// Công thức tính lương — hàm thuần, dễ kiểm thử.
const { payRatio } = require('./workdays');
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = n => Math.round(num(n));
const ymd = v => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

function pickEffective(rows, date) {
  let best = null;
  for (const r of rows || []) {
    const e = ymd(r.effective_from);
    if (e > date) continue;
    if (!best) { best = r; continue; }
    const be = ymd(best.effective_from);
    if (e > be || (e === be && num(r.id) > num(best.id))) best = r;
  }
  return best;
}
// Đơn giá cụ thể nhất: phòng > bảng lương > chung, kèm loại nhân sự
function pickUnitPrice(prices, ctx, date) {
  let best = null, bestScore = -1;
  for (const p of prices || []) {
    if (ymd(p.effective_from) > date) continue;
    if (p.department_id && p.department_id !== ctx.departmentId) continue;
    if (p.group_id && p.group_id !== ctx.groupId) continue;
    if (p.employee_type && p.employee_type !== ctx.employeeType) continue;
    const score = (p.department_id ? 8 : 0) + (p.group_id ? 4 : 0) + (p.employee_type ? 2 : 0);
    if (score > bestScore || (score === bestScore && ymd(p.effective_from) > ymd(best.effective_from))) { best = p; bestScore = score; }
  }
  return best;
}
// Lương cơ sở: mức riêng theo loại nhân sự (quản lý / công nhân) ưu tiên hơn mức chung (employee_type rỗng)
function pickBaseWage(rows, employeeType, date) {
  const live = (rows || []).filter(r => ymd(r.effective_from) <= date);
  return pickEffective(live.filter(r => r.employee_type === employeeType), date) || pickEffective(live.filter(r => !r.employee_type), date);
}
function pickMealRate(rates, mealTypeId, groupId, date) {
  const mine = (rates || []).filter(r => r.meal_type_id === mealTypeId && ymd(r.effective_from) <= date);
  return pickEffective(mine.filter(r => r.group_id === groupId), date) || pickEffective(mine.filter(r => !r.group_id), date);
}
// Tiền ăn ca theo ký hiệu công: MỘT mức chung cho mọi bảng lương. Lấy mức có hiệu lực mới nhất đến cuối tháng;
// nếu mọi mức đều có hiệu lực SAU tháng này thì dùng mức sớm nhất (tránh trường hợp nhập "hiệu lực từ" muộn làm tháng trước ra 0).
function pickCodeMealPrice(rows, code) {
  const mine = (rows || []).filter(r => r.code === code && !r.group_id);
  return mine.length ? mine.reduce((b, r) => (!b || ymd(r.effective_from) < ymd(b.effective_from) ? r : b), null) : null;
}
function pickCodeMealPriceAt(rows, code, date) {
  const mine = (rows || []).filter(r => r.code === code && !r.group_id);
  return pickEffective(mine, date) || pickCodeMealPrice(rows, code);
}
function mealByCode(codes, priceRows, groupId, date) {
  const items = {}; let amount = 0, days = 0; const cache = {};
  for (const c of codes || []) {
    if (!(c in cache)) cache[c] = num(pickCodeMealPriceAt(priceRows, c, date)?.amount);
    const p = cache[c]; if (!(p > 0)) continue;
    (items[c] ||= { n: 0, price: p }).n++; amount += p; days++;
  }
  return { items, amount: round(amount), days };
}
const workDays = (codes, codeWork) => (codes || []).reduce((s, c) => s + num(codeWork[c]), 0);
function autoMealQty(codes, codeMeals) {
  const out = {};
  for (const c of codes || []) for (const m of codeMeals[c] || []) out[m.meal_type_id] = (out[m.meal_type_id] || 0) + num(m.quantity);
  return out;
}
const mealAmount = (qty, rate) => round(Object.entries(qty).reduce((s, [t, q]) => s + num(q) * num(rate[t]), 0));

/** Lương BH = Σ hệ số 'insurance' × lương cơ sở ÷ công chuẩn × công tính lương (xem payRatio)
 *  Thưởng   = Σ hệ số 'bonus' × đơn giá ÷ công chuẩn × công tính thưởng + thưởng thêm trong tháng
 *  Phụ cấp  = Σ 'amount' (cố định)
 *  Khoản trừ= trừ định kỳ (% lương BH hoặc cố định) + trừ trong tháng
 *  Thực lĩnh= Lương BH + Thưởng + Phụ cấp (+ Tiền ăn nếu mealInNet) − Khoản trừ */
/** Tổng hệ số thưởng: cộng các hệ số thưởng thành phần; loại "tổng" (is_total) không cộng lại mà lấy theo tổng các thành phần
 *  (nếu chưa nhập thành phần nào thì dùng giá trị tổng đã lưu — dữ liệu cũ nhập thẳng tổng). */
