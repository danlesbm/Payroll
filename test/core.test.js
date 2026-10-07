const test = require('node:test');
const assert = require('node:assert/strict');
const { nextStatus, editorRole } = require('../src/lib/workflow');
const { can } = require('../src/lib/permissions');
const { isMonthOpen, daysInMonth } = require('../src/lib/dates');
const c = require('../src/lib/calc');

test('tháng chưa đến thì khoá, tháng hiện tại và quá khứ thì mở', () => {
  const now = { year: 2026, month: 10, day: 5 };
  assert.equal(isMonthOpen(2026, 10, now), true);
  assert.equal(isMonthOpen(2026, 9, now), true);
  assert.equal(isMonthOpen(2026, 11, now), false);
  assert.equal(isMonthOpen(2027, 1, now), false);
  assert.equal(daysInMonth(2028, 2), 29);
});
test('quy trình chấm công đi đúng luồng và chặn sai trạng thái', () => {
  assert.equal(nextStatus('submit', 'draft'), 'pending_l1');
  assert.equal(nextStatus('submit', 'draft', { requireL1: false }), 'pending_l2');
  assert.equal(nextStatus('l1_approve', 'pending_l1'), 'pending_l2');
  assert.equal(nextStatus('send_final', 'pending_l2'), 'pending_l3');
  assert.equal(nextStatus('l3_submit', 'pending_l3'), 'pending_dir');
  assert.equal(nextStatus('complete', 'pending_dir'), 'locked');
  assert.equal(nextStatus('l3_return', 'pending_l3'), 'pending_l2');
  assert.equal(nextStatus('dir_return', 'pending_dir'), 'pending_l3');
  assert.equal(nextStatus('reopen', 'locked'), 'pending_l2');
  assert.throws(() => nextStatus('complete', 'pending_l3'));
  assert.throws(() => nextStatus('submit', 'locked'));
  assert.equal(editorRole('draft'), 'timekeeper');
  assert.equal(editorRole('pending_l1'), 'l1');
  assert.equal(editorRole('pending_l2'), 'l2');
  assert.equal(editorRole('pending_l3'), 'l3');
  assert.equal(editorRole('pending_dir'), null);
  assert.equal(editorRole('locked'), null);
});
test('phân quyền theo phạm vi, giám đốc thay thế cấp 3, admin toàn quyền', () => {
  const a = [{ role: 'timekeeper', scope_type: 'sheet', scope_id: 'S1' }, { role: 'l2', scope_type: 'group', scope_id: 'G1' }, { role: 'director', scope_type: 'all', scope_id: '' }];
  assert.equal(can(a, 'timekeeper', { sheetId: 'S1' }), true);
  assert.equal(can(a, 'timekeeper', { sheetId: 'S2' }), false);
  assert.equal(can(a, 'l2', { sheetId: 'S9', groupId: 'G1' }), true);
  assert.equal(can(a, 'l2', { sheetId: 'S9', groupId: 'G2' }), false);
  assert.equal(can(a, 'l3', { groupId: 'G7' }), true);
  assert.equal(can(a, 'l1', { sheetId: 'S1' }), false);
  assert.equal(can([], 'l1', {}, true), true);
});
test('đơn giá chọn theo độ cụ thể và ngày hiệu lực', () => {
  const prices = [{ id: 1, amount: 100, effective_from: '2026-01-01' }, { id: 2, group_id: 'G', employee_type: 'worker', amount: 200, effective_from: '2026-01-01' },
    { id: 3, group_id: 'G', department_id: 'D', amount: 300, effective_from: '2026-01-01' }, { id: 4, group_id: 'G', department_id: 'D', amount: 400, effective_from: '2026-11-01' }];
  const at = (ctx, d) => c.pickUnitPrice(prices, ctx, d)?.amount;
  assert.equal(at({ groupId: 'G', departmentId: 'D', employeeType: 'worker' }, '2026-10-01'), 300);
  assert.equal(at({ groupId: 'G', departmentId: 'D', employeeType: 'worker' }, '2026-11-01'), 400);
  assert.equal(at({ groupId: 'G', departmentId: 'X', employeeType: 'worker' }, '2026-10-01'), 200);
  assert.equal(at({ groupId: 'G', departmentId: 'X', employeeType: 'manager' }, '2026-10-01'), 100);
  assert.equal(at({ groupId: 'Z', departmentId: 'X', employeeType: 'manager' }, '2025-01-01'), undefined);
});
test('hệ số lấy bản hiệu lực mới nhất, cùng ngày thì bản nhập sau thắng', () => {
  const rows = [{ id: 1, effective_from: '2026-01-01', v: 'a' }, { id: 2, effective_from: '2026-06-01', v: 'b' }, { id: 3, effective_from: '2026-06-01', v: 'c' }];
  assert.equal(c.pickEffective(rows, '2026-05-31').v, 'a');
  assert.equal(c.pickEffective(rows, '2026-10-31').v, 'c');
  assert.equal(c.pickEffective(rows, '2025-12-31'), null);
});
test('ăn ca tự động theo ký hiệu công và đơn giá theo bảng lương', () => {
  const cm = { K1: [{ meal_type_id: 'T', quantity: 1 }], 'K1,3': [{ meal_type_id: 'T', quantity: 2 }], P: [] };
  const q = c.autoMealQty(['K1', 'K1', 'K1,3', 'P'], cm);
  assert.deepEqual(q, { T: 4 });
  const rates = [{ meal_type_id: 'T', group_id: null, amount: 20000, effective_from: '2026-01-01' }, { meal_type_id: 'T', group_id: 'G', amount: 30000, effective_from: '2026-01-01' }];
  assert.equal(c.pickMealRate(rates, 'T', 'G', '2026-10-01').amount, 30000);
  assert.equal(c.pickMealRate(rates, 'T', 'H', '2026-10-01').amount, 20000);
  assert.equal(c.mealAmount(q, { T: 30000 }), 120000);
});
test('tính lương: BH + thưởng + phụ cấp + ăn − trừ, theo tỷ lệ công', () => {
  const coefTypes = [{ code: 'bhxh', kind: 'insurance' }, { code: 'cv', kind: 'bonus' }, { code: 'tn', kind: 'bonus' }, { code: 'at', kind: 'amount' }];
  const r = c.calcLine({ workDays: 13, standardDays: 26, baseWage: 2340000, coefTypes, coefs: { bhxh: 3, cv: 1.5, tn: 0.5, at: 200000 }, unitPrice: 1000000,
    mealAmount: 400000, mealInNet: true, monthlyBonus: 100000, monthlyDeduction: 50000,
    deductionTypes: [{ code: 'bhxh', name: 'BHXH', calc: 'pct_insurance', value: 8 }, { code: 'bhyt', name: 'BHYT', calc: 'pct_insurance', value: 1.5 }] });
  assert.equal(r.ratio, 0.5);
  assert.equal(r.insuranceSalary, 3510000);
  assert.equal(r.bonus, 1100000);
  assert.equal(r.allowance, 200000);
  assert.equal(r.insuranceBase, 3710000);           // mức đóng BH = lương BH + phụ cấp
  assert.equal(r.periodicDeduction, 296800 + 55650);
  assert.equal(r.deduction, 296800 + 55650 + 50000);
  assert.equal(r.net, 3510000 + 1100000 + 200000 + 400000 - r.deduction);
  assert.equal(c.calcLine({ workDays: 26, standardDays: 26, baseWage: 1000, coefTypes, coefs: { bhxh: 1 }, mealAmount: 500, mealInNet: false }).net, 1000);
});
test('ăn ca theo ký hiệu công: một mức chung; mức nhập có hiệu lực sau tháng vẫn được dùng; ký hiệu không cấu hình = 0', () => {
  const rows = [{ code: 'K1', group_id: null, amount: 35000, effective_from: '2026-10-06', id: 1 }, { code: 'K1,3', group_id: null, amount: 70000, effective_from: '2026-01-01', id: 2 },
    { code: 'K1', group_id: 'G', amount: 40000, effective_from: '2026-01-01', id: 3 }];
  const a = c.mealByCode(['K1', 'K1', 'K1,3', 'P'], rows, 'X', '2026-09-30');
  assert.equal(a.amount, 35000 * 2 + 70000); assert.equal(a.days, 3);
  assert.equal(c.mealByCode(['K1'], rows, 'G', '2026-09-30').amount, 35000);
});
test('công nhân trực ca kíp: đơn giá ngày = hệ số × đơn giá ÷ công tối thiểu; thiếu → theo công; trong khoảng → đủ; vượt chuẩn → làm thêm', () => {
  const base = { standardDays: 26, minDays: 24, rateBasis: 'min', baseWage: 2400000, coefTypes: [{ code: 'a', kind: 'insurance' }], coefs: { a: 1 } };
  assert.equal(c.calcLine({ ...base, workDays: 20 }).insuranceSalary, 2000000);
  assert.equal(c.calcLine({ ...base, workDays: 25 }).insuranceSalary, 2400000);
  const o = c.calcLine({ ...base, workDays: 27 }); assert.equal(o.insuranceSalary, 2400000); assert.equal(o.otSalaryAmt, 100000);
  assert.equal(c.calcLine({ ...base, workDays: 24 }).dailySalary, 100000);
});
test('shiftGroupMin: kíp thấp nhất (công cao nhất trong kíp) là công tối thiểu; ký hiệu LT trả riêng theo %; phép chỉ lương', () => {
  const w = require('../src/lib/workdays');
  const g = w.shiftGroupMin([{ shiftNo: 1, work: 24 }, { shiftNo: 1, work: 20 }, { shiftNo: 2, work: 26 }, { shiftNo: 3, work: 23 }, { work: 30 }]);
  assert.equal(g.min, 23); assert.equal(g.lowestKip, 3); assert.equal(w.shiftGroupMin([{ work: 5 }]), null);
  const by = w.shiftGroupMinBy([{ shiftNo: 1, dept: 'NC', work: 22 }, { shiftNo: 1, dept: 'TC', work: 24 }, { shiftNo: 1, dept: 'TC', work: 24 }]);
  assert.equal(by.NC.min, 22); assert.equal(by.TC.min, 24);
  assert.equal(w.minDays({ min_mode: 'group_min' }, 26, 23), 23); assert.equal(w.minDays({ min_mode: 'group_min' }, 26, null), 26); assert.equal(w.minDays({ min_mode: 'group_min' }, 22, 25), 22);
  const pct = { LT1: 150, LT2: 195, LT3: 300, LT4: 390, K3: 130 };
  const p = w.premiumDays([{ code: 'LT1', day: 2 }, { code: 'LT4', day: 3 }, { code: 'K3', day: 4 }], { work: { LT1: { value: 1, night: 0 }, LT4: { value: 1, night: 1 }, K3: { value: 1, night: 1 } }, kind: { K3: 'night' }, ot: x => x[0] === 'L', pct: x => pct[x], holPct: d => (d === 3 ? 400 : 100) });
  assert.equal(p.extra, 1.5 + 3.9); assert.equal(p.night, 0.3); assert.equal(p.holiday, 0);
  const r = c.calcLine({ workDays: 24, workDaysBonus: 20, standardDays: 24, minDays: 24, baseWage: 2400000, unitPrice: 2400000, coefTypes: [{ code: 'a', kind: 'insurance' }, { code: 'b', kind: 'bonus' }], coefs: { a: 1, b: 1 } });
  assert.equal(r.insuranceSalary, 2400000); assert.equal(r.bonusBase, 2000000);
});
test('khoản thưởng/trừ: cố định hoặc hệ số × đơn giá; thuế trừ vào thưởng tách khỏi lương', () => {
  const r = c.calcLine({ workDays: 26, standardDays: 26, baseWage: 2350000, unitPrice: 2500000, coefTypes: [{ code: 'a', kind: 'insurance' }, { code: 'b', kind: 'bonus' }], coefs: { a: 4, b: 2 },
    items: [{ kind: 'deduction', calc: 'fixed', amount: 50000 }, { kind: 'deduction', calc: 'coef_price', basis: 'insurance', value: 10000 }, { kind: 'bonus', calc: 'coef_price', basis: 'bonus', value: 100000 }, { kind: 'bonus_deduction', calc: 'fixed', amount: 1000 }], deductionTypes: [] });
  assert.equal(r.monthlyDeduction, 50000 + 40000); assert.equal(r.monthlyBonus, 200000);
  assert.equal(r.salaryNet, 4 * 2350000 - 90000); assert.equal(r.bonusNet, 2 * 2500000 + 200000 - 1000);
  assert.equal(r.net, r.salaryNet + r.bonusNet);
});
test('phiên Payroll: ký, kiểm tra và từ chối token giả', () => {
  const s = require('../src/lib/session'); const t = s.issue({ id: '5', email: 'a@b' });
  assert.equal(s.verify(t).id, '5'); assert.equal(s.verify(t.slice(0, -2) + 'xx'), null); assert.equal(s.verify('abc'), null);
});
test('ghi file xlsx hợp lệ', () => {
  const { Workbook } = require('../src/lib/xlsx'); const wb = new Workbook(); wb.sheet('A').set(1, 1, 'x', { b: true });
  assert.equal(wb.toBuffer().slice(0, 2).toString(), 'PK');
});

