// Thuế TNCN lũy tiến: nạp biểu thuế, người phụ thuộc, giảm trừ theo năm; tính thuế cho các dòng lương khi chạy lương; tổng hợp thuế cả năm.
// Công thức nằm ở src/lib/pit.js. Chỉ áp dụng dòng lương theo hệ số (dòng lương khoán detail.fixedPay đã khấu trừ thuế vãng lai).
const P = require('../lib/pit');
const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const NOT_FIXED = `COALESCE(pl.detail->>'fixedPay','') <> 'true'`;

const toSchedule = r => r && ({ year: r.year, selfDeduction: num(r.self_deduction), dependentDeduction: num(r.dependent_deduction),
  healthCap: r.health_cap === null || r.health_cap === undefined ? null : num(r.health_cap), educationCap: r.education_cap === null || r.education_cap === undefined ? null : num(r.education_cap),
  brackets: P.normBrackets(r.brackets), note: r.note || '' });
/** Biểu thuế dùng cho năm tính thuế: biểu của năm gần nhất ≤ năm đó; chưa có thì lấy biểu sớm nhất. null = chưa cài biểu nào. */
async function scheduleFor(c, year) {
  const r = (await q(c, 'SELECT * FROM pit_schedules WHERE year <= $1 ORDER BY year DESC LIMIT 1', [year]))[0] || (await q(c, 'SELECT * FROM pit_schedules ORDER BY year LIMIT 1'))[0];
  return toSchedule(r) || null;
}
const deductibleCodes = async c => new Set((await q(c, 'SELECT code FROM deduction_types WHERE pit_deductible')).map(r => r.code));
async function dependentsOf(c, ids) {
  const m = new Map(); if (!ids.length) return m;
  for (const r of await q(c, `SELECT employee_id, id, full_name, from_month, to_month FROM employee_dependents WHERE employee_id = ANY($1::uuid[]) ORDER BY from_month, full_name`, [ids])) (m.get(r.employee_id) || m.set(r.employee_id, []).get(r.employee_id)).push(r);
  return m;
}
async function extrasOf(c, ids, year) {
  const m = new Map(); if (!ids.length) return m;
  for (const r of await q(c, 'SELECT employee_id, health, education, other, note FROM employee_tax_deductions WHERE year=$1 AND employee_id = ANY($2::uuid[])', [year, ids])) m.set(r.employee_id, { health: num(r.health), education: num(r.education), other: num(r.other), note: r.note || '' });
  return m;
}
const depMonthsOfYear = (list, year) => { let n = 0; for (let m = 1; m <= 12; m++) n += P.dependentsInMonth(list, year, m); return n; };

/** Thuế tạm tính của từng tháng 1–11 đã có dòng lương (đã lưu khi tính lương; tháng tính trước khi có chức năng thuế thì ước tính lại từ số đã lưu). */
function monthTaxes(linesByMonth, ctx) {
  const out = {};
  for (const [month, ls] of linesByMonth) {
    const taxable = ls.reduce((s, l) => s + P.taxableOf(l), 0), insurance = ls.reduce((s, l) => s + P.insuranceOf(l.deductions, ctx.codes), 0);
    const stored = ls.every(l => l.has_pit);
    const dependents = P.dependentsInMonth(ctx.deps, ctx.year, month);
    const tax = stored ? ls.reduce((s, l) => s + num(l.pit_tax), 0) : P.monthlyPit({ taxable, insurance, dependents, extrasYear: ctx.extras, schedule: ctx.schedule }).tax;
    out[month] = { taxable, insurance, dependents: stored ? num(ls[0].pit_dependents ?? dependents) : dependents, tax, source: stored ? 'stored' : 'estimate', lines: ls.length, locked: ls.every(l => l.status === 'locked') };
  }
  return out;
}

/** Gắn thuế TNCN vào các dòng lương theo hệ số của 1 bảng lương trong 1 tháng (gọi trong calculateRun trước khi ghi dòng).
 *  lines = [{ employeeId, r, detail }] — r là kết quả calcLine; hàm cập nhật r / detail và trả về { taxable, tax } để ghi cột pit_taxable / pit_tax. */
