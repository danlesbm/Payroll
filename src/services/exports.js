// Xuất Excel (in được): bảng lương, bảng thưởng, bảng hệ số, bảng ăn ca, bảng chấm công — theo từng nhóm (bảng lương) / bảng chấm công.
const { Workbook } = require('../lib/xlsx');
const { monthEnd, daysInMonth } = require('../lib/dates');
const calc = require('../lib/calc');
const { mealReport } = require('./meals');
const { safetyHolders } = require('./safety');

const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);
const n = calc.num;
const MONEY = '#,##0', COEF = '#,##0.###', ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const pad = v => String(v).padStart(2, '0');
const DEFAULT_SIGN = { pay: ['Giám đốc', 'Kế toán trưởng', 'Người lập biểu'], att: ['Giám đốc', 'Phụ trách bộ phận', 'Người chấm công'] };

async function settings(c) { return Object.fromEntries((await q(c, 'SELECT key, value FROM settings')).map(r => [r.key, r.value])); }
const { dispPositions } = require('../lib/names');
const signersOf = (list, kind) => (Array.isArray(list) && list.length ? list : DEFAULT_SIGN[kind].map(title => ({ title, name: '' })));

// ---------- khung chung ----------
function head(ws, ncols, company, titles) {
  ws.box(1, 1, 1, Math.min(ncols, 6), String(company || '').toUpperCase(), { b: true, u: true, sz: 12 });
  titles.forEach((t, i) => ws.box(3 + i, 1, 3 + i, ncols, t, { b: true, sz: i === 0 ? 15 : 13, al: 'center' }));
  return 3 + titles.length + 1;
}
function signBlock(ws, row, ncols, signers, place, dateText) {
  const k = Math.max(1, signers.length), per = Math.max(1, Math.floor(ncols / k));
  ws.box(row, Math.max(1, ncols - per * Math.min(k, 3) + 1), row, ncols, `${place}, ${dateText}`, { i: true, al: 'right' });
  signers.forEach((s, i) => {
    const c1 = i * per + 1, c2 = i === k - 1 ? ncols : (i + 1) * per;
    ws.box(row + 1, c1, row + 1, c2, s.title, { b: true, al: 'center', sz: 12 });
    ws.box(row + 6, c1, row + 6, c2, s.name || '', { b: true, al: 'center', sz: 12 });
  });
  return row + 7;
}
const dateText = (d, run) => {
  const x = run?.signed_at || run?.locked_at || null;
  if (x) { const t = new Date(x); return `ngày ${pad(t.getDate())} tháng ${pad(t.getMonth() + 1)} năm ${t.getFullYear()}`; }
  return 'ngày …… tháng …… năm ……';
};