test('làm sạch tên SSO', () => {
  const { cleanName, isExcluded, parsePatterns } = require('../src/lib/names');
  assert.equal(cleanName('Phó phòng kỹ thuật - Phạm Văn Hảo', 'Phó phòng'), 'Phạm Văn Hảo');
  assert.equal(cleanName('Nguyễn Vân Kiều - NV Văn phòng', 'Nhân viên'), 'Nguyễn Vân Kiều');
  assert.equal(cleanName('Nguyễn Văn Trưởng - NV phòng KH', 'Nhân viên'), 'Nguyễn Văn Trưởng');
  assert.equal(cleanName('Giám đốc NMTĐ Suối Sập  3 - Lò Văn Thanh', 'Trưởng phòng'), 'Lò Văn Thanh');
  assert.equal(cleanName('Admin', ''), 'Admin');
  assert.equal(cleanName('Vũ Văn Nam_lái xe', 'Nhân viên'), 'Vũ Văn Nam');
  assert.equal(cleanName('Giám đốc NMTĐ SS3_ Lò Văn Thanh', 'Trưởng phòng'), 'Lò Văn Thanh');
  assert.equal(cleanName('Nguyễn Văn An -NV phòng KH', 'Nhân viên'), 'Nguyễn Văn An');
  assert.equal(cleanName('Phó phòng KT- Phạm Văn Hảo', 'Phó phòng'), 'Phạm Văn Hảo');
  assert.equal(cleanName('Nguyễn Thị Hoa-Lan', 'Nhân viên'), 'Nguyễn Thị Hoa-Lan');
  const pat = parsePatterns('admin\n NMTĐ Suối Sập 3 \n');
  assert.ok(isExcluded({ sso_name: 'Admin' }, pat)); assert.ok(isExcluded({ sso_name: 'NMTĐ Suối Sập 3' }, pat));
  assert.ok(!isExcluded({ sso_name: 'Lò Văn Thanh', email: 'thanh@x.vn' }, pat));
});
test('xếp loại lao động nhân vào lương & thưởng; an toàn B mất phụ cấp an toàn; % BH theo lương gốc + phụ cấp', () => {
  const base = { workDays: 26, standardDays: 26, baseWage: 1000000, unitPrice: 100000,
    coefTypes: [{ code: 'bh', kind: 'insurance' }, { code: 'th', kind: 'bonus' }, { code: 'pc', kind: 'amount' }, { code: 'an_toan', kind: 'amount' }],
    coefs: { bh: 3, th: 2, pc: 50000, an_toan: 150000 }, safetyCode: 'an_toan', deductionTypes: [{ code: 'bhxh', name: 'BH', calc: 'pct_insurance', value: 10 }] };
  const a = c.calcLine({ ...base });
  assert.equal(a.insuranceSalary, 3000000); assert.equal(a.allowance, 200000);
  assert.equal(a.periodicDeduction, 320000);     // 10% của (3.000.000 + phụ cấp 200.000)
  const b = c.calcLine({ ...base, laborFactor: 0.8, safetyFactor: 0 });
  assert.equal(b.insuranceSalary, 2400000); assert.equal(b.bonusBase, 160000);
  assert.equal(b.allowance, 50000);              // B: mất phụ cấp an toàn, phụ cấp khác giữ nguyên
  assert.equal(b.periodicDeduction, 305000);     // 10% của (3.000.000 chưa nhân xếp loại + phụ cấp còn lại 50.000)
  assert.equal(c.calcLine({ ...base, safetyFactor: 1 }).allowance, 200000);
});

