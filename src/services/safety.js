// Ai có phụ cấp an toàn (hệ số loại "Số tiền" tên chứa "an toàn", hoặc hệ số chọn ở Cấu hình) > 0 tại cuối tháng -> phải chấm xếp loại an toàn A/B
const calc = require('../lib/calc');
const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);
async function safetyCode(c) {
  const s = (await q(c, "SELECT value FROM settings WHERE key='safety_coef'"))[0]?.value;
  if (s) return s;
  return (await q(c, "SELECT code FROM coefficient_types WHERE active AND kind='amount' AND name ~* 'an toàn' ORDER BY sort_order, code LIMIT 1"))[0]?.code || null;
}
async function safetyHolders(c, empIds, end) {
  const code = await safetyCode(c), out = new Set();
  if (!code || !empIds.length) return out;
  const rowsAll = await q(c, 'SELECT id, employee_id, effective_from, vals FROM coefficient_history WHERE employee_id = ANY($1::uuid[]) AND effective_from <= $2', [empIds, end]);
  const by = new Map(); for (const r of rowsAll) (by.get(r.employee_id) || by.set(r.employee_id, []).get(r.employee_id)).push(r);
  for (const [id, list] of by) { const cur = calc.pickEffective(list, end); if (cur && calc.num(cur.vals?.[code]) > 0) out.add(id); }
  return out;
}
module.exports = { safetyCode, safetyHolders };
