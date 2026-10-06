// Quản trị › Công chuẩn: quy tắc nghỉ hằng tuần / công tối thiểu / tăng ca + ngày lễ trong năm.
const WD_WEEKLY = { sun: 'Nghỉ Chủ nhật', sat_sun: 'Nghỉ Thứ 7 + Chủ nhật' };
const WD_MIN = { equal: 'Bằng công chuẩn', group_min: 'Kíp thấp nhất của công nhân trực ca (theo kíp ở Nhân sự)', fixed: 'Số cố định', minus: 'Công chuẩn − N ngày', pct: 'N% công chuẩn' };
const WD_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
let WD_YEAR = null;
const wdMinText = r => (r.min_mode === 'group_min' ? 'Kíp thấp nhất của từng nhà máy' : r.min_mode === 'equal' ? 'Bằng công chuẩn' : r.min_mode === 'fixed' ? `Cố định ${Number(r.min_value)} ngày` : r.min_mode === 'minus' ? `Công chuẩn − ${Number(r.min_value)}` : `${Number(r.min_value)}% công chuẩn`) + (r.rate_basis === 'min' ? ' · đơn giá ngày ÷ công tối thiểu' : '');
const wdScope = r => [r.department_name && `Phòng ${r.department_name}`, r.group_name && `Bảng lương ${r.group_name}`, r.employee_type && (r.employee_type === 'manager' ? 'Quản lý' : 'Công nhân')].filter(Boolean).join(' · ') || 'Toàn công ty';

