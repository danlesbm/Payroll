// Báo cáo lương theo năm: theo bộ phận, so sánh cá nhân (năm/tháng), ăn ca, xuất Excel, và "Lương của tôi" (tự xem).
const router = require('express').Router();
const { rows, one, pool } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, str, api, forbid, sendXlsx } = require('../lib/http');
const { Workbook } = require('../lib/xlsx');
const { monthEnd, validYM } = require('../lib/dates');
const G = require('../services/grades');
const { dispPositions } = require('../lib/names');

// Ai được xem báo cáo của bảng lương (nhóm) nào: cùng nhóm quyền xem bảng lương
const PAY_ROLES = ['l2', 'l3', 'director', 'hr', 'view_pay'];
// Các chỉ tiêu: lấy từ dòng lương đã tính (payroll_lines). Lương = thực lĩnh bảng lương; Thưởng = thưởng thực nhận (bảng thưởng).
const SAL = `COALESCE((pl.detail->>'salaryNet')::numeric, pl.insurance_salary + pl.allowance - pl.deduction)`;
const BON = `COALESCE((pl.detail->>'bonusNet')::numeric, pl.bonus)`;
const METRIC_SQL = { net: 'pl.net', salary: SAL, bonus: BON, salbonus: `(${SAL} + ${BON})`, meal_amount: 'pl.meal_amount', meal_days: `COALESCE((pl.detail->>'mealDays')::numeric, 0)`,
  allowance: 'pl.allowance', deduction: 'pl.deduction', insurance_salary: 'pl.insurance_salary', work_days: 'pl.work_days',
  // Làm đêm / làm thêm (gồm công vượt chuẩn, sửa chữa…) / làm lễ-tết: lương + thưởng; "chính" = đã trừ các khoản này
  night: '(pl.night_salary + pl.night_bonus)', extra: '(pl.extra_salary + pl.extra_bonus)', holiday: '(pl.holiday_salary + pl.holiday_bonus)',
  premium: '(pl.night_salary + pl.night_bonus + pl.extra_salary + pl.extra_bonus + pl.holiday_salary + pl.holiday_bonus)',
  // Công so với công tiêu chuẩn theo hợp đồng (tháng không có số liệu công chuẩn cũ → chênh lệch 0)
  work_std: `COALESCE((pl.detail->>'standardDays')::numeric, pl.work_days)`, work_diff: `COALESCE(pl.work_days - (pl.detail->>'standardDays')::numeric, 0)`, work_ot: `COALESCE((pl.detail->>'otWork')::numeric, 0)`,
  salary_main: `(${SAL} - pl.night_salary - pl.extra_salary - pl.holiday_salary)`, bonus_main: `(${BON} - pl.night_bonus - pl.extra_bonus - pl.holiday_bonus)` };
const METRICS = { net: 'Tổng thực lĩnh', salary: 'Lương', bonus: 'Thưởng', salbonus: 'Lương + Thưởng', meal_amount: 'Tiền ăn ca', meal_days: 'Số ngày ăn ca', allowance: 'Phụ cấp', deduction: 'Khấu trừ', insurance_salary: 'Lương BHXH', work_days: 'Ngày công', work_std: 'Công tiêu chuẩn (theo hợp đồng)', work_diff: 'Công thực tế − công tiêu chuẩn (+ vượt / − thiếu)', work_ot: 'Công làm thêm (ký hiệu LT)',
  salary_main: 'Lương chính (không gồm đêm/thêm/lễ)', bonus_main: 'Thưởng chính (không gồm đêm/thêm/lễ)', night: 'Làm đêm (lương + thưởng)', extra: 'Làm thêm / sửa chữa (lương + thưởng)', holiday: 'Làm lễ, tết (lương + thưởng)', premium: 'Tổng làm đêm + thêm + lễ' };
const COUNT_METRICS = new Set(['meal_days', 'work_days', 'work_std', 'work_diff', 'work_ot']);   // không phải tiền
const yearOk = y => Number.isInteger(y) && y >= 2000 && y <= 2200;
const num = v => Number(v || 0);
const pad2 = n => String(n).padStart(2, '0');
const MON = Array.from({ length: 12 }, (_, i) => 'T' + (i + 1));

const statusSql = locked => locked ? `r.status='locked'` : `r.status IN ('submitted','pending_dir','locked')`;
async function allowedGroups(req) {
  const gs = await rows('SELECT id, code, name, kind FROM groups WHERE active ORDER BY sort_order, name');
  return gs.filter(g => req.auth.canAny(PAY_ROLES, { groupId: g.id }));
}
const selfViewOn = async () => (await one(`SELECT value FROM settings WHERE key='self_view'`))?.value === 'true';
const myEmployee = req => one(`SELECT id, full_name, employee_code, positions, title, employee_type FROM employees WHERE sso_user_id=$1`, [req.auth.user.id]);

// Kiểu ô dùng chung cho các bảng Excel
const ST = { H: { b: true, fill: 'DDE7F7', border: true, al: 'center', wrap: true, va: 'center' }, C: { border: true }, M: { border: true, fmt: '#,##0' }, D: { border: true, fmt: '0.##' }, T: { b: true, border: true, fmt: '#,##0', fill: 'F3F4F6' },
  P: { border: true, fmt: '0.0%' }, K: { border: true, fmt: '#,##0.####' } };