function bonusCoefOf(types, vals) {
  const bon = (types || []).filter(t => t.kind === 'bonus' && t.active !== false);
  const comp = bon.filter(t => !t.is_total).reduce((s, t) => s + num(vals[t.code]), 0);
  return comp > 0 ? comp : bon.filter(t => t.is_total).reduce((s, t) => s + num(vals[t.code]), 0);
}
function calcLine(i) {
  const std = num(i.standardDays);
  // Công ≥ chuẩn: tăng ca; tối thiểu ≤ công < chuẩn: đủ lương; công < tối thiểu: theo công thực tế (lương và thưởng có thể có hệ số tăng ca riêng)
  const minD = i.minDays === undefined || i.minDays === null ? std : num(i.minDays);
  // Mẫu số đơn giá ngày: công chuẩn (quản lý) hoặc công tối thiểu (công nhân trực ca kíp — rateBasis 'min')
  const div = i.rateBasis === 'min' && minD > 0 ? minD : std;
  const wdB = i.workDaysBonus === undefined || i.workDaysBonus === null ? i.workDays : i.workDaysBonus;
  const pr = payRatio(i.workDays, std, minD, i.otSalary === undefined || i.otSalary === null ? 1 : num(i.otSalary), div);
  const pb = payRatio(wdB, std, minD, i.otBonus === undefined || i.otBonus === null ? 1 : num(i.otBonus), div);
  const ratio = pr.ratio, ratioBonus = pb.ratio;
  const types = i.coefTypes || [], vals = i.coefs || {};
  const sumKind = k => types.filter(t => t.kind === k && t.active !== false).reduce((s, t) => s + num(vals[t.code]), 0);
  const insCoef = sumKind('insurance'), bonusCoef = bonusCoefOf(types, vals);
  const pf = i.planFactor === undefined || i.planFactor === null ? 1 : num(i.planFactor);   // hệ số hoàn thành kế hoạch: thưởng = hệ số thưởng × đơn giá × hệ số hoàn thành
  // Phụ cấp an toàn (một hệ số kiểu "số tiền" riêng của từng người): nhân theo xếp loại an toàn (A = 100%, B = 0%)
  const sf = i.safetyFactor === undefined || i.safetyFactor === null ? 1 : num(i.safetyFactor);
  const safetyBase = i.safetyCode ? num(vals[i.safetyCode]) : 0;
  const safetyAllowance = round(safetyBase * sf);
  const allowance = round(types.filter(t => t.kind === 'amount' && t.active !== false && t.code !== i.safetyCode).reduce((s, t) => s + num(vals[t.code]), 0)) + safetyAllowance;
  // Xếp loại lao động: nhân vào lương theo hệ số & thưởng định kỳ (không nhân vào thưởng/trừ đột xuất)
  const lf = i.laborFactor === undefined || i.laborFactor === null ? 1 : num(i.laborFactor);
  // Phần "chính" tối đa 1 lần công chuẩn; phần công vượt chuẩn là làm thêm, tách riêng (nhóm "làm thêm")
  const mainS = Math.min(ratio, 1), mainB = Math.min(ratioBonus, 1), overS = Math.max(ratio - 1, 0), overB = Math.max(ratioBonus - 1, 0);
  const insuranceFull = round(insCoef * num(i.baseWage) * mainS);        // lương BH chưa nhân xếp loại (cơ sở tính % trừ BH, không gồm làm đêm/thêm/lễ)
  const insuranceSalary = round(insCoef * num(i.baseWage) * mainS * lf);
  const otSalaryAmt = round(insCoef * num(i.baseWage) * overS * lf), otBonusAmt = round(bonusCoef * num(i.unitPrice) * overB * lf * pf);
  const bonusBase = round(bonusCoef * num(i.unitPrice) * mainB * lf * pf);
  // Công làm đêm / làm thêm (sửa chữa…) / làm ngày lễ: số "ngày tương đương" nhân đơn giá ngày (áp dụng cả lương và thưởng)
  const pd = i.premiumDays || {}, pdB = i.premiumDaysBonus || pd, rawDayS = div > 0 ? insCoef * num(i.baseWage) * lf / div : 0, rawDayB = div > 0 ? bonusCoef * num(i.unitPrice) * lf * pf / div : 0;
  const nightSalary = round(rawDayS * num(pd.night)), nightBonus = round(rawDayB * num(pdB.night));
  const extraSalary = otSalaryAmt + round(rawDayS * num(pd.extra)), extraBonus = otBonusAmt + round(rawDayB * num(pdB.extra));
  const holidaySalary = round(rawDayS * num(pd.holiday)), holidayBonus = round(rawDayB * num(pdB.holiday));
  // Tiền làm đêm / làm thêm / làm lễ phần theo hệ số lương: mặc định chuyển hết sang bảng thưởng (gộp vào cột thưởng làm đêm/thêm/lễ),
  // bảng lương chỉ còn đến lương đóng bảo hiểm. premiumInBonus=false giữ cách cũ (phần theo hệ số lương nằm ở bảng lương).
  const toBonus = i.premiumInBonus !== false;
  const premSal = { night: nightSalary, extra: extraSalary, holiday: holidaySalary }, premBon = { night: nightBonus, extra: extraBonus, holiday: holidayBonus };
  const outS = toBonus ? { night: 0, extra: 0, holiday: 0 } : premSal;
  const outB = toBonus ? { night: nightBonus + nightSalary, extra: extraBonus + extraSalary, holiday: holidayBonus + holidaySalary } : premBon;
  const salaryPremium = outS.night + outS.extra + outS.holiday, bonusPremium = outB.night + outB.extra + outB.holiday;
  const dailySalary = div > 0 ? Math.round(insCoef * num(i.baseWage) * lf / div) : 0, dailyBonus = div > 0 ? Math.round(bonusCoef * num(i.unitPrice) * lf * pf / div) : 0;   // đơn giá ngày = hệ số × đơn giá ÷ công chuẩn
  // Khoản thêm/trừ trong tháng: cố định, hoặc "hệ số × đơn giá" (hệ số lấy theo từng người)
  const extra = { bonus: 0, deduction: 0, bonus_deduction: 0 }, extraDetail = [];
  for (const it of i.items || []) {
    const amt = it.calc === 'coef_price' ? round((it.basis === 'insurance' ? insCoef : bonusCoef) * num(it.value)) : round(it.amount);
    if (!(it.kind in extra)) continue;
    extra[it.kind] += amt; extraDetail.push({ kind: it.kind, label: it.label, calc: it.calc, basis: it.basis, value: num(it.value), amount: amt });
  }
  const monthlyBonus = round(i.monthlyBonus) + extra.bonus, monthlyDeduction = round(i.monthlyDeduction) + extra.deduction;
  const bonus = bonusBase + monthlyBonus;
  // Mức lương đóng bảo hiểm = lương BH (tối đa hệ số × lương cơ sở, không gồm làm đêm/thêm/lễ) + phụ cấp (cột Phụ cấp, gồm phụ cấp an toàn)
  const insuranceBase = insuranceFull + allowance;
  const deductionDetail = [];
  for (const d of i.deductionTypes || []) {
    if (d.active === false) continue;
    const amt = d.calc === 'pct_insurance' ? round(insuranceBase * num(d.value) / 100) : round(d.value);
    if (amt) deductionDetail.push({ code: d.code, name: d.name, amount: amt });
  }
  const periodic = deductionDetail.reduce((s, d) => s + d.amount, 0);
  const deduction = periodic + monthlyDeduction;
  const bonusDeduction = extra.bonus_deduction;
  const meal = round(i.mealAmount);
  const salaryNet = insuranceSalary + salaryPremium + allowance - deduction;        // lương thực lĩnh (bảng lương)
  const bonusNet = bonus + bonusPremium - bonusDeduction;                           // thưởng thực nhận (bảng thưởng)
  const net = salaryNet + bonusNet + (i.mealInNet === false ? 0 : meal);
  return { ratio: Math.round(ratio * 10000) / 10000, ratioBonus: Math.round(ratioBonus * 10000) / 10000, payStatus: pr.status, otDays: pr.otDays, rateDiv: div, minDays: minD, standardDays: std, dailySalary, dailyBonus, nightSalary: outS.night, nightBonus: outB.night, extraSalary: outS.extra, extraBonus: outB.extra, holidaySalary: outS.holiday, holidayBonus: outB.holiday, premiumInBonus: toBonus, premSal, premBon, otSalaryAmt, otBonusAmt, salaryPremium, bonusPremium, premiumDays: { night: num(pd.night), extra: num(pd.extra), holiday: num(pd.holiday) }, laborFactor: lf, planFactor: pf, insuranceFull, insuranceBase, safetyFactor: sf, safetyAllowance, safetyBase, insCoef, bonusCoef, insuranceSalary, bonusBase, bonus, allowance, meal,
    periodicDeduction: periodic, monthlyDeduction, monthlyBonus, bonusDeduction, salaryNet, bonusNet, deduction, net, deductionDetail, extraDetail };
}
module.exports = { bonusCoefOf, pickBaseWage, pickCodeMealPrice, pickCodeMealPriceAt, mealByCode, round, num, pickEffective, pickUnitPrice, pickMealRate, workDays, autoMealQty, mealAmount, calcLine };