// Bảng có 2 tầng tiêu đề, dòng đánh số cột, nhóm theo phòng (có cộng từng phòng) và dòng tổng.
// cols: [{h, g?, w, fmt?, al?, sum?, tt?, val(row)}]; depts: [{name, rows:[...]}]
function table(ws, r0, cols, depts, opt = {}) {
  const hs = { b: true, al: 'center', va: 'center', wrap: true, border: true, fill: 'EDEDED' };
  cols.forEach((c, i) => ws.col(i + 1, c.w || 12));
  for (let i = 0; i < cols.length;) {
    const c = cols[i];
    if (!c.g) { ws.box(r0, i + 1, r0 + 1, i + 1, c.h, hs); i++; continue; }
    let j = i; while (j + 1 < cols.length && cols[j + 1].g === c.g) j++;
    ws.box(r0, i + 1, r0, j + 1, c.g, hs);
    for (let k = i; k <= j; k++) ws.set(r0 + 1, k + 1, cols[k].h, hs);
    i = j + 1;
  }
  ws.height(r0, 32); ws.height(r0 + 1, 62);
  cols.forEach((c, i) => ws.set(r0 + 2, i + 1, i + 1, { i: true, al: 'center', border: true, fill: 'F8F8F8' }));
  ws.printTitles = [r0, r0 + 2];
  let r = r0 + 3; const total = cols.map(() => 0), hasSum = cols.map(c => !!c.sum);
  const blank0 = (c, v) => (c.fmt === COEF && !n(v) ? null : v);
  const cell = (c, v, bold, italic) => ({ border: true, b: bold, i: italic, al: c.al || (c.fmt ? 'right' : 'left'), fmt: c.fmt, wrap: !c.fmt });
  depts.forEach((d, di) => {
    const sums = cols.map((c, i) => hasSum[i] ? d.rows.reduce((s, x) => s + n(c.val(x)), 0) : null);
    if (opt.deptRows !== false) {
      cols.forEach((c, i) => ws.set(r, i + 1, i === 0 ? (ROMAN[di] || di + 1) : i === 1 ? d.name : sums[i] === null ? null : blank0(c, sums[i]), { ...cell(c, 0, true, i === 1), al: i === 0 ? 'center' : (i === 1 ? 'left' : (c.al || 'right')) }));
      ws.height(r, 22); r++;
    }
    let lastSec = null;
    d.rows.forEach((x, k) => {
      if (x._sec && x._sec !== lastSec) {
        lastSec = x._sec;
        cols.forEach((c, i) => ws.set(r, i + 1, i === 1 ? x._sec : null, { border: true, b: true, i: true, fill: 'F3F3F3', al: 'left' }));
        ws.height(r, 20); r++;
      }
      cols.forEach((c, i) => ws.set(r, i + 1, c.tt ? k + 1 : blank0(c, c.val(x)), { ...cell(c), al: c.tt ? 'center' : (c.al || (c.fmt ? 'right' : 'left')) }));
      ws.height(r, opt.rowHeight || 24); r++;
    });
    sums.forEach((v, i) => { if (v !== null) total[i] += v; });
  });
  cols.forEach((c, i) => ws.set(r, i + 1, i === 1 ? 'Tổng cộng' : hasSum[i] ? blank0(c, total[i]) : null, { ...cell(c, 0, true), al: i === 1 ? 'center' : (c.al || 'right') }));
  ws.height(r, 24);
  return r + 2;
}
// Nhà máy: tách mục "Bộ phận quản lý" và "Công nhân vận hành" (theo ca, trưởng ca đứng trước)
const secOf = x => x.employee_type === 'manager' ? 'Bộ phận quản lý' : (x.shift_no ? `Công nhân vận hành — Kíp ${x.shift_no}` : 'Công nhân vận hành');
function byDept(list, key = 'pay_department_name', plant = false) {
  const out = []; let cur = null;
  for (const x of list) {
    if (plant) x._sec = secOf(x); const nme = x[key] || 'Chưa xếp bộ phận'; if (!cur || cur.name !== nme) { cur = { name: nme, rows: [] }; out.push(cur); } cur.rows.push(x); }
  return out;
}

