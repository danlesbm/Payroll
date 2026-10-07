// Lịch làm việc: nạp ngày lễ + quy tắc, tính công chuẩn / công tối thiểu / hệ số tăng ca cho từng người.
const W = require('../lib/workdays');
const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Nạp ngữ cảnh một tháng: toàn bộ quy tắc + ngày lễ của tháng. */
async function loadContext(c, year, month) {
  const rules = await q(c, `SELECT id, group_id, department_id, employee_type, weekly_off, min_mode, min_value, rate_basis, ot_salary, ot_bonus, note, updated_at FROM schedule_rules`);
  const from = `${year}-${W.pad(month)}-01`, to = `${year}-${W.pad(month)}-${W.pad(W.dim(year, month))}`;
  const hol = await q(c, `SELECT id, to_char(hdate,'YYYY-MM-DD') AS date, name, pay_pct FROM holidays WHERE hdate BETWEEN $1 AND $2 ORDER BY hdate`, [from, to]);
  return { year, month, rules, holidays: new Set(hol.map(h => h.date)), holidayList: hol, pct: new Map(hol.map(h => [h.date, num(h.pay_pct) || 100])), cache: new Map() };
}
/** Lịch của một người: nghỉ hằng tuần riêng của người (nếu có) > quy tắc cụ thể nhất. */
function forEmployee(ctx, e) {
  const key = [e.groupId, e.departmentId, e.employeeType, e.weeklyOff, e.groupMin ?? ''].join('|');
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const rule = W.pickRule(ctx.rules, e) || null;
  const own = W.isWeekly(e.weeklyOff) ? e.weeklyOff : null;
  const weeklyOff = own || (rule && W.isWeekly(rule.weekly_off) ? rule.weekly_off : 'sun');
  const info = W.monthInfo(ctx.year, ctx.month, weeklyOff, ctx.holidays);
  const out = { rule, weeklyOff, source: own ? 'employee' : rule ? 'rule' : 'default', info, standard: info.standard,
    min: W.minDays(rule, info.standard, e.groupMin), basis: rule?.rate_basis === 'min' ? 'min' : 'standard', groupMinMode: rule?.min_mode === 'group_min', otSalary: rule ? num(rule.ot_salary) : 1, otBonus: rule ? num(rule.ot_bonus) : 1, offSet: new Set(info.offDays) };
  ctx.cache.set(key, out);
  return out;
}
/** Công tối thiểu của nhóm trực ca kíp (kíp thấp nhất) cho một bảng lương: dùng chung cho tính lương và màn hình chấm công. */
async function groupMin(c, ctx, groupId) {
  const emps = await q(c, `SELECT DISTINCT ve.id, ve.employee_type, ve.shift_no, ve.pay_dept_id AS department_id, ve.weekly_off FROM period_employees pe JOIN periods p ON p.id=pe.period_id JOIN sheets s ON s.id=p.sheet_id JOIN v_employees ve ON ve.id=pe.employee_id
    WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3 AND ve.payroll_active AND ve.shift_no IS NOT NULL`, [groupId, ctx.year, ctx.month]);
  if (!emps.length) return null;
  const ents = await q(c, `SELECT ae.employee_id, ae.day, ae.code FROM attendance_entries ae JOIN periods p ON p.id=ae.period_id JOIN sheets s ON s.id=p.sheet_id WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3`, [groupId, ctx.year, ctx.month]);
  const codes = await q(c, 'SELECT code, work_value, off_day_zero, is_ot, leave_value FROM attendance_codes');
  const meta = Object.fromEntries(codes.map(r => [r.code, r]));
  const by = new Map(); for (const e of ents) (by.get(e.employee_id) || by.set(e.employee_id, []).get(e.employee_id)).push(e);
  const rows = [];
  for (const e of emps) {
    const sc = forEmployee(ctx, { groupId, departmentId: e.department_id, employeeType: e.employee_type, weeklyOff: e.weekly_off });
    if (!sc.groupMinMode) continue;
    const work = (by.get(e.id) || []).reduce((n, x) => { const m = meta[x.code]; if (!m || m.is_ot || (m.off_day_zero && sc.offSet.has(x.day))) return n;
      // Ký hiệu nghỉ có 'công nghỉ' (NP1 = 1, NP2 = 2…): đó vẫn là số công trực theo lịch, tính vào công của kíp (không tính vào công cá nhân)
      const v = num(m.work_value); return n + (v > 0 ? v : (sc.offSet.has(x.day) ? 0 : num(m.leave_value))); }, 0);
    rows.push({ shiftNo: e.shift_no, dept: e.department_id || '', work });
  }
  const byDept = W.shiftGroupMinBy(rows); return Object.keys(byDept).length ? byDept : null;
}
module.exports = { loadContext, forEmployee, groupMin };