test('thứ bậc chức vụ', () => {
  const { posRank } = require('../src/lib/names');
  assert.ok(posRank('Giám đốc') < posRank('Phó GĐ')); assert.ok(posRank('Phó GĐ') < posRank('Trưởng phòng'));
  assert.ok(posRank('Trưởng phòng') < posRank('Phó phòng')); assert.ok(posRank('Phó phòng') < posRank('Nhân viên'));
  assert.equal(posRank('Trưởng phòng, Phó GĐ'), posRank('Phó GĐ'));
  assert.ok(posRank('Văn thư, Nhân viên') < posRank('Nhân viên'));
});

test('chức danh hiển thị ở nhà máy', () => {
  const { dispPositions } = require('../src/lib/names');
  const st = { plant_title_head: 'Giám đốc nhà máy', plant_title_deputy: 'P. Giám đốc nhà máy' };
  assert.equal(dispPositions('Trưởng phòng', 'plant', st), 'Giám đốc nhà máy');
  assert.equal(dispPositions('Phó phòng, Nhân viên', 'plant', st), 'P. Giám đốc nhà máy');
  assert.equal(dispPositions('Trưởng phòng', 'office', st), 'Trưởng phòng');
  assert.equal(dispPositions('Trưởng phòng', 'plant', { plant_title_head: '' }), 'Trưởng phòng');
});

