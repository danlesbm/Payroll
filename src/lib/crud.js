// Sinh nhanh route CRUD cho bảng danh mục đơn giản (chỉ Admin ghi).
const { one } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, str, api } = require('./http');

function coerce(f, v) {
  const L = f.label || f.k;
  if (f.type === 'int') { const n = Number(v); if (!Number.isFinite(n) || Math.abs(n) > 1e9) bad(`"${L}" phải là số nguyên hợp lệ`); return Math.trunc(n); }
  if (f.type === 'num') { const n = Number(v === '' || v === null ? NaN : v); if (!Number.isFinite(n)) bad(`"${L}" phải là số`); const mx = f.max ?? 1e8; if (n < (f.min ?? -1e8) || n > mx) bad(`"${L}" phải trong khoảng ${f.min ?? -1e8} đến ${mx}`); return n; }
  if (f.type === 'signers') {   // [{title, name}] — người ký trên bảng in
    let a = v; if (typeof v === 'string') { try { a = JSON.parse(v); } catch (e) { bad(`"${L}" không hợp lệ`); } }
    if (!Array.isArray(a)) bad(`"${L}" không hợp lệ`);
    return JSON.stringify(a.slice(0, 6).map(x => ({ title: str(x?.title).slice(0, 80), name: str(x?.name).slice(0, 80) })).filter(x => x.title || x.name));
  }
  if (f.type === 'bool') return v === true || v === 'true';
  if (f.type === 'uuid') { if (v === null || v === '') return null; if (!isUuid(v)) bad(`"${L}" không hợp lệ`); return v; }
  if (f.type === 'enum') { if (f.nullable && (v === '' || v === null)) return null; if (!f.values.includes(v)) bad(`"${L}" chỉ nhận: ${f.values.join(', ')}`); return v; }
  return str(v);
}
function pickFields(fields, body, partial) {
  const out = {};
  for (const f of fields) {
    if (!body || !Object.prototype.hasOwnProperty.call(body, f.k)) { if (!partial && f.required) bad(`Thiếu "${f.label || f.k}"`); continue; }
    const v = coerce(f, body[f.k]);
    if (f.required && (v === '' || v === null)) bad(`Thiếu "${f.label || f.k}"`);
    out[f.k] = v;
  }
  return out;
}
const FK_GONE = 'Mục được chọn không còn tồn tại (có thể vừa bị xoá ở máy khác) — hãy tải lại trang rồi chọn lại.';
const fkMessage = e => e.code === '22003' ? 'Giá trị số quá lớn, hãy kiểm tra lại.' : e.code === '23503' ? (/^insert or update/i.test(e.message || '') ? FK_GONE : 'Không thể xoá/đổi vì còn dữ liệu đang dùng mục này. Hãy tắt "đang dùng" thay vì xoá.')
  : e.code === '23505' ? 'Mã hoặc tên bị trùng với mục đã có.' : null;

function crud(router, { path, table, pk = 'id', pkType = 'uuid', fields, guard, after }) {
  const check = id => { if (pkType === 'uuid' && !isUuid(id)) bad('Mã không hợp lệ'); };
  const run = async fn => { try { return await fn(); } catch (e) { const m = fkMessage(e); if (m) bad(m, 409); throw e; } };
  router.post(`/${path}`, api(async req => {
    guard(req);
    const v = pickFields(fields, req.body, false), ks = Object.keys(v);
    const row = await run(() => one(`INSERT INTO ${table}(${ks.join(',')}) VALUES(${ks.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, ks.map(k => v[k])));
    await audit(req, `${path}.create`, table, row[pk], v);
    if (after) await after(req, row, 'create');
    return row;
  }));
  router.patch(`/${path}/:id`, api(async req => {
    guard(req); check(req.params.id);
    const v = pickFields(fields.filter(f => f.k !== pk), req.body, true), ks = Object.keys(v);
    if (!ks.length) bad('Không có gì để cập nhật');
    const row = await run(() => one(`UPDATE ${table} SET ${ks.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE ${pk}=$1 RETURNING *`, [req.params.id, ...ks.map(k => v[k])]));
    if (!row) bad('Không tìm thấy', 404);
    await audit(req, `${path}.update`, table, row[pk], v);
    if (after) await after(req, row, 'update');
    return row;
  }));
  router.delete(`/${path}/:id`, api(async req => {
    guard(req); check(req.params.id);
    const row = await run(() => one(`DELETE FROM ${table} WHERE ${pk}=$1 RETURNING *`, [req.params.id]));
    if (!row) bad('Không tìm thấy', 404);
    await audit(req, `${path}.delete`, table, req.params.id, row);
    if (after) await after(req, row, 'delete');
    return { ok: true };
  }));
}
module.exports = { crud };