// ===== Danh sách năm có dữ liệu (cho ô chọn năm so sánh — không giới hạn cứng) =====
router.get('/years', api(async req => {
  const ids = (await allowedGroups(req)).map(g => g.id);
  if (!ids.length) return { years: [] };
  const locked = req.query.locked !== '0';
  return { years: (await rows(`SELECT DISTINCT r.year FROM payroll_runs r WHERE r.group_id = ANY($1::uuid[]) AND ${statusSql(locked)} ORDER BY r.year`, [ids])).map(r => r.year) };
}));

// ===== 1. Thống kê năm theo bộ phận =====
async function deptYear(req, year, locked, metric) {
  const expr = METRIC_SQL[metric]; if (!expr) bad('Chỉ tiêu không hợp lệ');
  const groups = await allowedGroups(req);
  if (!groups.length) forbid('Bạn không được phân quyền xem bảng lương nào');
  const data = await rows(`
    SELECT r.group_id, r.year, r.month, COALESCE(v.pay_department_name, 'Chưa xếp bộ phận') AS dept, COALESCE(v.pay_department_sort, 999999) AS dsort, count(*)::int AS n, sum(${expr}) AS val
    FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id JOIN v_employees v ON v.id=pl.employee_id
    WHERE r.group_id = ANY($1::uuid[]) AND r.year IN ($2,$3) AND ${statusSql(locked)} GROUP BY r.group_id, r.year, r.month, dept, dsort`, [groups.map(g => g.id), year, year - 1]);
  const out = [];
  for (const g of groups) {
    const map = new Map();
    for (const d of data.filter(x => x.group_id === g.id)) {
      let o = map.get(d.dept); if (!o) { o = { name: d.dept, sort: d.dsort, months: Array(12).fill(0), prevMonths: Array(12).fill(0), headcount: Array(12).fill(0), prevNet: 0 }; map.set(d.dept, o); }
      const m = d.month - 1;
      if (d.year === year) { o.months[m] = num(d.val); o.headcount[m] = d.n; } else { o.prevMonths[m] = num(d.val); o.prevNet += num(d.val); }
    }
    const depts = [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'vi'));
    if (depts.length) out.push({ id: g.id, name: g.name, kind: g.kind, depts });
  }
  return { year, locked, metric, metricLabel: METRICS[metric], groups: out };
}
router.get('/dept-year', api(async req => {
  const year = Number(req.query.year); if (!yearOk(year)) bad('Năm không hợp lệ');
  const metric = METRICS[req.query.metric] ? req.query.metric : 'net';
  return { ...(await deptYear(req, year, req.query.locked !== '0', metric)), metrics: METRICS };
}));
// Ghi 1 trang tính "bộ phận × 12 tháng" cho một chỉ tiêu
function deptSheet(wb, name, title, d) {
  const ws = wb.sheet(name), money = !COUNT_METRICS.has(d.metric), C = money ? ST.M : ST.K, T = { ...ST.T, fmt: money ? '#,##0' : '#,##0.##' }, year = d.year;
  ws.set(1, 1, `${title} NĂM ${year} THEO BỘ PHẬN (${d.locked ? 'bảng đã khoá' : 'gồm bảng đang xử lý'})`, { b: true, sz: 13 });
  ws.col(1, 28); for (let c = 2; c <= 16; c++) ws.col(c, 13);
  let r = 3;
  for (const g of d.groups) {
    ws.set(r++, 1, g.name, { b: true });
    ['Bộ phận', ...MON, 'Cả năm', `Năm ${year - 1}`, '+/- %'].forEach((t, i) => ws.set(r, i + 1, t, ST.H)); r++;
    const tot = Array(12).fill(0); let ty = 0, tp = 0;
    for (const x of g.depts) {
      const sum = x.months.reduce((s, v) => s + v, 0);
      ws.set(r, 1, x.name, ST.C); x.months.forEach((v, i) => { ws.set(r, i + 2, v, C); tot[i] += v; });
      ws.set(r, 14, sum, T); ws.set(r, 15, x.prevNet, C); ws.set(r, 16, x.prevNet ? (sum - x.prevNet) / x.prevNet : null, ST.P); ty += sum; tp += x.prevNet; r++;
    }
    ws.set(r, 1, 'Cộng', T); tot.forEach((v, i) => ws.set(r, i + 2, v, T)); ws.set(r, 14, ty, T); ws.set(r, 15, tp, T); ws.set(r, 16, tp ? (ty - tp) / tp : null, { ...T, fmt: '0.0%' }); r += 2;
  }
  ws.freeze = [0, 1];
}
// Xuất Excel năm: trang Tổng hợp (lương, thưởng, lương+thưởng, ăn ca, thực lĩnh theo bộ phận) + từng chỉ tiêu theo tháng
router.get('/dept-year/export', async (req, res) => {
  const year = Number(req.query.year); if (!yearOk(year)) bad('Năm không hợp lệ');
  const locked = req.query.locked !== '0';
  const keys = ['salary_main', 'bonus_main', 'night', 'extra', 'holiday', 'salary', 'bonus', 'salbonus', 'meal_amount', 'net'], D = {};
  for (const k of keys) D[k] = await deptYear(req, year, locked, k);
  const wb = new Workbook(), ws = wb.sheet('Tổng hợp năm');
  ws.set(1, 1, `TỔNG HỢP LƯƠNG – THƯỞNG NĂM ${year} THEO BỘ PHẬN (${locked ? 'bảng đã khoá' : 'gồm bảng đang xử lý'})`, { b: true, sz: 13 });
  const cols = [['Lương chính', 'salary_main'], ['Thưởng chính', 'bonus_main'], ['Làm đêm', 'night'], ['Làm thêm / sửa chữa', 'extra'], ['Làm lễ, tết', 'holiday'], ['Lương (gồm đêm/thêm/lễ)', 'salary'], ['Thưởng (gồm đêm/thêm/lễ)', 'bonus'], ['Lương + Thưởng', 'salbonus'], ['Tiền ăn ca', 'meal_amount'], ['Tổng thực lĩnh', 'net']];
  const NC = cols.length;
  ws.col(1, 30); for (let c = 2; c <= NC + 3; c++) ws.col(c, 16);
  let r = 3;
  for (const g of D.net.groups) {
    ws.set(r++, 1, g.name, { b: true });
    ['Bộ phận', ...cols.map(c => c[0]), `Tổng thực lĩnh ${year - 1}`, '+/- %'].forEach((t, i) => ws.set(r, i + 1, t, ST.H)); ws.height(r, 42); r++;
    const sum = (k, name) => (D[k].groups.find(x => x.id === g.id)?.depts.find(x => x.name === name)?.months || []).reduce((a, b) => a + b, 0);
    const tot = Array(NC + 1).fill(0);
    for (const x of g.depts) {
      const v = [...cols.map(c => sum(c[1], x.name)), x.prevNet];
      ws.set(r, 1, x.name, ST.C); v.forEach((n, i) => { ws.set(r, i + 2, n, ST.M); tot[i] += n; }); ws.set(r, NC + 3, x.prevNet ? (v[NC - 1] - x.prevNet) / x.prevNet : null, ST.P); r++;
    }
    ws.set(r, 1, 'Cộng', ST.T); tot.forEach((n, i) => ws.set(r, i + 2, n, ST.T)); ws.set(r, NC + 3, tot[NC] ? (tot[NC - 1] - tot[NC]) / tot[NC] : null, { ...ST.T, fmt: '0.0%' }); r += 2;
  }
  ws.set(r++, 1, 'Lương chính / thưởng chính = theo công chuẩn, chưa gồm tiền làm đêm, làm thêm (công vượt chuẩn, sửa chữa…) và làm lễ, tết. Lương = Lương chính + phần làm đêm/thêm/lễ của lương (đã trừ khoản phải trừ).', { i: true });
  ws.set(r, 1, 'Thực lĩnh = Lương + Thưởng + Ăn ca (nếu cài đặt cộng tiền ăn vào thực lĩnh).', { i: true });
  deptSheet(wb, 'Lương', 'LƯƠNG', D.salary); deptSheet(wb, 'Thưởng', 'THƯỞNG', D.bonus); deptSheet(wb, 'Lương + Thưởng', 'LƯƠNG + THƯỞNG', D.salbonus);
  deptSheet(wb, 'Làm đêm', 'LÀM ĐÊM (LƯƠNG + THƯỞNG)', D.night); deptSheet(wb, 'Làm thêm', 'LÀM THÊM / SỬA CHỮA (LƯƠNG + THƯỞNG)', D.extra); deptSheet(wb, 'Làm lễ tết', 'LÀM LỄ, TẾT (LƯƠNG + THƯỞNG)', D.holiday);
  deptSheet(wb, 'Ăn ca', 'TIỀN ĂN CA', D.meal_amount); deptSheet(wb, 'Thực lĩnh', 'TỔNG THỰC LĨNH', D.net);
  sendXlsx(res, wb.toBuffer(), `thong-ke-luong-thuong-nam-${year}.xlsx`);
});