test('lương cơ sở: mức riêng theo loại nhân sự ưu tiên hơn mức chung, theo ngày hiệu lực', () => {
  const rows = [
    { id: 1, value: 1800000, effective_from: '2026-01-01', employee_type: null },
    { id: 2, value: 2000000, effective_from: '2026-01-01', employee_type: 'manager' },
    { id: 3, value: 2200000, effective_from: '2026-07-01', employee_type: 'manager' },
    { id: 4, value: 1900000, effective_from: '2026-07-01', employee_type: null }];
  assert.equal(c.pickBaseWage(rows, 'manager', '2026-06-30').value, 2000000);
  assert.equal(c.pickBaseWage(rows, 'manager', '2026-07-31').value, 2200000);
  assert.equal(c.pickBaseWage(rows, 'worker', '2026-06-30').value, 1800000);
  assert.equal(c.pickBaseWage(rows, 'worker', '2026-07-31').value, 1900000);
  assert.equal(c.pickBaseWage(rows, 'worker', '2025-12-31'), null);
});
test('loại Hành chính (admin): lương cơ sở và đơn giá riêng, không có thì dùng mức chung', () => {
  const base = [{ id: 1, value: 1800000, effective_from: '2026-01-01', employee_type: null }, { id: 2, value: 2300000, effective_from: '2026-09-01', employee_type: 'admin' }];
  assert.equal(c.pickBaseWage(base, 'admin', '2026-08-31').value, 1800000);
  assert.equal(c.pickBaseWage(base, 'admin', '2026-09-30').value, 2300000);
  assert.equal(c.pickBaseWage(base, 'manager', '2026-09-30').value, 1800000);
  const prices = [{ id: 1, employee_type: 'worker', amount: 2000000, effective_from: '2026-09-01' }, { id: 2, employee_type: 'admin', amount: 2200000, effective_from: '2026-09-01' }, { id: 3, employee_type: 'manager', amount: 2500000, effective_from: '2026-09-01' }];
  assert.equal(c.pickUnitPrice(prices, { groupId: 'G', departmentId: 'D', employeeType: 'admin' }, '2026-09-30').amount, 2200000);
  const { isEmpType, empTypeName } = require('../src/lib/emptypes');
  assert.ok(isEmpType('admin') && !isEmpType('boss'));
  assert.equal(empTypeName('admin'), 'Hành chính');
});
test('cấp 1 và Giám đốc tự suy từ chức vụ SSO', () => {
  const { derive } = require('../src/lib/autoroles');
  const r = (positions, extra = {}) => ({ sso_user_id: 'u', full_name: 'X', positions, dept_name: 'P', sheet_id: 'S1', sheet_name: 'Bảng', dept_has_head: false, ...extra });
  const roles = l => derive(l).map(a => a.role + ':' + a.scope_type);
  assert.deepEqual(roles([r('Trưởng phòng')]), ['l1:sheet']);
  assert.deepEqual(roles([r('Phó phòng')]), ['l1:sheet']);
  assert.deepEqual(roles([r('Phó phòng', { dept_has_head: true })]), []);
  assert.deepEqual(roles([r('Giám đốc', { sheet_id: null })]), ['director:all']);
  assert.deepEqual(roles([r('Phó GĐ, Trưởng phòng')]), ['l1:sheet']);
  assert.deepEqual(roles([r('Nhân viên')]), []);
});

