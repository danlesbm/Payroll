// Chạy lương nháp cho 1 bảng lương (group) trong 1 tháng.
const { bad } = require('../lib/http');
const { isReceived, STATUS_LABEL } = require('../lib/workflow');
const { monthEnd } = require('../lib/dates');
const calc = require('../lib/calc');
const sched = require('./schedule');
const { safetyHolders } = require('./safety');
const workdaysLib = require('../lib/workdays');
const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);

/** standardDays = công chuẩn NHẬP TAY cho cả bảng (ghi đè lịch); undefined = giữ giá trị đã lưu, null/'' = bỏ ghi đè, dùng công chuẩn theo lịch từng người. */
async function calculateRun(c, { groupId, year, month, standardDays, userId }) {
  const group = (await q(c, 'SELECT * FROM groups WHERE id=$1', [groupId]))[0];
  if (!group) bad('Không tìm thấy bảng lương', 404);
  const existing = (await q(c, 'SELECT * FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3 FOR UPDATE', [groupId, year, month]))[0];
  if (existing && !['draft', 'submitted'].includes(existing.status)) bad('Bảng lương đã trình Giám đốc hoặc đã khoá, không thể tính lại. Cần trả lại / Admin mở khoá trả lại trước.', 409);

  // 1) Mọi bảng chấm công của nhóm phải được cấp 2 "Nhận"
  const sheets = await q(c, 'SELECT * FROM sheets WHERE group_id=$1 AND active ORDER BY sort_order, name', [groupId]);
  const periods = await q(c, `SELECT p.* FROM periods p JOIN sheets s ON s.id=p.sheet_id WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3`, [groupId, year, month]);
  const byS = new Map(periods.map(p => [p.sheet_id, p]));
  // Lương nháp chạy ngay khi có chấm công (không cần chờ cấp 1 trình lên); bảng nào chưa tới cấp 2 được ghi chú là "tạm tính"
  const pending = [];
  for (const s of sheets) {
    const p = byS.get(s.id);
    if (!p) {
      const n = (await q(c, `SELECT count(*)::int n FROM v_employees WHERE sheet_id=$1 AND sso_status='active' AND payroll_active`, [s.id]))[0].n;
      if (n > 0) pending.push(`${s.name}: chưa có bảng chấm công`);
    } else if (!isReceived(p.status)) pending.push(`${s.name}: ${STATUS_LABEL[p.status]}`);
  }

  const end = monthEnd(year, month);
  // 2) Nhân sự lấy từ danh sách người trong các kỳ chấm công (đóng băng theo kỳ)
  const emps = await q(c, `SELECT ve.id, ve.employee_type, ve.shift_no, ve.pay_dept_id AS department_id, ve.weekly_off, ve.allowance_group_id,
    (SELECT d.meal_mode FROM departments d WHERE d.id=ve.department_id) AS meal_mode
    FROM period_employees pe JOIN periods p ON p.id=pe.period_id JOIN sheets s ON s.id=p.sheet_id JOIN v_employees ve ON ve.id=pe.employee_id
    WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3 AND ve.payroll_active`, [groupId, year, month]);
  const seen = new Set();
  const employees = emps.filter(e => !seen.has(e.id) && seen.add(e.id));
  const ids = employees.map(e => e.id);

  const [entries, actual, codes, codeMealPrices, mealRates, coefTypes, dedTypes, params, prices, items, coefRows, settingRows, ratingRows, laborRows, safetyRows, payRates] = await Promise.all([
    q(c, `SELECT ae.employee_id, ae.day, ae.code, s.meal_mode FROM attendance_entries ae JOIN periods p ON p.id=ae.period_id JOIN sheets s ON s.id=p.sheet_id
          WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3`, [groupId, year, month]),
    q(c, `SELECT ma.employee_id, ma.meal_type_id, SUM(CASE WHEN ma.code IS NOT NULL THEN COALESCE(ac.meal_qty, 0) ELSE ma.quantity END) AS qty FROM meal_actual ma LEFT JOIN attendance_codes ac ON ac.code=ma.code JOIN periods p ON p.id=ma.period_id JOIN sheets s ON s.id=p.sheet_id
          WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3 GROUP BY ma.employee_id, ma.meal_type_id`, [groupId, year, month]),
    q(c, 'SELECT code, work_value, work_day, work_night, off_day_zero, pct_kind, pay_scope, is_ot FROM attendance_codes'),
    q(c, 'SELECT code, group_id, amount, effective_from, id FROM code_meal_prices WHERE group_id IS NULL'),
    q(c, 'SELECT * FROM meal_rates WHERE effective_from <= $1', [end]),
    q(c, 'SELECT * FROM coefficient_types WHERE active ORDER BY sort_order, code'),
    q(c, 'SELECT * FROM deduction_types WHERE active ORDER BY sort_order, code'),
    q(c, `SELECT id, value, effective_from, employee_type FROM company_params WHERE key='base_wage' AND effective_from <= $1`, [end]),
    q(c, 'SELECT * FROM unit_prices WHERE effective_from <= $1', [end]),
    q(c, 'SELECT employee_id, kind, label, calc, basis, value, amount FROM monthly_items WHERE year=$1 AND month=$2 ORDER BY id', [year, month]),
    q(c, 'SELECT id, employee_id, effective_from, vals FROM coefficient_history WHERE employee_id = ANY($1::uuid[]) AND effective_from <= $2', [ids, end]),
    q(c, `SELECT key, value FROM settings WHERE key IN ('standard_days','meal_in_net','safety_coef')`),
    q(c, `SELECT pe.employee_id, pr.safety, pr.labor, s.use_safety, s.use_labor FROM period_employees pe JOIN periods p ON p.id=pe.period_id JOIN sheets s ON s.id=p.sheet_id
          LEFT JOIN period_ratings pr ON pr.period_id=pe.period_id AND pr.employee_id=pe.employee_id WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3`, [groupId, year, month]),
    q(c, 'SELECT grade, factor FROM labor_grades'), q(c, 'SELECT grade, factor FROM safety_grades'),
    q(c, 'SELECT code, allowance_group_id, pct FROM code_pay_rates')
  ]);
  const setting = Object.fromEntries(settingRows.map(r => [r.key, r.value]));
  const baseOf = {};
  for (const t of new Set(employees.map(e => e.employee_type))) {
    const row = calc.pickBaseWage(params, t, end);
    if (!row) bad(`Chưa cấu hình "Lương cơ sở" cho ${t === 'manager' ? 'Quản lý' : 'Công nhân'} (Admin → Cấu hình → Lương cơ sở). Cần một mức có hiệu lực từ trước hoặc trong tháng này.`, 400);
    baseOf[t] = calc.num(row.value);
  }
  const ov = standardDays === undefined ? existing?.std_override : standardDays;
  const override = ov === null || ov === '' || ov === undefined || !(calc.num(ov) > 0) ? null : calc.num(ov);
  const sctx = await sched.loadContext(c, year, month);
  const planFactor = (await q(c, 'SELECT factor FROM plan_factors WHERE year=$1 AND month=$2', [year, month]))[0]?.factor;
  const pfNum = planFactor === undefined || planFactor === null ? 1 : calc.num(planFactor);
  const mealInNet = String(setting.meal_in_net ?? 'true') !== 'false';

  const codeWork = Object.fromEntries(codes.map(r => [r.code, r.work_value]));
  const kindOf = Object.fromEntries(codes.filter(r => r.pct_kind).map(r => [r.code, r.pct_kind]));
  const workOf = Object.fromEntries(codes.map(r => [r.code, { value: calc.num(r.work_value), night: calc.num(r.work_night) }]));
  const rateOf = new Map(); for (const r of payRates) rateOf.set(r.code + '|' + (r.allowance_group_id || ''), calc.num(r.pct));
  const kindFull = { ...kindOf }; for (const r of payRates) kindFull[r.code] ||= 'extra';   // có % nhưng chưa chọn nhóm: coi là làm thêm
  const offZero = new Set(codes.filter(r => r.off_day_zero).map(r => r.code));
  const codeDay = Object.fromEntries(codes.map(r => [r.code, r.work_day])), codeNight = Object.fromEntries(codes.map(r => [r.code, r.work_night]));
  const codesByEmp = new Map(), autoByEmp = new Map(), actualByEmp = new Map(), coefByEmp = new Map(), itemByEmp = new Map();
  const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  for (const e of entries) { push(codesByEmp, e.employee_id, e); push(autoByEmp, e.employee_id, e.code); }
  for (const a of actual) (actualByEmp.get(a.employee_id) || actualByEmp.set(a.employee_id, {}).get(a.employee_id))[a.meal_type_id] = calc.num(a.qty);
  for (const r of coefRows) push(coefByEmp, r.employee_id, r);
  for (const r of items) push(itemByEmp, r.employee_id, r);

  const laborF = Object.fromEntries(laborRows.map(r => [r.grade, calc.num(r.factor)])), safetyF = Object.fromEntries(safetyRows.map(r => [r.grade, calc.num(r.factor)]));
  const safetyCode = (settingRows.find(r => r.key === 'safety_coef')?.value) || coefTypes.find(t => t.kind === 'amount' && /an toàn/i.test(t.name))?.code || null;
  const holders = await safetyHolders(c, ids, end);
  const ratingBy = new Map(ratingRows.map(r => [r.employee_id, r]));
  const otSet = new Set(codes.filter(r => r.is_ot).map(r => r.code)), scopeOf = Object.fromEntries(codes.map(r => [r.code, r.pay_scope || 'both']));
  // Công tối thiểu của nhóm trực ca kíp = kíp thấp nhất (cùng hàm với màn hình chấm công)
  const gmInfo = await sched.groupMin(c, sctx, groupId);
  const waitTypes = new Set((await q(c, 'SELECT id FROM meal_types WHERE is_wait')).map(r => r.id));
  const lines = [], stdCount = {};
  for (const e of employees) {
    const rt = ratingBy.get(e.id) || {};
    const laborGrade = rt.use_labor && rt.labor && rt.labor in laborF ? rt.labor : null, safetyGrade = rt.safety && rt.safety in safetyF ? rt.safety : null;
    const needSafety = holders.has(e.id);
    const gm = e.shift_no && gmInfo ? (gmInfo[e.department_id || '']?.min ?? null) : null;
    const sc = sched.forEmployee(sctx, { groupId, departmentId: e.department_id, employeeType: e.employee_type, weeklyOff: e.weekly_off, groupMin: gm });
    const std = override || sc.standard, minD = override ? workdaysLib.minDays(sc.rule, override, gm) : sc.min;
    stdCount[std] = (stdCount[std] || 0) + 1;
    const rawE = codesByEmp.get(e.id) || [], empCodes = rawE.map(x => x.code);
    // Ký hiệu "nghỉ bù / nghỉ phép" rơi vào ngày nghỉ hằng tuần hoặc ngày lễ không cộng công (ngày đó vốn đã được nghỉ)
    // Ký hiệu làm thêm (LT…) không vào công thường mà trả riêng theo % của ký hiệu; ký hiệu "chỉ lương"/"chỉ thưởng" chỉ vào công tương ứng
    const keep = rawE.filter(x => !(offZero.has(x.code) && sc.offSet.has(x.day)));
    // Ký hiệu "không tính lương" (pay_scope 'none'): vẫn cộng vào ngày công hiển thị (eff, cột Công) nhưng không vào công tính lương/thưởng; ăn ca tính riêng theo ký hiệu
    const eff = keep.filter(x => !otSet.has(x.code)).map(x => x.code);
    const effS = eff.filter(cd => scopeOf[cd] !== 'bonus' && scopeOf[cd] !== 'none'), effB = eff.filter(cd => scopeOf[cd] !== 'salary' && scopeOf[cd] !== 'none');
    const wd = calc.workDays(effS, codeWork), wdB = calc.workDays(effB, codeWork), wTotal = calc.workDays(eff, codeWork), wDay = calc.workDays(eff, codeDay), wNight = calc.workDays(eff, codeNight);
    const zeroed = rawE.length - keep.length;
    const otCnt = keep.filter(x => otSet.has(x.code) && scopeOf[x.code] !== 'none').reduce((n, x) => n + calc.num(codeWork[x.code]), 0);
    const pctOf = code => rateOf.get(code + '|' + (e.allowance_group_id || '')) ?? rateOf.get(code + '|') ?? 100;
    const premOpt = skipScope => ({ work: workOf, kind: kindFull, ot: cd => otSet.has(cd), pct: pctOf,
      holPct: day => sctx.pct.get(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`) || 100, skip: x => (offZero.has(x.code) && sc.offSet.has(x.day)) || scopeOf[x.code] === skipScope || scopeOf[x.code] === 'none' });
    const prem = workdaysLib.premiumDays(rawE, premOpt('bonus')), premB = workdaysLib.premiumDays(rawE, premOpt('salary'));
    // Kiểu ăn ca của bộ phận: auto = theo ký hiệu công; actual = chỉ theo bảng chấm ăn ca riêng; auto_wait = theo ký hiệu công + bảng chấm ăn chờ ca
    const mealMode = e.meal_mode || 'auto', rawQty = actualByEmp.get(e.id) || {};
    const qty = {}; for (const [t, v] of Object.entries(rawQty)) if ((mealMode === 'actual' && !waitTypes.has(t)) || (mealMode === 'auto_wait' && waitTypes.has(t))) qty[t] = v;
    const auto = mealMode === 'actual' ? { amount: 0, items: {}, days: 0 } : calc.mealByCode(autoByEmp.get(e.id) || [], codeMealPrices, groupId, end);   // ăn ca tự động theo ký hiệu công
    const rateByType = {}; for (const t of Object.keys(qty)) rateByType[t] = calc.num(calc.pickMealRate(mealRates, t, groupId, end)?.amount);
    const coefRow = calc.pickEffective(coefByEmp.get(e.id) || [], end);
    const price = calc.pickUnitPrice(prices, { groupId, departmentId: e.department_id, employeeType: e.employee_type }, end);
    const its = itemByEmp.get(e.id) || [];
    const baseWage = baseOf[e.employee_type];
    const warnings = []; if (!coefRow) warnings.push('Chưa có hệ số'); if (!price) warnings.push('Chưa có đơn giá lương');
    const r = calc.calcLine({ workDays: wd, workDaysBonus: wdB, standardDays: std, minDays: minD, rateBasis: sc.basis, planFactor: pfNum, premiumDays: prem, premiumDaysBonus: premB, otSalary: sc.otSalary, otBonus: sc.otBonus, baseWage, coefTypes, coefs: coefRow?.vals || {}, unitPrice: price?.amount || 0,
      mealAmount: calc.mealAmount(qty, rateByType) + auto.amount, mealInNet, items: its, deductionTypes: dedTypes,
      laborFactor: laborGrade ? laborF[laborGrade] : 1, safetyCode, safetyFactor: safetyGrade ? safetyF[safetyGrade] : 1 });
    if (needSafety && !safetyGrade) warnings.push('Chưa chấm xếp loại an toàn (đang tính 100% phụ cấp an toàn)');
    const counts = {}; for (const cde of empCodes) counts[cde] = (counts[cde] || 0) + 1;
    lines.push({ employeeId: e.id, workDays: wTotal, r, detail: { workSalary: wd, workBonus: wdB, otWork: otCnt, diffStd: Math.round((wTotal - std) * 100) / 100, rateBasis: sc.basis, planFactor: pfNum, rateDiv: r.rateDiv, shiftNo: e.shift_no || null, groupMin: gm, laborGrade, laborFactor: r.laborFactor, safetyGrade, safetyFactor: r.safetyFactor, safetyAllowance: r.safetyAllowance, counts, workDay: wDay, workNight: wNight, mealQty: qty, mealMode, mealCodes: auto.items, mealDays: auto.days, mealActualAmount: calc.mealAmount(qty, rateByType), mealRates: rateByType, coefs: coefRow?.vals || {}, coefEffectiveFrom: coefRow?.effective_from || null,
      unitPrice: calc.num(price?.amount), baseWage, standardDays: std, minDays: minD, ratio: r.ratio, ratioBonus: r.ratioBonus, payStatus: r.payStatus, otDays: r.otDays, dailySalary: r.dailySalary, dailyBonus: r.dailyBonus, otSalary: sc.otSalary, otBonus: sc.otBonus,
      nightSalary: r.nightSalary, nightBonus: r.nightBonus, extraSalary: r.extraSalary, extraBonus: r.extraBonus, holidaySalary: r.holidaySalary, holidayBonus: r.holidayBonus, otSalaryAmt: r.otSalaryAmt, otBonusAmt: r.otBonusAmt, premiumDays: r.premiumDays, premiumInBonus: r.premiumInBonus, premSal: r.premSal, premBon: r.premBon,
      weeklyOff: sc.weeklyOff, scheduleSource: sc.source, offDays: sc.info.offDays.length, holidayDays: sc.info.holidays, zeroedOffDays: zeroed, overridden: !!override, insCoef: r.insCoef, bonusCoef: r.bonusCoef, bonusBase: r.bonusBase,
      monthlyBonus: r.monthlyBonus, bonusDeduction: r.bonusDeduction, salaryNet: r.salaryNet, bonusNet: r.bonusNet, extras: r.extraDetail, deductions: r.deductionDetail, periodicDeduction: r.periodicDeduction, monthlyDeduction: r.monthlyDeduction, warnings } });
  }
  // Công chuẩn hiển thị của bảng = mức phổ biến nhất trong bảng (mỗi người vẫn dùng công chuẩn riêng, xem chi tiết dòng lương)
  const std = Number(Object.entries(stdCount).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0]) || override || sched.forEmployee(sctx, { weeklyOff: 'sun' }).standard;
  const run = (await q(c, `INSERT INTO payroll_runs(group_id, year, month, status, standard_days, std_override, stale, calculated_at, calculated_by, provisional_note, min_info)
      VALUES($1,$2,$3,'draft',$4,$5,false,now(),$6,$7,$8)
      ON CONFLICT (group_id, year, month) DO UPDATE SET standard_days=EXCLUDED.standard_days, std_override=EXCLUDED.std_override, provisional_note=EXCLUDED.provisional_note, min_info=EXCLUDED.min_info, stale=false, calculated_at=now(), calculated_by=EXCLUDED.calculated_by
      RETURNING *`, [groupId, year, month, std, override, userId, pending.length ? pending.join('; ') : null, gmInfo ? JSON.stringify(gmInfo) : null]))[0];
  await c.query('DELETE FROM payroll_lines WHERE run_id=$1', [run.id]);
  for (const l of lines) await c.query(`INSERT INTO payroll_lines(run_id, employee_id, work_days, insurance_salary, bonus, allowance, meal_amount, deduction, net, detail, night_salary, night_bonus, extra_salary, extra_bonus, holiday_salary, holiday_bonus)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [run.id, l.employeeId, l.workDays, l.r.insuranceSalary, l.r.bonus, l.r.allowance, l.r.meal, l.r.deduction, l.r.net, JSON.stringify(l.detail), l.r.nightSalary, l.r.nightBonus, l.r.extraSalary, l.r.extraBonus, l.r.holidaySalary, l.r.holidayBonus]);
  return { run, count: lines.length, pending, warnings: lines.filter(l => l.detail.warnings.length).length };
}
// Cấp 2 chỉnh công -> bảng lương nháp tự tính lại; lỗi thì đánh dấu "cần tính lại"
async function recalcIfExists(c, sheetId, year, month, userId) {
  const g = (await q(c, 'SELECT group_id FROM sheets WHERE id=$1', [sheetId]))[0];
  if (!g) return;
  const run = (await q(c, `SELECT id, std_override FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3 AND status IN ('draft','submitted')`, [g.group_id, year, month]))[0];
  if (!run) return;
  await c.query('SAVEPOINT recalc');
  try { await calculateRun(c, { groupId: g.group_id, year, month, standardDays: run.std_override, userId }); await c.query('RELEASE SAVEPOINT recalc'); }
  catch (e) { await c.query('ROLLBACK TO SAVEPOINT recalc'); await c.query('UPDATE payroll_runs SET stale=true WHERE id=$1', [run.id]); }
}
/** Sau mỗi hành động chấm công: tự chạy / tính lại lương nháp để người kiểm soát xem ngay. Không làm hỏng thao tác chấm công nếu tính lỗi. */
async function autoCalc(c, sheetId, year, month, userId) {
  const g = (await q(c, 'SELECT group_id FROM sheets WHERE id=$1', [sheetId]))[0];
  if (!g) return;
  const run = (await q(c, 'SELECT id, status, std_override FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [g.group_id, year, month]))[0];
  if (run && !['draft', 'submitted'].includes(run.status)) return;
  await c.query('SAVEPOINT autocalc');
  try { await calculateRun(c, { groupId: g.group_id, year, month, standardDays: run ? run.std_override : undefined, userId }); await c.query('RELEASE SAVEPOINT autocalc'); }
  catch (e) { await c.query('ROLLBACK TO SAVEPOINT autocalc'); if (run) await c.query('UPDATE payroll_runs SET stale=true WHERE id=$1', [run.id]); }
}
const markStale = (c, groupId = null) => c.query(`UPDATE payroll_runs SET stale=true WHERE status IN ('draft','submitted') AND ($1::uuid IS NULL OR group_id=$1::uuid)`, [groupId]);
module.exports = { calculateRun, recalcIfExists, autoCalc, markStale };
