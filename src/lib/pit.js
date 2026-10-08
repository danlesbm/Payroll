// Thuế thu nhập cá nhân (TNCN) lũy tiến từng phần cho người hưởng lương theo hệ số — hàm thuần, dễ kiểm thử.
// Người lương khoán / thù lao không tính ở đây (đã khấu trừ thuế vãng lai 10%, xem calc.calcFixedLine).
//
// Biểu thuế (Cấu hình › Thuế TNCN) lưu theo năm, mức trần từng bậc tính theo CẢ NĂM; số bậc tuỳ ý (luật đổi bao nhiêu bậc cũng nhập được).
// - Tạm tính hằng tháng: mức trần bậc ÷ 12, giảm trừ bản thân / người phụ thuộc theo tháng, y tế + giáo dục + khác = số cả năm ÷ 12.
// - Tháng 12 (quyết toán): cộng thu nhập cả năm, giảm trừ bản thân đủ 12 tháng, người phụ thuộc theo số tháng được tính,
//   y tế / giáo dục tối đa theo mức trần của năm; thuế tháng 12 = thuế cả năm − thuế đã tạm tính tháng 1–11 (âm = được hoàn).
// Thu nhập chịu thuế = lương bảo hiểm + phụ cấp + thưởng; KHÔNG gồm tiền làm đêm, làm thêm, làm lễ tết và tiền ăn ca.
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = n => Math.round(num(n));

/** Chuẩn hoá danh sách bậc: bỏ dòng sai, xếp tăng dần theo mức trần, bậc cuối luôn không giới hạn (upto = null). */
function normBrackets(list) {
  const rows = (Array.isArray(list) ? list : [])
    .map(b => ({ upto: b && b.upto !== null && b.upto !== undefined && b.upto !== '' ? num(b.upto) : null, rate: num(b && b.rate) }))
    .filter(b => b.rate >= 0 && b.rate <= 100 && (b.upto === null || b.upto > 0));
  const capped = rows.filter(b => b.upto !== null).sort((a, b) => a.upto - b.upto);
  const open = rows.filter(b => b.upto === null);
  const out = capped.filter((b, i) => i === 0 || b.upto > capped[i - 1].upto);
  if (open.length) out.push({ upto: null, rate: open[open.length - 1].rate });
  else if (out.length) out[out.length - 1] = { upto: null, rate: out[out.length - 1].rate };
  return out;
}
/** Kiểm tra biểu thuế nhập từ màn hình; trả về danh sách đã chuẩn hoá hoặc ném lỗi bằng thông báo tiếng Việt. */
function validateBrackets(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('Biểu thuế phải có ít nhất 1 bậc');
  if (list.length > 20) throw new Error('Biểu thuế tối đa 20 bậc');
  list.forEach((b, i) => {
    const r = Number(b?.rate), last = i === list.length - 1, u = b?.upto;
    if (!Number.isFinite(r) || r < 0 || r > 100) throw new Error(`Bậc ${i + 1}: thuế suất phải từ 0 đến 100%`);
    if (!last && !(Number(u) > 0)) throw new Error(`Bậc ${i + 1}: cần nhập mức thu nhập tính thuế tối đa của bậc (cả năm)`);
    if (!last && i > 0 && Number(u) <= Number(list[i - 1].upto)) throw new Error(`Bậc ${i + 1}: mức tối đa phải lớn hơn bậc ${i}`);
  });
  return normBrackets(list.map((b, i) => ({ upto: i === list.length - 1 ? null : Number(b.upto), rate: Number(b.rate) })));
}
/** Thuế lũy tiến từng phần. divisor = 12 để tính theo tháng (mức trần bậc chia 12). Trả về tổng thuế (làm tròn đồng) và chi tiết từng bậc. */
function progressive(income, brackets, divisor = 1) {
  const list = normBrackets(brackets), d = num(divisor) > 0 ? num(divisor) : 1;
  const x = Math.max(0, num(income)), parts = [];
  let lower = 0, tax = 0;
  list.forEach((b, i) => {
    const upper = b.upto === null ? Infinity : b.upto / d;
    if (x > lower) {
      const base = Math.min(x, upper) - lower, t = base * b.rate / 100;
      parts.push({ level: i + 1, from: round(lower), to: upper === Infinity ? null : round(upper), rate: b.rate, base: round(base), tax: round(t) });
      tax += t;
    }
    lower = upper;
  });
  return { tax: round(tax), parts };
}
const capOf = (amount, cap) => (cap === null || cap === undefined || cap === '' ? Math.max(0, num(amount)) : Math.min(Math.max(0, num(amount)), Math.max(0, num(cap))));
/** Giảm trừ y tế / giáo dục / khác của cả năm sau khi áp mức tối đa của biểu thuế. */
function yearExtras(ded, schedule) {
  const d = ded || {}, s = schedule || {};
  return { health: round(capOf(d.health, s.healthCap)), education: round(capOf(d.education, s.educationCap)), other: round(Math.max(0, num(d.other))) };
}

/** Thuế tạm tính của 1 người trong 1 tháng.
 *  i = { taxable, insurance, dependents (số người được tính tháng này), extrasYear: {health, education, other} (cả năm, chưa áp trần), schedule } */
