const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/lib/pit');
const c = require('../src/lib/calc');

// Biểu 2026 (Luật 109/2025/QH15): 5 bậc theo năm 120/360/720/1.200 triệu; giảm trừ 15,5 triệu / 6,2 triệu
const S26 = { selfDeduction: 15500000, dependentDeduction: 6200000, healthCap: 23000000, educationCap: 24000000,
  brackets: [{ upto: 120000000, rate: 5 }, { upto: 360000000, rate: 10 }, { upto: 720000000, rate: 20 }, { upto: 1200000000, rate: 30 }, { upto: null, rate: 35 }] };
const S20 = { selfDeduction: 11000000, dependentDeduction: 4400000, healthCap: 0, educationCap: 0,
  brackets: [{ upto: 60000000, rate: 5 }, { upto: 120000000, rate: 10 }, { upto: 216000000, rate: 15 }, { upto: 384000000, rate: 20 }, { upto: 624000000, rate: 25 }, { upto: 960000000, rate: 30 }, { upto: null, rate: 35 }] };

test('thuế lũy tiến tháng = mức trần năm ÷ 12, khớp công thức rút gọn', () => {
  // Tháng: 10/30/60/100 triệu. 40 triệu tính thuế = 10×5% + 20×10% + 10×20% = 0,5 + 2 + 2 = 4,5 triệu (= 40×20% − 3,5)
  assert.equal(P.progressive(40000000, S26.brackets, 12).tax, 4500000);
  assert.equal(P.progressive(150000000, S26.brackets, 12).tax, 150000000 * 0.35 - 14500000);
  assert.equal(P.progressive(8000000, S26.brackets, 12).tax, 400000);
  assert.equal(P.progressive(0, S26.brackets, 12).tax, 0);
  assert.equal(P.progressive(-5, S26.brackets, 12).tax, 0);
  // Năm: 500 triệu = 500×20% − 42 triệu
  assert.equal(P.progressive(500000000, S26.brackets).tax, 58000000);
  // Biểu cũ 7 bậc (tháng 5/10/18/32/52/80): 20 triệu = 20×20% − 1,65
  assert.equal(P.progressive(20000000, S20.brackets, 12).tax, 2350000);
  const parts = P.progressive(40000000, S26.brackets, 12).parts;
  assert.deepEqual(parts.map(p => [p.level, p.base, p.tax]), [[1, 10000000, 500000], [2, 20000000, 2000000], [3, 10000000, 2000000]]);
});

test('biểu thuế động: chuẩn hoá, bậc cuối luôn không giới hạn, kiểm tra nhập liệu', () => {
  assert.deepEqual(P.normBrackets([{ upto: 200, rate: 10 }, { upto: 100, rate: 5 }, { upto: 300, rate: 20 }]), [{ upto: 100, rate: 5 }, { upto: 200, rate: 10 }, { upto: null, rate: 20 }]);
  assert.deepEqual(P.validateBrackets([{ upto: 100, rate: 5 }, { upto: '', rate: 10 }]), [{ upto: 100, rate: 5 }, { upto: null, rate: 10 }]);
  assert.throws(() => P.validateBrackets([]), /ít nhất 1 bậc/);
  assert.throws(() => P.validateBrackets([{ upto: 100, rate: 5 }, { upto: 50, rate: 10 }, { upto: null, rate: 20 }]), /lớn hơn bậc 1/);
  assert.throws(() => P.validateBrackets([{ upto: 100, rate: 120 }]), /0 đến 100/);
  // Thuế suất để trống / null không được coi là 0%; mức trần vô hạn (1e400) không được làm mất bậc
  assert.throws(() => P.validateBrackets([{ upto: 100, rate: '' }, { rate: 10 }]), /Bậc 1: thuế suất/);
  assert.throws(() => P.validateBrackets([{ upto: 100, rate: 5 }, { rate: null }]), /Bậc 2: thuế suất/);
  assert.throws(() => P.validateBrackets([{ upto: '1e400', rate: 5 }, { rate: 10 }]), /Bậc 1: cần nhập mức/);
  // 1 bậc duy nhất: thuế suất phẳng
  assert.equal(P.progressive(1000, [{ upto: null, rate: 10 }]).tax, 100);
  // 3 bậc khác hẳn (luật sau này đổi): vẫn tính đúng
  assert.equal(P.progressive(300, [{ upto: 120, rate: 0 }, { upto: 240, rate: 10 }, { upto: null, rate: 50 }], 12).tax, 10 * 0 + 10 * 0.1 + 280 * 0.5);
});

