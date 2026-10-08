// Giao tiếp với SSO Portal (không sửa SSO):
//  - Xác thực: GET {SSO}/api/auth/introspect?token=...  -> { active, user:{id,username,email,displayName,role,status}, assignments }
//  - Danh bạ : GET {SSO}/api/internal/directory (header X-Internal-Secret) -> { users, departments, assignments }
const { pool, tx } = require('./db');
const { extractTitle, cleanName, isExcluded, parsePatterns, posRank, looksLead, looksWorker } = require('./lib/names');
const base = () => String(process.env.SSO_BASE_URL || '').replace(/\/+$/, '');
const cache = new Map(); const TTL = 30 * 1000;

async function getJson(url, headers = {}) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: ctl.signal });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  } finally { clearTimeout(timer); }
}
async function introspect(token) {
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  if (!base()) throw new Error('Thiếu SSO_BASE_URL trong .env');
  const { ok, data } = await getJson(`${base()}/api/auth/introspect?token=${encodeURIComponent(token)}`);
  if (!ok || !data.active || !data.user || data.user.id == null) { cache.delete(token); return null; }
  if (String(data.user.status || '').toLowerCase() === 'locked') return null;
  const u = data.user;
  const user = { id: String(u.id), username: u.username || '', email: u.email || '', name: u.displayName || u.name || u.username || u.email || '', ssoRole: u.role || '' };
  cache.set(token, { exp: Date.now() + TTL, user });
  if (cache.size > 500) for (const [k, v] of cache) if (v.exp < Date.now()) cache.delete(k);
  return user;
}
async function fetchDirectory() {
  const secret = process.env.SSO_INTERNAL_API_SECRET;
  if (!base() || !secret) throw new Error('Cần cấu hình SSO_BASE_URL và SSO_INTERNAL_API_SECRET trong .env (cùng giá trị với SSO).');
  const { ok, status, data } = await getJson(`${base()}/api/internal/directory`, { 'X-Internal-Secret': secret });
  if (!ok || data.ok !== true) throw new Error(`SSO từ chối đọc danh bạ (HTTP ${status}${data.error ? ': ' + data.error : ''}). Kiểm tra SSO_INTERNAL_API_SECRET.`);
  if (!Array.isArray(data.users) || !Array.isArray(data.departments) || !Array.isArray(data.assignments)) throw new Error('SSO trả về danh bạ không đúng định dạng.');
  return data;
}
// Gán lại phòng Payroll cho mọi nhân sự từ bảng map
async function resolveEmployees(client = pool) {
  // Phòng chấm công: chỉ từ chức vụ thuộc phòng (Trưởng/Phó phòng, Nhân viên...); nếu không có thì rơi về đơn vị ảo (HĐQT/BKS/BGĐ)
  // Phòng tính lương: nếu thuộc đơn vị ảo (vd Phó GĐ kiêm Trưởng phòng) -> lương hiển thị ở đó, chấm công vẫn ở phòng.
  const first = col => `(SELECT m.department_id FROM department_sso_map m JOIN departments d ON d.id=m.department_id
      WHERE m.sso_department_id = ANY(e.${col}) AND d.active ORDER BY m.sort_order, m.sso_department_id LIMIT 1)`;
  await client.query(`UPDATE employees e SET
      mapped_department_id = CASE WHEN e.excluded THEN NULL ELSE COALESCE(${first('sso_dept_ids')}, ${first('sso_unit_ids')}) END,
      pay_department_id = CASE WHEN e.excluded THEN NULL ELSE COALESCE(${first('sso_unit_ids')}, ${first('sso_dept_ids')}) END, updated_at=now()`);
}
// Tài khoản dùng chung (admin, email phòng ban…) khai báo ở Cấu hình › Loại trừ tài khoản: bị loại khỏi mọi bảng
// Kíp / Trưởng ca chỉ áp dụng cho Công nhân; Quản lý / Hành chính không thuộc kíp nào
const normalizeShifts = (client = pool) => client.query(`UPDATE employees SET shift_no=NULL, is_lead=false WHERE employee_type<>'worker' AND (shift_no IS NOT NULL OR is_lead)`);
async function applyExclusions(client = pool) {
  const pat = parsePatterns((await client.query("SELECT value FROM settings WHERE key='exclude_patterns'")).rows[0]?.value);
  const all = (await client.query('SELECT id, sso_name, full_name, username, email FROM employees')).rows;
  const ids = all.filter(r => isExcluded(r, pat)).map(r => r.id);
  await client.query('UPDATE employees SET excluded = (id = ANY($1::uuid[])) WHERE excluded IS DISTINCT FROM (id = ANY($1::uuid[]))', [ids]);
  await resolveEmployees(client);
  await normalizeShifts(client);
  return ids.length;
}
// Chức vụ "quản lý" không nằm trong nhân sự phòng (người phụ trách thường thuộc bộ phận khác)
const NOT_MEMBER = new Set(['Người phụ trách']);
// HĐQT / Ban kiểm soát / Ban giám đốc trong SSO KHÔNG phải "phòng ban": đó là chức vụ không gắn phòng (deptId rỗng).
// Payroll tạo "đơn vị ảo" cho các nhóm này để liên kết được như phòng ban thường.
const VIRTUAL = { 'Hội đồng quản trị': ['role:HDQT', 'Hội đồng quản trị (SSO)'], 'Ban Kiểm Soát': ['role:BKS', 'Ban Kiểm Soát (SSO)'], 'Giám đốc': ['role:BGD', 'Ban Giám Đốc (SSO)'], 'Phó GĐ': ['role:BGD', 'Ban Giám Đốc (SSO)'] };
function virtualUnit(role) {
  return VIRTUAL[String(role || '').trim()] || null;
}
async function syncDirectory() {
  const dir = await fetchDirectory();
  const byUser = new Map();
  for (const a of dir.assignments) { if (a.userId == null) continue; const k = String(a.userId); (byUser.get(k) || byUser.set(k, []).get(k)).push(a); }
  const seen = []; let extraCount = 0;
  await tx(async c => {
    await c.query('DELETE FROM sso_departments_cache');
    const known = new Set(dir.departments.map(d => String(d.id)));
    const extra = new Map();   // đơn vị ảo + deptId có trong assignments nhưng không có trong danh sách phòng ban
    for (const a of dir.assignments) {
      if (a.deptId === null || a.deptId === undefined || a.deptId === '') { const v = virtualUnit(a.role); if (v) extra.set(v[0], v[1]); }
      else if (!known.has(String(a.deptId))) extra.set(String(a.deptId), String(a.deptId));
    }
    extraCount = extra.size;
    for (const [id, name] of extra) await c.query('INSERT INTO sso_departments_cache(id,name) VALUES($1,$2) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, synced_at=now()', [id, name]);
    for (const d of dir.departments) await c.query('INSERT INTO sso_departments_cache(id,name) VALUES($1,$2) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, synced_at=now()', [String(d.id), String(d.name || d.id)]);
    for (const u of dir.users) {
      const id = String(u.id); seen.push(id);
      const as = byUser.get(id) || [];
      const hasDept = a => !(a.deptId === null || a.deptId === undefined || a.deptId === '');
      const deptIds = [...new Set(as.filter(a => hasDept(a) && !virtualUnit(a.role) && !NOT_MEMBER.has(String(a.role || '').trim())).map(a => String(a.deptId)))];
      const unitIds = [...new Set(as.map(a => (virtualUnit(a.role) || [])[0]).filter(Boolean))];
      const positions = [...new Set(as.map(a => String(a.role || '').trim()).filter(Boolean))].join(', ');
      const locked = String(u.status || '').toLowerCase() === 'locked';
      const rawName = u.name || u.username || u.email || id;
      const title = extractTitle(rawName, positions);
      await c.query(`INSERT INTO employees(sso_user_id, full_name, sso_name, email, username, positions, sso_dept_ids, sso_unit_ids, sso_status, synced_at, pos_rank, is_lead, employee_type, title)
        VALUES($1,$2,$9,$3,$4,$5,$6,$8,$7,now(),$10,$11,$12,$13)
        ON CONFLICT (sso_user_id) DO UPDATE SET full_name=EXCLUDED.full_name, sso_name=EXCLUDED.sso_name, email=EXCLUDED.email, username=EXCLUDED.username,
          positions=EXCLUDED.positions, sso_dept_ids=EXCLUDED.sso_dept_ids, sso_unit_ids=EXCLUDED.sso_unit_ids, pos_rank=EXCLUDED.pos_rank, title=EXCLUDED.title, sso_status=EXCLUDED.sso_status, synced_at=now(), updated_at=now()`,
        [id, cleanName(rawName, positions), u.email || null, u.username || null, positions || null, deptIds, locked ? 'locked' : 'active', unitIds, rawName, posRank(positions, title), looksLead(rawName), (!looksWorker(rawName) && posRank(positions) <= 40) ? 'manager' : 'worker', title || null]);
    }
    await c.query(`UPDATE employees SET sso_status='missing', updated_at=now() WHERE NOT (sso_user_id = ANY($1::text[])) AND sso_status<>'missing' AND sso_user_id NOT LIKE 'manual:%'`, [seen]);
    await applyExclusions(c);
  });
  return { users: dir.users.length, departments: dir.departments.length + extraCount };
}
const tokenFrom = req => (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.cookies?.[process.env.SSO_TOKEN_COOKIE || 'sso_access_token'] || req.query?.token || '';
module.exports = { normalizeShifts, introspect, fetchDirectory, syncDirectory, resolveEmployees, applyExclusions, tokenFrom };