async function admWd(me, box, reload) {
  const now = new Date(); WD_YEAR = WD_YEAR || now.getFullYear();
  const [o, rr, hh, pv] = await Promise.all([GET('/api/org'), GET('/api/workdays/rules'), GET('/api/workdays/holidays?year=' + WD_YEAR), GET('/api/workdays/preview?year=' + WD_YEAR)]);
  const years = []; for (let y = Math.min(me.yearMin || WD_YEAR - 2, WD_YEAR - 1); y <= Math.max(me.yearMax || WD_YEAR + 2, WD_YEAR + 1); y++) years.push(y);
  const fmt = d => d.slice(8) + '/' + d.slice(5, 7);
  box.innerHTML = `
  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Quy tắc công chuẩn, công tối thiểu, tăng ca</h2><button class="btn sm" id="wr_add">+ Thêm quy tắc</button></div>
    <div class="muted small" style="margin:6px 0">
      <b>Công chuẩn</b> của tháng = số ngày trong tháng − ngày nghỉ hằng tuần − ngày lễ (ngày lễ trùng ngày nghỉ hằng tuần chỉ tính <b>một</b> ngày nghỉ; ngày nghỉ bù được nhập như một ngày lễ riêng ở bảng bên dưới).<br>
      Không có quy tắc nào khớp = nghỉ Chủ nhật, công tối thiểu bằng công chuẩn. Mỗi người áp dụng quy tắc <b>cụ thể nhất</b> khớp với mình: Phòng &gt; Bảng lương &gt; Loại nhân sự &gt; Toàn công ty. Lịch nghỉ riêng của từng người (tab Nhân sự) ưu tiên hơn lịch của quy tắc.<br>
      <b>Cách tính:</b> đơn giá ngày = hệ số × đơn giá ÷ công chuẩn. Công thực tế ≥ công chuẩn → hưởng đủ (vượt chuẩn = tăng ca, nhân hệ số tăng ca); từ công tối thiểu đến công chuẩn → vẫn hưởng đủ; dưới công tối thiểu → đơn giá ngày × công thực tế. Áp dụng cho cả lương và thưởng.</div>
    <table><thead><tr><th>Phạm vi</th><th>Nghỉ hằng tuần</th><th>Công tối thiểu</th><th class="n">Hệ số tăng ca lương</th><th class="n">Hệ số tăng ca thưởng</th><th>Ghi chú</th><th></th></tr></thead><tbody>${rr.rules.map(r => `<tr><td><b>${esc(wdScope(r))}</b></td><td>${WD_WEEKLY[r.weekly_off]}</td><td>${esc(wdMinText(r))}</td><td class="n">×${Number(r.ot_salary)}</td><td class="n">×${Number(r.ot_bonus)}</td><td class="small">${esc(r.note || '')}</td>
      <td><button class="btn sec sm" data-re="${r.id}">Sửa</button> <button class="btn red sm" data-rd="${r.id}">Xoá</button></td></tr>`).join('')}</tbody></table>
    <div class="muted small" style="margin-top:6px">Hệ số tăng ca: 1 = công vượt chuẩn được trả đúng đơn giá ngày; 1,5 = trả thêm 50%… Mặc định 1.</div></div>

  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Ngày lễ / nghỉ bù</h2><label>Năm</label><select id="wh_y">${years.map(y => `<option ${y === WD_YEAR ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
    <div class="row" style="margin:8px 0"><label>Từ ngày</label><input type="date" id="wh_from"><label>Đến ngày</label><input type="date" id="wh_to"><label>Tên</label><input id="wh_name" placeholder="vd: Tết Âm lịch, Nghỉ bù 30/4" style="width:200px"><label title="Đi làm vào ngày này được hưởng bao nhiêu % so với 1 ngày công tiêu chuẩn (đã gồm 100% lương ngày thường). Vd 300 hoặc 400.">Hưởng khi đi làm (%)</label><input id="wh_pct" type="number" value="100" style="width:80px"><button class="btn" id="wh_add">Thêm</button>
      <button class="btn sec sm" id="wh_tpl" title="1/1, 30/4, 1/5, 2/9">+ Ngày lễ cố định ${WD_YEAR}</button><button class="btn sec sm" id="wh_copy">Sao chép từ năm ${WD_YEAR - 1}</button></div>
    <div class="muted small">Chỉ nhập ngày nghỉ thật sự được hưởng (kể cả ngày nghỉ bù). Tết Âm lịch, Giỗ Tổ… đổi theo năm nên cần tự nhập. Để trống "Đến ngày" nếu chỉ một ngày. <b>Hưởng khi đi làm (%)</b>: người đi làm vào ngày này được tính ngày đó bằng bấy nhiêu % ngày công tiêu chuẩn (100 = như ngày thường; 400 = gấp 4). Ngày trong khoảng cần % khác nhau (vd 1/9 hưởng 400%, 2–4/9 hưởng 100%): nhập cả khoảng với 100% rồi bấm <b>Sửa</b> ở ngày đặc biệt. Nếu làm vào ca đêm hoặc sửa chữa, phần % tăng của ký hiệu cũng được nhân theo (vd 400% × 130%).</div>
    ${hh.holidays.length ? `<div class="scroll" style="max-height:260px;margin-top:8px"><table><thead><tr><th>Ngày</th><th>Thứ</th><th>Tên</th><th class="n">Hưởng khi đi làm</th><th></th></tr></thead><tbody>${hh.holidays.map(h => `<tr><td>${fmt(h.date)}/${WD_YEAR}</td><td>${WD_DOW[h.dow]}${h.dow === 0 ? ' <span class="muted small">(trùng Chủ nhật: chỉ tính 1 ngày nghỉ)</span>' : ''}</td><td>${esc(h.name)}</td><td class="n">${Number(h.pay_pct) === 100 ? '<span class="muted">100%</span>' : `<b>${Number(h.pay_pct)}%</b>`}</td><td><button class="btn sec sm" data-he="${h.id}">Sửa</button> <button class="btn red sm" data-hd="${h.id}">Xoá</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="muted" style="margin-top:8px">Năm này chưa nhập ngày lễ nào — công chuẩn mới chỉ trừ ngày nghỉ hằng tuần.</div>'}</div>

  <div class="card"><h2>Công chuẩn các tháng năm ${WD_YEAR} (kèm công tối thiểu)</h2><div class="scroll" style="max-height:none"><table><thead><tr><th>Quy tắc</th>${Array.from({ length: 12 }, (_, i) => `<th class="n">T${i + 1}</th>`).join('')}<th class="n">Cả năm</th></tr></thead><tbody>${pv.rules.map(r => `<tr><td class="small"><b>${esc(wdScope(r))}</b><br>${WD_WEEKLY[r.weekly_off]}</td>${r.months.map(m => `<td class="n" title="Nghỉ hằng tuần ${m.weekly} ngày, lễ ${m.holidays} ngày (trùng ${m.overlap})"><b>${Number(m.standard)}</b>${m.min !== m.standard ? `<div class="muted small">≥${Number(m.min)}</div>` : ''}</td>`).join('')}<td class="n"><b>${r.total}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="muted small" style="margin-top:6px">Số in đậm = công chuẩn; dòng nhỏ = công tối thiểu. Đổi quy tắc hoặc ngày lễ sẽ đánh dấu các bảng lương nháp "cần tính lại".</div></div>`;

  const sel = (list, v, blank) => [{ v: '', t: blank }, ...list.map(x => ({ v: x.id, t: x.name }))].map(x => x);
  const form = async (title, r = {}) => {
    const f = await ask(title, [
      { label: 'Bảng lương (để trống = mọi bảng)', type: 'select', options: sel(o.groups, '', '— Mọi bảng lương —'), value: r.group_id || '' },
      { label: 'Phòng (để trống = mọi phòng)', type: 'select', options: sel(o.departments, '', '— Mọi phòng —'), value: r.department_id || '' },
      { label: 'Loại nhân sự', type: 'select', options: [{ v: '', t: '— Cả hai —' }, { v: 'manager', t: 'Quản lý' }, { v: 'worker', t: 'Công nhân' }], value: r.employee_type || '' },
      { label: 'Nghỉ hằng tuần', type: 'select', options: Object.entries(WD_WEEKLY).map(([v, t]) => ({ v, t })), value: r.weekly_off || 'sun' },
      { label: 'Cách tính công tối thiểu', type: 'select', options: Object.entries(WD_MIN).map(([v, t]) => ({ v, t })), value: r.min_mode || 'equal' },
      { label: 'Giá trị N (số ngày cố định / số ngày trừ / % — bỏ qua nếu "Bằng công chuẩn")', type: 'number', step: '0.5', value: r.min_value ?? 0 },
      { label: 'Đơn giá ngày = hệ số × đơn giá ÷ …', type: 'select', options: [{ v: 'standard', t: 'Công tiêu chuẩn (khối quản lý)' }, { v: 'min', t: 'Công tối thiểu (công nhân trực ca kíp)' }], value: r.rate_basis || 'standard' },
      { label: 'Hệ số tăng ca — lương (công vượt chuẩn)', type: 'number', step: '0.1', value: r.ot_salary ?? 1 },
      { label: 'Hệ số tăng ca — thưởng', type: 'number', step: '0.1', value: r.ot_bonus ?? 1 },
      { label: 'Ghi chú', value: r.note || '' }]);
    return f && { groupId: f[0], departmentId: f[1], employeeType: f[2], weeklyOff: f[3], minMode: f[4], minValue: f[5], rateBasis: f[6], otSalary: f[7], otBonus: f[8], note: f[9] };
  };
  const mk = (b, fn) => b.onclick = guard(fn);
  $('#wr_add').onclick = guard(async () => { const b = await form('Thêm quy tắc công chuẩn'); if (b) { await POST('/api/workdays/rules', b); toast('Đã thêm'); reload(); } });
  box.querySelectorAll('[data-re]').forEach(b => mk(b, async () => { const r = rr.rules.find(x => x.id === b.dataset.re); const body = await form('Sửa quy tắc', r); if (body) { await PUT('/api/workdays/rules/' + r.id, body); toast('Đã lưu'); reload(); } }));
  box.querySelectorAll('[data-rd]').forEach(b => mk(b, async () => { if (await confirmBox('Xoá quy tắc này? Người thuộc phạm vi này sẽ áp dụng quy tắc rộng hơn.')) { await DEL('/api/workdays/rules/' + b.dataset.rd); reload(); } }));
  box.querySelectorAll('[data-hd]').forEach(b => mk(b, async () => { await DEL('/api/workdays/holidays/' + b.dataset.hd); reload(); }));
  box.querySelectorAll('[data-he]').forEach(b => mk(b, async () => { const h = hh.holidays.find(x => String(x.id) === b.dataset.he); const f = await ask(`Sửa ngày ${fmt(h.date)}/${WD_YEAR}`, [{ label: 'Ngày', type: 'date', value: h.date }, { label: 'Tên', value: h.name }, { label: 'Hưởng khi đi làm (%) — 100 = như ngày thường, 400 = gấp 4', type: 'number', step: '10', value: Number(h.pay_pct) }]); if (f) { await PATCH('/api/workdays/holidays/' + h.id, { date: f[0], name: f[1], payPct: f[2] }); toast('Đã lưu'); reload(); } }));
  $('#wh_y').onchange = () => { WD_YEAR = Number($('#wh_y').value); reload(); };
  $('#wh_add').onclick = guard(async () => { if (!$('#wh_from').value) throw new Error('Chọn ngày'); await POST('/api/workdays/holidays', { from: $('#wh_from').value, to: $('#wh_to').value || $('#wh_from').value, name: $('#wh_name').value, payPct: $('#wh_pct').value }); toast('Đã thêm'); reload(); });
  $('#wh_tpl').onclick = guard(async () => { const r = await POST('/api/workdays/holidays/template', { year: WD_YEAR }); toast(`Đã thêm ${r.added || 0} ngày lễ`); reload(); });
  $('#wh_copy').onclick = guard(async () => { const r = await POST('/api/workdays/holidays/copy', { from: WD_YEAR - 1, to: WD_YEAR }); toast(`Đã sao chép ${r.added || 0} ngày — nhớ chỉnh lại ngày Tết Âm lịch, Giỗ Tổ`); reload(); });
}
