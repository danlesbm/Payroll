// Quỹ lương (khối): xếp từng người vào một quỹ để tổng hợp tiền lương theo nguồn quỹ.
// Thứ tự ưu tiên: quỹ chọn tay ở Nhân sự → quỹ của bộ phận (Tổ chức) → quy tắc mặc định:
//   bộ phận HĐQT → quỹ có quy tắc 'hdqt'; Ban kiểm soát → 'bks'; bảng lương văn phòng → 'office';
//   nhà máy: người có kíp (ca kíp) → 'shift' (công nhân vận hành), còn lại → 'plant' (quản lý và hành chính).
// Quỹ được lưu vào dòng lương lúc tính (payroll_lines.fund_id) để báo cáo các tháng cũ không đổi khi sau này điều chuyển người.
const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** kind: loại bảng lương đang tính ('plant' | 'office'); null = theo bảng lương của bộ phận người đó (dùng cho bảng lương khoán), fallbackKind khi không xác định được. */
async function resolveFunds(c, ids, { kind = null, fallbackKind = 'plant' } = {}) {
  const out = new Map(); if (!ids.length) return out;
  const byRule = new Map((await q(c, 'SELECT id, rule FROM salary_funds WHERE active AND rule IS NOT NULL')).map(f => [f.rule, f.id]));
  const emps = await q(c, `SELECT v.id, v.fund_id, v.shift_no, pd.fund_id AS dept_fund, pg.kind AS pay_kind,
      EXISTS (SELECT 1 FROM department_sso_map m WHERE m.department_id=v.pay_dept_id AND m.sso_department_id='role:HDQT') AS hdqt,
      EXISTS (SELECT 1 FROM department_sso_map m WHERE m.department_id=v.pay_dept_id AND m.sso_department_id='role:BKS') AS bks
    FROM v_employees v LEFT JOIN departments pd ON pd.id=v.pay_dept_id LEFT JOIN groups pg ON pg.id=v.pay_group_id WHERE v.id = ANY($1::uuid[])`, [ids]);
  for (const e of emps) {
    const k = kind || e.pay_kind || fallbackKind;
    const rule = e.hdqt ? 'hdqt' : e.bks ? 'bks' : k === 'office' ? 'office' : e.shift_no ? 'shift' : 'plant';
    out.set(e.id, e.fund_id || e.dept_fund || byRule.get(rule) || null);
  }
  return out;
}

/** Tổng hợp tiền lương theo bảng lương × quỹ lương. statusSql: điều kiện trạng thái bảng lương (vd r.status='locked'). */
async function fundSummary(c, { groupIds, year, from = 1, to = 12, statusSql = 'true' }) {
  const funds = await q(c, 'SELECT id, code, name, rule, sort_order, active FROM salary_funds ORDER BY sort_order, name');
  if (!groupIds.length) return { year, from, to, funds, groups: [], byFund: [], total: null };
  const lines = await q(c, `SELECT r.group_id, g.name AS group_name, g.kind AS group_kind, g.pay_type, g.sort_order AS group_sort, r.month, pl.employee_id, pl.fund_id,
      pl.insurance_salary, pl.allowance, pl.bonus, pl.meal_amount, pl.deduction, pl.net, COALESCE(pl.pit_tax, 0) AS pit_tax,
      pl.night_salary + pl.night_bonus + pl.extra_salary + pl.extra_bonus + pl.holiday_salary + pl.holiday_bonus AS premium,
      COALESCE(pl.detail->>'fixedPay','') = 'true' AS fixed, COALESCE((pl.detail->>'amount')::numeric, 0) AS fixed_amount
    FROM payroll_lines pl JOIN payroll_runs r ON r.id=pl.run_id JOIN groups g ON g.id=r.group_id
    WHERE r.group_id = ANY($1::uuid[]) AND r.year=$2 AND r.month BETWEEN $3 AND $4 AND ${statusSql}`, [groupIds, year, from, to]);
  // Dòng tính trước khi có quỹ lương: xếp theo cài đặt hiện tại
  const miss = lines.filter(l => !l.fund_id);
  if (miss.length) {
    // Cùng cách xếp như lúc tính: lương hệ số theo loại bảng lương; lương khoán theo bảng lương của bộ phận người đó, không có thì theo loại bảng lương khoán
    const key = l => `${l.fixed ? 'f' : 'c'}|${l.group_kind || ''}`, by = new Map(), res = new Map();
    for (const l of miss) (by.get(key(l)) || by.set(key(l), new Set()).get(key(l))).add(l.employee_id);
    for (const [k, set] of by) { const [t, kind] = k.split('|'); res.set(k, await resolveFunds(c, [...set], t === 'f' ? { fallbackKind: kind || 'plant' } : { kind: kind || null })); }
    for (const l of miss) l.fund_id = res.get(key(l))?.get(l.employee_id) || null;
  }
  const fundName = new Map(funds.map(f => [f.id, f.name])), fundSort = new Map(funds.map(f => [f.id, f.sort_order]));
  const KEYS = ['insurance_salary', 'allowance', 'bonus', 'premium', 'fixed_amount', 'gross', 'meal_amount', 'deduction', 'pit_tax', 'net'];
  const blank = () => ({ ...Object.fromEntries(KEYS.map(k => [k, 0])), people: new Set(), lines: 0 });
  const add = (o, l) => {
    const gross = l.fixed ? num(l.fixed_amount) : num(l.insurance_salary) + num(l.allowance) + num(l.bonus) + num(l.premium);
    o.insurance_salary += num(l.insurance_salary); o.allowance += num(l.allowance); o.bonus += num(l.bonus); o.premium += num(l.premium); o.fixed_amount += l.fixed ? num(l.fixed_amount) : 0;
    o.gross += gross; o.meal_amount += num(l.meal_amount); o.deduction += num(l.deduction); o.pit_tax += l.fixed ? 0 : num(l.pit_tax); o.net += num(l.net); o.people.add(l.employee_id); o.lines++;
  };
  const fin = o => { const { people, ...rest } = o; return { ...rest, headcount: people.size }; };
  const groups = new Map(), byFund = new Map(), total = blank();
  for (const l of lines) {
    let g = groups.get(l.group_id); if (!g) groups.set(l.group_id, g = { id: l.group_id, name: l.group_name, kind: l.group_kind, payType: l.pay_type, sort: l.group_sort, funds: new Map(), total: blank() });
    const fk = l.fund_id || '';
    if (!g.funds.has(fk)) g.funds.set(fk, blank());
    add(g.funds.get(fk), l); add(g.total, l);
    if (!byFund.has(fk)) byFund.set(fk, blank());
    add(byFund.get(fk), l); add(total, l);
  }
  const fundRows = m => [...m].sort((a, b) => (fundSort.get(a[0]) ?? 1e9) - (fundSort.get(b[0]) ?? 1e9)).map(([id, o]) => ({ fundId: id || null, fundName: fundName.get(id) || 'Chưa xếp quỹ', ...fin(o) }));
  return { year, from, to, funds, keys: KEYS,
    groups: [...groups.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'vi')).map(g => ({ id: g.id, name: g.name, kind: g.kind, payType: g.payType, rows: fundRows(g.funds), total: fin(g.total) })),
    byFund: fundRows(byFund), total: fin(total) };
}
module.exports = { resolveFunds, fundSummary };