test('tạm tính tháng: giảm trừ bản thân, người phụ thuộc, BH, y tế/giáo dục/khác ÷ 12', () => {
  const m = P.monthlyPit({ taxable: 50000000, insurance: 3150000, dependents: 2, extrasYear: { health: 30000000, education: 12000000, other: 0 }, schedule: S26 });
  // y tế bị chặn 23 triệu/năm → 1.916.667/tháng; giáo dục 1.000.000/tháng
  assert.equal(m.extras.health, 1916667); assert.equal(m.extras.education, 1000000);
  assert.equal(m.totalDeduction, 3150000 + 15500000 + 12400000 + 1916667 + 1000000);
  assert.equal(m.assessable, 50000000 - m.totalDeduction);
  assert.equal(m.tax, P.progressive(m.assessable, S26.brackets, 12).tax);
  const low = P.monthlyPit({ taxable: 12000000, insurance: 1260000, dependents: 0, schedule: S26 });
  assert.equal(low.assessable, 0); assert.equal(low.tax, 0);
  // Biểu 2020: không có giảm trừ y tế, giáo dục (mức tối đa 0)
  assert.equal(P.monthlyPit({ taxable: 30000000, insurance: 0, dependents: 0, extrasYear: { health: 5e6, education: 5e6 }, schedule: S20 }).extras.health, 0);
});

test('quyết toán năm: giảm trừ bản thân đủ 12 tháng, người phụ thuộc theo số tháng, tháng 12 = cả năm − đã tạm tính', () => {
  const a = P.annualPit({ taxable: 600000000, insurance: 37800000, dependentMonths: 18, extrasYear: { health: 10000000, education: 40000000, other: 2000000 }, schedule: S26, priorTax: 30000000 });
  assert.equal(a.self, 186000000); assert.equal(a.dependent, 18 * 6200000); assert.equal(a.extras.education, 24000000);
  assert.equal(a.assessable, 600000000 - 37800000 - 186000000 - 111600000 - 10000000 - 24000000 - 2000000);
  assert.equal(a.tax, P.progressive(a.assessable, S26.brackets).tax);
  assert.equal(a.settle, a.tax - 30000000);
  // Thưởng cuối năm dồn tháng 12: tạm tính các tháng đều nhau thì tổng tạm tính = quyết toán khi không có thưởng
  const months = Array.from({ length: 12 }, () => P.monthlyPit({ taxable: 40000000, insurance: 0, dependents: 1, schedule: S26 }).tax);
  const y = P.annualPit({ taxable: 480000000, insurance: 0, dependentMonths: 12, schedule: S26, priorTax: months.slice(0, 11).reduce((s, x) => s + x, 0) });
  assert.equal(y.settle, months[11]);
  // Được hoàn khi tạm tính nhiều hơn
  assert.ok(P.annualPit({ taxable: 100000000, insurance: 0, schedule: S26, priorTax: 1000000 }).settle < 0);
});

test('chia thuế cho nhiều dòng lương cùng tháng theo tỷ lệ thu nhập, đủ từng đồng', () => {
  assert.deepEqual(P.allocate(1000, [1, 1, 1]), [333, 333, 334]);
  assert.deepEqual(P.allocate(1000, [3, 0]), [1000, 0]);
  assert.deepEqual(P.allocate(-600, [1, 2]), [-200, -400]);
  assert.deepEqual(P.allocate(500, [0, 0]), [500, 0]);
  assert.deepEqual(P.allocate(0, []), []);
});