test('tên và chức danh HĐQT / BKS / quản lý được tách đúng', () => {
  const n = require('../src/lib/names');
  for (const raw of ['Chủ tịch HĐQT - Vũ Minh Tú', 'Chủ tịch HĐQT_Vũ Minh Tú', 'Chủ tịch HĐQT -Vũ Minh Tú', 'Chủ tịch HĐQT- Vũ Minh Tú', 'Chủ tịch HĐQT_ Vũ Minh Tú']) {
    assert.equal(n.cleanName(raw, 'Hội đồng quản trị'), 'Vũ Minh Tú', raw);
    assert.equal(n.extractTitle(raw, 'Hội đồng quản trị'), 'Chủ tịch HĐQT', raw);
  }
  assert.equal(n.cleanName('Thành viên BKS_Nguyễn Văn Minh', 'Ban Kiểm Soát'), 'Nguyễn Văn Minh');
  assert.equal(n.extractTitle('Trưởng ban kiểm soát - Nguyễn Văn Minh', 'Ban Kiểm Soát'), 'Trưởng ban kiểm soát');
  assert.equal(n.cleanName('Kế toán trưởng - Lê Thị Hoa', 'Trưởng phòng'), 'Lê Thị Hoa');
  assert.equal(n.extractTitle('Kế toán trưởng - Lê Thị Hoa', 'Trưởng phòng'), 'Kế toán trưởng');
  assert.equal(n.extractTitle('Phó phòng kỹ thuật - Phạm Văn Hảo', 'Phó phòng'), '');      // không thuộc danh sách chức danh -> suy từ SSO
  assert.equal(n.extractTitle('Nguyễn Vân Kiều - NV Văn phòng', 'Văn thư, Nhân viên'), '');
  assert.equal(n.cleanName('Nguyễn Thị Hoa-Lan', 'Nhân viên'), 'Nguyễn Thị Hoa-Lan');
});
test('chức danh hiển thị chỉ một chức danh, bỏ người phụ trách / văn thư', () => {
  const d = require('../src/lib/names').dispPositions;
  assert.equal(d('Phó GĐ, Người phụ trách', 'office'), 'P. Giám đốc');
  assert.equal(d('Văn thư, Nhân viên', 'office'), 'Nhân viên');
  assert.equal(d('Văn thư', 'office'), 'Nhân viên');
  assert.equal(d('Hội đồng quản trị', 'office', {}, 'Chủ tịch HĐQT'), 'Chủ tịch HĐQT');
  assert.equal(d('Hội đồng quản trị', 'office'), 'Thành viên HĐQT');
  assert.equal(d('Ban Kiểm Soát', 'office'), 'Thành viên BKS');
  assert.equal(d('Giám đốc', 'office'), 'Giám đốc');
  assert.equal(d('Trưởng phòng', 'plant', { plant_title_head: 'Giám đốc nhà máy' }), 'Giám đốc nhà máy');
  assert.equal(d('Phó phòng', 'plant', { plant_title_deputy: 'P. Giám đốc nhà máy' }), 'P. Giám đốc nhà máy');
  assert.equal(d('Phó phòng, Nhân viên', 'office'), 'Phó phòng');
});

test('bậc lương: cộng tháng co về cuối tháng, đếm ngày', () => {
  const { addMonths, daysBetween, gradeLabel } = require('../src/services/grades');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2023-10-05', 36), '2026-10-05');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(daysBetween('2026-10-05', '2026-12-04'), 60);
  assert.equal(gradeLabel('Chung', 3), 'Chung · Bậc 3');
  assert.equal(gradeLabel('', null), '');
});

