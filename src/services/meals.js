// Bảng ăn ca của 1 bảng lương/tháng (tự động theo ký hiệu công hoặc chấm thực tế theo từng bảng chấm công).
const calc = require('../lib/calc');
const { monthEnd } = require('../lib/dates');
const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);
async function mealReport(c, groupId, year, month) {
  const end = monthEnd(year, month);
  const [emps, entries, actual, cmPrices, rates, types] = await Promise.all([
    q(c, `SELECT ve.id, ve.full_name, ve.employee_code, ve.positions, ve.title, ve.employee_type, ve.shift_no, ve.pay_department_name AS department_name, ve.pay_department_sort AS department_sort, s.name AS sheet_name, (SELECT d.meal_mode FROM departments d WHERE d.id=ve.department_id) AS meal_mode
          FROM period_employees pe JOIN periods p ON p.id=pe.period_id JOIN sheets s ON s.id=p.sheet_id JOIN v_employees ve ON ve.id=pe.employee_id
          WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3
          ORDER BY ve.pay_department_sort NULLS LAST, ve.pay_department_name, ve.emp_order, ve.sort_order, ve.full_name`, [groupId, year, month]),
    q(c, `SELECT ae.employee_id, ae.code FROM attendance_entries ae JOIN periods p ON p.id=ae.period_id JOIN sheets s ON s.id=p.sheet_id
          WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3 `, [groupId, year, month]),
    q(c, `SELECT ma.employee_id, ma.meal_type_id, SUM(CASE WHEN ma.code IS NOT NULL THEN COALESCE(ac.meal_qty, 0) ELSE ma.quantity END) AS qty FROM meal_actual ma LEFT JOIN attendance_codes ac ON ac.code=ma.code JOIN periods p ON p.id=ma.period_id JOIN sheets s ON s.id=p.sheet_id
          WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3 GROUP BY ma.employee_id, ma.meal_type_id`, [groupId, year, month]),
    q(c, 'SELECT code, group_id, amount, effective_from, id FROM code_meal_prices WHERE group_id IS NULL'),
    q(c, 'SELECT * FROM meal_rates WHERE effective_from <= $1', [end]),
    q(c, 'SELECT id, code, name, is_wait FROM meal_types WHERE active ORDER BY sort_order, name')]);
  const codesBy = new Map(); for (const e of entries) (codesBy.get(e.employee_id) || codesBy.set(e.employee_id, []).get(e.employee_id)).push(e.code);
  const actBy = new Map(); for (const a of actual) (actBy.get(a.employee_id) || actBy.set(a.employee_id, {}).get(a.employee_id))[a.meal_type_id] = calc.num(a.qty);
  const seen = new Set(), out = []; let total = 0;
  for (const e of emps) {
    if (seen.has(e.id)) continue; seen.add(e.id);
    const mode = e.meal_mode || 'auto', isWait = Object.fromEntries(types.map(t => [t.id, !!t.is_wait]));
    const qty = {}; for (const [t, v] of Object.entries(actBy.get(e.id) || {})) if ((mode === 'actual' && !isWait[t]) || (mode === 'auto_wait' && isWait[t])) qty[t] = v;
    let amount = 0, codes = {}, days = 0, actualQty = 0, waitQty = 0;
    if (mode !== 'actual') { const m = calc.mealByCode(codesBy.get(e.id) || [], cmPrices, groupId, end); amount += m.amount; codes = m.items; days = m.days; }
    const rateBy = {}; for (const t of Object.keys(qty)) rateBy[t] = calc.num(calc.pickMealRate(rates, t, groupId, end)?.amount);
    amount += calc.mealAmount(qty, rateBy);
    for (const [t, v] of Object.entries(qty)) { if (isWait[t]) waitQty += calc.num(v); else actualQty += calc.num(v); }
    total += amount;
    out.push({ employee_type: e.employee_type, shift_no: e.shift_no, employeeId: e.id, name: e.full_name, code: e.employee_code, positions: e.positions, title: e.title, department: e.department_name, departmentSort: e.department_sort, sheet: e.sheet_name, mode, qty, codes, days, actualQty, waitQty, amount });
  }
  return { types, rows: out, total };
}
module.exports = { mealReport };