async function applyRunPit(c, { groupId, year, month, lines, prevRunId, withhold }) {
  const out = new Map();
  if (!lines.length) return out;
  const schedule = await scheduleFor(c, year);
  const codes = await deductibleCodes(c);
  const ids = lines.map(l => l.employeeId);
  // Truy vấn tuần tự (cùng một client giao dịch không chạy song song được)
  const deps = await dependentsOf(c, ids), extras = await extrasOf(c, ids, year);
  // Cùng tháng ở bảng lương khác (người chuyển bảng lương trong tháng): thuế tính trên tổng thu nhập của người, chia theo tỷ lệ
  const others = await q(c, `SELECT pl.employee_id, r.group_id, r.id AS run_id, pl.insurance_salary, pl.allowance, pl.bonus, pl.detail->'deductions' AS deductions
          FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id WHERE r.year=$1 AND r.month=$2 AND r.group_id<>$3 AND pl.employee_id = ANY($4::uuid[]) AND ${NOT_FIXED}`, [year, month, groupId, ids]);
  const prevRows = prevRunId ? await q(c, 'SELECT employee_id, pit_taxable FROM payroll_lines WHERE run_id=$1', [prevRunId]) : [];
  const prior = month === 12 ? await q(c, `SELECT r.month, r.status, pl.employee_id, pl.insurance_salary, pl.allowance, pl.bonus, pl.detail->'deductions' AS deductions, pl.pit_tax,
        (pl.detail ? 'pit') AS has_pit, (pl.detail->'pit'->>'dependents')::numeric AS pit_dependents
      FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id WHERE r.year=$1 AND r.month < 12 AND pl.employee_id = ANY($2::uuid[]) AND ${NOT_FIXED}`, [year, ids]) : [];
  const group = (list, key) => { const m = new Map(); for (const x of list) (m.get(x[key]) || m.set(x[key], []).get(x[key])).push(x); return m; };
  const othersBy = group(others, 'employee_id'), priorBy = group(prior, 'employee_id'), prevTaxable = new Map(prevRows.map(r => [r.employee_id, r.pit_taxable === null ? null : num(r.pit_taxable)]));
  const staleRuns = new Set();
  for (const l of lines) {
    const r = l.r, id = l.employeeId;
    const lineTaxable = P.taxableOf({ insurance_salary: r.insuranceSalary, allowance: r.allowance, bonus: r.bonus });
    const lineInsurance = P.insuranceOf(r.deductionDetail, codes);
    const exempt = { night: num(r.nightSalary) + num(r.nightBonus), extra: num(r.extraSalary) + num(r.extraBonus), holiday: num(r.holidaySalary) + num(r.holidayBonus), meal: num(r.meal) };
    if (!schedule) { l.detail.pit = { missing: true, lineTaxable, exempt }; out.set(id, { taxable: lineTaxable, tax: null }); continue; }
    const oth = othersBy.get(id) || [];
    const taxable = lineTaxable + oth.reduce((s, x) => s + P.taxableOf(x), 0), insurance = lineInsurance + oth.reduce((s, x) => s + P.insuranceOf(x.deductions, codes), 0);
    const depList = deps.get(id) || [], ex = extras.get(id) || { health: 0, education: 0, other: 0 };
    const dependents = P.dependentsInMonth(depList, year, month);
    const m = P.monthlyPit({ taxable, insurance, dependents, extrasYear: ex, schedule });
    let total = m.tax, annual = null, months = null;
    if (month === 12) {
      months = monthTaxes(group(priorBy.get(id) || [], 'month'), { codes, deps: depList, year, extras: ex, schedule });
      const ms = Object.values(months);
      annual = P.annualPit({ taxable: ms.reduce((s, x) => s + x.taxable, 0) + taxable, insurance: ms.reduce((s, x) => s + x.insurance, 0) + insurance,
        dependentMonths: depMonthsOfYear(depList, year), extrasYear: ex, schedule, priorTax: ms.reduce((s, x) => s + x.tax, 0) });
      total = annual.settle;
    }
    // Chia cho các dòng cùng tháng theo thứ tự bảng lương (cố định để mọi bảng chia giống nhau)
    const parts = [{ groupId, taxable: lineTaxable }, ...oth.map(x => ({ groupId: x.group_id, taxable: P.taxableOf(x) }))].sort((a, b) => String(a.groupId).localeCompare(String(b.groupId)));
    const share = P.allocate(total, parts.map(p => p.taxable))[parts.findIndex(p => p.groupId === groupId)];
    l.detail.pit = { scheduleYear: schedule.year, month, lineTaxable, lineInsurance, lineTax: share, exempt, extrasYear: ex,
      ...m, monthTax: m.tax, tax: total, annual, months, shared: oth.length ? { lines: oth.length + 1, taxable, insurance } : null, withheld: withhold === 'bonus' };
    if (withhold === 'bonus' && share) {
      r.bonusDeduction += share; r.bonusNet -= share; r.net -= share;
      r.extraDetail.push({ kind: 'bonus_deduction', label: month === 12 ? 'Thuế TNCN (quyết toán năm)' : 'Thuế TNCN (tạm tính)', calc: 'pit', basis: null, value: 0, amount: share });
      Object.assign(l.detail, { bonusDeduction: r.bonusDeduction, bonusNet: r.bonusNet, extras: r.extraDetail });
    }
    out.set(id, { taxable: lineTaxable, tax: share });
    // Thu nhập của dòng này đổi → phần chia ở bảng lương khác cùng tháng đổi theo: đánh dấu các bảng đó cần tính lại
    if (oth.length && prevTaxable.get(id) !== lineTaxable) for (const x of oth) staleRuns.add(x.run_id);
  }
  if (staleRuns.size) await c.query(`UPDATE payroll_runs SET stale=true WHERE id = ANY($1::uuid[]) AND status IN ('draft','submitted')`, [[...staleRuns]]);
  // Tính lại tháng 1–11 → quyết toán tháng 12 (nếu đã chạy, chưa khoá) cần tính lại
  if (month < 12) await c.query(`UPDATE payroll_runs r SET stale=true WHERE r.year=$1 AND r.month=12 AND r.status IN ('draft','submitted')
      AND EXISTS (SELECT 1 FROM payroll_lines pl WHERE pl.run_id=r.id AND pl.employee_id = ANY($2::uuid[]))`, [year, ids]);
  return out;
}