test('người phụ thuộc được tính theo tháng bắt đầu / tháng cuối', () => {
  const list = [{ from_month: '2026-03-01', to_month: null }, { from_month: '2025-01-01', to_month: '2026-08-01' }, { from_month: '2026-11-01', to_month: '2026-12-01' }];
  assert.equal(P.dependentsInMonth(list, 2026, 1), 1);
  assert.equal(P.dependentsInMonth(list, 2026, 3), 2);
  assert.equal(P.dependentsInMonth(list, 2026, 8), 2);
  assert.equal(P.dependentsInMonth(list, 2026, 9), 1);
  assert.equal(P.dependentsInMonth(list, 2026, 12), 2);
  assert.equal(P.dependentsInMonth(list, 2027, 1), 1);
});

test('thu nhập chịu thuế = lương BH + phụ cấp + thưởng; BH được trừ theo khoản có đánh dấu', () => {
  assert.equal(P.taxableOf({ insurance_salary: 10000000, allowance: 500000, bonus: 20000000 }), 30500000);
  const codes = new Set(['bhxh', 'bhyt', 'bhtn']);
  assert.equal(P.insuranceOf([{ code: 'bhxh', amount: 800 }, { code: 'bhyt', amount: 150 }, { code: 'bhtn', amount: 100 }, { code: 'kpcd', amount: 50 }], codes), 1050);
});

test('lương đóng BH thỏa thuận (loại ins_amount) thay cho hệ số × lương cơ sở', () => {
  const types = [{ code: 'bhxh', kind: 'insurance' }, { code: 'bh_thoa_thuan', kind: 'ins_amount' }, { code: 'thuong', kind: 'bonus' }];
  const base = { workDays: 26, standardDays: 26, baseWage: 2340000, coefTypes: types, unitPrice: 1000000, deductionTypes: [{ code: 'bhxh', calc: 'pct_insurance', value: 8 }] };
  const coef = c.calcLine({ ...base, coefs: { bhxh: 3, thuong: 2 } });
  assert.equal(coef.insuranceSalary, 7020000); assert.equal(coef.deductionDetail[0].amount, 561600);
  const agreed = c.calcLine({ ...base, coefs: { bhxh: 3, bh_thoa_thuan: 12000000, thuong: 2 } });
  assert.equal(agreed.insAmount, 12000000); assert.equal(agreed.insuranceSalary, 12000000); assert.equal(agreed.deductionDetail[0].amount, 960000);
  // nghỉ nửa tháng: theo công như lương BH theo hệ số
  const half = c.calcLine({ ...base, workDays: 13, minDays: 26, coefs: { bh_thoa_thuan: 12000000 } });
  assert.equal(half.insuranceSalary, 6000000);
});

test('quyết toán dự kiến giữa năm: quy biểu thuế về n/12 năm thì thu nhập đều → khớp tổng tạm tính', () => {
  const m = P.monthlyPit({ taxable: 60000000, insurance: 3000000, dependents: 1, extrasYear: { health: 12000000, education: 0, other: 0 }, schedule: S26 });
  const n = 9, f = n / 12;
  const a = P.annualPit({ taxable: 60000000 * n, insurance: 3000000 * n, dependentMonths: n, selfMonths: n, extrasYear: { health: 12000000 * f, education: 0, other: 0 }, schedule: P.scaleSchedule(S26, f), priorTax: m.tax * n });
  assert.ok(Math.abs(a.settle) <= n, `chênh lệch chỉ do làm tròn: ${a.settle}`);
  assert.equal(P.scaleSchedule(S26, 0.5).brackets[0].upto, 60000000);
  assert.equal(P.scaleSchedule(S26, 0.5).brackets[4].upto, null);
  assert.equal(P.scaleSchedule(S26, 0.5).healthCap, 11500000);
});
