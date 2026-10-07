// Bậc lương bảo hiểm: trạng thái bậc hiện tại của từng người, ngày đến hạn tăng bậc.
const rows = (...a) => require('../db').rows(...a);   // nạp db khi dùng (để test hàm thuần không cần Postgres)

const pad = n => String(n).padStart(2, '0');
// Cộng n tháng vào ngày 'YYYY-MM-DD' (ngày cuối tháng được co lại cho hợp lệ, vd 31/01 + 1 tháng = 28/02)
function addMonths(d, n) {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  const t = y * 12 + (m - 1) + n, ny = Math.floor(t / 12), nm = t % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(dd, last))}`;
}
const daysBetween = (a, b) => Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 864e5);

// Loại hệ số do bậc quyết định: cài đặt grade_coef_code, nếu trống lấy loại hệ số bảo hiểm đầu tiên
async function coefCode() {
  const s = (await rows(`SELECT value FROM settings WHERE key='grade_coef_code'`))[0]?.value;
  const types = await rows(`SELECT code, name, kind, is_total FROM coefficient_types WHERE active ORDER BY sort_order, code`);
  const t = types.find(x => x.code === s) || types.find(x => x.kind === 'insurance') || null;
  return { code: t?.code || null, name: t?.name || '', types };
}
const gradeLabel = (scale, grade) => grade ? `${scale ? scale + ' · ' : ''}Bậc ${grade}` : '';

/** Trạng thái bậc tại ngày asOf cho các nhân sự (ids = null: tất cả).
 *  "Ngày hưởng bậc" = ngày hiệu lực của bản ghi đầu tiên trong chuỗi liên tục cùng (thang, bậc) — đổi hệ số khác nhưng giữ bậc thì không tính lại. */
async function states(asOf, ids = null) {
  const { code } = await coefCode();
  const grades = await rows('SELECT scale, grade, coefficient, months_to_next FROM salary_grades ORDER BY scale, grade');
  const gMap = new Map(grades.map(g => [g.scale + '|' + g.grade, g]));
  const hist = await rows(`SELECT employee_id, to_char(effective_from,'YYYY-MM-DD') AS ef, grade_scale, grade, vals FROM coefficient_history
      WHERE effective_from <= $1 AND ($2::uuid[] IS NULL OR employee_id = ANY($2::uuid[])) ORDER BY employee_id, effective_from, id`, [asOf, ids]);
  const out = new Map();
  for (const h of hist) {
    const prev = out.get(h.employee_id) || null;
    const curCoef = code ? Number(h.vals?.[code] || 0) : 0;
    if (!h.grade) { out.set(h.employee_id, { scale: null, grade: null, since: null, curCoef, hasHistory: true }); continue; }
    const scale = h.grade_scale || '';
    const since = prev && prev.grade === h.grade && prev.scale === scale ? prev.since : h.ef;
    out.set(h.employee_id, { scale, grade: h.grade, since, curCoef, hasHistory: true });
  }
  for (const st of out.values()) {
    if (!st.grade) continue;
    const g = gMap.get(st.scale + '|' + st.grade);
    st.months = g?.months_to_next || null; st.gradeCoef = g ? Number(g.coefficient) : null;
    st.due = st.months ? addMonths(st.since, st.months) : null;
    const next = grades.filter(x => x.scale === st.scale && x.grade > st.grade)[0];
    st.nextGrade = next ? next.grade : null; st.nextCoef = next ? Number(next.coefficient) : null;
    st.label = gradeLabel(st.scale, st.grade);
  }
  return out;
}
module.exports = { addMonths, daysBetween, coefCode, states, gradeLabel };
