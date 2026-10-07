window.PAGES = window.PAGES || {};
// ================= THỐNG KÊ: THEO BỘ PHẬN, SO SÁNH CÁ NHÂN, ĂN CA, LỊCH SỬ HỆ SỐ, BẬC LƯƠNG; LƯƠNG CỦA TÔI =================
const YCOL = ['#94a3b8', '#60a5fa', '#1d4ed8'];
const SEQ = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1e3a8a', '#172554', '#0f172a'];
const ycol = (n, k) => SEQ[Math.max(0, SEQ.length - n + k)];   // năm cũ nhạt → năm mới đậm
const mshort = n => Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' tỷ' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' tr' : Math.abs(n) >= 1e3 ? money(n) : String(Math.round(n * 10) / 10);
const pct = (a, b) => b ? ((a - b) / b * 100) : null;
const pctTxt = p => p === null ? '—' : `<span style="color:${p >= 0 ? '#166534' : '#b91c1c'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1).replace('.', ',')}%</span>`;
const COUNT_M = new Set(['meal_days', 'work_days', 'work_std', 'work_diff', 'work_ot']);
const fv = (m, v) => v === null || v === undefined ? '<span class="muted">–</span>' : COUNT_M.has(m) ? String(Math.round(v * 100) / 100).replace('.', ',') : money(v);
const MLAB = Array.from({ length: 12 }, (_, i) => 'T' + (i + 1));
const safeErr = (box, e) => { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; };