// ===== 2. So sánh cá nhân giữa các năm / các tháng (lương, thưởng, ăn ca…) =====
async function compare(req, q) {
  const groupId = str(q.groupId); if (!isUuid(groupId)) bad('Chưa chọn bảng lương');
  req.auth.canAny(PAY_ROLES, { groupId }) || forbid('Bạn không được phân quyền xem bảng lương này');
  const years = [...new Set(str(q.years).split(',').map(Number).filter(yearOk))].sort((a, b) => a - b).slice(0, 8);
  if (years.length < 1) bad('Chọn ít nhất 1 năm');
  const metric = METRIC_SQL[q.metric] ? q.metric : 'net';
  const locked = q.locked !== '0', deptId = isUuid(q.departmentId) ? q.departmentId : null;
  const data = await rows(`
    SELECT e.id, e.full_name, e.employee_code, COALESCE(v.pay_department_name, 'Chưa xếp bộ phận') AS dept, COALESCE(v.pay_department_sort, 999999) AS dsort, v.emp_order,
           r.year, r.month, ${METRIC_SQL[metric]} AS val
    FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id JOIN employees e ON e.id=pl.employee_id JOIN v_employees v ON v.id=e.id
    WHERE r.group_id=$1 AND r.year = ANY($2::int[]) AND ${statusSql(locked)} AND ($3::uuid IS NULL OR v.pay_dept_id=$3::uuid)`, [groupId, years, deptId]);
  const people = new Map();
  for (const d of data) {
    let p = people.get(d.id); if (!p) { p = { id: d.id, name: d.full_name, code: d.employee_code, dept: d.dept, dsort: d.dsort, order: d.emp_order, byYear: {}, months: {} }; people.set(d.id, p); }
    p.byYear[d.year] = (p.byYear[d.year] || 0) + num(d.val);
    (p.months[d.year] = p.months[d.year] || Array(12).fill(null))[d.month - 1] = num(d.val);
  }
  const list = [...people.values()].sort((a, b) => a.dsort - b.dsort || a.order - b.order || a.name.localeCompare(b.name, 'vi'));
  const depts = await rows(`SELECT d.id, d.name FROM departments d JOIN sheets s ON s.id=d.sheet_id WHERE s.group_id=$1 ORDER BY d.sort_order, d.name`, [groupId]);
  return { years, metric, metricLabel: METRICS[metric], metrics: METRICS, locked, people: list, departments: depts, group: (await one('SELECT name FROM groups WHERE id=$1', [groupId]))?.name };
}
router.get('/people-compare', api(async req => compare(req, req.query)));
router.get('/people-compare/export', async (req, res) => {
  const d = await compare(req, req.query), money = !COUNT_METRICS.has(d.metric), C = money ? ST.M : ST.K, T = { ...ST.T, fmt: money ? '#,##0' : '#,##0.##' };
  const wb = new Workbook(), ws = wb.sheet('So sánh các năm');
  ws.set(1, 1, `SO SÁNH ${d.metricLabel.toUpperCase()} CÁ NHÂN GIỮA CÁC NĂM — ${d.group || ''}`, { b: true, sz: 13 });
  ['STT', 'Họ tên', 'Bộ phận', ...d.years.map(String), `${d.years[d.years.length - 1]} so với ${d.years[d.years.length - 2] || '—'} (%)`].forEach((t, i) => ws.set(3, i + 1, t, ST.H));
  ws.height(3, 30); ws.col(1, 6); ws.col(2, 26); ws.col(3, 22); for (let c = 4; c <= 4 + d.years.length; c++) ws.col(c, 16);
  const last = d.years[d.years.length - 1], prev = d.years[d.years.length - 2];
  d.people.forEach((p, k) => { const r = 4 + k; ws.set(r, 1, k + 1, ST.C); ws.set(r, 2, p.name, ST.C); ws.set(r, 3, p.dept, ST.C);
    d.years.forEach((y, i) => ws.set(r, 4 + i, p.byYear[y] ?? null, C)); ws.set(r, 4 + d.years.length, prev && p.byYear[prev] ? ((p.byYear[last] || 0) - p.byYear[prev]) / p.byYear[prev] : null, ST.P); });
  const tr = 4 + d.people.length; ws.set(tr, 2, 'Cộng', T); ws.set(tr, 1, null, T); ws.set(tr, 3, null, T);
  d.years.forEach((y, i) => ws.set(tr, 4 + i, d.people.reduce((a, p) => a + (p.byYear[y] || 0), 0), T)); ws.freeze = [3, 3];
  for (const y of d.years) {   // mỗi năm một trang: người × 12 tháng (so sánh giữa các tháng)
    const w = wb.sheet(`Tháng ${y}`); w.set(1, 1, `${d.metricLabel.toUpperCase()} CÁ NHÂN THEO THÁNG — NĂM ${y}`, { b: true, sz: 13 });
    ['STT', 'Họ tên', 'Bộ phận', ...MON, 'Cả năm', 'Trung bình tháng'].forEach((t, i) => w.set(3, i + 1, t, ST.H));
    w.col(1, 6); w.col(2, 26); w.col(3, 22); for (let c = 4; c <= 17; c++) w.col(c, 13);
    d.people.forEach((p, k) => { const r = 4 + k, m = p.months[y] || [], filled = m.filter(v => v !== null && v !== undefined), sum = filled.reduce((a, b) => a + b, 0);
      w.set(r, 1, k + 1, ST.C); w.set(r, 2, p.name, ST.C); w.set(r, 3, p.dept, ST.C); for (let i = 0; i < 12; i++) w.set(r, 4 + i, m[i] ?? null, C);
      w.set(r, 16, sum, T); w.set(r, 17, filled.length ? sum / filled.length : null, C); });
    w.set(4 + d.people.length, 2, 'Cộng', T); for (let i = 0; i < 12; i++) w.set(4 + d.people.length, 4 + i, d.people.reduce((a, p) => a + ((p.months[y] || [])[i] || 0), 0), T);
    w.set(4 + d.people.length, 16, d.people.reduce((a, p) => a + (p.byYear[y] || 0), 0), T); w.freeze = [3, 3];
  }
  sendXlsx(res, wb.toBuffer(), `so-sanh-${d.metric}-ca-nhan.xlsx`);
});