test('công chuẩn: ngày nghỉ hằng tuần + ngày lễ, ngày lễ trùng Chủ nhật chỉ tính 1 ngày nghỉ', () => {
  const W = require('../src/lib/workdays');
  assert.equal(W.monthInfo(2026, 10, 'sun', []).standard, 27);
  assert.equal(W.monthInfo(2026, 10, 'sat_sun', []).standard, 22);
  // 6/9/2026 là Chủ nhật: lễ trùng CN không trừ thêm
  assert.equal(W.monthInfo(2026, 9, 'sun', ['2026-09-06']).standard, 26);
  assert.equal(W.monthInfo(2026, 9, 'sun', ['2026-09-02']).standard, 25);
  assert.equal(W.monthInfo(2026, 9, 'sat_sun', ['2026-09-01', '2026-09-02']).standard, 20);
  const i = W.monthInfo(2026, 9, 'sun', new Set(['2026-09-06', '2026-09-07']));
  assert.equal(i.overlap, 1); assert.equal(i.holidayCounted, 1); assert.equal(i.standard, 25);
  assert.equal(W.monthInfo(2026, 2, 'sun', []).days, 28);
});
test('công tối thiểu: bằng chuẩn / cố định / chuẩn − N / %', () => {
  const W = require('../src/lib/workdays');
  assert.equal(W.minDays({ min_mode: 'equal' }, 26), 26);
  assert.equal(W.minDays(null, 26), 26);
  assert.equal(W.minDays({ min_mode: 'fixed', min_value: 23 }, 26), 23);
  assert.equal(W.minDays({ min_mode: 'fixed', min_value: 26 }, 22), 22);       // không vượt công chuẩn
  assert.equal(W.minDays({ min_mode: 'minus', min_value: 5 }, 26), 21);
  assert.equal(W.minDays({ min_mode: 'minus', min_value: 30 }, 26), 0);
  assert.equal(W.minDays({ min_mode: 'pct', min_value: 90 }, 26), 23.4);
});
test('quy tắc cụ thể nhất: phòng > bảng lương > loại nhân sự > mặc định', () => {
  const W = require('../src/lib/workdays');
  const rules = [{ id: 'def', weekly_off: 'sun' }, { id: 'mgr', employee_type: 'manager' }, { id: 'g1', group_id: 'G1' }, { id: 'g1m', group_id: 'G1', employee_type: 'manager' }, { id: 'd1', department_id: 'D1' }];
  const pick = ctx => W.pickRule(rules, ctx)?.id;
  assert.equal(pick({ groupId: 'G9', departmentId: 'D9', employeeType: 'worker' }), 'def');
  assert.equal(pick({ groupId: 'G9', departmentId: 'D9', employeeType: 'manager' }), 'mgr');
  assert.equal(pick({ groupId: 'G1', departmentId: 'D9', employeeType: 'worker' }), 'g1');
  assert.equal(pick({ groupId: 'G1', departmentId: 'D9', employeeType: 'manager' }), 'g1m');
  assert.equal(pick({ groupId: 'G1', departmentId: 'D1', employeeType: 'worker' }), 'd1');
});
test('hệ số công tính lương: đủ / trong khoảng tối thiểu / thiếu / tăng ca', () => {
  const W = require('../src/lib/workdays');
  assert.deepEqual(W.payRatio(26, 26, 21), { ratio: 1, otDays: 0, status: 'full' });
  assert.equal(W.payRatio(23, 26, 21).ratio, 1); assert.equal(W.payRatio(23, 26, 21).status, 'tolerance');
  assert.equal(W.payRatio(21, 26, 21).ratio, 1);
  assert.equal(W.payRatio(20, 26, 21).status, 'short'); assert.ok(Math.abs(W.payRatio(20, 26, 21).ratio - 20 / 26) < 1e-9);
  const ot = W.payRatio(28, 26, 21, 1.5); assert.equal(ot.status, 'ot'); assert.equal(ot.otDays, 2); assert.ok(Math.abs(ot.ratio - (1 + 3 / 26)) < 1e-9);
  assert.equal(W.payRatio(5, 0, 0).status, 'none');
});
test('calcLine: mặc định (min = chuẩn, tăng ca ×1) cho kết quả như công thức cũ công/chuẩn', () => {
  const base = { standardDays: 26, baseWage: 1000, coefTypes: [{ code: 'a', kind: 'insurance' }, { code: 'b', kind: 'bonus' }], coefs: { a: 2, b: 1 }, unitPrice: 500 };
  for (const w of [10, 20.5, 25.5, 26, 28]) {
    const r = c.calcLine({ ...base, workDays: w });
    assert.ok(Math.abs(r.insuranceSalary + r.otSalaryAmt - 2 * 1000 * w / 26) <= 1); assert.ok(Math.abs(r.bonusBase + r.otBonusAmt - 500 * w / 26) <= 1);   // phần vượt chuẩn tách sang "làm thêm"
  }
  const t = c.calcLine({ ...base, workDays: 24, minDays: 21 });   // trong khoảng: hưởng đủ
  assert.equal(t.insuranceSalary, 2000); assert.equal(t.bonusBase, 500); assert.equal(t.payStatus, 'tolerance');
  const s = c.calcLine({ ...base, workDays: 20, minDays: 21 });   // thiếu: theo công thực tế
  assert.equal(s.insuranceSalary, Math.round(2000 * 20 / 26));
  const o = c.calcLine({ ...base, workDays: 28, minDays: 21, otSalary: 1.5, otBonus: 1 });
  assert.equal(o.insuranceSalary, 2000); assert.equal(o.otSalaryAmt, Math.round(2000 * 2 * 1.5 / 26)); assert.equal(o.otBonusAmt, Math.round(500 * 2 / 26));
  assert.equal(o.dailySalary, Math.round(2000 / 26));
});