function monthlyPit(i) {
  const s = i.schedule || {}, ex = yearExtras(i.extrasYear, s);
  const taxable = round(i.taxable), insurance = round(i.insurance), deps = Math.max(0, Math.trunc(num(i.dependents)));
  const self = round(s.selfDeduction), dependent = round(num(s.dependentDeduction) * deps);
  const extras = { health: round(ex.health / 12), education: round(ex.education / 12), other: round(ex.other / 12) };
  const totalDeduction = insurance + self + dependent + extras.health + extras.education + extras.other;
  const assessable = Math.max(0, taxable - totalDeduction);
  const p = progressive(assessable, s.brackets, 12);
  return { mode: 'month', taxable, insurance, self, dependents: deps, dependentAmount: round(s.dependentDeduction), dependent, extras, totalDeduction, assessable, tax: p.tax, parts: p.parts };
}
/** Quyết toán cả năm của 1 người.
 *  i = { taxable (cả năm), insurance (cả năm), dependentMonths (tổng số tháng-người phụ thuộc), extrasYear, schedule, selfMonths (mặc định 12), priorTax (đã tạm tính tháng 1–11) } */
function annualPit(i) {
  const s = i.schedule || {}, ex = yearExtras(i.extrasYear, s);
  const taxable = round(i.taxable), insurance = round(i.insurance), months = i.selfMonths === undefined || i.selfMonths === null ? 12 : Math.max(0, Math.min(12, num(i.selfMonths)));
  const depMonths = Math.max(0, num(i.dependentMonths));
  const self = round(num(s.selfDeduction) * months), dependent = round(num(s.dependentDeduction) * depMonths);
  const totalDeduction = insurance + self + dependent + ex.health + ex.education + ex.other;
  const assessable = Math.max(0, taxable - totalDeduction);
  const p = progressive(assessable, s.brackets, 1);
  const priorTax = round(i.priorTax);
  return { mode: 'year', taxable, insurance, selfMonths: months, self, dependentMonths: depMonths, dependentAmount: round(s.dependentDeduction), dependent, extras: ex, totalDeduction, assessable, tax: p.tax, parts: p.parts, priorTax, settle: p.tax - priorTax };
}
/** Quy biểu thuế về f phần của năm (vd 9/12): mức trần bậc và mức tối đa y tế / giáo dục nhân f.
 *  Dùng cho quyết toán DỰ KIẾN giữa năm (chưa có tháng 12): coi như năm chỉ có n tháng đã có lương để so với thuế đã tạm tính. */
const scaleSchedule = (s, f) => s && ({ ...s, brackets: normBrackets(s.brackets).map(b => ({ upto: b.upto === null ? null : b.upto * f, rate: b.rate })),
  healthCap: s.healthCap === null || s.healthCap === undefined ? null : num(s.healthCap) * f, educationCap: s.educationCap === null || s.educationCap === undefined ? null : num(s.educationCap) * f });
/** Chia số thuế của người cho nhiều dòng lương cùng tháng (người chuyển bảng lương trong tháng) theo tỷ lệ thu nhập chịu thuế; dòng cuối nhận phần lẻ. */
function allocate(total, weights) {
  const w = weights.map(x => Math.max(0, num(x))), sum = w.reduce((a, b) => a + b, 0), n = w.length;
  if (!n) return [];
  const out = w.map(x => (sum > 0 ? Math.round(num(total) * x / sum) : 0));
  if (sum <= 0) out[0] = round(total);
  const diff = round(total) - out.reduce((a, b) => a + b, 0);
  let k = n - 1; if (sum > 0) while (k > 0 && w[k] === 0) k--;
  out[k] += diff;
  return out;
}
/** Số người phụ thuộc được tính trong tháng (year, month): from_month ≤ tháng ≤ to_month (to_month trống = đang tính). */
const ymKey = v => { if (!v) return null; const s = v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}` : String(v).slice(0, 7); return /^\d{4}-\d{2}$/.test(s) ? s : null; };
function dependentsInMonth(list, year, month) {
  const k = `${year}-${String(month).padStart(2, '0')}`;
  return (list || []).filter(d => { const f = ymKey(d.from_month), t = ymKey(d.to_month); return f && f <= k && (!t || t >= k); }).length;
}
/** Thu nhập chịu thuế của dòng lương theo hệ số: lương bảo hiểm + phụ cấp + thưởng (cột đã lưu; insurance_salary đã gồm phụ cấp an toàn). */
const taxableOf = l => round(num(l.insurance_salary) + num(l.allowance) + num(l.bonus));
/** Tiền BH bắt buộc được trừ: các khoản trừ định kỳ có đánh dấu "được trừ khi tính thuế". */
const insuranceOf = (deductions, deductibleCodes) => round((deductions || []).filter(d => deductibleCodes.has(d.code)).reduce((s, d) => s + num(d.amount), 0));
module.exports = { normBrackets, validateBrackets, progressive, monthlyPit, annualPit, scaleSchedule, allocate, dependentsInMonth, yearExtras, taxableOf, insuranceOf, ymKey };