// ===== 3. Bảng thống kê lương từng nhân viên trong 1 tháng (đủ hệ số, lương, thưởng) =====
const f4 = n => Math.round(num(n) * 10000) / 10000;
async function typesList() { return rows(`SELECT code, name, kind FROM coefficient_types WHERE active ORDER BY sort_order, code`); }
const KIND_VN = { insurance: 'hệ số BH', bonus: 'hệ số thưởng', amount: 'số tiền' };
router.get('/employee-month/export', async (req, res) => {
  const groupId = str(req.query.groupId), year = Number(req.query.year), month = Number(req.query.month);
  if (!isUuid(groupId) || !validYM(year, month)) bad('Chọn bảng lương, năm và tháng');
  req.auth.canAny(PAY_ROLES, { groupId }) || forbid('Bạn không được phân quyền xem bảng lương này');
  const run = await one('SELECT id, status FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [groupId, year, month]);
  if (!run) bad('Tháng này chưa có bảng lương', 404);
  const g = await one('SELECT name, kind FROM groups WHERE id=$1', [groupId]);
  const lines = await rows(`SELECT pl.*, e.full_name, e.employee_code, e.positions, e.title, v.pay_department_name AS dept FROM payroll_lines pl JOIN employees e ON e.id=pl.employee_id JOIN v_employees v ON v.id=e.id
    WHERE pl.run_id=$1 ORDER BY v.pay_department_sort NULLS LAST, v.pay_department_name, v.emp_order, e.sort_order, e.full_name`, [run.id]);
  const types = await typesList(), gs = await G.states(monthEnd(year, month), lines.map(l => l.employee_id));
  const wb = new Workbook(), ws = wb.sheet(`Thống kê ${pad2(month)}-${year}`);
  ws.set(1, 1, `BẢNG THỐNG KÊ LƯƠNG, THƯỞNG TỪNG NHÂN VIÊN — THÁNG ${month}/${year} — ${g.name}`, { b: true, sz: 13 });
  const stLabel = { draft: 'lương nháp (cấp 2)', submitted: 'đang ở cấp 3', pending_dir: 'chờ Giám đốc khoá', locked: 'đã khoá' }[run.status];
  ws.set(2, 1, `Trạng thái bảng lương: ${stLabel}${run.status !== 'locked' ? ' — số liệu chưa chính thức' : ''}`, { i: true });
  // Cột khai báo một lần: t = kiểu ô (text | k = hệ số | m = tiền | n = số thường), sum = có cộng cuối bảng, b = đậm
  const col = (head, w, t, val, o = {}) => ({ head, w, t, val, ...o });
  const cols = [
    col('STT', 5, 'text', (l, d, k) => k + 1), col('Họ tên', 24, 'text', l => l.full_name), col('Mã NV', 10, 'text', l => l.employee_code || ''), col('Bộ phận', 18, 'text', l => l.dept || ''),
    col('Chức danh', 18, 'text', l => dispPositions(l.positions, g.kind, {}, l.title)), col('Bậc lương BH', 14, 'text', l => gs.get(l.employee_id)?.label || ''),
    col('Ngày công', 9, 'n', l => num(l.work_days), { sum: true }), col('Công chuẩn', 9, 'n', (l, d) => num(d.standardDays)), col('Công tối thiểu', 9, 'n', (l, d) => d.minDays === undefined ? num(d.standardDays) : num(d.minDays)), col('Công thực tế − chuẩn (+/−)', 11, 'n', (l, d) => d.diffStd !== undefined ? num(d.diffStd) : num(l.work_days) - num(d.standardDays)), col('Công làm thêm (LT)', 10, 'n', (l, d) => num(d.otWork)), col('Công tăng ca', 9, 'n', (l, d) => num(d.otDays)), col('Tỷ lệ công lương', 9, 'k', (l, d) => f4(d.ratio)), col('Tỷ lệ công thưởng', 9, 'k', (l, d) => f4(d.ratioBonus ?? d.ratio)),
    ...types.map(t => col(`${t.name} (${KIND_VN[t.kind]})`, 13, t.kind === 'amount' ? 'm' : 'k', (l, d) => f4(d.coefs?.[t.code]), { sum: t.kind === 'amount', coef: true })),
    col('Tổng hệ số BH', 11, 'k', (l, d) => f4(d.insCoef), { coef: true }), col('Tổng hệ số thưởng', 11, 'k', (l, d) => f4(d.bonusCoef), { coef: true }),
    col('Lương cơ sở', 13, 'm', (l, d) => num(d.baseWage)), col('Đơn giá lương', 13, 'm', (l, d) => num(d.unitPrice)), col('Xếp loại LĐ', 9, 'text', (l, d) => d.laborGrade || ''), col('Hệ số xếp loại', 9, 'k', (l, d) => d.laborFactor ?? '', { coef: true }),
    col('Lương BH (theo công)', 14, 'm', l => num(l.insurance_salary), { sum: true }), col('Lương làm đêm', 13, 'm', l => num(l.night_salary), { sum: true }), col('Lương làm thêm', 13, 'm', l => num(l.extra_salary), { sum: true }), col('Lương làm lễ/tết', 13, 'm', l => num(l.holiday_salary), { sum: true }), col('Phụ cấp', 13, 'm', l => num(l.allowance), { sum: true }), col('Khấu trừ', 13, 'm', l => num(l.deduction), { sum: true }),
    col('LƯƠNG THỰC LĨNH', 15, 'm', (l, d) => num(d.salaryNet ?? (num(l.insurance_salary) + num(l.allowance) - num(l.deduction))), { sum: true, b: true }),
    col('Thưởng theo hệ số', 14, 'm', (l, d) => num(d.bonusBase), { sum: true }), col('Thưởng làm đêm', 13, 'm', l => num(l.night_bonus), { sum: true }), col('Thưởng làm thêm', 13, 'm', l => num(l.extra_bonus), { sum: true }), col('Thưởng làm lễ/tết', 13, 'm', l => num(l.holiday_bonus), { sum: true }), col('Thưởng thêm', 13, 'm', (l, d) => num(d.monthlyBonus), { sum: true }), col('Trừ vào thưởng', 13, 'm', (l, d) => num(d.bonusDeduction), { sum: true }),
    col('THƯỞNG THỰC NHẬN', 15, 'm', (l, d) => num(d.bonusNet ?? l.bonus), { sum: true, b: true }),
    col('Lương + Thưởng', 15, 'm', (l, d) => num(d.salaryNet ?? 0) + num(d.bonusNet ?? l.bonus), { sum: true, b: true }),
    col('Ăn ca (ngày)', 9, 'n', (l, d) => num(d.mealDays), { sum: true }), col('Tiền ăn ca', 13, 'm', l => num(l.meal_amount), { sum: true }), col('TỔNG THỰC LĨNH', 15, 'm', l => num(l.net), { sum: true, b: true })];
  cols.forEach((c, i) => { ws.set(4, i + 1, c.head, ST.H); ws.col(i + 1, c.w); }); ws.height(4, 48);
  const sty = c => ({ ...(c.t === 'text' ? ST.C : c.t === 'm' ? ST.M : ST.K), ...(c.b ? { b: true } : {}) }), tot = cols.map(() => 0);
  lines.forEach((l, k) => { const d = l.detail || {}; cols.forEach((c, i) => { const v0 = c.val(l, d, k), v = c.coef && !num(v0) ? null : v0; ws.set(5 + k, i + 1, v, sty(c)); if (c.sum && typeof v === 'number') tot[i] += v; }); });
  const tr = 5 + lines.length; cols.forEach((c, i) => ws.set(tr, i + 1, i === 1 ? 'Cộng' : c.sum ? tot[i] : null, { ...ST.T, fmt: c.t === 'm' ? '#,##0' : '#,##0.##' }));
  ws.freeze = [4, 2];
  sendXlsx(res, wb.toBuffer(), `thong-ke-luong-nhan-vien-${year}-${pad2(month)}.xlsx`);
});

// ===== 4. Lương của tôi (tự xem) =====
// Nút bật/tắt của Admin: bật = mọi nhân sự đăng nhập được (kể cả người không có quyền xem bảng lương) xem lương CHÍNH THỨC (đã khoá) của chính mình
router.get('/self-view', api(async req => { req.auth.needAdmin(); return { enabled: await selfViewOn() }; }));
router.put('/self-view', api(async req => {
  req.auth.needAdmin();
  const on = req.body?.enabled === true || req.body?.enabled === 'true';
  await pool.query(`INSERT INTO settings(key, value, updated_by) VALUES('self_view',$1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [String(on), req.auth.user.id]);
  await audit(req, 'settings.self_view', 'settings', null, { enabled: on });
  return { ok: true, enabled: on };
}));
async function mine(req) {
  if (!(await selfViewOn())) forbid('Chức năng xem lương cá nhân chưa được bật. Hãy liên hệ Quản trị Payroll.');
  const emp = await myEmployee(req);
  if (!emp) forbid('Tài khoản của bạn chưa có trong danh sách nhân sự Payroll (chưa đồng bộ từ SSO).');
  return emp;
}
const MY_COLS = `r.year, r.month, pl.work_days, pl.insurance_salary, pl.allowance, pl.meal_amount, pl.deduction, pl.net, ${SAL} AS salary, ${BON} AS bonus, (${SAL} + ${BON}) AS salbonus, ${METRIC_SQL.meal_days} AS meal_days, ${METRIC_SQL.work_std} AS std_days, ${METRIC_SQL.work_diff} AS diff_days, ${METRIC_SQL.work_ot} AS ot_days`;
const MY_KEYS = ['work_days', 'insurance_salary', 'allowance', 'meal_amount', 'deduction', 'net', 'salary', 'bonus', 'salbonus', 'meal_days', 'std_days', 'diff_days', 'ot_days'];
router.get('/my', api(async req => {
  const emp = await mine(req);
  const lines = await rows(`SELECT ${MY_COLS} FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id WHERE pl.employee_id=$1 AND r.status='locked' ORDER BY r.year, r.month`, [emp.id]);
  const years = {};
  for (const l of lines) {
    const y = years[l.year] = years[l.year] || { year: l.year, months: Array(12).fill(null), total: Object.fromEntries(MY_KEYS.map(k => [k, 0])) };
    y.months[l.month - 1] = Object.fromEntries(MY_KEYS.map(k => [k, num(l[k])]));
    for (const k of MY_KEYS) y.total[k] += num(l[k]);
  }
  await audit(req, 'payroll.self_view', 'employee', emp.id, null);
  return { employee: { name: emp.full_name, code: emp.employee_code }, years: Object.values(years), note: 'Chỉ hiển thị các tháng bảng lương đã được Giám đốc khoá.' };
}));
// Nhân viên tự xuất Excel: có month = phiếu lương tháng (đủ hệ số, cách tính); không có month = bảng cả năm
router.get('/my/export/file', async (req, res) => {
  const emp = await mine(req), year = Number(req.query.year), month = req.query.month ? Number(req.query.month) : null;
  if (!yearOk(year) || (month !== null && !validYM(year, month))) bad('Năm/tháng không hợp lệ');
  const lines = await rows(`SELECT ${MY_COLS}, pl.detail FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id WHERE pl.employee_id=$1 AND r.year=$2 AND r.status='locked' ${month ? 'AND r.month=$3' : ''} ORDER BY r.month`, month ? [emp.id, year, month] : [emp.id, year]);
  if (!lines.length) bad(month ? 'Chưa có bảng lương đã khoá của tháng này' : 'Năm này chưa có tháng nào được khoá', 404);
  const types = await typesList(), wb = new Workbook();
  if (month) {
    const l = lines[0], d = l.detail || {}, ws = wb.sheet(`Phiếu lương ${pad2(month)}-${year}`, { landscape: false });
    ws.col(1, 44); ws.col(2, 20); ws.col(3, 30);
    ws.set(1, 1, `PHIẾU LƯƠNG THÁNG ${month}/${year}`, { b: true, sz: 14 });
    ws.set(2, 1, `Họ tên: ${emp.full_name}${emp.employee_code ? ' · Mã NV: ' + emp.employee_code : ''}`, { b: true });
    let r = 4; const sec = t => { ws.set(r, 1, t, { ...ST.H, al: 'left' }); ws.set(r, 2, null, ST.H); ws.set(r, 3, null, ST.H); r++; };
    const row = (a, v, note, bold) => { ws.set(r, 1, a, { ...ST.C, ...(bold ? { b: true } : {}) }); ws.set(r, 2, v, { ...(typeof v === 'number' ? (/^(Ngày công|Công)/.test(a) ? ST.D : ST.M) : ST.C), ...(bold ? { b: true } : {}), al: 'right' }); ws.set(r, 3, note || '', { ...ST.C, i: true, color: '6B7280' }); r++; };
    sec('1. Hệ số được hưởng trong tháng');
    for (const t of types) if (num(d.coefs?.[t.code])) row(t.name, t.kind === 'amount' ? num(d.coefs[t.code]) : f4(d.coefs[t.code]), KIND_VN[t.kind]);
    row('Tổng hệ số bảo hiểm', f4(d.insCoef), '', true); row('Tổng hệ số thưởng', f4(d.bonusCoef), '', true);
    sec('2. Lương');
    row('Ngày công thực tế', num(l.work_days)); row('Công thực tế − công chuẩn (+ vượt / − thiếu)', d.diffStd !== undefined ? num(d.diffStd) : num(l.work_days) - num(d.standardDays)); if (num(d.otWork)) row('Công làm thêm (ký hiệu LT)', num(d.otWork), 'trả riêng theo % của ký hiệu'); row('Công chuẩn', num(d.standardDays), d.weeklyOff ? (d.weeklyOff === 'sat_sun' ? 'nghỉ Thứ 7 + CN' : 'nghỉ Chủ nhật') + (d.holidayDays ? `, ${d.holidayDays} ngày lễ` : '') : ''); if (d.minDays !== undefined) row('Công tối thiểu', num(d.minDays), 'từ mức này đến công chuẩn vẫn hưởng đủ'); if (num(d.otDays)) row('Công tăng ca', num(d.otDays), `hệ số lương ×${d.otSalary ?? 1}, thưởng ×${d.otBonus ?? 1}`); row('Đơn giá ngày — lương', num(d.dailySalary), '(hệ số × lương cơ sở + phụ cấp) ÷ công chuẩn'); row('Đơn giá ngày — thưởng', num(d.dailyBonus), 'hệ số × đơn giá ÷ công chuẩn'); row('Tỷ lệ công (lương)', f4(d.ratio)); row('Tỷ lệ công (thưởng)', f4(d.ratioBonus ?? d.ratio)); row('Lương cơ sở', num(d.baseWage)); row('Xếp loại lao động', d.laborGrade || '—', d.laborFactor ? `hệ số ×${d.laborFactor}` : '');
    row('Lương bảo hiểm (theo công, tối đa công chuẩn)', num(l.insurance_salary), 'hệ số BH × lương cơ sở ÷ công chuẩn × công tính lương × xếp loại');
    if (!d.premiumInBonus) { const pdays = d.premiumDays || {}; row('Lương làm đêm', num(d.nightSalary), `${num(pdays.night)} ngày tương đương × đơn giá ngày`); row('Lương làm thêm (công vượt chuẩn, sửa chữa…)', num(d.extraSalary), `gồm ${num(d.otSalaryAmt)} công vượt chuẩn; ${num(pdays.extra)} ngày tương đương theo % ký hiệu`); row('Lương làm lễ, tết', num(d.holidaySalary), `${num(pdays.holiday)} ngày tương đương theo % ngày lễ`); }
    row('Phụ cấp', num(l.allowance));
    for (const x of d.deductions || []) row('  Trừ: ' + x.name, -num(x.amount)); if (num(d.monthlyDeduction)) row('  Trừ trong tháng', -num(d.monthlyDeduction));
    row('LƯƠNG THỰC LĨNH', num(l.salary), '', true);
    sec('3. Thưởng');
    row('Đơn giá lương', num(d.unitPrice)); row('Thưởng theo hệ số (tối đa công chuẩn)', num(d.bonusBase), 'hệ số thưởng × đơn giá ÷ công chuẩn × công tính thưởng × xếp loại'); { const ps = d.premiumInBonus ? d.premSal || {} : null, nt = k => ps ? `gồm ${num(ps[k]).toLocaleString('vi-VN')} theo hệ số lương + ${num((d.premBon || {})[k]).toLocaleString('vi-VN')} theo hệ số thưởng` : '';
      row('Thưởng làm đêm', num(d.nightBonus), nt('night')); row('Thưởng làm thêm (công vượt chuẩn, sửa chữa…)', num(d.extraBonus), nt('extra')); row('Thưởng làm lễ, tết', num(d.holidayBonus), nt('holiday')); }
    for (const x of d.extras || []) row(`  ${x.kind === 'bonus' ? 'Thưởng thêm' : 'Trừ vào thưởng'}: ${x.label}`, x.kind === 'bonus' ? num(x.amount) : -num(x.amount));
    row('THƯỞNG THỰC NHẬN', num(l.bonus), '', true);
    sec('4. Ăn ca và tổng'); row('Số ngày ăn ca', num(l.meal_days)); row('Tiền ăn ca', num(l.meal_amount)); row('Lương + Thưởng', num(l.salbonus), '', true); row('TỔNG THỰC LĨNH', num(l.net), '', true);
  } else {
    const ws = wb.sheet(`Lương ${year}`), heads = ['Tháng', 'Ngày công', ...types.map(t => `${t.name} (${KIND_VN[t.kind]})`), 'Tổng hệ số BH', 'Tổng hệ số thưởng', 'Lương BH', 'Phụ cấp', 'Khấu trừ', 'Lương thực lĩnh', 'Thưởng thực nhận', 'Lương + Thưởng', 'Ăn ca (ngày)', 'Tiền ăn ca', 'Tổng thực lĩnh'];
    ws.set(1, 1, `BẢNG LƯƠNG CÁ NHÂN NĂM ${year} — ${emp.full_name}`, { b: true, sz: 13 });
    heads.forEach((t, i) => ws.set(3, i + 1, t, ST.H)); ws.height(3, 44); ws.col(1, 10); for (let c = 2; c <= heads.length; c++) ws.col(c, 13);
    const tot = new Array(heads.length).fill(0);
    lines.forEach((l, k) => { const d = l.detail || {}, v = [`Tháng ${l.month}`, num(l.work_days), ...types.map(t => f4(d.coefs?.[t.code])), f4(d.insCoef), f4(d.bonusCoef), num(l.insurance_salary), num(l.allowance), num(l.deduction), num(l.salary), num(l.bonus), num(l.salbonus), num(l.meal_days), num(l.meal_amount), num(l.net)];
      const hc = 2 + types.length + 2; v.forEach((x, i) => { ws.set(4 + k, i + 1, x, typeof x === 'number' ? (i >= hc && i !== hc + 7 ? ST.M : ST.K) : ST.C); if (typeof x === 'number' && i >= hc) tot[i] += x; }); });
    ws.set(4 + lines.length, 1, 'Cả năm', ST.T); for (let i = 1; i < heads.length; i++) ws.set(4 + lines.length, i + 1, i >= 2 + types.length + 2 ? tot[i] : null, ST.T);
    ws.freeze = [3, 1];
  }
  await audit(req, 'payroll.self_export', 'employee', emp.id, { year, month });
  sendXlsx(res, wb.toBuffer(), month ? `phieu-luong-${year}-${pad2(month)}.xlsx` : `luong-ca-nhan-${year}.xlsx`);
});
router.get('/my/:year/:month', api(async req => {
  const emp = await mine(req);
  const year = Number(req.params.year), month = Number(req.params.month); if (!validYM(year, month)) bad('Tháng không hợp lệ');
  const l = await one(`SELECT ${MY_COLS}, pl.detail FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id WHERE pl.employee_id=$1 AND r.year=$2 AND r.month=$3 AND r.status='locked'`, [emp.id, year, month]);
  if (!l) bad('Chưa có bảng lương đã khoá của tháng này', 404);
  const d = l.detail || {};
  return { year, month, line: Object.fromEntries(MY_KEYS.map(k => [k, num(l[k])])),
    detail: { salaryNet: d.salaryNet, bonusNet: d.bonusNet, monthlyBonus: d.monthlyBonus, bonusDeduction: d.bonusDeduction, periodicDeduction: d.periodicDeduction, monthlyDeduction: d.monthlyDeduction, extras: d.extras || [], deductions: d.deductions || [] } };
}));
// Cho giao diện biết có hiện tab "Lương của tôi" không
async function selfTab(req) { return (await selfViewOn()) && !!(await myEmployee(req)); }
module.exports = router; module.exports.selfTab = selfTab; module.exports.allowedGroups = allowedGroups;