test('làm đêm / sửa chữa / lễ: tổng ngày = lễ% × (công + công cơ sở × (% ký hiệu − 1))', () => {
  const W = require('../src/lib/workdays');
  const work = { K1: { value: 1, night: 0 }, DEM: { value: 1, night: 1 }, SC: { value: 1, night: 0 }, 'K1,3': { value: 2, night: 1 } };
  const kind = { DEM: 'night', SC: 'extra', 'K1,3': 'night' }, pctTab = { DEM: 130, SC: 135, 'K1,3': 130 };
  const o = { work, kind, pct: c => pctTab[c] ?? 100, holPct: d => (d === 1 ? 400 : 100) };
  assert.deepEqual(W.premiumDays([{ day: 5, code: 'K1' }], o), { night: 0, extra: 0, holiday: 0 });
  assert.deepEqual(W.premiumDays([{ day: 5, code: 'DEM' }], o), { night: 0.3, extra: 0, holiday: 0 });
  // ngày lễ 400% + ca đêm 130%: tổng 520% = 1 (lương) + 0,3 (làm đêm, không nhân lễ) + 3,9 (lễ: 520% − 100% − 30%)
  assert.deepEqual(W.premiumDays([{ day: 1, code: 'DEM' }], o), { night: 0.3, extra: 0, holiday: 3.9 });
  // K1,3 ngày lễ 300%: lương 2 công, làm đêm 0,3, làm lễ 2 (ca ngày 300% − 100%) + 2,6 (ca đêm 390% − 100% − 30%)
  assert.deepEqual(W.premiumDays([{ day: 1, code: 'K1,3' }], { ...o, holPct: d => (d === 1 ? 300 : 100) }), { night: 0.3, extra: 0, holiday: 4.6 });
  // K1,3 vượt công tiêu chuẩn, tăng ca ×2: ca đêm 260% = 200% (tiền tăng ca) + 30% làm đêm + 30% làm thêm
  assert.deepEqual(W.premiumDays([{ day: 2, code: 'K1' }, { day: 3, code: 'K1,3' }], { ...o, std: 1, otMult: 2 }), { night: 0.3, extra: 0.3, holiday: 0 });
  // chưa vượt công tiêu chuẩn: chỉ 30% làm đêm
  assert.deepEqual(W.premiumDays([{ day: 3, code: 'K1,3' }], { ...o, std: 26, otMult: 2 }), { night: 0.3, extra: 0, holiday: 0 });
  // sửa chữa 135% ngày lễ 400% → 540% = 1 (lương) + 0,35 (sửa chữa) + 4,05 (lễ)
  assert.deepEqual(W.premiumDays([{ day: 1, code: 'SC' }], o), { night: 0, extra: 0.35, holiday: 4.05 });
  // ký hiệu K1,3 (1 công ngày + 1 công đêm): % đêm chỉ tính trên phần công đêm
  assert.deepEqual(W.premiumDays([{ day: 5, code: 'K1,3' }], o), { night: 0.3, extra: 0, holiday: 0 });
  // ngày nghỉ bù trùng ngày nghỉ bị bỏ qua
  assert.deepEqual(W.premiumDays([{ day: 1, code: 'DEM' }], { ...o, skip: () => true }), { night: 0, extra: 0, holiday: 0 });
});
test('calcLine: làm đêm/thêm/lễ tách riêng; mặc định chuyển cả phần theo hệ số lương sang bảng thưởng', () => {
  const base = { standardDays: 24, baseWage: 2000, coefTypes: [{ code: 'a', kind: 'insurance' }, { code: 'b', kind: 'bonus' }], coefs: { a: 2, b: 1 }, unitPrice: 1000, workDays: 24, minDays: 24 };
  const dayS = 4000 / 24, dayB = 1000 / 24, pd = { night: 1.5, extra: 0.35, holiday: 3 };
  // cách cũ: phần theo hệ số lương nằm ở bảng lương
  const r = c.calcLine({ ...base, premiumDays: pd, premiumInBonus: false });
  assert.equal(r.insuranceSalary, 4000); assert.equal(r.nightSalary, Math.round(dayS * 1.5)); assert.equal(r.extraSalary, Math.round(dayS * 0.35)); assert.equal(r.holidaySalary, Math.round(dayS * 3));
  assert.equal(r.nightBonus, Math.round(dayB * 1.5)); assert.equal(r.holidayBonus, Math.round(dayB * 3));
  assert.equal(r.salaryNet, 4000 + r.nightSalary + r.extraSalary + r.holidaySalary);
  assert.equal(r.net, r.salaryNet + r.bonusNet);
  // mặc định: bảng lương dừng ở lương BH; thưởng làm đêm/thêm/lễ = phần lương + phần thưởng; thực lĩnh tổng không đổi
  const m = c.calcLine({ ...base, premiumDays: pd });
  assert.equal(m.nightSalary, 0); assert.equal(m.extraSalary, 0); assert.equal(m.holidaySalary, 0); assert.equal(m.salaryNet, 4000);
  assert.equal(m.nightBonus, r.nightSalary + r.nightBonus); assert.equal(m.extraBonus, r.extraSalary + r.extraBonus); assert.equal(m.holidayBonus, r.holidaySalary + r.holidayBonus);
  assert.equal(m.premSal.night, r.nightSalary); assert.equal(m.premBon.night, r.nightBonus);
  assert.equal(m.net, r.net);
  // công vượt chuẩn tính vào "làm thêm", phần chính tối đa 1 lần công chuẩn
  const o = c.calcLine({ ...base, workDays: 26, premiumInBonus: false });
  assert.equal(o.insuranceSalary, 4000); assert.equal(o.extraSalary, Math.round(dayS * 2)); assert.equal(o.otSalaryAmt, Math.round(dayS * 2));
  // khoản trừ % BH chỉ tính trên lương chính
  const d = c.calcLine({ ...base, premiumDays: { holiday: 3 }, deductionTypes: [{ code: 'bh', name: 'BH', calc: 'pct_insurance', value: 10 }] });
  assert.equal(d.deduction, 400); assert.equal(d.salaryNet, 4000 - 400);
});