// ---------- dữ liệu bảng lương ----------
async function payrollData(c, groupId, year, month) {
  const group = (await q(c, 'SELECT id, name, signers, kind FROM groups WHERE id=$1', [groupId]))[0];
  const run = (await q(c, 'SELECT * FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [groupId, year, month]))[0];
  if (!run) { const e = new Error('Chưa có bảng lương tháng này — hãy chạy lương nháp trước khi xuất.'); e.status = 404; throw e; }
  const lines = await q(c, `SELECT pl.*, e.full_name, e.employee_code, e.positions, e.title, e.employee_type, e.shift_no, e.is_lead, v.pay_department_name, v.pay_department_sort
    FROM payroll_lines pl JOIN employees e ON e.id=pl.employee_id LEFT JOIN v_employees v ON v.id=e.id WHERE pl.run_id=$1
    ORDER BY v.pay_department_sort NULLS LAST, v.pay_department_name, v.emp_order, e.sort_order, e.full_name`, [run.id]);
  const coefTypes = await q(c, 'SELECT code, name, kind, is_total FROM coefficient_types WHERE active ORDER BY sort_order, code');
  const dedTypes = await q(c, 'SELECT code, name FROM deduction_types ORDER BY sort_order, code');
  const st = await settings(c); lines.forEach(l => { l.positions = dispPositions(l.positions, group.kind, st, l.title); });
  return { group, run, lines, coefTypes, dedTypes, st };
}
const title = (what, group, year, month) => [`${what} ${String(group.name).toUpperCase()}`, `THÁNG ${pad(month)} NĂM ${year}`];

async function salaryXlsx(c, groupId, year, month) {
  const d = await payrollData(c, groupId, year, month);
  const wb = new Workbook(), ws = wb.sheet('Lương');
  const dedCols = d.dedTypes.filter(t => d.lines.some(l => (l.detail.deductions || []).some(x => x.code === t.code)));
  const hasExtra = d.lines.some(l => n(l.detail.monthlyDeduction) > 0), hasLabor = d.lines.some(l => l.detail.laborGrade), hasSafety = d.lines.some(l => l.detail.safetyGrade);
  const lineOf = l => l;
  // Tiền làm đêm / làm thêm / làm lễ (cả phần theo hệ số lương) nằm ở bảng thưởng; bảng lương chỉ đến lương đóng bảo hiểm.
  // Áp dụng cả cho bảng lương tính trước v6.20 (chưa "Tính lại"): tổng lương + thưởng của mỗi người không đổi.
  const cols = [
    { h: 'TT', w: 5, tt: true, val: () => '' }, { h: 'Họ và tên', w: 26, val: l => l.full_name }, { h: 'Chức vụ', w: 14, val: l => l.positions || '' },
    { h: 'Số công tiêu chuẩn (Ntc)', w: 10, fmt: 'General', sum: true, val: l => n(l.detail.standardDays) }, { h: 'Số công thực tế (Ntt)', w: 10, fmt: 'General', sum: true, val: l => n(l.work_days) },
    { h: 'Hệ số lương', w: 10, fmt: COEF, sum: true, val: l => n(l.detail.insCoef) },
    ...(hasLabor ? [{ h: 'Xếp loại LĐ', w: 9, al: 'center', val: l => l.detail.laborGrade || '' }, { h: 'Hệ số xếp loại', w: 9, fmt: COEF, val: l => n(l.detail.laborFactor ?? 1) }] : []),
    ...(hasSafety ? [{ h: 'Xếp loại an toàn', w: 9, val: l => l.detail.safetyGrade || '' }] : []),
    { h: 'Phụ cấp', w: 12, fmt: MONEY, sum: true, val: l => n(l.allowance) },
    { h: 'Tiền lương', w: 14, fmt: MONEY, sum: true, val: l => n(l.insurance_salary) },
    { h: 'Tổng tiền lương và phụ cấp', w: 15, fmt: MONEY, sum: true, val: l => n(l.insurance_salary) + n(l.allowance) },
    ...dedCols.map(t => ({ h: t.name, g: 'Các khoản khấu trừ vào lương', w: 13, fmt: MONEY, sum: true, val: l => n((l.detail.deductions || []).find(x => x.code === t.code)?.amount) })),
    ...(hasExtra ? [{ h: 'Khoản trừ khác trong tháng', g: 'Các khoản khấu trừ vào lương', w: 13, fmt: MONEY, sum: true, val: l => n(l.detail.monthlyDeduction) }] : []),
    { h: 'Tổng khấu trừ', w: 13, fmt: MONEY, sum: true, val: l => n(l.deduction) },
    { h: 'Lương thực lĩnh', w: 15, fmt: MONEY, sum: true, val: l => n(l.insurance_salary) + n(l.allowance) - n(l.deduction) },
    { h: 'Ký nhận', w: 14, val: () => '' }
  ];
  let r = head(ws, cols.length, d.st.company_name, title('BẢNG THANH TOÁN LƯƠNG', d.group, year, month));
  r = table(ws, r, cols, byDept(d.lines.map(lineOf), 'pay_department_name', d.group.kind === 'plant'));
  signBlock(ws, r, cols.length, await paySigners(c, d.group, d.run), d.st.place || 'Hà Nội', dateText(null, d.run));
  return wb.toBuffer();
}

async function bonusXlsx(c, groupId, year, month) {
  const d = await payrollData(c, groupId, year, month);
  const wb = new Workbook(), ws = wb.sheet('Thưởng');
  const bonusTypes = d.coefTypes.filter(t => t.kind === 'bonus' && !t.is_total);
  const pN = l => n(l.night_salary) + n(l.night_bonus), pE = l => n(l.extra_salary) + n(l.extra_bonus), pH = l => n(l.holiday_salary) + n(l.holiday_bonus);
  const premB = l => pN(l) + pE(l) + pH(l), hasPremB = d.lines.some(l => premB(l) > 0);
  const hasLabor = d.lines.some(l => l.detail.laborGrade), hasMonthly = d.lines.some(l => n(l.detail.monthlyBonus) !== 0), hasBonusDed = d.lines.some(l => n(l.detail.bonusDeduction) !== 0);
  const labels = [...new Set(d.lines.flatMap(l => (l.detail.extras || []).filter(x => x.kind === 'bonus_deduction').map(x => x.label)))];
  const cols = [
    { h: 'TT', w: 5, tt: true, val: () => '' }, { h: 'Họ và tên', w: 26, val: l => l.full_name }, { h: 'Chức vụ', w: 14, val: l => l.positions || '' },
    { h: 'Số công tối thiểu', w: 10, fmt: 'General', sum: true, val: l => n(l.detail.minDays ?? l.detail.standardDays) }, { h: 'Số công thực tế (Ntt)', w: 10, fmt: 'General', sum: true, val: l => n(l.work_days) },
    ...bonusTypes.map(t => ({ h: t.name, g: 'Hệ số thưởng', w: 12, fmt: COEF, sum: true, val: l => n((l.detail.coefs || {})[t.code]) })),
    { h: 'Tổng hệ số thưởng', g: 'Hệ số thưởng', w: 12, fmt: COEF, sum: true, val: l => n(l.detail.bonusCoef) },
    { h: 'Đơn giá thưởng', w: 12, fmt: MONEY, val: l => n(l.detail.unitPrice) },
    ...(hasLabor ? [{ h: 'Xếp loại LĐ', w: 9, al: 'center', val: l => l.detail.laborGrade || '' }, { h: 'Hệ số xếp loại', w: 9, fmt: COEF, val: l => n(l.detail.laborFactor ?? 1) }] : []),
    { h: 'Thưởng theo hệ số', w: 14, fmt: MONEY, sum: true, val: l => n(l.detail.bonusBase) },
    ...(hasMonthly ? [{ h: 'Thưởng tháng', w: 14, fmt: MONEY, sum: true, val: l => n(l.detail.monthlyBonus) }] : []),
    ...(hasPremB ? [{ h: 'Làm đêm', g: 'Thưởng làm đêm, làm thêm, làm lễ', w: 13, fmt: MONEY, sum: true, val: pN }, { h: 'Làm thêm / sửa chữa', g: 'Thưởng làm đêm, làm thêm, làm lễ', w: 13, fmt: MONEY, sum: true, val: pE }, { h: 'Làm lễ, tết', g: 'Thưởng làm đêm, làm thêm, làm lễ', w: 13, fmt: MONEY, sum: true, val: pH }] : []),
    { h: 'Tiền thưởng', w: 14, fmt: MONEY, sum: true, val: l => n(l.bonus) + premB(l) },
    ...labels.map(lb => ({ h: lb, g: 'Trừ vào thưởng', w: 13, fmt: MONEY, sum: true, val: l => (l.detail.extras || []).filter(x => x.kind === 'bonus_deduction' && x.label === lb).reduce((s, x) => s + n(x.amount), 0) })),
    ...(labels.length || !hasBonusDed ? [] : [{ h: 'Khoản trừ vào thưởng', w: 13, fmt: MONEY, sum: true, val: l => n(l.detail.bonusDeduction) }]),
    { h: 'Tiền thưởng thực nhận', w: 15, fmt: MONEY, sum: true, val: l => n(l.bonus) + premB(l) - n(l.detail.bonusDeduction) },
    { h: 'Ký nhận', w: 14, val: () => '' }
  ];
  let r = head(ws, cols.length, d.st.company_name, title('BẢNG THANH TOÁN THƯỞNG', d.group, year, month));
  r = table(ws, r, cols, byDept(d.lines, 'pay_department_name', d.group.kind === 'plant'));
  signBlock(ws, r, cols.length, await paySigners(c, d.group, d.run), d.st.place || 'Hà Nội', dateText(null, d.run));
  return wb.toBuffer();
}

// Hệ số có hiệu lực vào CUỐI tháng được chọn (xem lại bất kỳ tháng nào)
async function coefXlsx(c, groupId, year, month) {
  const group = (await q(c, 'SELECT id, name, signers, kind FROM groups WHERE id=$1', [groupId]))[0];
  if (!group) { const e = new Error('Không tìm thấy bảng lương'); e.status = 404; throw e; }
  const end = monthEnd(year, month), st = await settings(c);
  const run = (await q(c, 'SELECT id, calculated_by FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [groupId, year, month]))[0];
  const emps = run
    ? await q(c, `SELECT e.id, e.full_name, e.positions, e.title, e.employee_type, e.shift_no, v.pay_department_name, v.pay_department_sort, e.sort_order FROM payroll_lines pl JOIN employees e ON e.id=pl.employee_id LEFT JOIN v_employees v ON v.id=e.id WHERE pl.run_id=$1 ORDER BY v.pay_department_sort NULLS LAST, v.pay_department_name, v.emp_order, e.sort_order, e.full_name`, [run.id])
    : await q(c, `SELECT id, full_name, positions, title, employee_type, shift_no, pay_department_name, pay_department_sort, sort_order FROM v_employees WHERE group_id=$1 AND sso_status='active' AND payroll_active ORDER BY pay_department_sort NULLS LAST, pay_department_name, emp_order, sort_order, full_name`, [groupId]);
  const hist = await q(c, `SELECT DISTINCT ON (employee_id) employee_id, vals, effective_from FROM coefficient_history WHERE employee_id = ANY($1::uuid[]) AND effective_from <= $2 ORDER BY employee_id, effective_from DESC, id DESC`, [emps.map(e => e.id), end]);
  const hm = new Map(hist.map(h => [h.employee_id, h]));
  const rows = emps.map(e => ({ ...e, positions: dispPositions(e.positions, group.kind, st, e.title), vals: hm.get(e.id)?.vals || {}, eff: hm.get(e.id)?.effective_from || '' }));
  const types = await q(c, 'SELECT code, name, kind, is_total FROM coefficient_types WHERE active ORDER BY sort_order, code');
  const ins = types.filter(t => t.kind === 'insurance'), bon = types.filter(t => t.kind === 'bonus' && !t.is_total), totT = types.filter(t => t.kind === 'bonus' && t.is_total), amt = types.filter(t => t.kind === 'amount');
  const sumOf = list => l => list.reduce((s, t) => s + n(l.vals[t.code]), 0);
  const cols = [
    { h: 'TT', w: 5, tt: true, val: () => '' }, { h: 'Họ và tên', w: 26, val: l => l.full_name }, { h: 'Chức vụ', w: 14, val: l => l.positions || '' },
    ...ins.map(t => ({ h: t.name, g: 'Hệ số lương (bảo hiểm)', w: 12, fmt: COEF, sum: true, val: l => n(l.vals[t.code]) })),
    ...(ins.length > 1 ? [{ h: 'Tổng hệ số lương', g: 'Hệ số lương (bảo hiểm)', w: 12, fmt: COEF, sum: true, val: sumOf(ins) }] : []),
    ...bon.map(t => ({ h: t.name, g: 'Hệ số thưởng', w: 12, fmt: COEF, sum: true, val: l => n(l.vals[t.code]) })),
    ...(bon.length ? [{ h: 'Tổng hệ số thưởng', g: 'Hệ số thưởng', w: 12, fmt: COEF, sum: true, val: l => sumOf(bon)(l) || sumOf(totT)(l) }] : []),
    ...amt.map(t => ({ h: t.name, g: 'Phụ cấp (số tiền)', w: 13, fmt: MONEY, sum: true, val: l => n(l.vals[t.code]) })),
    { h: 'Hệ số có hiệu lực từ', w: 13, al: 'center', val: l => String(l.eff || '').slice(0, 10).split('-').reverse().join('/') }
  ];
  const wb = new Workbook(), ws = wb.sheet('Hệ số');
  let r = head(ws, cols.length, st.company_name, [`BẢNG HỆ SỐ LƯƠNG, THƯỞNG ${String(group.name).toUpperCase()}`, `THÁNG ${pad(month)} NĂM ${year}`]);
  r = table(ws, r, cols, byDept(rows, 'pay_department_name', group.kind === 'plant'));
  signBlock(ws, r, cols.length, await paySigners(c, group, run), st.place || 'Hà Nội', 'ngày …… tháng …… năm ……');
  return wb.toBuffer();
}

async function mealXlsx(c, groupId, year, month) {
  const group = (await q(c, 'SELECT id, name, signers, kind FROM groups WHERE id=$1', [groupId]))[0];
  if (!group) { const e = new Error('Không tìm thấy bảng lương'); e.status = 404; throw e; }
  const st = await settings(c), rep = await mealReport(c, groupId, year, month);
  const run = (await q(c, 'SELECT * FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [groupId, year, month]))[0];
  const note = x => [Object.entries(x.codes).map(([k, v]) => `${k}×${v.n} (${new Intl.NumberFormat('vi-VN').format(v.price)}đ)`).join('; '), x.actualQty ? `Ăn ca riêng ×${x.actualQty}` : '', x.waitQty ? `Chờ ca ×${x.waitQty}` : ''].filter(Boolean).join('; ');
  const anyDays = rep.rows.some(x => x.days), anyAct = rep.rows.some(x => x.actualQty), anyWait = rep.rows.some(x => x.waitQty);
  const cols = [
    { h: 'STT', w: 6, tt: true, val: () => '' }, { h: 'Họ và tên', w: 28, val: x => x.name }, { h: 'Chức vụ', w: 16, val: x => x.positions || '' },
    ...(anyDays || (!anyAct && !anyWait) ? [{ h: 'Theo ký hiệu công', g: 'Số công / suất ăn ca', w: 12, fmt: 'General', sum: true, val: x => x.days }] : []),
    ...(anyAct ? [{ h: 'Ăn ca riêng', g: 'Số công / suất ăn ca', w: 12, fmt: '#,##0.##', sum: true, val: x => x.actualQty }] : []),
    ...(anyWait ? [{ h: 'Ăn chờ ca', g: 'Số công / suất ăn ca', w: 12, fmt: '#,##0.##', sum: true, val: x => x.waitQty }] : []),
    { h: 'Tiền ăn', w: 15, fmt: MONEY, sum: true, val: x => x.amount }, { h: 'Ghi chú', w: 40, val: note }
  ];
  rep.rows.forEach(x => { x.positions = dispPositions(x.positions, group.kind, st, x.title); });
  const sorted = [...rep.rows].sort((a, b) => (a.departmentSort ?? 1e9) - (b.departmentSort ?? 1e9));
  const wb = new Workbook(), ws = wb.sheet('Ăn ca');
  let r = head(ws, cols.length, st.company_name, [`DANH SÁCH CHI TIỀN ĂN CA ${String(group.name).toUpperCase()}`, `THÁNG ${pad(month)} NĂM ${year}`]);
  r = table(ws, r, cols, byDept(sorted.map(x => ({ ...x, pay_department_name: x.department })), 'pay_department_name', group.kind === 'plant'));
  signBlock(ws, r, cols.length, await paySigners(c, group, run), st.place || 'Hà Nội', dateText(null, run));
  return wb.toBuffer();
}

// Tự điền người ký bảng chấm công: Giám đốc (chức vụ "Giám đốc" ở SSO), phụ trách bộ phận (trưởng phòng, nếu không có thì phó phòng), người chấm công (quyền "Người chấm công" của bảng)
async function autoSignerNames(c, sh, run) {
  const pos = r => `positions ~* '(^|, )${r}(,|$)'`;
  const one1 = async (sql, p) => (await q(c, sql + ' LIMIT 1', p))[0]?.full_name || '';
  const director = await one1(`SELECT full_name FROM v_employees WHERE sso_status='active' AND NOT excluded AND ${pos('Giám đốc')} ORDER BY emp_order, sort_order, full_name`);
  let head = await one1(`SELECT full_name FROM v_employees WHERE sheet_id=$1 AND sso_status='active' AND ${pos('Trưởng phòng')} ORDER BY department_sort NULLS LAST, emp_order, sort_order, full_name`, [sh.id]);
  if (!head) head = await one1(`SELECT full_name FROM v_employees WHERE sheet_id=$1 AND sso_status='active' AND ${pos('Phó phòng')} ORDER BY department_sort NULLS LAST, emp_order, sort_order, full_name`, [sh.id]);
  const tk = await one1(`SELECT e.full_name FROM role_assignments ra JOIN employees e ON e.sso_user_id=ra.sso_user_id WHERE ra.role='timekeeper' AND e.sso_status='active'
    AND ((ra.scope_type='sheet' AND ra.scope_id=$1) OR (ra.scope_type='group' AND ra.scope_id=$2) OR ra.scope_type='all')
    ORDER BY CASE ra.scope_type WHEN 'sheet' THEN 0 WHEN 'group' THEN 1 ELSE 2 END, e.full_name`, [String(sh.id), String(sh.group_id || '')]);
  // Kế toán trưởng: trưởng phòng của phòng có tên "kế toán" (hoặc người có chữ "Kế toán trưởng" trong tên SSO)
  const acc = async p => one1(`SELECT full_name FROM v_employees WHERE sso_status='active' AND NOT excluded AND ${pos(p)}
    AND (department_name ILIKE '%kế toán%' OR pay_department_name ILIKE '%kế toán%' OR sso_name ILIKE '%kế toán trưởng%') ORDER BY emp_order, full_name`);
  const accountant = (await acc('Trưởng phòng')) || (await acc('Phó phòng')) || await one1("SELECT full_name FROM employees WHERE sso_status='active' AND NOT excluded AND sso_name ILIKE '%kế toán trưởng%' ORDER BY full_name");
  // Người lập biểu: người đã chạy lương nháp; không có thì người cấp 2 của bảng lương
  let preparer = '';
  if (run?.calculated_by) preparer = await one1('SELECT full_name FROM employees WHERE sso_user_id=$1', [String(run.calculated_by)]);
  if (!preparer && sh.group_id) preparer = await one1(`SELECT e.full_name FROM role_assignments ra JOIN employees e ON e.sso_user_id=ra.sso_user_id WHERE ra.role='l2' AND e.sso_status='active'
    AND ((ra.scope_type='group' AND ra.scope_id=$1) OR ra.scope_type='all') ORDER BY CASE ra.scope_type WHEN 'group' THEN 0 ELSE 1 END, e.full_name`, [String(sh.group_id)]);
  return { director, head, timekeeper: tk, accountant, preparer };
}
async function paySigners(c, group, run) {
  const auto = await autoSignerNames(c, { id: null, group_id: group.id }, run);
  return signersOf(group.signers, 'pay').map(x => ({ ...x, name: x.name || autoName(x.title, auto) }));
}
const autoName = (title, a) => { const t = String(title || '').toLowerCase(); return /chấm công/.test(t) ? a.timekeeper : /kế toán/.test(t) ? a.accountant : /lập biểu|người lập/.test(t) ? a.preparer : /phụ trách|trưởng/.test(t) ? a.head : /giám đốc/.test(t) ? a.director : ''; };

// Bảng chấm công: mỗi bảng chấm công của nhóm = 1 trang tính
async function attendanceXlsx(c, sheetIds, year, month) {
  const st = await settings(c), wb = new Workbook(), days = daysInMonth(year, month);
  const codes = await q(c, 'SELECT code, name FROM attendance_codes WHERE active ORDER BY sort_order, code');
  const sctx = await require('./schedule').loadContext(c, year, month);
  const wdName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  let made = 0;
  for (const sid of sheetIds) {
    const sh = (await q(c, 'SELECT s.id, s.name, s.signers, s.print_title, s.use_safety, s.use_labor, s.group_id, g.kind AS group_kind FROM sheets s LEFT JOIN groups g ON g.id=s.group_id WHERE s.id=$1', [sid]))[0]; if (!sh) continue;
    const rat = {}; for (const x of await q(c, 'SELECT pr.employee_id, pr.safety, pr.labor FROM period_ratings pr JOIN periods p ON p.id=pr.period_id WHERE p.sheet_id=$1 AND p.year=$2 AND p.month=$3', [sid, year, month])) rat[x.employee_id] = x;
    const p = (await q(c, 'SELECT id, status FROM periods WHERE sheet_id=$1 AND year=$2 AND month=$3', [sid, year, month]))[0]; if (!p) continue;
    const emps = await q(c, `SELECT ve.id, ve.full_name, ve.positions, ve.title, ve.employee_type, ve.shift_no, ve.department_name, ve.department_sort, ve.weekly_off, ve.pay_dept_id FROM period_employees pe JOIN v_employees ve ON ve.id=pe.employee_id WHERE pe.period_id=$1
      ORDER BY ve.department_sort NULLS LAST, ve.department_name NULLS LAST, ve.emp_order, ve.sort_order, ve.full_name`, [p.id]);
    const holders = await safetyHolders(c, emps.map(e => e.id), monthEnd(year, month));
    const extraCols = [...(sh.use_safety || holders.size ? [['An toàn', 'safety']] : []), ...(sh.use_labor ? [['Xếp loại', 'labor']] : [])];
    const ent = {}; for (const e of await q(c, 'SELECT employee_id, day, code FROM attendance_entries WHERE period_id=$1', [p.id])) (ent[e.employee_id] ||= {})[e.day] = e.code;
    const work = Object.fromEntries((await q(c, 'SELECT code, work_value, work_day, work_night, off_day_zero, pay_scope FROM attendance_codes')).map(r => [r.code, r]));
    const ws = wb.sheet(sh.name, { landscape: true }); made++;
    const nc = 3 + days + 2 + extraCols.length, dcol = d => 3 + d;
    ws.col(1, 5); ws.col(2, 24); ws.col(3, 12); for (let d = 1; d <= days; d++) ws.col(dcol(d), 4.3); for (let k = 0; k < 2 + extraCols.length; k++) ws.col(nc - 1 - k, 8);
    ws.box(1, 1, 1, 12, String(st.company_name || '').toUpperCase(), { b: true, sz: 12 });
    ws.box(2, 1, 2, 12, String(sh.print_title || sh.name).toUpperCase(), { b: true, u: true, sz: 12 });
    ws.box(1, 13, 2, nc, 'BẢNG CHẤM CÔNG', { b: true, sz: 18, al: 'center' });
    ws.box(3, 13, 3, nc, `Tháng ${pad(month)} năm ${year}`, { b: true, sz: 13, al: 'center' });
    const r0 = 5, hs = { b: true, al: 'center', border: true, fill: 'EDEDED', wrap: true };
    ws.box(r0, 1, r0 + 1, 1, 'TT', hs); ws.box(r0, 2, r0 + 1, 2, 'Họ và tên', hs); ws.box(r0, 3, r0 + 1, 3, 'Chức vụ', hs);
    ws.box(r0, 4, r0, 3 + days, 'Ngày', hs);
    for (let d = 1; d <= days; d++) { const w = new Date(Date.UTC(year, month - 1, d)).getUTCDay(); ws.set(r0 + 1, dcol(d), d, { ...hs, fill: sctx.holidays.has(`${year}-${pad(month)}-${pad(d)}`) ? 'FFB74D' : w === 0 ? 'FFD6D6' : w === 6 ? 'FFF2CC' : 'EDEDED', sz: 10 }); }
    const cn = nc - extraCols.length;
    ws.box(r0, cn - 1, r0 + 1, cn - 1, 'Công ngày', hs); ws.box(r0, cn, r0 + 1, cn, 'Công đêm', hs);
    extraCols.forEach(([h], i) => ws.box(r0, cn + 1 + i, r0 + 1, cn + 1 + i, h, hs));
    ws.height(r0 + 1, 30); ws.printTitles = [r0, r0 + 1];
    let r = r0 + 2, tot = [0, 0], k = 0;
    let lastSec = null;
    for (const e of emps) {
      if (sh.group_kind === 'plant') {
        const sec = secOf(e);
        if (sec !== lastSec) { lastSec = sec; ws.box(r, 1, r, nc, sec, { b: true, i: true, fill: 'F3F3F3', border: true }); ws.height(r, 20); r++; }
      }
      let dsum = 0, nsum = 0;
      const sc = require('./schedule').forEmployee(sctx, { groupId: sh.group_id, departmentId: e.pay_dept_id, employeeType: e.employee_type, weeklyOff: e.weekly_off });
      ws.set(r, 1, ++k, { border: true, al: 'center' }); ws.set(r, 2, e.full_name, { border: true }); ws.set(r, 3, dispPositions(e.positions, sh.group_kind, st, e.title) || '', { border: true, wrap: true, sz: 10 });
      for (let d = 1; d <= days; d++) {
        const cd = ent[e.id]?.[d] || '', w = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
        if (cd && work[cd] && work[cd].pay_scope !== 'none' && !(work[cd].off_day_zero && sc.offSet.has(d))) { dsum += n(work[cd].work_day); nsum += n(work[cd].work_night); }
        ws.set(r, dcol(d), cd, { border: true, al: 'center', sz: 9, fill: sctx.holidays.has(`${year}-${pad(month)}-${pad(d)}`) ? 'FFE0B2' : sc.offSet.has(d) ? 'FFEDED' : undefined });
      }
      ws.set(r, cn - 1, dsum, { border: true, al: 'center', b: true }); ws.set(r, cn, nsum, { border: true, al: 'center', b: true });
      extraCols.forEach(([, k], i) => ws.set(r, cn + 1 + i, rat[e.id]?.[k] || '', { border: true, al: 'center', b: true }));
      tot[0] += dsum; tot[1] += nsum; ws.height(r, 22); r++;
    }
    ws.box(r, 1, r, 3, 'Tổng cộng', { b: true, al: 'center', border: true });
    for (let d = 1; d <= days; d++) ws.set(r, dcol(d), null, { border: true });
    ws.set(r, cn - 1, tot[0], { border: true, al: 'center', b: true }); ws.set(r, cn, tot[1], { border: true, al: 'center', b: true });
    extraCols.forEach((_, i) => ws.set(r, cn + 1 + i, null, { border: true }));
    r += 2;
    ws.box(r, 1, r, 8, 'Ghi chú ký hiệu:', { b: true });
    // Ghi chú ký hiệu: chia thành tối đa 4 cột nhưng luôn nằm trong khung bảng (không tràn sang cột ngoài cột cuối)
    const blocks = Math.min(4, Math.max(1, Math.ceil(codes.length / 5))), per = Math.max(4, Math.floor(nc / blocks)), legendRows = Math.max(1, Math.ceil(codes.length / blocks));
    codes.forEach((cd, i) => { const bl = Math.floor(i / legendRows), col = 1 + bl * per, last = bl === blocks - 1 || col + per - 1 > nc ? nc : col + per - 1, row = r + 1 + (i % legendRows); if (col <= nc) ws.box(row, col, row, last, `${cd.code}: ${cd.name}`, { sz: 10 }); });
    r += 2 + legendRows;
    const auto = await autoSignerNames(c, sh);
    signBlock(ws, r, nc, signersOf(sh.signers, 'att').map(x => ({ ...x, name: x.name || autoName(x.title, auto) })), st.place || 'Hà Nội', `ngày …… tháng ${pad(month)} năm ${year}`);
  }
  if (!made) { const e = new Error('Chưa có bảng chấm công tháng này để xuất.'); e.status = 404; throw e; }
  return wb.toBuffer();
}
module.exports = { salaryXlsx, bonusXlsx, coefXlsx, mealXlsx, attendanceXlsx };