// Biểu đồ cột nhóm: labels + series [{name,color,values}]
function barSvg(labels, series, o = {}) {
  const W = o.w || 760, H = o.h || 260, L = 54, R = 10, T = 14, B = 30, iw = W - L - R, ih = H - T - B;
  const max = Math.max(1, ...series.flatMap(s => s.values.map(v => v || 0)));
  const step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step * 2) / 2 * step || 1;
  const gw = iw / labels.length, bw = Math.min(26, (gw * 0.8) / series.length), y = v => T + ih - (v / nice) * ih;
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = nice * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#6b7280">${mshort(v)}</text>`; }
  labels.forEach((lb, i) => {
    const cx = L + gw * i + gw / 2;
    g += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#374151">${esc(lb)}</text>`;
    series.forEach((s, k) => { const v = s.values[i]; if (v === null || v === undefined) return; const x = cx - (bw * series.length) / 2 + bw * k;
      g += `<rect x="${x}" y="${y(Math.max(v, 0))}" width="${bw - 2}" height="${Math.max(0, y(0) - y(Math.max(v, 0)))}" rx="2" fill="${s.color}"><title>${esc(s.name)} · ${esc(lb)}: ${fv(o.m, v).replace(/<[^>]+>/g, '')}</title></rect>`; });
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto">${g}</svg>${legend(series)}`;
}
// Biểu đồ đường nhiều năm theo tháng
function lineSvg(labels, series, o = {}) {
  const W = o.w || 760, H = o.h || 260, L = 54, R = 14, T = 14, B = 30, iw = W - L - R, ih = H - T - B;
  const max = Math.max(1, ...series.flatMap(s => s.values.map(v => v || 0)));
  const step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step * 2) / 2 * step || 1;
  const x = i => L + (iw * i) / Math.max(1, labels.length - 1), y = v => T + ih - (v / nice) * ih;
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = nice * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#6b7280">${mshort(v)}</text>`; }
  labels.forEach((lb, i) => { g += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#374151">${esc(lb)}</text>`; });
  series.forEach(s => {
    let d = '', pen = false;
    s.values.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)} ${y(v)} `; pen = true; });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`;
    s.values.forEach((v, i) => { if (v !== null && v !== undefined) g += `<circle cx="${x(i)}" cy="${y(v)}" r="3.2" fill="${s.color}"><title>${esc(s.name)} · ${esc(labels[i])}: ${fv(o.m, v).replace(/<[^>]+>/g, '')}</title></circle>`; });
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto">${g}</svg>${legend(series)}`;
}
const legend = series => series.length > 1 || series[0]?.name ? `<div class="small" style="display:flex;gap:14px;flex-wrap:wrap;margin:4px 0 8px">${series.map(s => `<span><i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${s.color};vertical-align:-1px"></i> ${esc(s.name)}</span>`).join('')}</div>` : '';

// ---------- Khung các tab thống kê ----------
let RP_TAB = 'dept', RP_LOCKED = true, RP_YEAR = 0, RP_METRIC = 'net';
PAGES.reports = async (me, root) => {
  const tabs = [['dept', 'Theo bộ phận'], ['people', 'So sánh cá nhân (lương, thưởng)'], ['meal', 'Ăn ca cá nhân'], ['hist', 'Lịch sử tăng/giảm hệ số'], ['grades', 'Bậc lương & đến hạn tăng bậc']];
  root.innerHTML = `<div class="sub">${tabs.map(t => `<button class="btn ${t[0] === RP_TAB ? '' : 'sec'}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="rp"></div>`;
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { RP_TAB = b.dataset.t; PAGES.reports(me, root); });
  const box = $('#rp');
  try { await ({ dept: repDept, people: (m, b) => repPeople(m, b, 'pay'), meal: (m, b) => repPeople(m, b, 'meal'), hist: repHist, grades: repGrades })[RP_TAB](me, box); } catch (e) { safeErr(box, e); }
};
const lockedChk = on => `<label class="small"><input type="checkbox" id="lk" ${on ? 'checked' : ''}> Chỉ tính bảng đã khoá (chính thức)</label>`;

// ---------- 1. Theo bộ phận ----------
async function repDept(me, box) {
  const year = RP_YEAR || me.now.year, yrs = []; for (let y = me.yearMin; y <= me.yearMax; y++) yrs.push(y);
  const d = await GET(`/api/reports/dept-year?year=${year}&locked=${RP_LOCKED ? 1 : 0}&metric=${RP_METRIC}`), m = d.metric;
  const groups = (await GET(`/api/payroll/groups?year=${year}&month=${me.now.month}`).catch(() => ({ groups: [] }))).groups;
  box.innerHTML = `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Thống kê ${esc(d.metricLabel.toLowerCase())} năm ${year} theo bộ phận</h2>
    <select id="ry">${yrs.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <select id="rm">${Object.entries(d.metrics).map(([k, v]) => `<option value="${k}" ${k === m ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>${lockedChk(RP_LOCKED)}
    <button class="btn sec" id="xl">Xuất Excel (lương, thưởng, lương+thưởng, ăn ca)</button></div>
    <div class="muted small" style="margin:6px 0">Cộng theo bộ phận hiện tại của người lao động. Cột "+/-" so với cả năm ${year - 1}. <b>Lương</b> = thực lĩnh bảng lương; <b>Thưởng</b> = thưởng thực nhận; file Excel gồm trang Tổng hợp và từng chỉ tiêu theo tháng.</div></div>
    <div class="card"><div class="row"><h3 class="grow" style="margin:0">Bảng thống kê từng nhân viên trong 1 tháng (đủ hệ số, lương, thưởng) — Excel</h3>
    <select id="eg">${groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>${ymPicker(me)}<button class="btn" id="xe" ${groups.length ? '' : 'disabled'}>Xuất Excel</button></div></div>
    ${d.groups.length ? d.groups.map(g => {
      const tot = Array(12).fill(0); g.depts.forEach(x => x.months.forEach((v, i) => tot[i] += v));
      const ty = tot.reduce((a, b) => a + b, 0), tp = g.depts.reduce((a, x) => a + x.prevNet, 0);
      return `<div class="card"><h2 style="margin-top:0">${esc(g.name)}</h2>
        <div class="scroll"><table class="rtb"><thead><tr><th>Bộ phận</th>${MLAB.map(x => `<th class="n">${x}</th>`).join('')}<th class="n">Cả năm</th><th class="n">Năm ${year - 1}</th><th class="n">+/-</th></tr></thead><tbody>
        ${g.depts.map(x => { const s = x.months.reduce((a, b) => a + b, 0); return `<tr><td><b>${esc(x.name)}</b></td>${x.months.map(v => `<td class="n">${v ? fv(m, v) : '<span class="muted">–</span>'}</td>`).join('')}<td class="n"><b>${fv(m, s)}</b></td><td class="n">${fv(m, x.prevNet)}</td><td class="n">${pctTxt(pct(s, x.prevNet))}</td></tr>`; }).join('')}
        <tr style="font-weight:700;background:#f3f4f6"><td>Cộng</td>${tot.map(v => `<td class="n">${fv(m, v)}</td>`).join('')}<td class="n">${fv(m, ty)}</td><td class="n">${fv(m, tp)}</td><td class="n">${pctTxt(pct(ty, tp))}</td></tr></tbody></table></div>
        <h3 style="margin:14px 0 4px">Cả năm theo bộ phận</h3>
        ${barSvg(g.depts.map(x => x.name.length > 14 ? x.name.slice(0, 13) + '…' : x.name), [{ name: String(year - 1), color: YCOL[0], values: g.depts.map(x => x.prevNet) }, { name: String(year), color: YCOL[2], values: g.depts.map(x => x.months.reduce((a, b) => a + b, 0)) }], { m })}
        <h3 style="margin:10px 0 4px">Cả bảng lương theo tháng</h3>
        ${lineSvg(MLAB, [{ name: String(year - 1), color: YCOL[0], values: Array.from({ length: 12 }, (_, i) => g.depts.reduce((a, x) => a + x.prevMonths[i], 0) || null) }, { name: String(year), color: YCOL[2], values: tot.map(v => v || null) }], { m })}</div>`;
    }).join('') : `<div class="card muted">Chưa có bảng lương ${RP_LOCKED ? 'đã khoá' : 'đang xử lý hoặc đã khoá'} nào trong năm ${year}.</div>`}`;
  const again = () => repDept(me, box).catch(x => safeErr(box, x));
  $('#ry').onchange = e => { RP_YEAR = +e.target.value; again(); }; $('#rm').onchange = e => { RP_METRIC = e.target.value; again(); };
  $('#lk').onchange = e => { RP_LOCKED = e.target.checked; again(); };
  $('#xl').onclick = guard(() => download(`/api/reports/dept-year/export?year=${year}&locked=${RP_LOCKED ? 1 : 0}`, `thong-ke-luong-thuong-nam-${year}.xlsx`));
  bindYm(() => {});
  if ($('#xe')) $('#xe').onclick = guard(() => download(`/api/reports/employee-month/export?groupId=${$('#eg').value}&year=${ymState.year}&month=${ymState.month}`, `thong-ke-luong-nhan-vien-${ymState.year}-${String(ymState.month).padStart(2, '0')}.xlsx`));
}

// ---------- 2 & 3. So sánh cá nhân giữa các năm / các tháng (lương, thưởng, ăn ca) ----------
const CMP = { pay: { gid: '', dept: '', years: null, metric: 'net', view: 'year', vy: 0 }, meal: { gid: '', dept: '', years: null, metric: 'meal_amount', view: 'year', vy: 0 } };
async function repPeople(me, box, mode) {
  const S = CMP[mode], isMeal = mode === 'meal';
  const groups = (await GET(`/api/payroll/groups?year=${me.now.year}&month=${me.now.month}`)).groups;
  if (!groups.length) { box.innerHTML = '<div class="card muted">Bạn chưa được phân quyền xem bảng lương nào.</div>'; return; }
  if (!S.gid || !groups.some(g => g.id === S.gid)) S.gid = groups[0].id;
  const avail = (await GET(`/api/reports/years?locked=${RP_LOCKED ? 1 : 0}`)).years;   // chỉ các năm thật sự có dữ liệu — tự mở rộng theo thời gian
  if (!S.years) S.years = avail.slice(-3);
  S.years = S.years.filter(y => avail.includes(y)); if (!S.years.length) S.years = avail.slice(-3);
  if (!S.years.length) { box.innerHTML = `<div class="card muted">Chưa có bảng lương ${RP_LOCKED ? 'đã khoá' : 'đang xử lý hoặc đã khoá'} nào để thống kê.${RP_LOCKED ? '' : ''}<div style="margin-top:8px">${lockedChk(RP_LOCKED)}</div></div>`; $('#lk').onchange = e => { RP_LOCKED = e.target.checked; repPeople(me, box, mode).catch(x => safeErr(box, x)); }; return; }
  const q = `groupId=${S.gid}&years=${S.years.join(',')}&metric=${S.metric}&locked=${RP_LOCKED ? 1 : 0}${S.dept ? '&departmentId=' + S.dept : ''}`;
  const d = await GET(`/api/reports/people-compare?${q}`), m = d.metric;
  const metricList = isMeal ? { meal_amount: d.metrics.meal_amount, meal_days: d.metrics.meal_days } : Object.fromEntries(Object.entries(d.metrics).filter(([k]) => !['meal_amount', 'meal_days'].includes(k)));
  if (!S.vy || !d.years.includes(S.vy)) S.vy = d.years[d.years.length - 1];
  const last = d.years[d.years.length - 1], prev = d.years[d.years.length - 2];
  const title = isMeal ? 'Thống kê ăn ca cá nhân' : 'So sánh cá nhân giữa các năm / các tháng';
  const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
  box.innerHTML = `<div class="card"><h2 style="margin-top:0">${title}</h2>
    <div class="row"><select id="cg">${opts(groups, 'id', 'name')}</select>
      <select id="cd"><option value="">Tất cả bộ phận</option>${d.departments.map(x => `<option value="${x.id}" ${x.id === S.dept ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <select id="cm">${Object.entries(metricList).map(([k, v]) => `<option value="${k}" ${k === m ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>${lockedChk(RP_LOCKED)}
      <span class="muted">|</span><button class="btn ${S.view === 'year' ? '' : 'sec'} sm" data-v="year">So sánh giữa các năm</button><button class="btn ${S.view === 'month' ? '' : 'sec'} sm" data-v="month">So sánh giữa các tháng</button>
      <button class="btn sec sm" id="xl">Xuất Excel</button></div>
    <div class="row small" style="margin-top:6px"><span class="muted">Năm có dữ liệu — chọn để so sánh:</span>${avail.map(y => `<label><input type="checkbox" data-y="${y}" ${S.years.includes(y) ? 'checked' : ''}> ${y}</label>`).join(' ')}</div></div>
    ${!d.people.length ? '<div class="card muted">Không có dữ liệu trong các năm đã chọn.</div>' : S.view === 'year' ? `<div class="card">
    <div class="muted small" style="margin-bottom:6px">${esc(d.metricLabel)} — tổng cả năm của từng người. Bấm vào một người để xem biểu đồ theo tháng. Năm đang chạy có ít tháng hơn nên tổng thấp hơn: dùng "So sánh giữa các tháng" để so sánh công bằng.</div>
    <div class="scroll"><table><thead><tr><th>Họ tên</th><th>Bộ phận</th>${d.years.map(y => `<th class="n">${y}</th>`).join('')}<th class="n">${prev ? `${last} so với ${prev}` : ''}</th></tr></thead><tbody>
    ${d.people.map((p, i) => `<tr class="clk" data-i="${i}" style="cursor:pointer"><td><b>${esc(p.name)}</b></td><td class="muted">${esc(p.dept)}</td>${d.years.map(y => `<td class="n">${fv(m, p.byYear[y])}</td>`).join('')}<td class="n">${prev ? pctTxt(pct(p.byYear[last] ?? 0, p.byYear[prev] ?? 0)) : ''}</td></tr>`).join('')}
    <tr style="font-weight:700;background:#f3f4f6"><td colspan="2">Cộng</td>${d.years.map(y => `<td class="n">${fv(m, sum(d.people.map(p => p.byYear[y])))}</td>`).join('')}<td class="n">${prev ? pctTxt(pct(sum(d.people.map(p => p.byYear[last])), sum(d.people.map(p => p.byYear[prev])))) : ''}</td></tr></tbody></table></div></div>` : `<div class="card">
    <div class="row"><b>Năm</b><select id="cv">${d.years.map(y => `<option ${y === S.vy ? 'selected' : ''}>${y}</option>`).join('')}</select><span class="muted small">${esc(d.metricLabel)} từng tháng của từng người trong năm đã chọn. Bấm vào một người để xem biểu đồ so với năm trước.</span></div>
    <div class="scroll"><table class="rtb"><thead><tr><th>Họ tên</th><th>Bộ phận</th>${MLAB.map(x => `<th class="n">${x}</th>`).join('')}<th class="n">Cả năm</th><th class="n">TB tháng</th></tr></thead><tbody>
    ${d.people.map((p, i) => { const mm = p.months[S.vy] || [], f = mm.filter(v => v !== null && v !== undefined), s = sum(f); return `<tr class="clk" data-i="${i}" style="cursor:pointer"><td><b>${esc(p.name)}</b></td><td class="muted">${esc(p.dept)}</td>${MLAB.map((_, k) => `<td class="n">${fv(m, mm[k])}</td>`).join('')}<td class="n"><b>${fv(m, s)}</b></td><td class="n">${f.length ? fv(m, s / f.length) : '–'}</td></tr>`; }).join('')}
    <tr style="font-weight:700;background:#f3f4f6"><td colspan="2">Cộng</td>${MLAB.map((_, k) => `<td class="n">${fv(m, sum(d.people.map(p => (p.months[S.vy] || [])[k])))}</td>`).join('')}<td class="n">${fv(m, sum(d.people.map(p => p.byYear[S.vy])))}</td><td></td></tr></tbody></table></div></div>`}`;
  const again = () => repPeople(me, box, mode).catch(x => safeErr(box, x));
  $('#cg').value = S.gid; $('#cg').onchange = e => { S.gid = e.target.value; S.dept = ''; again(); };
  $('#cd').onchange = e => { S.dept = e.target.value; again(); }; $('#cm').onchange = e => { S.metric = e.target.value; again(); };
  $('#lk').onchange = e => { RP_LOCKED = e.target.checked; S.years = null; again(); };
  if ($('#cv')) $('#cv').onchange = e => { S.vy = +e.target.value; again(); };
  box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { S.view = b.dataset.v; again(); });
  $('#xl').onclick = guard(() => download(`/api/reports/people-compare/export?${q}`, `so-sanh-${m}-ca-nhan.xlsx`));
  box.querySelectorAll('[data-y]').forEach(c => c.onchange = () => { const ys = [...box.querySelectorAll('[data-y]:checked')].map(x => +x.dataset.y); if (!ys.length || ys.length > 8) { toast('Chọn từ 1 đến 8 năm', true); c.checked = !c.checked; return; } S.years = ys; again(); });
  box.querySelectorAll('tr.clk').forEach(tr => tr.onclick = () => {
    const p = d.people[+tr.dataset.i];
    if (S.view === 'month') { const yy = S.vy; modal(`<h2>${esc(p.name)} — ${esc(d.metricLabel)} theo tháng, năm ${yy}<span class="x">✕</span></h2>${barSvg(MLAB, [...(p.months[yy - 1] ? [{ name: String(yy - 1), color: YCOL[0], values: p.months[yy - 1] }] : []), { name: String(yy), color: YCOL[2], values: p.months[yy] || Array(12).fill(null) }], { m })}`, true); return; }
    modal(`<h2>${esc(p.name)} — ${esc(d.metricLabel)} theo tháng<span class="x">✕</span></h2>${lineSvg(MLAB, d.years.map((y, k) => ({ name: String(y), color: ycol(d.years.length, k), values: p.months[y] || Array(12).fill(null) })), { m })}`, true);
  });
}

// ---------- 4. Lịch sử tăng / giảm hệ số ----------
const HF = { gid: '', kind: 'insurance', from: '', to: '', q: '', first: false };
async function repHist(me, box) {
  const groups = (await GET(`/api/payroll/groups?year=${me.now.year}&month=${me.now.month}`)).groups;
  if (!HF.from) { HF.from = `${me.now.year - 1}-01-01`; HF.to = `${me.now.year}-12-31`; }
  const qs = `groupId=${HF.gid}&kind=${HF.kind}&from=${HF.from}&to=${HF.to}&q=${encodeURIComponent(HF.q)}&first=${HF.first ? 1 : 0}`;
  const d = await GET('/api/reports/coef-changes?' + qs);
  const arrow = (a, b) => a === null ? '—' : a === b ? String(a) : `${a} → <b>${b}</b>`;
  box.innerHTML = `<div class="card"><h2 style="margin-top:0">Lịch sử tăng / giảm hệ số của nhân viên</h2>
    <div class="row"><select id="hg"><option value="">Tất cả bảng lương</option>${groups.map(g => `<option value="${g.id}" ${g.id === HF.gid ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
      <select id="hk">${[['insurance', 'Hệ số bảo hiểm (lương)'], ['bonus', 'Hệ số thưởng'], ['amount', 'Phụ cấp (số tiền)'], ['all', 'Tất cả hệ số']].map(([k, v]) => `<option value="${k}" ${k === HF.kind ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label>Từ ngày</label><input type="date" id="hf" value="${HF.from}"><label>đến</label><input type="date" id="ht" value="${HF.to}"><input id="hq" placeholder="Tìm tên…" value="${esc(HF.q)}" style="width:140px">
      <label class="small"><input type="checkbox" id="h1" ${HF.first ? 'checked' : ''}> Gồm lần nhập đầu tiên</label><button class="btn" id="hgo">Xem</button><button class="btn sec" id="hxl">Xuất Excel</button></div>
    <div class="muted small" style="margin-top:6px">Mỗi dòng là một lần hệ số thay đổi (theo ngày hiệu lực). Tổng ${d.total} lượt${d.total > 2000 ? ' (hiện 2.000 lượt gần nhất, Excel có đủ)' : ''}: <span style="color:#166534">▲ ${d.ups} lần tăng hệ số BH</span> · <span style="color:#b91c1c">▼ ${d.downs} lần giảm</span>.</div></div>
    <div class="card"><div class="scroll"><table class="rtb"><thead><tr><th>Hiệu lực từ</th><th>Họ tên</th><th>Bộ phận</th><th>Bậc</th><th class="n">Hệ số BH</th><th class="n">+/-</th><th class="n">%</th><th class="n">Hệ số thưởng</th><th>Chi tiết thay đổi</th><th>Ghi chú</th><th>Người nhập</th></tr></thead><tbody>
    ${d.rows.map(x => `<tr><td><b>${esc(x.ef)}</b></td><td>${esc(x.name)}</td><td class="muted">${esc(x.dept || '')}</td><td>${x.grade_before === x.grade_after ? esc(x.grade_after || '—') : `${esc(x.grade_before || '—')} → <b>${esc(x.grade_after || '—')}</b>`}</td>
      <td class="n">${x.first ? `<b>${x.ins_after}</b> <span class="muted">(khởi tạo)</span>` : arrow(x.ins_before, x.ins_after)}</td><td class="n">${x.delta === null ? '' : `<span style="color:${x.delta >= 0 ? '#166534' : '#b91c1c'}">${x.delta > 0 ? '+' : ''}${Math.round(x.delta * 10000) / 10000}</span>`}</td><td class="n">${x.pct === null ? '' : pctTxt(x.pct)}</td>
      <td class="n">${x.first ? x.bonus_after : arrow(x.bonus_before, x.bonus_after)}</td><td class="small" style="white-space:normal;min-width:200px">${esc(x.detail.join('; '))}</td><td class="small">${esc(x.note || '')}</td><td class="small">${esc(x.by || '')}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Không có lần thay đổi nào trong khoảng đã chọn.</td></tr>'}</tbody></table></div></div>`;
  const go = () => { HF.gid = $('#hg').value; HF.kind = $('#hk').value; HF.from = $('#hf').value; HF.to = $('#ht').value; HF.q = $('#hq').value; HF.first = $('#h1').checked; return qs2(); };
  const qs2 = () => `groupId=${HF.gid}&kind=${HF.kind}&from=${HF.from}&to=${HF.to}&q=${encodeURIComponent(HF.q)}&first=${HF.first ? 1 : 0}`;
  $('#hgo').onclick = () => { go(); repHist(me, box).catch(x => safeErr(box, x)); };
  ['hg', 'hk', 'h1'].forEach(id => $('#' + id).onchange = () => { go(); repHist(me, box).catch(x => safeErr(box, x)); });
  $('#hxl').onclick = guard(() => { go(); return download('/api/reports/coef-changes/export?' + qs2(), 'lich-su-he-so.xlsx'); });
}

// ---------- 5. Bậc lương BH & đến hạn tăng bậc ----------
const GF = { gid: '', preset: 'u90', from: '', to: '', q: '' };
const iso = d => d.toISOString().slice(0, 10);
const addD = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function presetRange(p, t) {   // t = 'YYYY-MM-DD' hôm nay
  const y = +t.slice(0, 4), mo = +t.slice(5, 7) - 1, mkd = (yy, m0, d) => iso(new Date(Date.UTC(yy, m0, d)));
  const q0 = Math.floor(mo / 3) * 3;
  return ({ over: ['1900-01-01', addD(t, -1)], u30: ['1900-01-01', addD(t, 30)], u90: ['1900-01-01', addD(t, 90)], all: ['1900-01-01', '2999-12-31'],
    thisM: [mkd(y, mo, 1), mkd(y, mo + 1, 0)], nextM: [mkd(y, mo + 1, 1), mkd(y, mo + 2, 0)], thisQ: [mkd(y, q0, 1), mkd(y, q0 + 3, 0)], nextQ: [mkd(y, q0 + 3, 1), mkd(y, q0 + 6, 0)],
    thisY: [mkd(y, 0, 1), mkd(y, 12, 0)], nextY: [mkd(y + 1, 0, 1), mkd(y + 1, 12, 0)] })[p];
}
const PRESETS = [['u90', 'Quá hạn + 90 ngày tới'], ['over', 'Đã quá hạn'], ['u30', 'Quá hạn + 30 ngày tới'], ['thisM', 'Tháng này'], ['nextM', 'Tháng tới'], ['thisQ', 'Quý này'], ['nextQ', 'Quý tới'], ['thisY', 'Năm nay'], ['nextY', 'Năm tới'], ['all', 'Tất cả'], ['custom', 'Tuỳ chọn…']];
async function repGrades(me, box) {
  const [groups, gr] = await Promise.all([GET(`/api/payroll/groups?year=${me.now.year}&month=${me.now.month}`).then(r => r.groups), GET('/api/reports/grades')]);
  const today = `${me.now.year}-${String(me.now.month).padStart(2, '0')}-${String(me.now.day).padStart(2, '0')}`;
  let [from, to] = GF.preset === 'custom' ? [GF.from || '1900-01-01', GF.to || '2999-12-31'] : presetRange(GF.preset, today);
  const qs = `groupId=${GF.gid}&from=${from}&to=${to}&q=${encodeURIComponent(GF.q)}`;
  const d = await GET('/api/reports/grade-due?' + qs);
  box.innerHTML = `<div class="card"><h2 style="margin-top:0">Bậc lương bảo hiểm — theo dõi đến hạn tăng bậc</h2>
    <div class="row" style="gap:18px"><div><b style="font-size:22px;color:#b91c1c">${d.overdueAll}</b><div class="muted small">đã quá hạn tăng bậc</div></div><div><b style="font-size:22px;color:#b45309">${d.soon}</b><div class="muted small">đến hạn trong 30 ngày</div></div>
      <div><b style="font-size:22px">${d.total - d.noGrade}</b><div class="muted small">đã gán bậc / ${d.total} người</div></div><div><b style="font-size:22px;color:#6b7280">${d.noGrade}</b><div class="muted small">chưa gán bậc (gán ở tab Hệ số)</div></div></div></div>
    <div class="card"><div class="row"><h3 class="grow" style="margin:0">Danh sách đến hạn</h3><select id="gg"><option value="">Tất cả bảng lương</option>${groups.map(g => `<option value="${g.id}" ${g.id === GF.gid ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
      <select id="gp">${PRESETS.map(([k, v]) => `<option value="${k}" ${k === GF.preset ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${GF.preset === 'custom' ? `<input type="date" id="gf" value="${from === '1900-01-01' ? '' : from}"><input type="date" id="gt" value="${to === '2999-12-31' ? '' : to}">` : ''}<input id="gq" placeholder="Tìm tên…" value="${esc(GF.q)}" style="width:130px"><button class="btn sec" id="gxl">Xuất Excel</button></div>
      <div class="muted small" style="margin:6px 0">Đến hạn = ngày hưởng bậc hiện tại + số tháng giữ bậc của bậc đó. Đổi hệ số khác nhưng giữ nguyên bậc thì không tính lại ngày hưởng bậc. Khoảng đang xem: ${from === '1900-01-01' ? 'từ trước tới' : from} → ${to === '2999-12-31' ? 'không giới hạn' : to}.</div>
      <div class="scroll"><table class="rtb"><thead><tr><th>Họ tên</th><th>Bộ phận</th><th>Chức danh</th><th>Bậc hiện tại</th><th>Hưởng bậc từ</th><th class="n">Giữ (tháng)</th><th>Đến hạn</th><th class="n">Còn</th><th class="n">Hệ số BH nay</th><th>Bậc kế tiếp</th><th class="n">Hệ số kế tiếp</th></tr></thead><tbody>
      ${d.list.map(x => `<tr style="${x.overdue ? 'background:#fef2f2' : x.days_left <= 30 ? 'background:#fffbeb' : ''}"><td><b>${esc(x.name)}</b></td><td class="muted">${esc(x.dept || '')}</td><td class="small">${esc(x.position || '')}</td><td>${esc(x.label)}</td><td>${esc(x.since)}</td><td class="n">${x.months}</td><td><b>${esc(x.due)}</b></td>
        <td class="n">${x.overdue ? `<b style="color:#b91c1c">quá ${-x.days_left} ngày</b>` : `${x.days_left} ngày`}</td><td class="n">${x.cur_coef}</td><td>${x.next_grade ? 'Bậc ' + x.next_grade : '<span class="muted">bậc cuối</span>'}</td><td class="n">${x.next_coef ?? ''}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Không có ai đến hạn trong khoảng này.</td></tr>'}</tbody></table></div></div>
    <div class="card"><div class="row"><h3 class="grow" style="margin:0">Thang bậc lương bảo hiểm</h3>${gr.canEdit ? '<button class="btn sm" id="gadd">+ Thêm bậc</button>' : ''}</div>
      <div class="muted small" style="margin:6px 0">Mỗi bậc có hệ số và số tháng giữ bậc trước khi được xét lên bậc kế (để trống ở bậc cuối). Có thể tạo nhiều thang (vd "Chung", "Kỹ thuật"). Gán bậc cho từng người ở tab <b>Hệ số</b> (nút Cập nhật / Sửa hệ số) — chọn bậc sẽ tự lấy hệ số của bậc.
      Hệ số do bậc quyết định: ${gr.canEdit ? `<select id="gcode"><option value="">(tự chọn loại hệ số BH đầu tiên)</option>${gr.coefTypes.map(t => `<option value="${esc(t.code)}" ${t.code === gr.coefCode ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : `<b>${esc(gr.coefName || '—')}</b>`}</div>
      <div class="scroll"><table><thead><tr><th>Thang</th><th class="n">Bậc</th><th class="n">Hệ số</th><th class="n">Giữ bậc (tháng)</th><th>Ghi chú</th>${gr.canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${gr.grades.map(g => `<tr><td>${esc(g.scale)}</td><td class="n"><b>${g.grade}</b></td><td class="n">${Number(g.coefficient)}</td><td class="n">${g.months_to_next ?? '<span class="muted">bậc cuối</span>'}</td><td class="small">${esc(g.note || '')}</td>${gr.canEdit ? `<td style="white-space:nowrap"><button class="btn sec sm" data-ge="${esc(g.scale)}|${g.grade}">Sửa</button> <button class="btn red sm" data-gd="${esc(g.scale)}|${g.grade}">Xoá</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="6" class="muted">Chưa có thang bậc nào${gr.canEdit ? ' — bấm "+ Thêm bậc" để tạo' : ''}.</td></tr>`}</tbody></table></div></div>`;
  const again = () => repGrades(me, box).catch(x => safeErr(box, x));
  $('#gg').onchange = e => { GF.gid = e.target.value; again(); }; $('#gp').onchange = e => { GF.preset = e.target.value; again(); };
  $('#gq').onchange = e => { GF.q = e.target.value; again(); };
  if ($('#gf')) { $('#gf').onchange = e => { GF.from = e.target.value; again(); }; $('#gt').onchange = e => { GF.to = e.target.value; again(); }; }
  $('#gxl').onclick = guard(() => download('/api/reports/grade-due/export?' + qs, 'den-han-tang-bac.xlsx'));
  const editGrade = guard(async (g) => {
    const r = await ask(g ? `Sửa ${g.scale} · Bậc ${g.grade}` : 'Thêm bậc lương', [{ label: 'Thang lương (vd: Chung, Kỹ thuật)', value: g?.scale ?? 'Chung' }, { label: 'Bậc (số)', type: 'number', value: g?.grade ?? '' }, { label: 'Hệ số', type: 'number', step: '0.0001', value: g ? Number(g.coefficient) : '' },
      { label: 'Số tháng giữ bậc (trống nếu bậc cuối)', type: 'number', value: g?.months_to_next ?? '' }, { label: 'Ghi chú', value: g?.note ?? '' }]); if (!r) return;
    await PUT('/api/reports/grades', { scale: r[0], grade: r[1], coefficient: r[2], monthsToNext: r[3], note: r[4] }); toast('Đã lưu'); again();
  });
  if ($('#gadd')) $('#gadd').onclick = () => editGrade(null);
  box.querySelectorAll('[data-ge]').forEach(b => b.onclick = () => editGrade(gr.grades.find(g => `${g.scale}|${g.grade}` === b.dataset.ge)));
  box.querySelectorAll('[data-gd]').forEach(b => b.onclick = guard(async () => { if (!await confirmBox('Xoá bậc này khỏi thang? (Bậc đã gán cho nhân viên vẫn giữ trong lịch sử nhưng không còn tính ngày đến hạn)')) return; const [s, g] = b.dataset.gd.split('|'); await DEL(`/api/reports/grades/${encodeURIComponent(s)}/${g}`); again(); }));
  if ($('#gcode')) $('#gcode').onchange = guard(async e => { await PUT('/api/reports/grade-coef', { code: e.target.value }); toast('Đã lưu'); again(); });
}

// ---------- Lương của tôi (mọi nhân sự, chỉ của chính mình) ----------
PAGES.mypay = async (me, root) => {
  const d = await GET('/api/reports/my');
  if (!d.years.length) { root.innerHTML = `<div class="card"><h2>Lương của tôi — ${esc(d.employee.name)}</h2><div class="info">Chưa có tháng nào được Giám đốc khoá bảng lương. ${esc(d.note)}</div></div>`; return; }
  let sel = d.years[d.years.length - 1].year, metric = 'net';
  const M = { net: 'Tổng thực lĩnh', salary: 'Lương', bonus: 'Thưởng', salbonus: 'Lương + Thưởng', meal_amount: 'Tiền ăn ca', meal_days: 'Số ngày ăn ca', allowance: 'Phụ cấp', deduction: 'Khấu trừ', insurance_salary: 'Lương BHXH', work_days: 'Ngày công', work_std: 'Công tiêu chuẩn', work_diff: 'Công thực tế − tiêu chuẩn', work_ot: 'Công làm thêm (LT)' };
  const dfc = v => `<span style="color:${v > 0.004 ? '#1d4ed8' : v < -0.004 ? '#b91c1c' : '#15803d'}"><b>${v > 0.004 ? '+' : ''}${String(Math.round(v * 100) / 100).replace('.', ',')}</b></span>`;
  const yrs = d.years.map(y => y.year);
  function paint() {
    const Y = d.years.find(y => y.year === sel), prev = d.years.find(y => y.year === sel - 1);
    root.innerHTML = `<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Lương của tôi — ${esc(d.employee.name)}</h2><div class="muted small">${esc(d.note)} Chỉ bạn nhìn thấy số liệu này.</div></div>
      <select id="my">${yrs.map(y => `<option ${y === sel ? 'selected' : ''}>${y}</option>`).join('')}</select><select id="mm">${Object.entries(M).map(([k, v]) => `<option value="${k}" ${k === metric ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn sec" id="xy">Xuất Excel cả năm ${sel}</button></div></div>
      <div class="card"><h3 style="margin-top:0">${esc(M[metric])} từng tháng — năm ${sel}${prev ? ` so với ${sel - 1}` : ''}</h3>
      ${barSvg(MLAB, [...(prev ? [{ name: String(sel - 1), color: YCOL[0], values: prev.months.map(m => m ? m[metric] : null) }] : []), { name: String(sel), color: YCOL[2], values: Y.months.map(m => m ? m[metric] : null) }], { m: metric })}</div>
      <div class="card"><h3 style="margin-top:0">So sánh giữa các năm (${esc(M[metric])} cả năm)</h3>
      ${barSvg(yrs.map(String), [{ name: M[metric], color: YCOL[2], values: d.years.map(y => y.total[metric]) }], { h: 220, m: metric })}
      <h3 style="margin:10px 0 4px">Đường theo tháng của các năm</h3>${lineSvg(MLAB, d.years.map((y, k) => ({ name: String(y.year), color: ycol(d.years.length, k), values: y.months.map(m => m ? m[metric] : null) })), { m: metric })}</div>
      <div class="card"><h3 style="margin-top:0">Chi tiết năm ${sel}</h3><div class="scroll"><table><thead><tr><th>Tháng</th><th class="n">Ngày công</th><th class="n" title="Công tiêu chuẩn theo hợp đồng của tháng">Chuẩn</th><th class="n" title="Công thực tế trừ công tiêu chuẩn: + là làm vượt, − là chưa đủ">+ / −</th><th class="n" title="Công làm thêm ghi bằng ký hiệu LT">Làm thêm</th><th class="n">Lương</th><th class="n">Thưởng</th><th class="n">Ăn ca</th><th class="n">Phụ cấp</th><th class="n">Khấu trừ</th><th class="n">Tổng thực lĩnh</th><th></th></tr></thead><tbody>
      ${Y.months.map((m, i) => m ? `<tr class="clk" data-m="${i + 1}" style="cursor:pointer"><td><b>Tháng ${i + 1}</b></td><td class="n">${m.work_days}</td><td class="n">${m.std_days}</td><td class="n">${dfc(m.diff_days)}</td><td class="n">${m.ot_days || '·'}</td><td class="n">${money(m.salary)}</td><td class="n">${money(m.bonus)}</td><td class="n">${money(m.meal_amount)}</td><td class="n">${money(m.allowance)}</td><td class="n">${money(m.deduction)}</td><td class="n"><b>${money(m.net)}</b></td><td><button class="btn sec sm" data-xm="${i + 1}">Xuất Excel</button></td></tr>` : '').join('')}
      <tr style="font-weight:700;background:#f3f4f6"><td>Cả năm</td><td class="n">${Y.total.work_days}</td><td class="n">${Y.total.std_days}</td><td class="n">${dfc(Y.total.diff_days)}</td><td class="n">${Y.total.ot_days || '·'}</td><td class="n">${money(Y.total.salary)}</td><td class="n">${money(Y.total.bonus)}</td><td class="n">${money(Y.total.meal_amount)}</td><td class="n">${money(Y.total.allowance)}</td><td class="n">${money(Y.total.deduction)}</td><td class="n">${money(Y.total.net)} ${prev ? pctTxt(pct(Y.total.net, prev.total.net)) : ''}</td><td></td></tr></tbody></table></div>
      <div class="muted small" style="margin-top:6px">Cột "Chuẩn" là công tiêu chuẩn theo hợp đồng của từng tháng; "+ / −" cho biết bạn làm vượt (+) hay chưa đủ (−) so với công tiêu chuẩn — công vượt phải được trả riêng bằng ký hiệu làm thêm (LT). Bấm vào một tháng để xem chi tiết; nút Xuất Excel từng tháng tải phiếu lương đủ hệ số và cách tính.${prev ? ` Mũi tên so với cả năm ${sel - 1} (nếu năm trước có ít tháng hơn thì chênh lệch chưa phản ánh đủ).` : ''}</div></div>`;
    $('#my').onchange = e => { sel = +e.target.value; paint(); }; $('#mm').onchange = e => { metric = e.target.value; paint(); };
    $('#xy').onclick = guard(() => download(`/api/reports/my/export/file?year=${sel}`, `luong-ca-nhan-${sel}.xlsx`));
    root.querySelectorAll('[data-xm]').forEach(b => b.onclick = guard(e => { e.stopPropagation(); return download(`/api/reports/my/export/file?year=${sel}&month=${b.dataset.xm}`, `phieu-luong-${sel}-${String(b.dataset.xm).padStart(2, '0')}.xlsx`); }));
    root.querySelectorAll('tr.clk').forEach(tr => tr.onclick = guard(async () => {
      const r = await GET(`/api/reports/my/${sel}/${tr.dataset.m}`), l = r.line, x = r.detail, li = a => (a || []).map(i => `<tr><td>${esc(i.name || i.label || i.code || '')}</td><td class="n">${money(i.amount ?? i.value ?? 0)}</td></tr>`).join('');
      modal(`<h2>Lương tháng ${r.month}/${r.year}<span class="x">✕</span></h2><table><tbody>
        <tr><td>Ngày công</td><td class="n">${l.work_days}</td></tr><tr><td>Lương đóng BHXH</td><td class="n">${money(l.insurance_salary)}</td></tr><tr><td>Phụ cấp</td><td class="n">${money(l.allowance)}</td></tr>
        <tr><td>Khấu trừ</td><td class="n">−${money(l.deduction)}</td></tr><tr style="font-weight:700"><td>Lương thực lĩnh</td><td class="n">${money(l.salary)}</td></tr>
        <tr style="font-weight:700"><td>Thưởng thực nhận</td><td class="n">${money(l.bonus)}</td></tr><tr><td>Ăn ca (${l.meal_days} ngày)</td><td class="n">${money(l.meal_amount)}</td></tr>
        <tr style="font-weight:700;background:#f3f4f6"><td>Tổng thực lĩnh</td><td class="n">${money(l.net)}</td></tr></tbody></table>
        ${(x.extras || []).length ? `<h3>Khoản thưởng / trừ thêm trong tháng</h3><table><tbody>${x.extras.map(i => `<tr><td>${esc(i.label || '')}</td><td class="n">${i.kind === 'bonus' ? '+' : '−'}${money(i.amount)}</td></tr>`).join('')}</tbody></table>` : ''}${(x.deductions || []).length ? `<h3>Khoản trừ định kỳ</h3><table><tbody>${li(x.deductions)}</tbody></table>` : ''}
        <div class="row" style="margin-top:10px"><button class="btn" id="xm">Xuất Excel phiếu lương tháng này</button></div>`);
      $('#xm').onclick = guard(() => download(`/api/reports/my/export/file?year=${sel}&month=${tr.dataset.m}`, `phieu-luong-${sel}-${String(tr.dataset.m).padStart(2, '0')}.xlsx`));
    }));
  }
  paint();
};