test('hệ số hoàn thành kế hoạch nhân vào thưởng; hệ số "tổng" tự cộng các hệ số thưởng khác', () => {
  const types = [{ code: 'bh', kind: 'insurance' }, { code: 'cv', kind: 'bonus' }, { code: 'tn', kind: 'bonus' }, { code: 'tong', kind: 'bonus', is_total: true }];
  assert.equal(c.bonusCoefOf(types, { cv: 1.5, tn: 0.5, tong: 99 }), 2);
  assert.equal(c.bonusCoefOf(types, { tong: 3.465 }), 3.465);   // dữ liệu cũ: nhập thẳng tổng
  const base = { workDays: 26, standardDays: 26, baseWage: 1000000, unitPrice: 1000000, coefTypes: types, coefs: { bh: 1, cv: 1.5, tn: 0.5 } };
  assert.equal(c.calcLine(base).bonusBase, 2000000);
  const r = c.calcLine({ ...base, planFactor: 0.9, items: [{ kind: 'bonus', calc: 'fixed', amount: 100000 }] });
  assert.equal(r.bonusBase, 1800000); assert.equal(r.bonus, 1900000); assert.equal(r.insuranceSalary, 1000000);
});

test('phân quyền theo bộ phận và quyền cài đặt chấm công / nhân sự', () => {
  const P = require('../src/lib/permissions');
  const as = [{ role: 'timekeeper', scope_type: 'department', scope_id: 'd1' }, { role: 'cfg_att', scope_type: 'all', scope_id: '' }];
  assert.equal(P.can(as, 'timekeeper', { sheetId: 's1', groupId: 'g1' }), false);   // phạm vi bộ phận không mở cả bảng
  assert.deepEqual([...P.deptIds(as, ['timekeeper', 'view_att'])], ['d1']);
  assert.equal(P.can(as, 'cfg_att', {}), true); assert.equal(P.can(as, 'people', {}), false);
  assert.deepEqual(P.SCOPES_OF('cfg_att'), ['all']); assert.ok(P.SCOPES_OF('timekeeper').includes('department')); assert.ok(!P.SCOPES_OF('l2').includes('department'));
});

test('Excel: số nguyên không có dấu chấm thừa; ăn ca theo kiểu bộ phận', () => {
  const { Workbook } = require('../src/lib/xlsx');
  const ws = new Workbook().sheet('t');
  ws.set(1, 1, 7, { fmt: '#,##0.##' }); ws.set(1, 2, 1.5, { fmt: '#,##0.###' });
  const cells = [...ws.cells.values()], fmts = cells.map(c => c.s);
  assert.notEqual(fmts[0], fmts[1]);   // 2 kiểu ô khác nhau: số nguyên dùng định dạng không có phần thập phân
  const num = c.mealAmount({ a: 10, b: 5 }, { a: 40000, b: 20000 });
  assert.equal(num, 500000);
});