/** Đánh dấu "cần tính lại" các bảng lương chưa khoá có người này, từ năm fromYear (đổi người phụ thuộc / giảm trừ theo năm). */
const staleEmployee = (c, employeeId, fromYear, toYear = 2200) => c.query(`UPDATE payroll_runs r SET stale=true WHERE r.status IN ('draft','submitted') AND r.year BETWEEN $2 AND $3
    AND EXISTS (SELECT 1 FROM payroll_lines pl WHERE pl.run_id=r.id AND pl.employee_id=$1)`, [employeeId, fromYear, toYear]);
/** Đổi biểu thuế của năm Y: các bảng lương chưa khoá từ năm Y trở đi cần tính lại. */
const staleFromYear = (c, year) => c.query(`UPDATE payroll_runs SET stale=true WHERE status IN ('draft','submitted') AND year >= $1`, [year]);

/** Tổng hợp thuế TNCN cả năm theo từng người (báo cáo năm, "Lương của tôi").
 *  employeeIds: chỉ những người này; groupIds: người có dòng lương ở các bảng lương này (vẫn cộng thu nhập ở mọi bảng lương của người đó). lockedOnly: chỉ tháng đã khoá. */
async function yearSummary(c, { year, employeeIds = null, groupIds = null, lockedOnly = false }) {
  const schedule = await scheduleFor(c, year);
  const codes = await deductibleCodes(c);
  const st = lockedOnly ? `AND r.status='locked'` : '';
  let ids = employeeIds;
  if (!ids) ids = (await q(c, `SELECT DISTINCT pl.employee_id FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id WHERE r.year=$1 AND ${NOT_FIXED} ${st} ${groupIds ? 'AND r.group_id = ANY($2::uuid[])' : ''}`, groupIds ? [year, groupIds] : [year])).map(r => r.employee_id);
  if (!ids.length) return { year, schedule, employees: [] };
  const lines = await q(c, `SELECT r.month, r.status, r.group_id, g.name AS group_name, pl.employee_id, pl.insurance_salary, pl.allowance, pl.bonus, pl.meal_amount, pl.net, pl.pit_tax, pl.pit_taxable,
            pl.night_salary + pl.night_bonus AS night, pl.extra_salary + pl.extra_bonus AS extra, pl.holiday_salary + pl.holiday_bonus AS holiday,
            pl.detail->'deductions' AS deductions, (pl.detail ? 'pit') AS has_pit, (pl.detail->'pit'->>'dependents')::numeric AS pit_dependents, pl.detail->'pit'->'annual' AS stored_annual
          FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id JOIN groups g ON g.id=r.group_id WHERE r.year=$1 AND pl.employee_id = ANY($2::uuid[]) AND ${NOT_FIXED} ${st} ORDER BY r.month`, [year, ids]);
  const emps = await q(c, `SELECT v.id, v.full_name, v.employee_code, v.pay_department_name, v.pay_department_sort, v.group_name, v.emp_order, v.sort_order FROM v_employees v WHERE v.id = ANY($1::uuid[])`, [ids]);
  const deps = await dependentsOf(c, ids), extras = await extrasOf(c, ids, year);
  const byEmp = new Map(); for (const l of lines) (byEmp.get(l.employee_id) || byEmp.set(l.employee_id, []).get(l.employee_id)).push(l);
  const out = [];
  for (const e of emps) {
    const ls = byEmp.get(e.id) || []; if (!ls.length) continue;
    const depList = deps.get(e.id) || [], ex = extras.get(e.id) || { health: 0, education: 0, other: 0, note: '' };
    const byMonth = new Map(); for (const l of ls) (byMonth.get(l.month) || byMonth.set(l.month, []).get(l.month)).push(l);
    const ctx = { codes, deps: depList, year, extras: ex, schedule };
    const early = new Map([...byMonth].filter(([m]) => m < 12));
    const months = schedule ? monthTaxes(early, ctx) : {};
    for (const [m, list] of byMonth) {   // tiền miễn thuế (đêm / thêm / lễ / ăn ca) để hiện trên báo cáo
      const o = months[m] || (months[m] = { taxable: list.reduce((s, l) => s + P.taxableOf(l), 0), insurance: list.reduce((s, l) => s + P.insuranceOf(l.deductions, codes), 0), dependents: P.dependentsInMonth(depList, year, m), tax: null, source: null, lines: list.length, locked: list.every(l => l.status === 'locked') });
      o.exempt = list.reduce((s, l) => s + num(l.night) + num(l.extra) + num(l.holiday) + num(l.meal_amount), 0);
      o.net = list.reduce((s, l) => s + num(l.net), 0);
      o.groups = [...new Set(list.map(l => l.group_name))];
    }
    const prior = Object.entries(months).filter(([m]) => Number(m) < 12).reduce((s, [, x]) => s + num(x.tax), 0);
    const all = Object.values(months), dec = byMonth.get(12), n = byMonth.size;
    // Có tháng 12: quyết toán cả năm (bản thân đủ 12 tháng). Chưa có tháng 12: quyết toán DỰ KIẾN theo n tháng đã có lương —
    // bậc thuế, mức tối đa y tế / giáo dục và giảm trừ y tế / giáo dục / khác quy về n/12 năm, bản thân n tháng, người phụ thuộc trong n tháng đó.
    const f = dec ? 1 : n / 12, ks = [...byMonth.keys()];
    const annual = schedule ? Object.assign(P.annualPit({ taxable: all.reduce((s, x) => s + x.taxable, 0), insurance: all.reduce((s, x) => s + x.insurance, 0),
      dependentMonths: dec ? depMonthsOfYear(depList, year) : ks.reduce((s, m) => s + P.dependentsInMonth(depList, year, m), 0), selfMonths: dec ? 12 : n,
      extrasYear: dec ? ex : { health: ex.health * f, education: ex.education * f, other: ex.other * f }, schedule: dec ? schedule : P.scaleSchedule(schedule, f), priorTax: prior }), { projected: !dec, months: n }) : null;
    if (dec && schedule) {   // tháng 12 = quyết toán: dùng số đã lưu khi tính lương; tháng 12 tính trước khi có chức năng thuế thì lấy số quyết toán tính lại
      const stored = dec.every(l => l.has_pit);
      months[12].tax = stored ? dec.reduce((s, l) => s + num(l.pit_tax), 0) : annual.settle;
      months[12].source = stored ? 'stored' : 'estimate';
      months[12].storedAnnualTax = stored ? dec.reduce((s, l) => s + num(l.stored_annual?.tax), 0) / dec.length : null;
    }
    const paid = Object.values(months).reduce((s, x) => s + num(x.tax), 0);
    out.push({ employeeId: e.id, name: e.full_name, code: e.employee_code, department: e.pay_department_name, group: e.group_name, sort: [e.group_name || '', e.pay_department_sort ?? 999999, e.emp_order ?? 0, e.sort_order ?? 0, e.full_name],
      dependents: depList.map(d => ({ name: d.full_name, from: P.ymKey(d.from_month), to: P.ymKey(d.to_month) })), extras: ex, months, annual, taxInMonths: paid,
      // Còn phải nộp (+) / được hoàn (−) so với tổng thuế các tháng: 0 khi tháng 12 đã quyết toán đúng
      remaining: annual ? annual.tax - paid : null, settled: !!dec, staleDecember: !!(dec && months[12].source === 'stored' && annual && Math.round(months[12].storedAnnualTax) !== annual.tax) });
  }
  out.sort((a, b) => { for (let i = 0; i < a.sort.length; i++) { const x = a.sort[i], y = b.sort[i]; if (x === y) continue; return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'vi'); } return 0; });
  out.forEach(x => delete x.sort);
  return { year, schedule, employees: out };
}
module.exports = { scheduleFor, toSchedule, deductibleCodes, dependentsOf, extrasOf, applyRunPit, staleEmployee, staleFromYear, yearSummary, depMonthsOfYear };
