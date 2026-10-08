window.PAGES = window.PAGES || {};
let ADM_TAB = 'org';
let PEOPLE_DIRTY = null; // Map các thay đổi Nhân sự chưa lưu (để cảnh báo khi rời tab)
PAGES.admin = async (me, root) => {
  const has = r => me.assignments.some(x => x.role === r), A = me.isAdmin;
  const tabs = [['org', 'Tổ chức & liên kết SSO', A], ['people', 'Nhân sự', A || has('people')], ['roles', 'Phân quyền', A], ['cfg', 'Cấu hình', A || has('hr') || has('cfg_att')], ['wd', 'Công chuẩn', A || has('hr') || has('cfg_att')], ['audit', 'Nhật ký', A]].filter(t => t[2]);
  if (!tabs.some(t => t[0] === ADM_TAB)) ADM_TAB = tabs[0][0];
  root.innerHTML = `<div class="sub">${tabs.map(t => `<button class="btn ${t[0] === ADM_TAB ? '' : 'sec'}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="adm"></div>`;
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { if (PEOPLE_DIRTY && PEOPLE_DIRTY.size && b.dataset.t !== ADM_TAB && !confirm(`Còn ${PEOPLE_DIRTY.size} người sửa chưa lưu. Rời tab và bỏ các thay đổi này?`)) return; if (b.dataset.t !== ADM_TAB) PEOPLE_DIRTY = null; ADM_TAB = b.dataset.t; PAGES.admin(me, root); });
  const box = $('#adm');
  try { await ({ org: admOrg, people: admPeople, roles: admRoles, cfg: admCfg, wd: admWd, audit: admAudit })[ADM_TAB](me, box, () => PAGES.admin(me, root)); }
  catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
const KIND = { plant: 'Nhà máy', office: 'Văn phòng' };
// Quỹ lương tự xếp (giống src/services/funds.js): bộ phận liên kết HĐQT / Ban kiểm soát → bảng lương văn phòng → nhà máy: có kíp / không kíp
const ADM_FUND_RULES = [['', 'Không tự xếp (chỉ nhận người / bộ phận được chọn)'], ['hdqt', 'Bộ phận HĐQT'], ['bks', 'Bộ phận Ban kiểm soát'], ['office', 'Bảng lương văn phòng (người còn lại)'], ['shift', 'Nhà máy: người có kíp (công nhân vận hành)'], ['plant', 'Nhà máy: người không có kíp (quản lý, hành chính)']];
function admFundTools(o) {
  const F = o.salaryFunds || [], name = id => F.find(f => f.id === id)?.name || '';
  const byRule = r => F.find(f => f.active && f.rule === r)?.name || 'chưa xếp quỹ';
  const kindOf = d => o.groups.find(g => g.id === o.sheets.find(s => s.id === d?.sheet_id)?.group_id)?.kind;
  const ruleOf = (d, kind, shift) => { const ids = d?.sso_ids || []; return ids.includes('role:HDQT') ? 'hdqt' : ids.includes('role:BKS') ? 'bks' : kind === 'office' ? 'office' : shift === undefined ? null : shift ? 'shift' : 'plant'; };
  // bộ phận chưa chọn quỹ: quỹ theo quy tắc (nhà máy tuỳ người có kíp hay không)
  const deptAuto = d => { const r = ruleOf(d, kindOf(d)); return r ? byRule(r) : `có kíp → ${byRule('shift')}; không kíp → ${byRule('plant')}`; };
  // người chưa chọn quỹ: quỹ của bộ phận tính lương → quy tắc
  const personAuto = (e, shift) => { const d = o.departments.find(x => x.id === e.pay_dept_id); return d?.fund_id ? `${name(d.fund_id)} (theo bộ phận)` : byRule(ruleOf(d, kindOf(d) || e.group_kind, !!shift)); };
  // danh sách chọn: quỹ đang dùng + quỹ đã ngừng nhưng đang được chọn
  const options = cur => F.filter(f => f.active || f.id === cur).map(f => `<option value="${f.id}" ${f.id === cur ? 'selected' : ''}>${esc(f.name)}${f.active ? '' : ' (ngừng)'}</option>`).join('');
  return { F, name, deptAuto, personAuto, options };
}

// ---------- Tổ chức ----------
// Cấu trúc: Bảng lương ▸ Bảng chấm công ▸ Bộ phận (mỗi bộ phận thuộc đúng 1 bảng chấm công; mỗi bảng chấm công thuộc đúng 1 bảng lương)
const signersToText = l => (l || []).map(x => `${x.title || ''} | ${x.name || ''}`).join('\n');
const textToSigners = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [a, ...b] = x.split('|'); return { title: (a || '').trim(), name: b.join('|').trim() }; });
// Hộp chọn nhiều mục (tick = thuộc về mục này)
function pickMany(title, hint, items, onSave) {
  const m = modal(`<h2>${esc(title)}<span class="x">✕</span></h2><div class="muted small">${hint}</div>
    <input id="fq" placeholder="Lọc…" style="width:100%;margin:8px 0"><div class="optlist" style="max-height:52vh">${items.map(i => `<label class="opt" data-n="${esc(i.label.toLowerCase())}"><input type="checkbox" value="${esc(i.id)}" ${i.checked ? 'checked' : ''}><span>${esc(i.label)}${i.note ? `<small>${esc(i.note)}</small>` : ''}</span></label>`).join('') || '<div class="muted">Chưa có mục nào.</div>'}</div>
    <div class="row" style="margin-top:10px"><button class="btn" id="ok">Lưu</button><button class="btn sec" id="no">Huỷ</button></div>`);
  m.querySelector('#fq').oninput = e => m.querySelectorAll('.opt').forEach(l => l.style.display = l.dataset.n.includes(e.target.value.toLowerCase()) ? '' : 'none');
  m.querySelector('#no').onclick = () => m.close();
  m.querySelector('#ok').onclick = guard(async () => { await onSave([...m.querySelectorAll('.opt input:checked')].map(i => i.value)); m.close(); });
}
async function admOrg(me, box, reload) {
  const o = await GET('/api/org');
  const st = await GET('/api/sso/status');
  const gname = Object.fromEntries(o.groups.map(g => [g.id, g.name])), sname = Object.fromEntries(o.sheets.map(s => [s.id, s.name]));
  const ssoName = Object.fromEntries(o.ssoDepartments.map(s => [s.id, s.name]));
  const yn = [{ v: 'true', t: 'Đang dùng' }, { v: 'false', t: 'Ngừng' }];
  const MEAL = [['auto', 'Kiểu 1 — Tự động theo ký hiệu công'], ['actual', 'Kiểu 2 — Bảng chấm ăn ca riêng'], ['auto_wait', 'Kiểu 1 + 3 — Tự động + bảng chấm ăn chờ ca']];
  const FT = admFundTools(o);
  const deptRow = d => `<tr><td>${esc(d.name)}${d.active ? '' : ' <span class="badge">ngừng</span>'}<div class="muted small">${esc(d.code)}</div></td><td>${d.sso_ids.map(i => `<span class="badge">${esc(ssoName[i] || i)}</span>`).join(' ') || '<span class="muted">chưa liên kết SSO</span>'}</td><td class="n">${d.employee_count}</td>
      <td><select data-mm="${d.id}" style="max-width:240px" title="Cách tính tiền ăn ca của bộ phận này">${MEAL.map(m => `<option value="${m[0]}" ${(d.meal_mode || 'auto') === m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}</select></td>
      <td class="small" style="max-width:220px">${d.fund_id ? `<b>${esc(FT.name(d.fund_id) || '?')}</b>` : `<span class="muted">Tự xếp: ${esc(FT.deptAuto(d))}</span>`}</td>
      <td class="n" style="white-space:nowrap"><button class="btn sec sm" data-map="${d.id}">Liên kết SSO</button> <button class="btn sec sm" data-ed="${d.id}">Sửa</button> <button class="btn red sm" data-dd="${d.id}">Xoá</button></td></tr>`;
  const deptTable = list => list.length ? `<table><thead><tr><th>Bộ phận</th><th>Phòng ban SSO đã liên kết</th><th class="n">Nhân sự</th><th>Kiểu tính ăn ca</th><th title="Quỹ lương để tổng hợp lương theo khối (cài danh sách quỹ ở Cấu hình). Người được chọn quỹ riêng ở tab Nhân sự thì theo quỹ riêng đó">Quỹ lương</th><th></th></tr></thead><tbody>${list.map(deptRow).join('')}</tbody></table>` : '<div class="muted small">Chưa có bộ phận nào.</div>';
  const sheetBlock = s => `<div style="margin:10px 12px 12px"><div class="row" style="margin-bottom:4px"><b class="grow">Bảng chấm công: ${esc(s.name)}</b>${s.active ? '' : '<span class="badge">ngừng</span>'}
      <button class="btn sec sm" data-sd="${s.id}">Chọn bộ phận</button><button class="btn sec sm" data-es="${s.id}">Sửa</button><button class="btn red sm" data-ds="${s.id}">Xoá</button></div>${deptTable(o.departments.filter(d => d.sheet_id === s.id))}</div>`;
  const noGroupSheets = o.sheets.filter(s => !s.group_id), noSheetDepts = o.departments.filter(d => !d.sheet_id);
  // Bảng lương khoán: không có bảng chấm công, gồm những người chọn "Lương khoán" ở tab Nhân sự
  const fixedBlock = g => { const mem = o.fixedPeople.filter(e => e.fixed_group_id === g.id); return `<div class="deptgrp" style="border-color:#7c3aed"><h3 class="row" style="margin:0;background:#f5f3ff"><span class="grow">Bảng lương khoán: ${esc(g.name)} <span class="badge">Lương khoán</span>${g.active ? '' : ' <span class="badge">ngừng</span>'}</span>
      <button class="btn sec sm" data-gm="${g.id}">Chọn người lương khoán</button><button class="btn sec sm" data-eg="${g.id}">Sửa</button><button class="btn red sm" data-dg="${g.id}">Xoá</button></h3>
    <div class="small" style="margin:10px 12px">Khấu trừ thuế vãng lai khi số tiền chi từ <b>${money(g.tax_threshold)} đ</b> trở lên (tỷ lệ của từng người cài ở tab Nhân sự).<br>${mem.length ? `<b>${mem.length} người:</b> ${mem.map(e => esc(e.full_name) + (e.payroll_active ? '' : ' <span class="muted">(không tính lương)</span>')).join(', ')}` : '<span class="muted">Chưa có ai — chọn "Lương khoán" cho từng người ở tab Nhân sự, hoặc bấm "Chọn người lương khoán".</span>'}
    ${o.sheets.some(s => s.group_id === g.id) ? '<div class="warnbox">Bảng này đang gắn bảng chấm công (từ khi còn là bảng lương theo hệ số). Bảng lương khoán không dùng chấm công: hãy chuyển các bảng chấm công sang bảng lương khác.</div>' : ''}</div></div>`; };
  box.innerHTML = `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Đồng bộ danh bạ SSO</h2><button class="btn" id="sync">Đồng bộ từ SSO</button></div>
    <div class="muted small">Lần cuối: ${dt(st.last_sync) || 'chưa'} · ${st.active_users} nhân sự · ${st.sso_departments} phòng ban/đơn vị SSO</div></div>
  ${o.groups.length ? '' : `<div class="card"><div class="info">Chưa có cấu hình tổ chức. Bạn có thể tự tạo (nút bên dưới) hoặc nạp sẵn cơ cấu SBM mẫu rồi chỉnh.</div><button class="btn warn" id="seed">Nạp cơ cấu SBM mẫu</button></div>`}
  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Cấu trúc bảng lương ▸ bảng chấm công ▸ bộ phận</h2>
      <button class="btn sm" id="addG">+ Bảng lương</button><button class="btn sm" id="addS">+ Bảng chấm công</button><button class="btn sm" id="addD">+ Bộ phận</button><button class="btn sm warn" id="impSso">Tạo bộ phận từ phòng ban SSO</button></div>
    <div class="muted small" style="margin-bottom:10px">Một <b>bảng lương</b> gồm nhiều <b>bảng chấm công</b>; một bảng chấm công gồm nhiều <b>bộ phận</b>. Mỗi bộ phận chỉ thuộc 1 bảng chấm công, mỗi bảng chấm công chỉ thuộc 1 bảng lương. Chấm công có thể tách theo phòng nhưng bảng lương gom cả khối. Nhân sự tự rơi vào bộ phận theo phòng ban SSO đã liên kết.</div>
    ${o.groups.map(g => g.pay_type === 'fixed' ? fixedBlock(g) : `<div class="deptgrp"><h3 class="row" style="margin:0"><span class="grow">Bảng lương: ${esc(g.name)} <span class="badge">${KIND[g.kind]}</span>${g.active ? '' : ' <span class="badge">ngừng</span>'}</span>
        <button class="btn sec sm" data-gs="${g.id}">Chọn bảng chấm công</button><button class="btn sec sm" data-eg="${g.id}">Sửa</button><button class="btn red sm" data-dg="${g.id}">Xoá</button></h3>
      ${o.sheets.filter(s => s.group_id === g.id).map(sheetBlock).join('') || '<div class="muted small" style="margin:10px 12px">Chưa có bảng chấm công — bấm "Chọn bảng chấm công".</div>'}</div>`).join('')}
    ${o.fixedPeople.some(e => !e.fixed_group_id) ? `<div class="deptgrp" style="border-color:#f59e0b"><h3 style="background:#fef3c7">Người lương khoán chưa thuộc bảng lương khoán nào</h3><div class="small" style="margin:10px 12px">${o.fixedPeople.filter(e => !e.fixed_group_id).map(e => esc(e.full_name)).join(', ')}<div class="muted">Những người này không được tính lương ở đâu cả cho tới khi được chọn vào một bảng lương khoán.</div></div></div>` : ''}
    ${noGroupSheets.length ? `<div class="deptgrp" style="border-color:#f59e0b"><h3 style="background:#fef3c7">Bảng chấm công chưa thuộc bảng lương nào</h3>${noGroupSheets.map(sheetBlock).join('')}</div>` : ''}
    ${noSheetDepts.length ? `<div class="deptgrp" style="border-color:#f59e0b"><h3 style="background:#fef3c7">Bộ phận chưa thuộc bảng chấm công nào</h3><div style="margin:10px 12px">${deptTable(noSheetDepts)}</div></div>` : ''}</div>`;
  $('#sync').onclick = guard(async () => { const r = await POST('/api/sso/sync'); toast(`Đã đồng bộ ${r.users} người, ${r.departments} phòng ban/đơn vị`); reload(); });
  if ($('#seed')) $('#seed').onclick = guard(async () => { await POST('/api/org/seed-sbm'); toast('Đã nạp cơ cấu mẫu'); reload(); });
  const kinds = [{ v: 'plant', t: 'Nhà máy' }, { v: 'office', t: 'Văn phòng' }];
  const sg = 'Người ký (mỗi dòng: Chức danh | Họ tên) — để trống = mặc định';
  const payTypes = [{ v: 'coef', t: 'Theo hệ số (chấm công, hệ số lương / thưởng)' }, { v: 'fixed', t: 'Lương khoán / thù lao (số tiền cố định, trừ thuế vãng lai)' }];
  const formG = async g => { const r = await ask(g ? 'Sửa bảng lương' : 'Thêm bảng lương', [{ label: 'Mã', value: g?.code }, { label: 'Tên bảng lương', value: g?.name }, { label: 'Loại', type: 'select', options: kinds, value: g?.kind || 'plant' }, { label: 'Loại tính lương', type: 'select', options: payTypes, value: g?.pay_type || 'coef' }, { label: 'Bảng lương khoán: chỉ khấu trừ thuế vãng lai khi số tiền chi từ (đ) — mặc định 2.000.000 theo Thông tư 111/2013/TT-BTC; nhập 0 = luôn khấu trừ', type: 'number', value: Number(g?.tax_threshold ?? 2000000) }, { label: 'Thứ tự', type: 'number', value: g?.sort_order ?? 0 }, { label: 'Trạng thái', type: 'select', options: yn, value: String(g?.active ?? true) }, { label: sg + ' — in trên bảng lương/thưởng/ăn ca/hệ số', type: 'textarea', value: signersToText(g?.signers) }]); if (!r) return; const b = { code: r[0], name: r[1], kind: r[2], pay_type: r[3], tax_threshold: r[4] === '' ? 2000000 : r[4], sort_order: r[5], active: r[6], signers: textToSigners(r[7]) }; g ? await PATCH('/api/org/groups/' + g.id, b) : await POST('/api/org/groups', b); reload(); };
  const formS = async s => { const r = await ask(s ? 'Sửa bảng chấm công' : 'Thêm bảng chấm công', [{ label: 'Mã', value: s?.code }, { label: 'Tên bảng chấm công', value: s?.name }, { label: 'Thuộc bảng lương', type: 'select', options: o.groups.filter(g => g.pay_type !== 'fixed').map(g => ({ v: g.id, t: g.name })), value: s?.group_id }, { label: 'Tiêu đề in (dòng thứ 2 góc trái; để trống = tên bảng)', value: s?.print_title || '' }, { label: 'Hiện cột xếp loại AN TOÀN (A/B) cho cả bảng — mặc định chỉ hiện cho người có phụ cấp an toàn', type: 'select', options: [{ v: 'false', t: 'Không' }, { v: 'true', t: 'Có' }], value: String(s?.use_safety ?? false) }, { label: 'Chấm xếp loại LAO ĐỘNG (A–E, nhân vào lương & thưởng)', type: 'select', options: [{ v: 'true', t: 'Có' }, { v: 'false', t: 'Không' }], value: String(s?.use_labor ?? true) }, { label: 'Trạng thái', type: 'select', options: yn, value: String(s?.active ?? true) }, { label: sg + ' — in trên bảng chấm công. Để trống tên = tự điền (Giám đốc / trưởng phòng, phó phòng / người chấm công)', type: 'textarea', value: signersToText(s?.signers) }]); if (!r) return; const b = { code: r[0], name: r[1], group_id: r[2], print_title: r[3], use_safety: r[4], use_labor: r[5], active: r[6], signers: textToSigners(r[7]) }; s ? await PATCH('/api/org/sheets/' + s.id, b) : await POST('/api/org/sheets', b); reload(); };
  // Bộ phận: chọn bảng lương trước -> danh sách bảng chấm công lọc theo bảng lương đó
  const formD = d => {
    const curSheet = o.sheets.find(x => x.id === d?.sheet_id), curGroup = curSheet?.group_id || '';
    const m = modal(`<h2>${d ? 'Sửa bộ phận' : 'Thêm bộ phận'}<span class="x">✕</span></h2>
      <div class="field"><label>Mã</label><input id="d_code" value="${esc(d?.code || '')}"></div><div class="field"><label>Tên bộ phận</label><input id="d_name" value="${esc(d?.name || '')}"></div>
      <div class="field"><label>Thuộc bảng lương</label><select id="d_g"><option value="">(chưa gán)</option>${o.groups.filter(g => g.pay_type !== 'fixed').map(g => `<option value="${g.id}" ${g.id === curGroup ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Thuộc bảng chấm công (thuộc bảng lương đã chọn)</label><select id="d_s"></select></div>
      <div class="field"><label>Kiểu tính ăn ca</label><select id="d_m">${MEAL.map(m => `<option value="${m[0]}" ${(d?.meal_mode || 'auto') === m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Quỹ lương (tổng hợp lương theo khối) — người được chọn quỹ riêng ở tab Nhân sự thì theo quỹ riêng</label><select id="d_f"><option value="">Tự xếp theo quy tắc${d ? ` (hiện: ${esc(FT.deptAuto(d))})` : ''}</option>${FT.options(d?.fund_id || '')}</select></div>
      <div class="field"><label>Thứ tự</label><input id="d_o" type="number" value="${d?.sort_order ?? 100}"></div>
      <div class="field"><label>Trạng thái</label><select id="d_a">${yn.map(x => `<option value="${x.v}" ${String(d?.active ?? true) === x.v ? 'selected' : ''}>${x.t}</option>`).join('')}</select></div>
      <div class="row"><button class="btn" id="ok">Lưu</button><button class="btn sec" id="no">Huỷ</button></div>`);
    const fill = () => { const g = m.querySelector('#d_g').value; m.querySelector('#d_s').innerHTML = `<option value="">(chưa gán)</option>` + o.sheets.filter(s => g ? s.group_id === g : !s.group_id).map(s => `<option value="${s.id}" ${s.id === d?.sheet_id ? 'selected' : ''}>${esc(s.name)}</option>`).join(''); };
    fill(); m.querySelector('#d_g').onchange = fill; m.querySelector('#no').onclick = () => m.close();
    m.querySelector('#ok').onclick = guard(async () => { const b = { code: m.querySelector('#d_code').value, name: m.querySelector('#d_name').value, sheet_id: m.querySelector('#d_s').value || null, sort_order: m.querySelector('#d_o').value, meal_mode: m.querySelector('#d_m').value, fund_id: m.querySelector('#d_f').value || null, active: m.querySelector('#d_a').value }; d ? await PATCH('/api/org/departments/' + d.id, b) : await POST('/api/org/departments', b); m.close(); reload(); });
  };
  $('#addG').onclick = guard(() => formG()); $('#addS').onclick = guard(() => formS()); $('#addD').onclick = () => formD();
  box.querySelectorAll('[data-eg]').forEach(b => b.onclick = guard(() => formG(o.groups.find(x => x.id === b.dataset.eg))));
  box.querySelectorAll('[data-es]').forEach(b => b.onclick = guard(() => formS(o.sheets.find(x => x.id === b.dataset.es))));
  box.querySelectorAll('[data-mm]').forEach(sl => sl.onchange = guard(async () => { await PATCH('/api/org/departments/' + sl.dataset.mm, { meal_mode: sl.value }); toast('Đã đổi kiểu tính ăn ca — bảng lương nháp cần "Tính lại"'); }));
  box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => formD(o.departments.find(x => x.id === b.dataset.ed)));
  const del = (sel, path, what, list) => box.querySelectorAll(sel).forEach(b => b.onclick = guard(async () => { const x = list.find(k => k.id === b.dataset[sel.slice(6, -1)]); if (!await confirmBox(`Xoá ${what} "${x.name}"?`)) return; await DEL(`/api/org/${path}/${x.id}`); toast('Đã xoá'); reload(); }));
  del('[data-dg]', 'groups', 'bảng lương', o.groups); del('[data-ds]', 'sheets', 'bảng chấm công', o.sheets); del('[data-dd]', 'departments', 'bộ phận', o.departments);
  box.querySelectorAll('[data-gs]').forEach(b => b.onclick = () => { const g = o.groups.find(x => x.id === b.dataset.gs);
    pickMany(`Bảng chấm công thuộc "${g.name}"`, 'Tick nhiều bảng chấm công. Bảng đang thuộc bảng lương khác sẽ được chuyển sang đây; bỏ tick = gỡ ra.',
      o.sheets.map(s => ({ id: s.id, label: s.name, checked: s.group_id === g.id, note: s.group_id && s.group_id !== g.id ? 'đang thuộc: ' + gname[s.group_id] : '' })), async ids => { await PUT(`/api/org/groups/${g.id}/sheets`, { sheetIds: ids }); toast('Đã lưu'); reload(); }); });
  box.querySelectorAll('[data-gm]').forEach(b => b.onclick = () => { const g = o.groups.find(x => x.id === b.dataset.gm), gn = id => o.groups.find(x => x.id === id)?.name || '';
    pickMany(`Người lương khoán thuộc "${g.name}"`, 'Danh sách gồm những người đã chọn "Lương khoán" ở tab Nhân sự. Mỗi người chỉ ở 1 bảng lương khoán: người đang ở bảng khác sẽ được chuyển sang đây; bỏ tick = gỡ ra.',
      o.fixedPeople.map(e => ({ id: e.id, label: e.full_name, checked: e.fixed_group_id === g.id, note: [e.department_name, e.fixed_group_id && e.fixed_group_id !== g.id ? 'đang thuộc: ' + gn(e.fixed_group_id) : ''].filter(Boolean).join(' · ') })), async ids => { await PUT(`/api/org/groups/${g.id}/members`, { employeeIds: ids }); toast('Đã lưu — bảng lương nháp cần "Tính lại"'); reload(); }); });
  box.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { const s = o.sheets.find(x => x.id === b.dataset.sd);
    pickMany(`Bộ phận thuộc "${s.name}"`, 'Tick nhiều bộ phận. Mỗi bộ phận chỉ thuộc 1 bảng chấm công: bộ phận đang ở bảng khác sẽ được chuyển sang đây; bỏ tick = gỡ ra.',
      o.departments.map(d => ({ id: d.id, label: d.name, checked: d.sheet_id === s.id, note: d.sheet_id && d.sheet_id !== s.id ? 'đang thuộc: ' + sname[d.sheet_id] : '' })), async ids => { await PUT(`/api/org/sheets/${s.id}/departments`, { departmentIds: ids }); toast('Đã lưu'); reload(); }); });
  $('#impSso').onclick = () => {
    const free = o.ssoDepartments.filter(x => !x.department_id);
    if (!free.length) return toast('Mọi phòng ban/đơn vị SSO đã được liên kết (hoặc chưa đồng bộ).', true);
    const m = modal(`<h2>Tạo bộ phận từ phòng ban SSO<span class="x">✕</span></h2><div class="muted small">Mỗi mục tick sẽ tạo 1 bộ phận cùng tên và tự liên kết. Có thể gán luôn vào một bảng chấm công.</div>
      <div class="field" style="margin-top:8px"><label>Gán vào bảng chấm công (tuỳ chọn)</label><select id="is"><option value="">(chưa gán)</option>${o.sheets.map(s => `<option value="${s.id}">${esc(s.name)} — ${esc(gname[s.group_id] || 'chưa có bảng lương')}</option>`).join('')}</select></div>
      <div class="optlist" style="max-height:44vh">${free.map(x => `<label class="opt"><input type="checkbox" value="${esc(x.id)}" checked><span>${esc(x.name)}</span></label>`).join('')}</div>
      <div class="row" style="margin-top:10px"><button class="btn" id="ok">Tạo</button><button class="btn sec" id="no">Huỷ</button></div>`);
    m.querySelector('#no').onclick = () => m.close();
    m.querySelector('#ok').onclick = guard(async () => { const r = await POST('/api/org/import-sso', { ssoIds: [...m.querySelectorAll('.opt input:checked')].map(i => i.value), sheetId: m.querySelector('#is').value || null }); m.close(); toast(`Đã tạo ${r.created} bộ phận`); reload(); });
  };
  box.querySelectorAll('[data-map]').forEach(b => b.onclick = () => {
    const d = o.departments.find(x => x.id === b.dataset.map), chosen = new Set(d.sso_ids);
    const m = modal(`<h2>Liên kết SSO → ${esc(d.name)}<span class="x">✕</span></h2><div class="muted small">Tick <b>nhiều</b> phòng ban/đơn vị SSO. Mục đã gán cho bộ phận khác sẽ được chuyển sang đây.</div>
      <input id="fq" placeholder="Lọc…" style="width:100%;margin:8px 0"><div class="optlist" style="max-height:50vh">${o.ssoDepartments.map(s => `<label class="opt" data-n="${esc(s.name.toLowerCase())}"><input type="checkbox" value="${esc(s.id)}" ${chosen.has(s.id) ? 'checked' : ''}><span>${esc(s.name)}${s.department_id && s.department_id !== d.id ? `<small>đang thuộc: ${esc(o.departments.find(x => x.id === s.department_id)?.name || '')}</small>` : ''}</span></label>`).join('') || '<div class="muted">Chưa có dữ liệu — bấm "Đồng bộ từ SSO" trước.</div>'}</div>
      <div class="row" style="margin-top:10px"><button class="btn" id="ok">Lưu</button><button class="btn sec" id="no">Huỷ</button></div>`);
    m.querySelector('#fq').oninput = e => m.querySelectorAll('.opt').forEach(l => l.style.display = l.dataset.n.includes(e.target.value.toLowerCase()) ? '' : 'none');
    m.querySelector('#no').onclick = () => m.close();
    m.querySelector('#ok').onclick = guard(async () => { const ids = [...m.querySelectorAll('.opt input:checked')].map(i => i.value); const r = await PUT(`/api/org/departments/${d.id}/sso`, { ssoDepartmentIds: ids }); m.close(); toast(`Đã lưu — ${r.employees} nhân sự thuộc bộ phận này`); reload(); });
  });
}

// ---------- Nhân sự ----------
// Phòng ban lấy hoàn toàn từ SSO (qua liên kết ở tab "Tổ chức"); tại đây chỉ hiển thị, chỉnh mã NV / loại / kíp / trưởng ca / có tính lương.
async function admPeople(me, box, reload) {
  const [o, agr] = await Promise.all([GET('/api/org'), GET('/api/workdays/allowance-groups')]);
  const AG = agr.groups.filter(g => g.active), FG = o.groups.filter(g => g.pay_type === 'fixed' && g.active), FT = admFundTools(o);
  const EMP = new Map();   // id -> nhân sự đang hiện (để tính gợi ý quỹ tự xếp, mở thuế TNCN)
  const MANUAL_KEY = 'Người ngoài SSO (thời vụ / thù lao)';
  const picked = new Set();
  const dirty = PEOPLE_DIRTY = new Map(); // id -> { field: giá trị mới }
  box.innerHTML = `<div class="card"><h2>Nhân sự theo phòng (lấy từ SSO)</h2>
    <div class="muted small">Người ở phòng nào được lấy tự động từ SSO (chỉ Trưởng phòng, Phó phòng, Nhân viên mới nằm trong phòng; người phụ trách/Giám đốc/Phó GĐ không tính vào phòng). Phó GĐ kiêm trưởng phòng: chấm công ở phòng, bảng lương ở Ban Giám đốc. Người chưa thuộc phòng nào được ẩn. Muốn đổi phòng → đổi bên SSO rồi bấm "Đồng bộ".<br>
    <b>Cách xếp trên bảng in:</b> HĐQT → Ban kiểm soát → Ban giám đốc → các phòng/nhà máy; trong phòng người chức cao đứng trước. Nhà máy: mục "Bộ phận quản lý", "Bộ phận hành chính" rồi "Công nhân vận hành" theo từng <b>Kíp</b>, trưởng ca đứng đầu kíp. Kíp / Trưởng ca chỉ có với <b>Công nhân</b>; Quản lý và Hành chính không thuộc kíp nào. Loại <b>Hành chính</b> gán tay ở cột Loại, nút Tự nhận loại không đổi người đã là Hành chính.<br><b>Chức danh</b> (in trên bảng chấm công, bảng lương): để trống = tự động — tích Trưởng ca → "Trưởng ca"; có Kíp → "ĐHV"; Trưởng / Phó phòng ở nhà máy → tên cài ở Cấu hình (mặc định "Giám đốc NM" / "P. Giám đốc NM"); còn lại theo chức vụ SSO. Gõ vào ô để sửa tay; xoá trắng để về tự động.<br><b>Cách tính lương</b>: mặc định <b>Theo hệ số</b>. Chọn <b>Lương khoán</b> cho người nhận thù lao / lao động thời vụ: nhập số tiền mỗi tháng, tỷ lệ thuế vãng lai (mặc định 10%) và bảng lương khoán sẽ tính người đó. Người lương khoán không vào bảng lương theo hệ số; thực nhận = số tiền − thuế vãng lai. Bảng lương khoán tạo ở tab Tổ chức (+ Bảng lương, Loại tính lương = Lương khoán); có thể để tất cả vào một bảng hoặc chia nhiều bảng. Người không có tài khoản SSO: bấm <b>+ Người ngoài SSO</b>.<br><b>Người phụ thuộc</b> (thuế TNCN, chỉ người hưởng lương theo hệ số): số người đang được tính giảm trừ tháng này, trong ngoặc là tổng số đã khai; bấm vào số để khai người phụ thuộc và giảm trừ y tế, giáo dục, khác theo năm. <b>Quỹ lương</b>: để "Tự xếp" thì theo quỹ của bộ phận (tab Tổ chức) hoặc quy tắc (HĐQT, Ban kiểm soát, văn phòng, nhà máy có kíp / không kíp); chọn quỹ khác khi người này thuộc khối khác (vd Khối sửa chữa).</div>
    <div class="row" style="margin-top:8px"><input id="q" placeholder="Tìm tên / email / mã…"><select id="fg"><option value="">Tất cả bảng lương</option>${opts(o.groups, 'id', 'name')}</select><select id="fpm"><option value="">Mọi cách tính lương</option><option value="coef">Theo hệ số</option><option value="fixed">Lương khoán</option></select><button class="btn sm" id="go">Lọc</button>
    <button class="btn sec sm" id="addManual" title="Lao động thời vụ / người nhận thù lao không có tài khoản SSO: tạo tay, tính lương khoán">+ Người ngoài SSO</button>
    <button class="btn sec sm" id="autotype" title="Quản lý = toàn bộ khối văn phòng (HĐQT, Ban kiểm soát, Ban giám đốc, các phòng) + Giám đốc/Phó giám đốc/Trưởng-Phó phòng nhà máy; còn lại = Công nhân. Đồng thời bỏ lịch nghỉ riêng để theo quy tắc Quản lý / Công nhân ở tab Công chuẩn.">Tự nhận loại + lịch nghỉ</button></div>
    <div class="row" id="bulkbar" style="margin-top:8px;padding:8px;background:#f1f5f9;border-radius:8px"><b id="bn">Chưa chọn ai</b><span class="muted small">Tick ô đầu dòng (hoặc tick cả phòng) rồi:</span>
      <label>Kíp</label><select id="b_shift"><option value="">— giữ nguyên —</option><option value="0">Bỏ kíp</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">Kíp ${n}</option>`).join('')}</select>
      <label>Loại</label><select id="b_type"><option value="">— giữ nguyên —</option><option value="manager">Quản lý</option><option value="admin">Hành chính</option><option value="worker">Công nhân</option></select>
      <label>Nghỉ hằng tuần</label><select id="b_woff"><option value="">— giữ nguyên —</option><option value="-">Theo quy tắc</option><option value="sun">Nghỉ CN</option><option value="sat_sun">Nghỉ T7 + CN</option></select>
      <label>Nhóm phụ cấp</label><select id="b_ag"><option value="">— giữ nguyên —</option><option value="-">Không thuộc nhóm</option>${AG.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>
      <label>Trưởng ca</label><select id="b_lead"><option value="">— giữ nguyên —</option><option value="true">Là trưởng ca</option><option value="false">Không</option></select>
      <label>Cách tính lương</label><select id="b_pm"><option value="">— giữ nguyên —</option><option value="coef">Theo hệ số</option><option value="fixed">Lương khoán</option></select>
      <label>Bảng lương khoán</label><select id="b_fg"><option value="">— giữ nguyên —</option>${FG.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>
      <label>Thuế vãng lai %</label><input id="b_tax" type="number" min="0" max="100" step="0.5" style="width:70px" placeholder="giữ">
      <label>Quỹ lương</label><select id="b_fund"><option value="">— giữ nguyên —</option><option value="-">Tự xếp (theo bộ phận / quy tắc)</option>${FT.options('')}</select>
      <button class="btn sm" id="b_apply">Áp dụng cho người đã chọn</button></div>
      <div id="undobar" class="small" style="margin-top:8px"></div>
      <div id="savebar" class="pplsave" hidden></div><div id="pl"></div></div>`;
  const upd = () => { $('#bn').textContent = picked.size ? `Đã chọn ${picked.size} người` : 'Chưa chọn ai'; };
  const FIELD = { type: 'employee_type', shift: 'shift_no', lead: 'is_lead', woff: 'weekly_off', ag: 'allowance_group_id', code: 'employee_code', active: 'payroll_active', title: 'title_manual', pm: 'pay_mode', famt: 'fixed_amount', ftax: 'fixed_tax_pct', fgrp: 'fixed_group_id', name: 'full_name', fund: 'fund_id' };
  const ctl = el => el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
  const setCtl = (el, v) => { if (el.type === 'checkbox') el.checked = v === '1'; else el.value = v; };
  const mark = el => { const d = ctl(el) !== el.dataset.o; el.classList.toggle('chg', d); const td = el.closest('td'); if (td) td.classList.toggle('chgtd', d); };
  // Lương khoán: hiện ô số tiền / % thuế / bảng lương khoán; chọn lương khoán lần đầu thì tự điền bảng lương khoán đầu tiên
  const syncPay = (tr, picking) => { const pm = tr.querySelector('[data-f="pm"]'); if (!pm) return; const fx = pm.value === 'fixed', box = tr.querySelector('.fxbox'); box.hidden = !fx;
    const g = tr.querySelector('[data-f="fgrp"]'); if (fx && picking && !g.value && FG.length) { g.value = FG[0].id; stage(g); }
    box.querySelector('.fxwarn').hidden = !(fx && !g.value); };
  const syncType = tr => { const w = tr.querySelector('[data-f="type"]').value === 'worker'; tr.querySelectorAll('[data-f="shift"],[data-f="lead"]').forEach(x => { x.disabled = !w; }); syncTitle(tr); };
  // Gợi ý chức danh tự động theo trưởng ca / kíp đang chọn (chưa lưu cũng đổi ngay); kíp / trưởng ca chỉ tính với Công nhân
  const syncTitle = tr => { const t = tr.querySelector('[data-f="title"]'); if (!t) return; const w = tr.querySelector('[data-f="type"]').value === 'worker', lead = w && tr.querySelector('[data-f="lead"]').checked, sh = w && tr.querySelector('[data-f="shift"]').value; t.placeholder = lead ? 'Trưởng ca' : sh ? 'ĐHV' : (t.dataset.sso || ''); syncFund(tr); };
  // Gợi ý quỹ tự xếp theo kíp đang chọn (nhà máy: có kíp → công nhân vận hành, không kíp → quản lý và hành chính)
  const syncFund = tr => { const s = tr.querySelector('[data-f="fund"]'), a = tr.querySelector('[data-fauto]'), e = EMP.get(tr.dataset.id); if (!s || !a || !e) return; const w = tr.querySelector('[data-f="type"]').value === 'worker'; a.hidden = !!s.value; a.textContent = '→ ' + FT.personAuto(e, w && tr.querySelector('[data-f="shift"]').value); };
  const bar = () => {
    const sb = $('#savebar'); if (!sb) return;
    sb.hidden = !dirty.size; window.onbeforeunload = dirty.size ? () => 'Còn thay đổi chưa lưu' : null;
    if (!dirty.size) return;
    sb.innerHTML = `<b>Có ${dirty.size} người đang sửa chưa lưu</b> <span class="muted small">(ô đổi được tô vàng; chưa có gì được ghi vào hệ thống)</span> <span style="flex:1"></span><button class="btn sec sm" id="sv_no">Bỏ thay đổi</button><button class="btn sm" id="sv_ok">Lưu thay đổi (${dirty.size})</button>`;
    $('#sv_no').onclick = () => { dirty.clear(); window.onbeforeunload = null; guard(load)(); };
    $('#sv_ok').onclick = guard(async () => {
      const conv = { type: v => ({ employee_type: v }), shift: v => ({ shift_no: v === '' ? null : Number(v) }), lead: v => ({ is_lead: v === '1' }), woff: v => ({ weekly_off: v }), ag: v => ({ allowance_group_id: v }), code: v => ({ employee_code: v }), active: v => ({ payroll_active: v === '1' }), title: v => ({ title_manual: v }),
        pm: v => ({ pay_mode: v }), famt: v => ({ fixed_amount: v === '' ? 0 : Number(v) }), ftax: v => ({ fixed_tax_pct: v === '' ? 10 : Number(v) }), fgrp: v => ({ fixed_group_id: v || null }), name: v => ({ full_name: v }), fund: v => ({ fund_id: v || null }) };
      const changes = [...dirty].map(([id, ch]) => Object.assign({ id }, ...Object.entries(ch).map(([f, v]) => conv[f](v))));
      const r = await POST('/api/employees-batch', { changes });
      dirty.clear(); toast(`Đã lưu ${r.updated} người — nếu nhầm, bấm "Hoàn tác" ở phía trên`); await load();
    });
  };
  const stage = el => {
    const tr = el.closest('tr'), id = tr.dataset.id, f = el.dataset.f; mark(el);
    let ch = dirty.get(id) || {};
    const v = ctl(el);
    if (v === el.dataset.o) delete ch[f]; else ch[f] = v;
    // chuyển sang body gửi lên: chuyển kiểu cho đúng
    if (!Object.keys(ch).length) dirty.delete(id); else dirty.set(id, ch);
    if (f === 'type') syncType(tr); else if (f === 'lead' || f === 'shift') syncTitle(tr); else if (f === 'pm') syncPay(tr, true); else if (f === 'fgrp') syncPay(tr); else if (f === 'fund') syncFund(tr);
    tr.classList.toggle('rowdirty', dirty.has(id)); bar();
  };
  async function loadUndo() {
    const u = await GET('/api/employees-undo').catch(() => null), el = $('#undobar'); if (!el) return;
    if (!u || !u.last) { el.innerHTML = ''; return; }
    el.innerHTML = `<span class="undochip">↩ Lần thay đổi gần nhất: <b>${esc(u.last.label)}</b> · ${esc(u.last.actor_name || '')} · ${new Date(u.last.created_at).toLocaleString('vi-VN')} <button class="btn sec sm" id="undo_go">Hoàn tác lần này</button></span>`;
    $('#undo_go').onclick = guard(async () => {
      if (dirty.size && !confirm('Đang có thay đổi chưa lưu. Hoàn tác sẽ tải lại danh sách và giữ các ô chưa lưu. Tiếp tục?')) return;
      const r = await POST('/api/employees-undo', {}); toast(`Đã hoàn tác "${r.label}" (${r.restored} người về như trước)`); await load();
    });
  }
  async function load() {
    const p = new URLSearchParams(); if ($('#q').value) p.set('q', $('#q').value); if ($('#fg').value) p.set('groupId', $('#fg').value); if ($('#fpm').value) p.set('payMode', $('#fpm').value);
    const r = await GET('/api/employees?' + p);
    const by = new Map(); EMP.clear();
    for (const e of r.employees) { EMP.set(e.id, e); const k = e.manual ? MANUAL_KEY : `${e.group_name} › ${e.sheet_name} › ${e.department_name}`; (by.get(k) || by.set(k, []).get(k)).push(e); }
    const fgName = id => o.groups.find(g => g.id === id)?.name || '';
    const paySel = e => `<select data-f="pm" style="width:135px"><option value="coef" ${e.pay_mode !== 'fixed' ? 'selected' : ''}>Theo hệ số</option><option value="fixed" ${e.pay_mode === 'fixed' ? 'selected' : ''}>Lương khoán</option></select>
      <div class="fxbox small" ${e.pay_mode === 'fixed' ? '' : 'hidden'} style="margin-top:4px;line-height:1.9"><label title="Số tiền mặc định mỗi tháng; tháng nào khác thì sửa ở màn Bảng lương">Số tiền/tháng <input data-f="famt" type="number" min="0" step="100000" style="width:110px;text-align:right" value="${Number(e.fixed_amount) || ''}"></label><br>
      <label title="Tỷ lệ khấu trừ thuế TNCN vãng lai. Người đã nộp cam kết mẫu 08/CK-TNCN thì đặt 0">Thuế vãng lai <input data-f="ftax" type="number" min="0" max="100" step="0.5" style="width:60px;text-align:right" value="${Number(e.fixed_tax_pct ?? 10)}">%</label><br>
      <select data-f="fgrp" style="width:170px" title="Bảng lương khoán tính người này"><option value="">— chọn bảng lương khoán —</option>${FG.map(g => `<option value="${g.id}" ${e.fixed_group_id === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}${e.fixed_group_id && !FG.some(g => g.id === e.fixed_group_id) ? `<option value="${e.fixed_group_id}" selected>${esc(fgName(e.fixed_group_id) || '(bảng đã ngừng)')}</option>` : ''}</select>
      <div class="fxwarn" style="color:#b91c1c" ${e.pay_mode === 'fixed' && !e.fixed_group_id ? '' : 'hidden'}>${FG.length ? 'Chưa chọn bảng lương khoán: người này chưa được tính lương ở đâu' : 'Chưa có bảng lương khoán — tạo ở tab Tổ chức'}</div></div>`;
    const shiftSel = e => `<select data-f="shift" style="width:84px" ${e.employee_type === 'worker' ? '' : 'disabled'}><option value="">—</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${e.shift_no === n ? 'selected' : ''}>Kíp ${n}</option>`).join('')}</select>`;
    const fundSel = e => `<select data-f="fund" style="width:135px" title="Quỹ lương để tổng hợp lương theo khối. Tự xếp = theo quỹ của bộ phận (tab Tổ chức) hoặc quy tắc"><option value="">Tự xếp</option>${FT.options(e.fund_id || '')}</select><div class="muted small" data-fauto style="max-width:150px" ${e.fund_id ? 'hidden' : ''}>→ ${esc(FT.personAuto(e, e.employee_type === 'worker' && e.shift_no))}</div>`;
    // Người phụ thuộc: số đang được tính tháng này (tổng đã khai trong ngoặc); lương khoán / thù lao đã khấu trừ thuế vãng lai nên không có
    const depCell = e => e.pay_mode === 'fixed' ? '<span class="muted" title="Lương khoán / thù lao: đã khấu trừ thuế vãng lai, không tính thuế lũy tiến nên không khai người phụ thuộc">—</span>'
      : `<button class="btn sec sm" data-dep="${e.id}" title="Người phụ thuộc đang được tính giảm trừ tháng này (trong ngoặc: tổng số đã khai). Bấm để khai người phụ thuộc, giảm trừ y tế / giáo dục / khác theo năm">${admDepTxt(e.dependents_active, e.dependents_total)}</button>`;
    $('#pl').innerHTML = `<div class="muted small" style="margin:6px 0">${r.employees.length} người · ${by.size} nhóm</div>` + [...by].map(([k, list]) => `<div class="deptgrp"><h3>${esc(k)} <span class="badge">${list.length}</span></h3>
      <div class="scroll" style="max-height:none;border:0"><table><thead><tr><th style="width:30px"><input type="checkbox" data-all="${esc(k)}" title="Chọn cả nhóm"></th><th>Họ tên</th><th title="Để trống = chức danh tự động (chữ mờ trong ô); gõ để sửa tay">Chức danh</th><th>Loại</th><th>Kíp</th><th>Trưởng ca</th><th title="Trống = theo quy tắc ở tab Công chuẩn">Nghỉ hằng tuần</th><th title="Nhóm đối tượng hưởng % phụ cấp đêm / sửa chữa (cài ở Cấu hình › Ký hiệu công)">Nhóm phụ cấp</th><th title="Theo hệ số (mặc định) hoặc Lương khoán: số tiền cố định, khấu trừ thuế vãng lai">Cách tính lương</th><th title="Thuế TNCN: số người phụ thuộc đang được giảm trừ tháng này (trong ngoặc: tổng đã khai). Bấm để xem / sửa">Người phụ thuộc</th><th title="Quỹ lương (khối) để tổng hợp tiền lương; trống = tự xếp theo bộ phận / quy tắc">Quỹ lương</th><th>Mã NV</th><th>Tính lương</th></tr></thead><tbody>${list.map(e => `<tr data-id="${e.id}" data-g="${esc(k)}"><td><input type="checkbox" data-pick ${picked.has(e.id) ? 'checked' : ''}></td><td>${e.manual ? `<input data-f="name" style="width:170px;font-weight:bold" maxlength="120" value="${esc(e.full_name)}"><div class="muted small">ngoài SSO <button class="btn red sm" data-delman="${e.id}" title="Xoá người này (chỉ khi chưa có trong bảng lương nào)">Xoá</button></div>` : `<b>${esc(e.full_name)}</b><div class="muted small">${esc(e.email || '')}</div>`}</td><td class="small"><input data-f="title" style="width:150px" maxlength="60" value="${esc(e.title_manual || '')}" placeholder="${esc(e.auto_title || '')}" data-sso="${esc(e.sso_title || '')}" title="Để trống = tự động"><div class="muted small">SSO: ${esc(e.positions || '—')}</div>${e.pay_dept_id && e.pay_dept_id !== e.department_id ? `<div><span class="badge">Lương tính ở: ${esc(e.pay_department_name || '')}</span></div>` : ''}</td>
      <td>${e.type_locked ? '<span title="Đã chỉnh tay — nút Tự nhận loại sẽ không ghi đè">🔒</span> ' : ''}<select data-f="type">${EMP_TYPE_OPTS.map(o => `<option value="${o.v}" ${e.employee_type === o.v ? 'selected' : ''}>${o.t}</option>`).join('')}</select></td>
      <td>${shiftSel(e)}</td><td><input type="checkbox" data-f="lead" ${e.is_lead ? 'checked' : ''} ${e.employee_type === 'worker' ? '' : 'disabled'}></td>
       <td><select data-f="woff" style="width:130px"><option value="">Theo quy tắc</option><option value="sun" ${e.weekly_off === 'sun' ? 'selected' : ''}>Nghỉ CN</option><option value="sat_sun" ${e.weekly_off === 'sat_sun' ? 'selected' : ''}>Nghỉ T7 + CN</option></select></td>
 <td><select data-f="ag" style="width:120px"><option value="">—</option>${AG.map(g => `<option value="${g.id}" ${e.allowance_group_id === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></td>
      <td>${paySel(e)}</td><td class="n">${depCell(e)}</td><td>${fundSel(e)}</td><td><input data-f="code" style="width:90px" value="${esc(e.employee_code || '')}"></td><td><input type="checkbox" data-f="active" ${e.payroll_active ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div></div>`).join('') || '<div class="muted">Không có nhân sự. Bấm "Đồng bộ từ SSO" ở tab Tổ chức.</div>';
    $('#pl').querySelectorAll('[data-pick]').forEach(cb => cb.onchange = () => { const id = cb.closest('tr').dataset.id; cb.checked ? picked.add(id) : picked.delete(id); upd(); });
    $('#pl').querySelectorAll('[data-all]').forEach(cb => cb.onchange = () => { $('#pl').querySelectorAll('tr[data-g]').forEach(tr => { if (tr.dataset.g !== cb.dataset.all) return; const x = tr.querySelector('[data-pick]'); x.checked = cb.checked; cb.checked ? picked.add(tr.dataset.id) : picked.delete(tr.dataset.id); }); upd(); });
    $('#pl').querySelectorAll('[data-f]').forEach(el => { el.dataset.o = ctl(el); el.onchange = () => stage(el); });
    // giữ lại các thay đổi chưa lưu khi lọc / tải lại
    for (const [id, ch] of dirty) { const tr = $('#pl').querySelector(`tr[data-id="${id}"]`); if (!tr) continue; for (const f of Object.keys(ch)) { const el = tr.querySelector(`[data-f="${f}"]`); if (el) { setCtl(el, ch[f]); mark(el); } } syncType(tr); syncPay(tr); }
    $('#pl').querySelectorAll('[data-dep]').forEach(b => b.onclick = guard(() => admPitPerson(me, EMP.get(b.dataset.dep), (a, t) => { const e = EMP.get(b.dataset.dep), x = $('#pl').querySelector(`[data-dep="${b.dataset.dep}"]`); if (e) Object.assign(e, { dependents_active: a, dependents_total: t }); if (x) x.textContent = admDepTxt(a, t); })));
    $('#pl').querySelectorAll('[data-delman]').forEach(b => b.onclick = guard(async () => { const tr = b.closest('tr'); if (!await confirmBox(`Xoá người ngoài SSO "${tr.querySelector('[data-f="name"]').dataset.o}"?`)) return; await DEL('/api/employees-manual/' + b.dataset.delman); dirty.delete(tr.dataset.id); toast('Đã xoá'); await load(); }));
    bar(); loadUndo();
    upd();
  }
  $('#go').onclick = guard(load); $('#q').onkeydown = e => { if (e.key === 'Enter') guard(load)(); };
  $('#addManual').onclick = guard(async () => {
    const r = await ask('Thêm người ngoài SSO (lương khoán)', [{ label: 'Họ và tên' }, { label: 'Chức danh / nội dung (in trên bảng lương khoán)' }, { label: 'Mã NV (tuỳ chọn)' }, { label: 'Số tiền mỗi tháng (đ)', type: 'number' }, { label: 'Tỷ lệ thuế vãng lai (%)', type: 'number', value: 10 }, { label: 'Bảng lương khoán', type: 'select', options: [{ v: '', t: FG.length ? '— chọn sau —' : '(chưa có bảng lương khoán — tạo ở tab Tổ chức)' }, ...FG.map(g => ({ v: g.id, t: g.name }))], value: FG[0]?.id || '' }]);
    if (!r) return;
    await POST('/api/employees-manual', { full_name: r[0], title_manual: r[1], employee_code: r[2], fixed_amount: r[3] === '' ? 0 : Number(r[3]), fixed_tax_pct: r[4] === '' ? 10 : Number(r[4]), fixed_group_id: r[5] || null });
    toast('Đã thêm'); await load();
  });
  $('#b_apply').onclick = guard(async () => {
    if (!picked.size) throw new Error('Hãy tick chọn ít nhất một người');
    const body = { ids: [...picked] };
    if ($('#b_shift').value !== '') body.shift_no = $('#b_shift').value === '0' ? null : Number($('#b_shift').value);
    if ($('#b_type').value) body.employee_type = $('#b_type').value;
    if ($('#b_woff').value) body.weekly_off = $('#b_woff').value === '-' ? '' : $('#b_woff').value;
    if ($('#b_ag').value) body.allowance_group_id = $('#b_ag').value === '-' ? '' : $('#b_ag').value;
    if ($('#b_lead').value) body.is_lead = $('#b_lead').value === 'true';
    if ($('#b_pm').value) body.pay_mode = $('#b_pm').value;
    if ($('#b_fg').value) body.fixed_group_id = $('#b_fg').value;
    if ($('#b_tax').value !== '') body.fixed_tax_pct = Number($('#b_tax').value);
    if ($('#b_fund').value) body.fund_id = $('#b_fund').value === '-' ? '' : $('#b_fund').value;
    if (Object.keys(body).length === 1) throw new Error('Chọn ít nhất một thay đổi (Kíp / Loại / Nghỉ hằng tuần / Nhóm phụ cấp / Trưởng ca / Cách tính lương / Quỹ lương)');
    const r = await PATCH('/api/employees-bulk', body); toast(`Đã áp dụng cho ${r.updated} người — nếu nhầm bấm "Hoàn tác"`); picked.clear(); await load();
  });
  $('#autotype').onclick = guard(async () => {
    const pv = await POST('/api/employees-autotype', { dryRun: true });
    const TY = { manager: 'Quản lý', worker: 'Công nhân' }, OFF = { sun: 'Nghỉ CN', sat_sun: 'Nghỉ T7 + CN' };
    const m = modal(`<h2>Tự nhận loại + lịch nghỉ<span class="x">✕</span></h2>
      <div class="small" style="line-height:1.6;margin-bottom:8px"><b>Quy tắc:</b> toàn bộ <b>khối văn phòng</b> và <b>Giám đốc / Phó giám đốc nhà máy</b> → <b>Quản lý, nghỉ T7 + CN</b>. Còn lại → <b>Công nhân, nghỉ CN</b>.<br>
      Người bạn <b>đã chỉnh tay</b> (loại hoặc lịch nghỉ) được đánh dấu 🔒 và <b>được giữ nguyên</b>, không bị ghi đè. Áp dụng xong vẫn có nút <b>Hoàn tác</b> để quay về như trước.</div>
      <div class="info">Sẽ thay đổi <b>${pv.changes.length}</b> người${pv.keptLocked ? `; giữ nguyên <b>${pv.keptLocked}</b> người đã chỉnh tay` : ''}. Tổng ${pv.total} người.</div>
      ${pv.lockedAll ? `<label class="small" style="display:block;margin:6px 0"><input type="checkbox" id="at_ow"> Ghi đè cả những người đã chỉnh tay (${pv.lockedAll} người có 🔒)</label>` : ''}
      <div class="scroll" style="max-height:300px"><table><thead><tr><th>Họ tên</th><th>Bộ phận</th><th>Hiện tại</th><th>Sẽ đặt</th></tr></thead><tbody id="at_rows"></tbody></table></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="at_ok">Áp dụng</button><button class="btn sec" id="at_no">Huỷ</button></div>`, true);
    const show = list => { m.querySelector('#at_rows').innerHTML = list.slice(0, 300).map(x => `<tr><td>${esc(x.full_name)}${x.type_locked ? ' 🔒' : ''}</td><td class="small">${esc(x.department_name || '')}</td><td class="small">${TY[x.cur_type] || ''} · ${OFF[x.cur_off] || 'theo quy tắc'}</td><td class="small"><b>${TY[x.new_type]} · ${OFF[x.new_off]}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Không có ai cần thay đổi.</td></tr>'; };
    show(pv.changes);
    const ow = m.querySelector('#at_ow'); if (ow) ow.onchange = guard(async () => { const q = await POST('/api/employees-autotype', { dryRun: true, overwrite: ow.checked }); show(q.changes); m.querySelector('.info').innerHTML = `Sẽ thay đổi <b>${q.changes.length}</b> người${q.keptLocked ? `; giữ nguyên <b>${q.keptLocked}</b> người đã chỉnh tay` : ''}. Tổng ${q.total} người.`; });
    m.querySelector('#at_no').onclick = () => m.close();
    m.querySelector('#at_ok').onclick = guard(async () => { const r = await POST('/api/employees-autotype', { overwrite: !!(ow && ow.checked) }); m.close(); toast(`Đã cập nhật ${r.updated} người (có thể Hoàn tác)${r.keptLocked ? `, giữ nguyên ${r.keptLocked} người đã chỉnh tay` : ''} — hiện có ${r.managers} Quản lý, ${r.admins} Hành chính, ${r.workers} Công nhân`); await load(); });
  });
  await load();
}

// ---------- Thuế TNCN: dùng chung cho Nhân sự và Cấu hình ----------
const admDepTxt = (a, t) => `${Number(a) || 0}${Number(t) !== Number(a) ? ` (${Number(t) || 0})` : ''}`;
const admYmTxt = v => v ? `${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '';
const admCurYm = me => `${me.now.year}-${String(me.now.month).padStart(2, '0')}`;
// Biểu thuế dùng cho năm y: biểu của năm gần nhất ≤ y; chưa có thì biểu sớm nhất (như src/services/pit.js)
const admPitSched = (list, y) => { const l = [...(list || [])].sort((a, b) => b.year - a.year); return l.find(s => s.year <= y) || l[l.length - 1] || null; };
const admCapTxt = v => v === null || v === undefined || v === '' ? 'không giới hạn' : Number(v) === 0 ? 'không áp dụng' : 'tối đa ' + money(v);
const admCapped = (a, cap) => { const x = Math.max(0, Number(a) || 0); return cap === null || cap === undefined || cap === '' ? x : Math.min(x, Math.max(0, Number(cap) || 0)); };
const admPct = n => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
// Thuế lũy tiến từng phần (như src/lib/pit.js): divisor = 12 khi tạm tính tháng (mức trần bậc ÷ 12); bậc cuối không giới hạn
function admPitProgressive(income, brackets, divisor = 1) {
  const x = Math.max(0, Number(income) || 0), parts = []; let lower = 0, tax = 0;
  brackets.forEach((b, i) => { const upper = i === brackets.length - 1 || !(Number(b.upto) > 0) ? Infinity : Number(b.upto) / divisor;
    if (x > lower) { const base = Math.min(x, upper) - lower, t = base * (Number(b.rate) || 0) / 100; parts.push({ level: i + 1, rate: Number(b.rate) || 0, base, tax: t }); tax += t; }
    lower = Math.max(lower, upper); });
  return { tax: Math.round(tax), parts };
}
const ADM_REL_OPTS = ['Con', 'Vợ', 'Chồng', 'Cha đẻ', 'Mẹ đẻ', 'Cha vợ / cha chồng', 'Mẹ vợ / mẹ chồng', 'Anh / chị / em ruột', 'Ông / bà', 'Cháu ruột', 'Người khác đang trực tiếp nuôi dưỡng'];
// Hộp "Thuế TNCN — <họ tên>": người phụ thuộc (tính theo tháng) + giảm trừ y tế / giáo dục / khác theo năm. onCount(đang tính, tổng) để cập nhật số ở danh sách.
async function admPitPerson(me, e, onCount) {
  if (!e) return;
  const m = modal(`<h2>Thuế TNCN — ${esc(e.full_name)}<span class="x">✕</span></h2><div id="tx_b"><div class="muted">Đang tải…</div></div>`, true);
  const cfg = await GET('/api/config').catch(() => ({ pitSchedules: [] })), S = cfg.pitSchedules || [], cur = admCurYm(me), sNow = admPitSched(S, me.now.year);
  const years = []; for (let y = me.yearMin; y <= me.yearMax; y++) years.push(y);
  const capInfo = s => s ? `Biểu ${s.year}: y tế ${admCapTxt(s.health_cap)}, giáo dục ${admCapTxt(s.education_cap)} / năm` : 'Chưa có biểu thuế (Cấu hình › Thuế TNCN)';
  const stTxt = x => x.active_now ? '<span class="badge locked">Đang tính</span>' : x.from_month > cur ? `<span class="badge draft">Từ ${admYmTxt(x.from_month)}</span>` : '<span class="badge">Đã thôi</span>';
  async function draw() {
    const [d, t] = await Promise.all([GET(`/api/employees/${e.id}/dependents`), GET(`/api/employees/${e.id}/tax-deductions`)]);
    const deps = d.dependents, items = t.items, have = new Set(items.map(i => Number(i.year)));
    onCount(deps.filter(x => x.active_now).length, deps.length);
    const free = years.filter(y => !have.has(y)), ny = free.includes(me.now.year) ? me.now.year : free.find(y => y > me.now.year) ?? free[free.length - 1];
    const yrRow = (it, isNew) => `<tr data-yr="${it.year}" ${isNew ? 'data-new="1"' : ''}><td style="min-width:150px;max-width:210px">${isNew ? `<select data-ny>${free.map(y => `<option ${y === ny ? 'selected' : ''}>${y}</option>`).join('')}</select>` : `<b>${it.year}</b>`}<div class="muted small" data-cap>${esc(capInfo(admPitSched(S, it.year)))}</div></td>
      ${['health', 'education', 'other'].map(k => `<td class="n"><input type="number" min="0" step="100000" data-k="${k}" style="width:118px;text-align:right" value="${Number(it[k]) || ''}" placeholder="0"></td>`).join('')}
      <td><input data-k="note" maxlength="500" style="width:100%;min-width:110px" value="${esc(it.note || '')}"></td><td class="small" data-eff style="min-width:150px"></td>
      <td style="white-space:nowrap">${isNew ? '<button class="btn sm" data-ysave>Thêm</button>' : '<button class="btn sm" data-ysave>Lưu</button> <button class="btn red sm" data-ydel>Xoá</button>'}</td></tr>`;
    m.querySelector('#tx_b').innerHTML = `<div class="muted small" style="margin-bottom:8px">${esc(e.pay_department_name || e.department_name || '')}${e.group_name ? ' · ' + esc(e.group_name) : ''}${sNow ? ` · Biểu thuế năm ${me.now.year} (biểu ${sNow.year}): giảm trừ bản thân <b>${money(sNow.self_deduction)}</b>, mỗi người phụ thuộc <b>${money(sNow.dependent_deduction)}</b> / tháng` : ''}</div>
      <div class="row" style="margin:0 0 4px"><h3 class="grow" style="margin:0">Người phụ thuộc</h3><button class="btn sm" id="tx_add">+ Thêm người phụ thuộc</button></div>
      <div class="muted small" style="margin-bottom:6px">Mỗi người phụ thuộc được giảm trừ từ <b>tháng bắt đầu</b> đến <b>hết tháng cuối</b> (trống = vẫn đang tính). Khi người đó thôi là người phụ thuộc (con đã đi làm, đã chuyển cho người khác nhận giảm trừ…) bấm <b>Thôi tính</b> và chọn tháng cuối cùng còn được tính — không xoá, để các tháng trước vẫn đúng. Chỉ xoá khi khai nhầm. Đổi xong, các bảng lương chưa khoá có người này được đánh dấu cần Tính lại.</div>
      <div class="scroll" style="max-height:none"><table><thead><tr><th>Họ tên</th><th>Quan hệ</th><th>Ngày sinh</th><th>CCCD / Mã số thuế</th><th>Tính từ tháng</th><th>Đến hết tháng</th><th>Trạng thái</th><th>Ghi chú</th><th></th></tr></thead><tbody>${deps.map(x => `<tr><td><b>${esc(x.full_name)}</b></td><td>${esc(x.relationship || '')}</td><td style="white-space:nowrap">${fmtDate(x.birth_date)}</td>
        <td class="small">${[x.id_number ? 'CCCD: ' + esc(x.id_number) : '', x.tax_code ? 'MST: ' + esc(x.tax_code) : ''].filter(Boolean).join('<br>') || '<span class="muted">—</span>'}</td><td>${admYmTxt(x.from_month)}</td><td>${x.to_month ? admYmTxt(x.to_month) : '<span class="muted">đang tính</span>'}</td><td>${stTxt(x)}</td><td class="small">${esc(x.note || '')}</td>
        <td style="white-space:nowrap"><button class="btn sec sm" data-dedit="${x.id}">Sửa</button> ${!x.to_month || x.to_month >= cur ? `<button class="btn sec sm" data-dstop="${x.id}">Thôi tính</button> ` : ''}<button class="btn red sm" data-ddel="${x.id}">Xoá</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Chưa khai người phụ thuộc nào.</td></tr>'}</tbody></table></div>
      <h3 style="margin:16px 0 4px">Giảm trừ theo năm (y tế, giáo dục, khác)</h3>
      <div class="muted small" style="margin-bottom:6px">Nhập số <b>cả năm</b>. Tạm tính mỗi tháng trừ 1/12; tháng 12 quyết toán trừ đủ số cả năm. Chi phí y tế, giáo dục được trừ tối đa theo biểu thuế của năm (Cấu hình › Thuế TNCN); khoản khác (từ thiện, nhân đạo, khuyến học, quỹ hưu trí tự nguyện…) không giới hạn. Xoá trắng cả ba khoản và ghi chú rồi Lưu = xoá dòng.
        <br>Lưu ý: theo Nghị định 253/2026/NĐ-CP (Điều 51), giảm trừ chi phí y tế, giáo dục do người lao động tự kê khai khi <b>tự quyết toán</b> thuế TNCN; số nhập ở đây chỉ để công ty tạm tính, quyết toán chính thức có thể khác.</div>
      <div class="scroll" style="max-height:none"><table><thead><tr><th>Năm</th><th class="n">Chi phí y tế (cả năm)</th><th class="n">Chi phí giáo dục (cả năm)</th><th class="n">Giảm trừ khác (cả năm)</th><th>Ghi chú</th><th>Được trừ (sau mức tối đa)</th><th></th></tr></thead>
        <tbody>${items.map(it => yrRow(it, false)).join('')}${free.length ? yrRow({ year: ny }, true) : ''}</tbody></table></div>
      <div class="row" style="margin-top:12px"><span class="grow"></span><button class="btn sec" id="tx_close">Đóng</button></div>`;
    const B = m.querySelector('#tx_b');
    // Số được trừ sau mức tối đa của biểu năm đó; mỗi tháng = từng khoản ÷ 12 (làm tròn như khi tính lương)
    const eff = tr => {
      const y = Number(tr.querySelector('[data-ny]')?.value || tr.dataset.yr), s = admPitSched(S, y), v = k => Number(tr.querySelector(`[data-k="${k}"]`).value) || 0;
      const h = admCapped(v('health'), s?.health_cap), ed = admCapped(v('education'), s?.education_cap), ot = Math.max(0, v('other')), tot = h + ed + ot;
      const warn = (k, a, cap, lb) => v(k) > a ? `<div style="color:#b45309">${lb}: ${Number(cap) === 0 ? 'biểu năm này không áp dụng, không được trừ' : 'vượt mức tối đa, chỉ trừ ' + money(a)}</div>` : '';
      tr.querySelector('[data-cap]').textContent = capInfo(s);
      tr.querySelector('[data-eff]').innerHTML = (tot ? `Cả năm <b>${money(tot)}</b><br>Mỗi tháng ≈ ${money(Math.round(h / 12) + Math.round(ed / 12) + Math.round(ot / 12))}` : '<span class="muted">—</span>') + warn('health', h, s?.health_cap, 'Y tế') + warn('education', ed, s?.education_cap, 'Giáo dục');
    };
    B.querySelectorAll('tr[data-yr]').forEach(tr => { eff(tr); tr.querySelectorAll('input,select').forEach(i => i.oninput = i.onchange = () => eff(tr)); });
    B.querySelector('#tx_close').onclick = () => m.close();
    B.querySelectorAll('[data-ysave]').forEach(b => b.onclick = guard(async () => {
      const tr = b.closest('tr'), y = Number(tr.querySelector('[data-ny]')?.value || tr.dataset.yr), v = k => tr.querySelector(`[data-k="${k}"]`).value;
      await PUT(`/api/employees/${e.id}/tax-deductions/${y}`, { health: Number(v('health')) || 0, education: Number(v('education')) || 0, other: Number(v('other')) || 0, note: v('note') });
      toast(`Đã lưu giảm trừ năm ${y} — các bảng lương chưa khoá năm ${y} có người này cần Tính lại`); await draw();
    }));
    B.querySelectorAll('[data-ydel]').forEach(b => b.onclick = guard(async () => {
      const y = b.closest('tr').dataset.yr; if (!await confirmBox(`Xoá giảm trừ y tế / giáo dục / khác năm ${y} của ${e.full_name}?`)) return;
      await PUT(`/api/employees/${e.id}/tax-deductions/${y}`, { health: 0, education: 0, other: 0, note: '' }); toast('Đã xoá'); await draw();
    }));
    const byId = id => deps.find(x => x.id === id);
    B.querySelector('#tx_add').onclick = () => depForm(null);
    B.querySelectorAll('[data-dedit]').forEach(b => b.onclick = () => depForm(byId(b.dataset.dedit)));
    B.querySelectorAll('[data-dstop]').forEach(b => b.onclick = guard(async () => {
      const x = byId(b.dataset.dstop), r = await ask(`Thôi tính giảm trừ — ${x.full_name}`, [{ label: `Tháng cuối cùng còn được giảm trừ (từ tháng sau không tính nữa). Đang tính từ ${admYmTxt(x.from_month)}.`, type: 'month', value: x.to_month || (cur < x.from_month ? x.from_month : cur) }], 'Thôi tính');
      if (!r) return; if (!/^\d{4}-\d{2}$/.test(r[0])) throw new Error('Chọn tháng / năm cuối cùng còn được tính');
      if (r[0] < x.from_month) throw new Error(`Tháng cuối phải từ ${admYmTxt(x.from_month)} trở đi (nếu khai nhầm thì bấm Xoá)`);
      await PATCH('/api/dependents/' + x.id, { to_month: r[0] }); toast(`Đã thôi tính ${x.full_name} từ sau tháng ${admYmTxt(r[0])}`); await draw();
    }));
    B.querySelectorAll('[data-ddel]').forEach(b => b.onclick = guard(async () => {
      const x = byId(b.dataset.ddel); if (!await confirmBox(`Xoá hẳn người phụ thuộc "${x.full_name}"? Chỉ dùng khi khai nhầm — các tháng đã tính sẽ mất giảm trừ khi bấm Tính lại. Người thôi là người phụ thuộc thì dùng "Thôi tính".`)) return;
      await DEL('/api/dependents/' + x.id); toast('Đã xoá'); await draw();
    }));
  }
  // Thêm / sửa người phụ thuộc (tháng dạng YYYY-MM)
  function depForm(x) {
    const f = modal(`<h2>${x ? 'Sửa người phụ thuộc' : 'Thêm người phụ thuộc'} — ${esc(e.full_name)}<span class="x">✕</span></h2>
      <div class="fgrid"><div class="field"><label>Họ và tên người phụ thuộc *</label><input id="p_n" maxlength="120" value="${esc(x?.full_name || '')}"></div>
      <div class="field"><label>Quan hệ với người nộp thuế</label><input id="p_r" list="p_rl" maxlength="60" value="${esc(x?.relationship || '')}" placeholder="vd Con, Mẹ đẻ…"><datalist id="p_rl">${ADM_REL_OPTS.map(r => `<option value="${esc(r)}">`).join('')}</datalist></div>
      <div class="field"><label>Ngày sinh</label><input id="p_b" type="date" value="${esc(ymd(x?.birth_date))}"></div>
      <div class="field"><label>Số CCCD / định danh cá nhân</label><input id="p_i" maxlength="60" value="${esc(x?.id_number || '')}"></div>
      <div class="field"><label>Mã số thuế người phụ thuộc</label><input id="p_t" maxlength="60" value="${esc(x?.tax_code || '')}"></div>
      <div class="field"><label>Tính giảm trừ từ tháng *</label><input id="p_f" type="month" placeholder="YYYY-MM" value="${esc(x?.from_month || cur)}"></div>
      <div class="field"><label>Đến hết tháng (trống = đang tính)</label><input id="p_to" type="month" placeholder="YYYY-MM" value="${esc(x?.to_month || '')}"></div></div>
      <div class="field"><label>Ghi chú</label><input id="p_note" maxlength="500" value="${esc(x?.note || '')}"></div>
      <div class="muted small" style="margin-bottom:10px">Được giảm trừ từ tháng phát sinh nghĩa vụ nuôi dưỡng (vd tháng sinh con). Mỗi người phụ thuộc chỉ được tính cho một người nộp thuế.</div>
      <div class="row"><button class="btn" id="p_ok">Lưu</button><button class="btn sec" id="p_no">Huỷ</button></div>`);
    const v = id => f.querySelector(id).value.trim();
    f.querySelector('#p_no').onclick = () => f.close();
    f.querySelector('#p_ok').onclick = guard(async () => {
      if (!v('#p_n')) throw new Error('Nhập họ tên người phụ thuộc');
      if (!/^\d{4}-\d{2}$/.test(v('#p_f'))) throw new Error('Chọn tháng bắt đầu tính giảm trừ');
      if (v('#p_to') && v('#p_to') < v('#p_f')) throw new Error('"Đến hết tháng" phải từ tháng bắt đầu trở đi');
      const b = { full_name: v('#p_n'), relationship: v('#p_r'), birth_date: v('#p_b'), id_number: v('#p_i'), tax_code: v('#p_t'), from_month: v('#p_f'), to_month: v('#p_to'), note: v('#p_note') };
      x ? await PATCH('/api/dependents/' + x.id, b) : await POST(`/api/employees/${e.id}/dependents`, b);
      f.close(); toast(x ? 'Đã lưu' : 'Đã thêm người phụ thuộc'); await draw();
    });
    f.querySelector('#p_n').focus();
  }
  try { await draw(); } catch (err) { m.querySelector('#tx_b').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
}

// ---------- Phân quyền ----------
// Giao diện theo PHẠM VI: chọn phòng/bảng ở cột trái → bên phải hiện từng quyền kèm danh sách người đang có quyền đó, thêm/bớt ngay tại chỗ.
async function admRoles(me, box, reload) {
  const [a, o, people] = await Promise.all([GET('/api/assignments'), GET('/api/org'), GET('/api/employees?everyone=1')]);
  const roles = Object.entries(a.roles);
  const desc = k => { const v = a.roles[k], i = v.indexOf(' ('); return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 2, -1)]; };
  const sheetsOf = gid => o.sheets.filter(s => s.group_id === gid);
  const scopes = [{ key: 'all:', type: 'all', id: '', label: 'Toàn hệ thống', lvl: 0 }];
  for (const g of o.groups) { scopes.push({ key: 'group:' + g.id, type: 'group', id: g.id, label: g.name, sub: 'Bảng lương', lvl: 0 }); for (const s of sheetsOf(g.id)) { scopes.push({ key: 'sheet:' + s.id, type: 'sheet', id: s.id, label: s.name, sub: 'Bảng chấm công', lvl: 1 }); for (const d of o.departments.filter(d => d.sheet_id === s.id)) scopes.push({ key: 'department:' + d.id, type: 'department', id: d.id, label: d.name, sub: 'Bộ phận (chỉ quyền Chấm công / Xem chấm công)', lvl: 2 }); } }
  for (const s of o.sheets.filter(s => !s.group_id)) scopes.push({ key: 'sheet:' + s.id, type: 'sheet', id: s.id, label: s.name, sub: 'Bảng chấm công (chưa thuộc bảng lương)', lvl: 0 });
  const cur0 = sessionStorage.getItem('pr_scope'); let cur = scopes.find(x => x.key === cur0) || scopes[0];
  const autoBy = new Map(); for (const x of a.auto) (autoBy.get(x.sso_user_id) || autoBy.set(x.sso_user_id, []).get(x.sso_user_id)).push(x);
  const byUser = new Map(); for (const x of a.assignments) (byUser.get(x.sso_user_id) || byUser.set(x.sso_user_id, []).get(x.sso_user_id)).push(x);
  const label = p => `${p.full_name}${p.positions ? ' — ' + p.positions : ''}${p.email ? ' · ' + p.email : ''}`;
  const byLabel = new Map(people.employees.map(p => [label(p), p]));
  const autoIn = sc => a.auto.filter(x => x.scope_type === sc.type && (x.scope_id || '') === sc.id);
  const count = sc => autoIn(sc).length + a.assignments.filter(x => x.scope_type === sc.type && (x.scope_id || '') === sc.id).length;
  function draw() {
    const inScope = a.assignments.filter(x => x.scope_type === cur.type && (x.scope_id || '') === cur.id);
    const roleCards = roles.filter(([k]) => k !== 'admin' && (a.scopesOf[k] || ['all']).includes(cur.type)).map(([k]) => {
      const [t, d] = desc(k), list = inScope.filter(x => x.role === k), au = autoIn(cur).filter(x => x.role === k);
      return `<div class="rolecard"><div class="row"><b class="grow">${esc(t)}</b><span class="badge">${list.length + au.length}</span></div>${d ? `<div class="muted small">${esc(d)}</div>` : ''}
        ${k === 'l1' || k === 'director' ? `<div class="small" style="color:#0f766e;margin:4px 0">✔ Tự động từ chức vụ SSO — không cần gán tay. ${k === 'l1' ? 'Trưởng phòng / Giám đốc nhà máy; phòng chưa có Trưởng thì Phó phòng / P. Giám đốc nhà máy.' : 'Người có chức vụ "Giám đốc" trong SSO.'}</div>` : ''}
        <div style="margin:6px 0">${au.map(x => `<span class="pill" title="${esc(x.reason)}"><b>${esc(x.full_name)}</b> <span class="badge">tự động</span></span>`).join('')}${list.map(x => `<span class="pill"><b>${esc(x.full_name || x.sso_user_id)}</b><a href="#" data-del="${x.id}" title="Gỡ quyền này">✕</a></span>`).join('') || (au.length ? '' : '<span class="muted small">Chưa có ai</span>')}</div>
        ${k === 'l1' || k === 'director' ? '' : `<div class="row"><input list="ppl" data-add="${esc(k)}" placeholder="+ Thêm người (gõ tên)…" style="flex:1;min-width:160px"><button class="btn sm" data-addbtn="${esc(k)}">Thêm</button></div>`}</div>`;
    }).join('');
    $('#rp').innerHTML = `<h2 style="margin-top:0">${esc(cur.label)} <span class="muted small">${esc(cur.sub || '')}</span></h2>
      <div class="muted small">${cur.type === 'group' ? 'Quyền gán ở đây áp dụng cho mọi bảng chấm công thuộc bảng lương này.' : cur.type === 'all' ? 'Quyền gán ở đây áp dụng cho toàn bộ hệ thống.' : cur.type === 'department' ? 'Phạm vi bộ phận: người được gán chỉ thấy và chấm công cho nhân sự của bộ phận này (không gửi duyệt cả bảng, không xuất Excel). Các quyền Cài đặt chấm công, Quản lý nhân sự, Quản lý hệ số… chỉ gán ở mục "Toàn hệ thống".' : 'Quyền gán ở đây chỉ áp dụng cho bảng chấm công này.'}</div><div class="rolegrid">${roleCards}</div>`;
    $('#rp').querySelectorAll('[data-del]').forEach(x => x.onclick = guard(async e => { e.preventDefault(); await DEL('/api/assignments/' + x.dataset.del); sessionStorage.setItem('pr_scope', cur.key); reload(); }));
    $('#rp').querySelectorAll('[data-addbtn]').forEach(btn => btn.onclick = guard(async () => {
      const inp = $('#rp').querySelector(`[data-add="${btn.dataset.addbtn}"]`), p = byLabel.get(inp.value.trim()) || people.employees.find(x => x.full_name.toLowerCase() === inp.value.trim().toLowerCase());
      if (!p) throw new Error('Hãy chọn một người trong danh sách gợi ý');
      await POST('/api/assignments', { userId: p.sso_user_id, roles: [btn.dataset.addbtn], scopes: [{ type: cur.type, id: cur.id }] });
      toast('Đã thêm quyền'); sessionStorage.setItem('pr_scope', cur.key); reload();
    }));
    box.querySelectorAll('#sl [data-k]').forEach(el => el.classList.toggle('on', el.dataset.k === cur.key));
  }
  box.innerHTML = `<div class="card"><h2>Gán quyền theo phòng / bảng</h2><div class="muted small">Chọn bảng ở cột trái → bên phải là từng quyền và những người đang giữ quyền đó. Gõ tên để thêm, bấm ✕ để gỡ — không còn nhầm phòng với quyền.</div>
    <datalist id="ppl">${people.employees.map(p => `<option value="${esc(label(p))}">`).join('')}</datalist>
    <div class="scopesplit"><div class="scopelist" id="sl">${scopes.map(s => `<a href="#" class="scopeitem" data-k="${esc(s.key)}" style="padding-left:${10 + s.lvl * 16}px"><span>${s.lvl ? '↳ ' : ''}${esc(s.label)}</span><span class="badge">${count(s)}</span></a>`).join('')}</div><div id="rp" class="scopepanel"></div></div></div>
  <div class="card"><h2>Tổng hợp theo người</h2><div class="scroll"><table><thead><tr><th style="width:26%">Người dùng</th><th>Quyền · phạm vi (bấm ✕ để gỡ)</th><th></th></tr></thead><tbody>${[...byUser].map(([uid, list]) => `<tr><td><b>${esc(list[0].full_name || uid)}</b><div class="muted small">${esc(list[0].email || '')}</div></td><td>${list.map(x => `<span class="pill"><b>${esc(x.role_label.split(' (')[0])}</b> · ${esc(x.scope_label)}<a href="#" data-del2="${x.id}" title="Gỡ">✕</a></span>`).join(' ')}</td><td><button class="btn red sm" data-clr="${esc(uid)}">Xoá hết</button></td></tr>`).join('') + [...autoBy].filter(([uid]) => !byUser.has(uid)).map(([uid, list]) => `<tr><td><b>${esc(list[0].full_name)}</b></td><td>${list.map(x => `<span class="pill"><b>${esc(x.role_label.split(' (')[0])}</b> · ${esc(x.scope_label)} <span class="badge">tự động</span></span>`).join(' ')}</td><td></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Chưa gán quyền cho ai.</td></tr>'}</tbody></table></div>
    <div class="muted small" style="margin-top:6px"><b>Tự động từ SSO:</b> Cấp 1 (Trưởng phòng / Giám đốc nhà máy, hoặc Phó phòng / P. Giám đốc nhà máy nếu phòng chưa có Trưởng) và Giám đốc công ty. <b>Gán tay:</b> Người chấm công, Cấp 2 (nhận công &amp; chạy lương), Cấp 3 (kiểm soát cuối), Hệ số/đơn giá, quyền chỉ xem.</div></div>`;
  box.querySelectorAll('#sl [data-k]').forEach(el => el.onclick = e => { e.preventDefault(); cur = scopes.find(x => x.key === el.dataset.k); sessionStorage.setItem('pr_scope', cur.key); draw(); });
  box.querySelectorAll('[data-del2]').forEach(x => x.onclick = guard(async e => { e.preventDefault(); await DEL('/api/assignments/' + x.dataset.del2); reload(); }));
  box.querySelectorAll('[data-clr]').forEach(b => b.onclick = guard(async () => { if (!await confirmBox('Xoá toàn bộ quyền của người này?')) return; await DEL('/api/assignments/user/' + encodeURIComponent(b.dataset.clr)); reload(); }));
  const admins = a.assignments.filter(x => x.role === 'admin');
  box.insertAdjacentHTML('afterbegin', `<div class="card" style="border-left:4px solid #b45309"><h2 style="margin:0">Quản trị viên — quyền như Admin</h2>
    <div class="muted small" style="margin:4px 0 8px">Người được thêm ở đây có <b>toàn quyền như Admin</b> (cấu hình, phân quyền, nhân sự, mở khoá, xem mọi bảng). Dùng cho Giám đốc hoặc người cần toàn quyền. Gỡ bằng nút ✕. Tài khoản Admin của SSO luôn là quản trị.</div>
    <div style="margin:6px 0">${admins.map(x => `<span class="pill"><b>${esc(x.full_name || x.sso_user_id)}</b><a href="#" data-deladm="${x.id}" title="Gỡ quyền quản trị" style="margin-left:6px">✕</a></span>`).join('') || '<span class="muted small">Chưa có ai được gán thêm.</span>'}</div>
    <div class="row"><input list="ppl" id="adm_add" placeholder="+ Thêm quản trị viên (gõ tên)…" style="flex:1;min-width:200px"><button class="btn sm" id="adm_btn">Cấp quyền Admin</button></div></div>`);
  box.querySelectorAll('[data-deladm]').forEach(x => x.onclick = guard(async e => { e.preventDefault(); if (!await confirmBox('Gỡ quyền quản trị của người này?')) return; await DEL('/api/assignments/' + x.dataset.deladm); reload(); }));
  $('#adm_btn').onclick = guard(async () => {
    const v = $('#adm_add').value.trim(), p = byLabel.get(v) || people.employees.find(x => x.full_name.toLowerCase() === v.toLowerCase());
    if (!p) throw new Error('Hãy chọn một người trong danh sách gợi ý');
    if (!await confirmBox(`Cấp TOÀN QUYỀN Admin cho ${p.full_name}?`)) return;
    await POST('/api/assignments', { userId: p.sso_user_id, roles: ['admin'], scopes: [{ type: 'all', id: '' }] }); toast('Đã cấp quyền quản trị'); reload();
  });
  const sv = (await GET('/api/reports/self-view')).enabled;
  box.insertAdjacentHTML('afterbegin', `<div class="card selfcard"><div class="row"><div class="grow"><h2 style="margin:0">Cho mọi nhân sự xem lương của mình</h2>
    <div class="muted small" style="margin-top:4px">Khi <b>BẬT</b>: tất cả nhân sự đăng nhập bằng SSO (kể cả người không có quyền xem bảng lương) thấy thêm mục <b>"Lương của tôi"</b> — chỉ xem được lương <b>của chính mình</b> (các tháng đã được Giám đốc khoá) và biểu đồ so sánh lương giữa các tháng, giữa các năm. Không xem được lương người khác, không sửa được gì.</div></div>
    <span class="badge ${sv ? 'locked' : 'draft'}">${sv ? 'Đang BẬT' : 'Đang TẮT'}</span><button class="btn ${sv ? 'red' : ''}" id="svtoggle">${sv ? 'Tắt' : 'Bật cho tất cả nhân sự'}</button></div></div>`);
  $('#svtoggle').onclick = guard(async () => { if (!sv && !await confirmBox('Bật cho TẤT CẢ nhân sự xem lương đã khoá của chính mình?')) return; await PUT('/api/reports/self-view', { enabled: !sv }); toast(sv ? 'Đã tắt' : 'Đã bật'); reload(); });
  draw();
}

// ---------- Cấu hình ----------
async function admCfg(me, box, reload) {
  const [c, o, agr, crr] = await Promise.all([GET('/api/config'), GET('/api/org'), GET('/api/workdays/allowance-groups'), GET('/api/workdays/code-rates')]);
  const AGS = agr.groups, rateBy = {}; for (const r of crr.rates) (rateBy[r.code] ||= []).push(r);
  const KIND_TXT = { night: 'Làm đêm', extra: 'Làm thêm / sửa chữa' };
  const SCOPE_TXT = { both: 'Lương + thưởng', salary: 'Chỉ lương', bonus: 'Chỉ thưởng', none: '<b style="color:#b45309">Không tính lương</b>' }, scopeOpts = [{ v: 'both', t: 'Lương + thưởng (mặc định)' }, { v: 'salary', t: 'Chỉ lương (bảo hiểm)' }, { v: 'bonus', t: 'Chỉ thưởng' }, { v: 'none', t: 'Không tính lương, thưởng (vẫn tính ăn ca nếu có tiền ăn / suất ăn)' }];
  const rateTxt = x => { const rs = rateBy[x.code] || []; if (!x.pct_kind && !rs.length) return '<span class="muted">100% (mặc định)</span>'; return `<b>${KIND_TXT[x.pct_kind || 'extra']}</b>: ` + (rs.length ? rs.map(r => `${r.allowance_group_id ? esc(AGS.find(g => g.id === r.allowance_group_id)?.name || '?') : 'mọi nhóm'} ${Number(r.pct)}%`).join('; ') : 'chưa nhập %'); };
  const s = c.settings, mt = Object.fromEntries(c.mealTypes.map(m => [m.id, m.name])), today = new Date().toISOString().slice(0, 10);
  const cmBy = {}; for (const x of c.codeMeals) (cmBy[x.code] ||= []).push(x);
  // mức tiền ăn đang hiệu lực hôm nay của (ký hiệu, bảng lương); null = chưa cấu hình
  const mealRow = (code, gid) => { const all = (c.codeMealPrices || []).filter(x => x.code === code && (x.group_id || null) === (gid || null)); return all.filter(x => ymd(x.effective_from) <= today).sort((a, b) => ymd(b.effective_from).localeCompare(ymd(a.effective_from)) || b.id - a.id)[0] || all.sort((a, b) => ymd(a.effective_from).localeCompare(ymd(b.effective_from)))[0] || null; };
  const mealNow = (code, gid) => { const r = mealRow(code, gid); return r ? Number(r.amount) : null; };
  const mpEff = window.__mpEff || today;   // giữ ngày hiệu lực vừa chọn sau khi lưu (không nhảy về hôm nay)
  box.innerHTML = `
  <div class="card"><h2>Cài đặt chung</h2><div class="row">
    <label>Tên công ty</label><input id="s_cn" value="${esc(s.company_name)}">
    <label>Năm nhỏ nhất</label><input id="s_y0" type="number" placeholder="Tự động" style="width:100px" value="${esc(s.year_min)}">
    <label>Năm lớn nhất</label><input id="s_y1" type="number" placeholder="Tự động" style="width:100px" value="${esc(s.year_max)}">
    <label>Địa danh in trên bảng</label><input id="s_pl" style="width:140px" value="${esc(s.place || 'Hà Nội')}"></div>
    <div class="row"><label>Ở nhà máy, "Trưởng phòng" in là</label><input id="s_th" style="width:190px" value="${esc(s.plant_title_head ?? 'Giám đốc NM')}"><label>"Phó phòng" in là</label><input id="s_td" style="width:190px" value="${esc(s.plant_title_deputy ?? 'P. Giám đốc NM')}"><span class="muted small">Chỉ áp dụng cho bảng lương loại Nhà máy; để trống = giữ nguyên chức danh SSO.</span></div>
    <div class="row"><label><input type="checkbox" id="s_l1" ${s.require_l1 !== 'false' ? 'checked' : ''}> Bắt buộc cấp 1 duyệt trước khi gửi văn phòng</label><label><input type="checkbox" id="s_mn" ${s.meal_in_net !== 'false' ? 'checked' : ''}> Cộng tiền ăn vào thực lĩnh</label><button class="btn" id="s_save">Lưu cài đặt</button></div>
    <div class="muted small">Danh sách chọn năm ở mọi trang chạy từ "Năm nhỏ nhất" đến "Năm lớn nhất" — muốn dùng tới năm nào thì tăng "Năm lớn nhất" ở đây.</div></div>
  <div class="card"><h2>Phương pháp tính tiền làm lễ, làm thêm</h2>
    <div class="muted small">Hai phương pháp chỉ khác nhau ở <b>tiền làm lễ, tết</b> và <b>tiền công vượt chuẩn</b> khi có ca đêm. Lương, thưởng, tiền làm đêm 30%, bảo hiểm, ăn ca, ký hiệu làm thêm (LT…) và phụ cấp sửa chữa tính như nhau. Đổi phương pháp xong bấm <b>Tính lại</b> các bảng lương nháp; bảng đã khoá giữ nguyên số cũ. Popup chi tiết từng người ghi rõ đang tính theo phương pháp nào.</div>
    <div class="small" style="margin:6px 0">Ký hiệu dùng chung: <b>Đơn giá ngày</b> = (lương bảo hiểm + phụ cấp + thưởng) ÷ công tối thiểu (hoặc công chuẩn). <b>% lễ</b> cài ở lịch ngày lễ (vd 300%), <b>% tăng ca</b> là hệ số trả cho công vượt chuẩn (vd 200%), <b>30% làm đêm</b> cài ở ký hiệu công.</div>
    <label style="display:block;margin-top:8px"><input type="radio" name="s_pm" value="A" ${s.premium_method === 'A' ? 'checked' : ''}> <b>Theo Nghị định 145/2020/NĐ-CP</b> (hướng dẫn Điều 98 Bộ luật Lao động 2019): tính theo từng ca</label>
    <ul class="small" style="margin:4px 0 0 22px">
      <li>Tiền làm đêm = đơn giá ngày × công đêm × 30%</li>
      <li>Tiền làm lễ = đơn giá ngày × công lễ × (% lễ − 100%) + đơn giá ngày × công đêm ngày lễ × 20% × % lễ</li>
      <li>Tiền công vượt chuẩn = đơn giá ngày × công vượt chuẩn × % tăng ca + đơn giá ngày × công đêm vượt chuẩn × 20% × % tăng ca</li>
      <li>Ví dụ: ca ngày ngày lễ 300% = <b>300%</b>; ca đêm ngày lễ 300% = 300% + 30% + 20% × 300% = <b>390%</b>; ca đêm vượt chuẩn (tăng ca 200%) = 200% + 30% + 20% × 200% = <b>270%</b>.</li>
      <li>Căn cứ: Điều 98 Bộ luật Lao động 2019; Điều 55, 56, 57 Nghị định 145/2020/NĐ-CP (làm thêm giờ vào ban đêm được trả thêm 20% tiền lương làm việc ban ngày của ngày đó).</li>
    </ul>
    <label style="display:block;margin-top:8px"><input type="radio" name="s_pm" value="B" ${s.premium_method !== 'A' ? 'checked' : ''}> <b>Theo quy chế lương riêng</b> (như bảng Excel nhà máy): tiền làm đêm bình quân cộng vào đơn giá</label>
    <ul class="small" style="margin:4px 0 0 22px">
      <li>Tiền làm đêm = đơn giá ngày × công đêm × 30% (như trên)</li>
      <li>Đơn giá ngày có đêm = (lương bảo hiểm + phụ cấp + thưởng + tiền làm đêm cả tháng) ÷ công tối thiểu</li>
      <li>Tiền làm lễ = đơn giá ngày có đêm × công lễ × (% lễ − 100%)</li>
      <li>Tiền công vượt chuẩn = đơn giá ngày có đêm × công vượt chuẩn × % tăng ca</li>
      <li>Ca đêm ngày lễ không cộng riêng phần đêm theo ca; thay vào đó mọi công lễ / vượt chuẩn (cả ca ngày) tính trên đơn giá đã gồm tiền đêm bình quân của tháng. Tương ứng bảng Excel: T = công đêm × S × 30% ÷ 22, U = (S + T) × công làm thêm × 2 ÷ 22, với S = lương + thưởng + phụ cấp.</li>
    </ul>
    <div class="row" style="margin-top:8px"><button class="btn" id="pm_save">Lưu phương pháp tính</button></div></div>
  <div class="card"><h2>Loại trừ tài khoản dùng chung</h2><div class="muted small">Mỗi dòng một cụm từ (không phân biệt hoa thường). Ai có <b>tên, tài khoản hoặc email</b> chứa cụm từ này sẽ bị loại khỏi mọi bảng chấm công / lương khi đồng bộ từ SSO (vd tài khoản Admin, email chung của từng nhà máy/phòng). Chỉ so với <b>tên người</b> (phần trước dấu " - ", không gồm chức danh), tài khoản và email. Ví dụ: <code>admin</code>, <code>@phong-</code>. Đừng nhập tên nhà máy (vd NMTĐ Suối Sập 3) vì sẽ trùng cả nhân viên.</div>
    <textarea id="s_ex" rows="5" style="width:100%;margin-top:6px" placeholder="admin&#10;@phong-">${esc(s.exclude_patterns || '')}</textarea>
    <div class="row" style="margin-top:6px"><button class="btn" id="s_exsave">Lưu &amp; áp dụng ngay</button>${(c.excludeCounts || []).length ? `<div class="small" style="margin:6px 0">${c.excludeCounts.map(x => `<span class="chip" style="background:${x.count > 3 ? '#fee2e2' : '#e5e7eb'}">${esc(x.pattern)} → loại ${x.count} người</span>`).join(' ')} ${c.excludeCounts.some(x => x.count > 3) ? '<b style="color:#b91c1c">Cụm đỏ loại nhiều người: kiểm tra xem có loại nhầm nhân viên không.</b>' : ''}</div>` : ''}<span class="muted small">Đang loại ${(c.excluded || []).length} tài khoản${(c.excluded || []).length ? ': ' + (c.excluded || []).slice(0, 30).map(x => esc(x.name)).join(', ') + ((c.excluded || []).length > 30 ? '…' : '') : ''}</span></div></div>
  <div class="card"><h2>Xếp loại lao động &amp; an toàn</h2><div class="muted small">Xếp loại lao động (A–E) nhập ở bảng chấm công: <b>nhân hệ số</b> vào lương theo hệ số và thưởng định kỳ tháng (không nhân vào thưởng/trừ đột xuất). Xếp loại an toàn tháng (A/B) quyết định tỷ lệ hưởng <b>phụ cấp an toàn</b> của từng người (hệ số "Phụ cấp an toàn" ở trang Hệ số): A = 100%, B = mất phụ cấp. Bật/tắt từng loại cho từng bảng chấm công ở Tổ chức › Sửa bảng chấm công.</div>
    <div class="row" style="margin-top:8px"><b>Lao động:</b>${(c.laborGrades || []).map(g => `<label>${g.grade} ×</label><input type="number" step="0.01" min="0" style="width:70px" data-lg="${g.grade}" value="${Number(g.factor)}">`).join('')}</div>
    <div class="row" style="margin-top:8px"><b>An toàn (% phụ cấp an toàn được hưởng):</b>${(c.safetyGrades || []).map(g => `<label>${g.grade}</label><input type="number" step="5" min="0" max="100" style="width:70px" data-sg="${g.grade}" value="${Math.round(Number(g.factor) * 100)}">%`).join('')}<label>Hệ số phụ cấp</label><select id="s_sc"><option value="">(tự nhận: loại có chữ "an toàn")</option>${c.coefTypes.filter(k => k.kind === 'amount').map(k => `<option value="${esc(k.code)}" ${s.safety_coef === k.code ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select><button class="btn" id="g_save">Lưu xếp loại</button></div></div>
  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Ký hiệu công & ăn ca theo công</h2><button class="btn sm" id="addC">+ Ký hiệu</button></div>
    <table><thead><tr><th>Ký hiệu</th><th>Tên</th><th class="n">Công ngày</th><th class="n">Công đêm</th><th class="n">Tổng công</th><th class="n">Tiền ăn ca</th><th class="n" title="Số suất khi ký hiệu được chấm ở bảng chấm ăn ca riêng (Kiểu 2) / ăn chờ ca (Kiểu 3). 0 = không tính suất ăn">Suất ăn (bảng riêng)</th><th title="Nghỉ bù / nghỉ phép rơi vào ngày nghỉ hằng tuần hoặc ngày lễ thì không cộng công">Không tính ngày nghỉ</th><th title="Công của ký hiệu hưởng bao nhiêu % so với công tiêu chuẩn, theo nhóm phụ cấp. Không cài = 100%.">% so với công tiêu chuẩn</th><th title="Nghỉ phép: chỉ hưởng lương, không thưởng">Tính cho</th><th title="Ký hiệu làm thêm (LT…): không vào công thường, trả riêng theo %">Làm thêm</th><th title="Số công trực bị nghỉ (NP1 = 1, NP2 = 2): dùng để đếm công tối thiểu của nhà máy, không cộng vào công người nghỉ">Công nghỉ</th><th>Dùng</th><th></th></tr></thead><tbody>${c.codes.map(x => `<tr><td><span class="chip" style="background:${esc(x.color)}">${esc(x.code)}</span></td><td>${esc(x.name)}</td><td class="n">${x.work_day}</td><td class="n">${x.work_night}</td><td class="n"><b>${x.work_value}</b></td><td class="n">${mealNow(x.code, null) ? money(mealNow(x.code, null)) : '<span class="muted">—</span>'}</td><td class="n">${Number(x.meal_qty) ? Number(x.meal_qty) : '<span class="muted">—</span>'}</td><td>${x.off_day_zero ? '✓' : '—'}</td><td class="small">${rateTxt(x)} <button class="btn sec sm" data-er="${esc(x.code)}">Cài %</button></td><td>${SCOPE_TXT[x.pay_scope || 'both']}</td><td>${x.is_ot ? '✓' : '—'}</td><td class="n">${Number(x.leave_value) ? '<b>' + Number(x.leave_value) + '</b>' : '—'}</td><td>${x.active ? '✓' : '—'}</td><td style="white-space:nowrap"><button class="btn sec sm" data-ec="${esc(x.code)}">Sửa</button> <button class="btn red sm" data-dc="${esc(x.code)}">Xoá</button></td></tr>`).join('')}</tbody></table></div>
  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Nhóm tính phụ cấp</h2><button class="btn sm" id="addAG">+ Nhóm</button></div>
    <div class="muted small" style="margin:6px 0">Mỗi nhân sự thuộc tối đa một nhóm (gán ở tab <b>Nhân sự</b>, cột "Nhóm phụ cấp"). Cùng một ký hiệu (vd Sửa chữa) mỗi nhóm có thể hưởng % khác nhau — cài ở nút <b>Cài %</b> trong bảng ký hiệu công phía trên. Người không thuộc nhóm nào dùng dòng "mọi nhóm" hoặc 100%.</div>
    ${AGS.length ? `<table><thead><tr><th>Tên nhóm</th><th class="n">Số người</th><th>Ghi chú</th><th>Dùng</th><th></th></tr></thead><tbody>${AGS.map(g => `<tr><td><b>${esc(g.name)}</b></td><td class="n">${g.employee_count}</td><td class="small">${esc(g.note || '')}</td><td>${g.active ? '✓' : '—'}</td><td><button class="btn sec sm" data-eag="${g.id}">Sửa</button> <button class="btn red sm" data-dag="${g.id}">Xoá</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Chưa có nhóm nào (vd: Vận hành, Sửa chữa, Văn phòng…).</div>'}</div>
  <div class="card"><h2>Tiền ăn ca theo ký hiệu công</h2><div class="muted small">Mỗi ngày công có ký hiệu nào thì tính tiền ăn theo mức của ký hiệu đó (vd K1 = 35.000, K1,3 = 70.000, ký hiệu để trống/0 = không có tiền ăn). <b>Một mức chung cho mọi bảng lương.</b> Mỗi lần đổi mức ghi nhận theo <b>ngày hiệu lực</b> (giữ lịch sử); mức nhập lần đầu áp dụng cho cả các tháng trước đó. Đây là cách tính ăn ca duy nhất: số ngày công theo từng ký hiệu × mức của ký hiệu đó.</div>
    <div class="row" style="margin-top:8px"><label>Hiệu lực từ</label><input id="mp_eff" type="date" value="${mpEff}"><button class="btn" id="mp_save">Lưu bảng tiền ăn</button></div>
    <div class="scroll" style="max-height:none"><table><thead><tr><th>Ký hiệu</th><th>Tên</th><th class="n">Mức tiền ăn / ngày (đ)</th><th>Đang áp dụng từ</th></tr></thead><tbody>${c.codes.filter(x => x.active).map(x => `<tr><td><span class="chip" style="background:${esc(x.color)}">${esc(x.code)}</span></td><td>${esc(x.name)}</td>
      ${[null].map(gid => `<td class="n"><input type="number" min="0" step="1000" style="width:110px;text-align:right" data-mp="${esc(x.code)}" data-g="${gid || ''}" data-v0="${mealNow(x.code, gid) ?? ''}" value="${mealNow(x.code, gid) ?? ''}"></td><td class="small">${mealRow(x.code, gid) ? fmtDate(mealRow(x.code, gid).effective_from) : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <h3 style="margin:14px 0 4px">Lịch sử thay đổi mức tiền ăn</h3>
    <div class="muted small" style="margin-bottom:4px">Mỗi lần đổi mức được giữ lại kèm ngày hiệu lực, mức cũ → mức mới, người nhập và thời điểm nhập. Tháng nào tính theo mức có hiệu lực tại <b>cuối tháng đó</b>. Xoá một dòng nhập sai sẽ trả về mức trước đó.</div>
    <div class="scroll" style="max-height:340px"><table><thead><tr><th>Hiệu lực từ</th><th>Ký hiệu</th><th class="n">Mức cũ</th><th class="n">Mức mới</th><th class="n">Chênh lệch</th><th>Người nhập</th><th>Nhập lúc</th><th></th></tr></thead><tbody>${(c.codeMealPrices || []).filter(r => !r.group_id).map(r => { const d = r.prev_amount === null || r.prev_amount === undefined ? null : Number(r.amount) - Number(r.prev_amount); return `<tr><td><b>${ymd(r.effective_from)}</b></td><td>${esc(r.code)}</td><td class="n">${r.prev_amount === null || r.prev_amount === undefined ? '<span class="muted">(mới)</span>' : money(r.prev_amount)}</td><td class="n"><b>${money(r.amount)}</b></td><td class="n">${d === null ? '' : `<span style="color:${d >= 0 ? '#166534' : '#b91c1c'}">${d >= 0 ? '▲ +' : '▼ '}${money(d)}</span>`}</td><td class="small">${esc(r.by_name || r.created_by || '')}</td><td class="small">${r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : ''}</td><td><button class="btn red sm" data-dmp="${r.id}">Xoá</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Chưa có thay đổi nào</td></tr>'}</tbody></table></div></div>
  ${c.mealRates ? `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Lương cơ sở</h2><button class="btn sm" id="addB">+ Thêm mức mới</button></div><div class="muted small">Giống đơn giá thưởng: mỗi mức có <b>loại nhân sự</b> (Quản lý / Hành chính / Công nhân; "Tất cả" = dùng chung khi không có mức riêng) và <b>ngày hiệu lực</b>. Lương bảo hiểm = hệ số BH × lương cơ sở của loại nhân sự đó. Mức mới không ghi đè mức cũ nên xem lại được lịch sử.</div>
    <table><thead><tr><th>Loại nhân sự</th><th class="n">Lương cơ sở</th><th>Hiệu lực từ</th><th>Ghi chú</th><th style="width:110px"></th></tr></thead><tbody>${c.baseWages.map(b => `<tr><td>${b.employee_type ? empType(b.employee_type) : 'Tất cả'}</td><td class="n"><b>${money(b.value)}</b></td><td>${ymd(b.effective_from)}</td><td>${esc(b.note || '')}</td><td style="white-space:nowrap"><button class="btn sec sm" data-eb="${b.id}">Sửa</button> <button class="btn red sm" data-db="${b.id}">Xoá</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Chưa có — bắt buộc nhập (cho từng loại nhân sự hoặc một mức "Tất cả") trước khi chạy lương</td></tr>'}</tbody></table></div>
  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Đơn giá lương (để tính thưởng)</h2><button class="btn sm" id="addU">+ Thêm đơn giá</button></div><div class="muted small">Ưu tiên: phòng cụ thể > bảng lương > chung; kèm loại nhân sự (quản lý / hành chính / công nhân). Nhờ vậy 2 bộ phận trong cùng 1 nhà máy có thể có 2 đơn giá khác nhau.</div>
    <table><thead><tr><th>Bảng lương</th><th>Phòng</th><th>Loại nhân sự</th><th class="n">Đơn giá</th><th>Hiệu lực từ</th><th style="width:110px"></th></tr></thead><tbody>${c.unitPrices.map(u => `<tr><td>${esc(u.group_name || 'Chung')}</td><td>${esc(u.department_name || 'Tất cả')}</td><td>${u.employee_type ? empType(u.employee_type) : 'Tất cả'}</td><td class="n"><b>${money(u.amount)}</b></td><td>${ymd(u.effective_from)}</td><td style="white-space:nowrap"><button class="btn sec sm" data-eu="${u.id}">Sửa</button> <button class="btn red sm" data-du="${u.id}">Xoá</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Loại hệ số</h2><button class="btn sm" id="addK">+ Thêm</button></div><div class="muted small">Bảo hiểm: nhân lương cơ sở · Thưởng: nhân đơn giá · Số tiền: cộng cố định · Lương đóng BH thỏa thuận: nhập <b>số tiền</b> lương đóng bảo hiểm của người đó; khi lớn hơn 0 thì thay cho hệ số BH × lương cơ sở (vẫn chia theo ngày công, nhân xếp loại lao động; các khoản trừ % bảo hiểm tính theo số này).</div>
    <table><tbody>${c.coefTypes.map(k => `<tr><td>${esc(k.code)}</td><td>${esc(k.name)}</td><td>${({ insurance: 'Bảo hiểm', bonus: 'Thưởng', amount: 'Số tiền', ins_amount: 'Lương đóng BH thỏa thuận (số tiền thay hệ số BH × lương cơ sở)' })[k.kind] || esc(k.kind)}${k.is_total ? ' <span class="badge">Tổng tự cộng</span>' : ''}</td><td>${k.active ? '✓' : '—'}</td><td><button class="btn sec sm" data-ek="${esc(k.code)}">Sửa</button></td></tr>`).join('')}</tbody></table></div>
  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Khoản trừ định kỳ</h2><button class="btn sm" id="addX">+ Thêm</button></div>
    <div class="muted small" style="margin-bottom:6px">Đánh dấu <b>Được trừ khi tính thuế TNCN</b> cho bảo hiểm bắt buộc người lao động đóng (BHXH, BHYT, BHTN); kinh phí công đoàn và các khoản trừ khác không được trừ khi tính thuế.</div>
    <table><thead><tr><th>Khoản trừ</th><th>Cách tính</th><th>Thuế TNCN</th><th>Dùng</th><th></th></tr></thead><tbody>${c.dedTypes.map(k => `<tr><td>${esc(k.name)}</td><td>${k.calc === 'pct_insurance' ? k.value + '% (lương bảo hiểm + phụ cấp)' : money(k.value) + ' đ cố định'}</td><td>${k.pit_deductible ? '<span class="badge locked">Được trừ khi tính thuế TNCN</span>' : '<span class="muted small">Không trừ khi tính thuế</span>'}</td><td>${k.active ? '✓' : '—'}</td><td><button class="btn sec sm" data-ex="${esc(k.code)}">Sửa</button></td></tr>`).join('')}</tbody></table></div>
  <div class="card" id="pitcard"><h2>Thuế thu nhập cá nhân (TNCN)</h2><div id="pitbox"></div></div>
  ${me.isAdmin ? '<div class="card" id="fundcard"><div class="row"><h2 class="grow" style="margin:0">Quỹ lương (tổng hợp lương theo khối)</h2><button class="btn sm" id="addF">+ Quỹ lương</button></div><div id="fundbox"></div></div>' : ''}`;
  if (!me.isAdmin) {   // người chỉ có quyền "Cài đặt chấm công" / "Hệ số, đơn giá": chỉ thấy các thẻ thuộc quyền của mình
    const keep = ['Ký hiệu công', 'Nhóm tính phụ cấp', 'Tiền ăn ca', ...(me.assignments.some(x => x.role === 'hr') ? ['Lương cơ sở', 'Đơn giá lương', 'Loại hệ số', 'Khoản trừ', 'Thuế thu nhập cá nhân'] : [])];
    box.querySelectorAll(':scope > .card').forEach(cd => { const h = cd.querySelector('h2'); if (!h || !keep.some(k => h.textContent.trim().startsWith(k))) cd.style.display = 'none'; });
  }
  $('#s_save').onclick = guard(async () => { await PUT('/api/config/settings', { company_name: $('#s_cn').value, year_min: $('#s_y0').value, year_max: $('#s_y1').value, place: $('#s_pl').value, plant_title_head: $('#s_th').value, plant_title_deputy: $('#s_td').value, require_l1: $('#s_l1').checked, meal_in_net: $('#s_mn').checked }); toast('Đã lưu. Tải lại trang để áp dụng danh sách năm.'); });
  $('#pm_save').onclick = guard(async () => { const v = box.querySelector('[name=s_pm]:checked')?.value; if (!v) return toast('Chọn một phương pháp tính'); await PUT('/api/config/settings', { premium_method: v }); toast('Đã lưu. Bấm Tính lại các bảng lương nháp để áp dụng.'); reload(); });
  $('#s_exsave').onclick = guard(async () => { await PUT('/api/config/settings', { exclude_patterns: $('#s_ex').value }); toast('Đã lưu và áp dụng'); reload(); });
  $('#g_save').onclick = guard(async () => { const labor = {}, safety = {}; box.querySelectorAll('[data-lg]').forEach(i => labor[i.dataset.lg] = i.value); box.querySelectorAll('[data-sg]').forEach(i => safety[i.dataset.sg] = Number(i.value) / 100); await PUT('/api/config/settings', { safety_coef: $('#s_sc').value }); await PUT('/api/config/grades', { labor, safety }); toast('Đã lưu xếp loại'); });
  const yn = [{ v: 'true', t: 'Đang dùng' }, { v: 'false', t: 'Ngừng' }];
  const mk = (btn, fn) => { const el = typeof btn === 'string' ? $(btn) : btn; if (el) el.onclick = guard(fn); };
  mk('#addAG', async () => { const r = await ask('Thêm nhóm tính phụ cấp', [{ label: 'Tên nhóm' }, { label: 'Ghi chú' }]); if (r) { await POST('/api/workdays/allowance-groups', { name: r[0], note: r[1] }); toast('Đã thêm'); reload(); } });
  box.querySelectorAll('[data-eag]').forEach(b => mk(b, async () => { const g = AGS.find(x => x.id === b.dataset.eag); const r = await ask('Sửa nhóm ' + g.name, [{ label: 'Tên nhóm', value: g.name }, { label: 'Ghi chú', value: g.note || '' }, { label: 'Trạng thái', type: 'select', options: yn, value: String(g.active) }]); if (r) { await PATCH('/api/workdays/allowance-groups/' + g.id, { name: r[0], note: r[1], active: r[2] }); toast('Đã lưu'); reload(); } }));
  box.querySelectorAll('[data-dag]').forEach(b => mk(b, async () => { if (await confirmBox('Xoá nhóm này? Nhân sự thuộc nhóm sẽ về "không thuộc nhóm", các dòng % của nhóm bị xoá.')) { await DEL('/api/workdays/allowance-groups/' + b.dataset.dag); reload(); } }));
  // % hưởng của ký hiệu so với công tiêu chuẩn: loại tăng (đêm / làm thêm-sửa chữa) + % cho mọi nhóm + % riêng từng nhóm
  box.querySelectorAll('[data-er]').forEach(b => mk(b, async () => {
    const x = c.codes.find(k => k.code === b.dataset.er), rs = rateBy[x.code] || [], pv = gid => rs.find(r => (r.allowance_group_id || '') === gid)?.pct;
    const f = await ask(`% hưởng của ký hiệu ${x.code} so với công tiêu chuẩn`, [
      { label: 'Loại tăng (Làm đêm: tính trên công đêm của ký hiệu · Làm thêm / sửa chữa: tính trên toàn bộ công của ký hiệu)', type: 'select', options: [{ v: '', t: 'Không tăng (100%)' }, { v: 'night', t: 'Làm đêm' }, { v: 'extra', t: 'Làm thêm / sửa chữa' }], value: x.pct_kind || (rs.length ? 'extra' : '') },
      { label: 'Mọi nhóm / người chưa có nhóm (%) — vd 130 = hưởng 130% công tiêu chuẩn; để trống = 100%', type: 'number', step: '1', value: pv('') ?? '' },
      ...AGS.filter(g => g.active).map(g => ({ label: `Nhóm ${g.name} (%) — để trống = dùng dòng "mọi nhóm"`, type: 'number', step: '1', value: pv(g.id) ?? '' }))]);
    if (!f) return;
    const rates = []; if (f[1] !== '') rates.push({ groupId: null, pct: Number(f[1]) });
    AGS.filter(g => g.active).forEach((g, i) => { if (f[2 + i] !== '') rates.push({ groupId: g.id, pct: Number(f[2 + i]) }); });
    await PUT('/api/workdays/code-rates/' + encodeURIComponent(x.code), { kind: f[0], rates }); toast('Đã lưu'); reload();
  }));
  mk('#addC', async () => { const r = await ask('Thêm ký hiệu công', [{ label: 'Ký hiệu' }, { label: 'Tên' }, { label: 'Công ngày (vd: 1)', type: 'number', value: 1, step: '0.25' }, { label: 'Công đêm (vd: 0 hoặc 1)', type: 'number', value: 0, step: '0.25' }, { label: 'Màu', type: 'color', value: '#dcfce7' }, { label: 'Thứ tự', type: 'number', value: 100 }, { label: 'Tính cho', type: 'select', options: scopeOpts, value: 'both' }, { label: 'Ký hiệu làm thêm (LT…)?', type: 'select', options: [{ v: 'false', t: 'Không' }, { v: 'true', t: 'Có' }], value: 'false' }, { label: 'Suất ăn khi chấm ở bảng chấm ăn ca riêng / chờ ca (0 = không tính)', type: 'number', value: 1, step: '0.5' }]); if (r) { await POST('/api/config/codes', { code: r[0], name: r[1], work_day: r[2], work_night: r[3], color: r[4], sort_order: r[5], pay_scope: r[6], is_ot: r[7], meal_qty: r[8] }); reload(); } });
  box.querySelectorAll('[data-ec]').forEach(b => mk(b, async () => { const x = c.codes.find(k => k.code === b.dataset.ec); const r = await ask('Sửa ký hiệu ' + x.code, [{ label: 'Tên', value: x.name }, { label: 'Công ngày', type: 'number', value: x.work_day, step: '0.25' }, { label: 'Công đêm', type: 'number', value: x.work_night, step: '0.25' }, { label: 'Màu', type: 'color', value: x.color }, { label: 'Thứ tự', type: 'number', value: x.sort_order }, { label: 'Trạng thái', type: 'select', options: yn, value: String(x.active) }, { label: 'Rơi vào ngày nghỉ hằng tuần / ngày lễ thì không cộng công (dùng cho nghỉ bù, nghỉ phép)', type: 'select', options: [{ v: 'false', t: 'Vẫn cộng công' }, { v: 'true', t: 'Không cộng công' }], value: String(!!x.off_day_zero) }, { label: 'Ngày công của ký hiệu tính cho', type: 'select', options: scopeOpts, value: x.pay_scope || 'both' }, { label: 'Ký hiệu LÀM THÊM (LT1–LT4…): không vào công thường, trả riêng theo % ở cột %', type: 'select', options: [{ v: 'false', t: 'Không' }, { v: 'true', t: 'Có — làm thêm' }], value: String(!!x.is_ot) }, { label: 'CÔNG NGHỈ: số công trực bị nghỉ khi chấm ký hiệu này (NP1 = 1, NP2 = 2; ký hiệu không nghỉ để 0). Dùng đếm công tối thiểu của nhà máy; không tính vào công người nghỉ', type: 'number', step: '0.5', value: Number(x.leave_value || 0) }, { label: 'Ký hiệu (đổi tên: mọi ô chấm công cũ tự đổi theo)', value: x.code }, { label: 'SUẤT ĂN khi chấm ký hiệu này ở bảng chấm ăn ca riêng (Kiểu 2) / ăn chờ ca (Kiểu 3); 0 = không tính suất ăn. (Kiểu 1 tính theo bảng Tiền ăn ca theo ký hiệu công)', type: 'number', step: '0.5', value: Number(x.meal_qty ?? 1) }]); if (r) { await PATCH('/api/config/codes/' + encodeURIComponent(x.code), { off_day_zero: r[6], pay_scope: r[7], is_ot: r[8], leave_value: r[9], meal_qty: r[11], name: r[0], work_day: r[1], work_night: r[2], color: r[3], sort_order: r[4], active: r[5] }); if (r[10] && r[10] !== x.code) await POST('/api/config/codes/' + encodeURIComponent(x.code) + '/rename', { code: r[10] }); reload(); } }));
  mk('#mp_save', async () => {
    // Gửi mọi ô có số (kể cả chỉ đổi ngày hiệu lực, không đổi tiền): máy chủ chỉ ghi những mức khác với mức đang có hiệu lực tại ngày đó
    const rowsOut = [...box.querySelectorAll('[data-mp]')].filter(i => i.value !== '').map(i => ({ code: i.dataset.mp, groupId: i.dataset.g || null, amount: i.value }));
    if (!rowsOut.length) return toast('Chưa nhập mức tiền ăn nào');
    const r = await POST('/api/config/code-meal-prices/bulk', { effectiveFrom: $('#mp_eff').value, rows: rowsOut });
    window.__mpEff = $('#mp_eff').value;
    toast(r.saved ? `Đã lưu ${r.saved} mức, hiệu lực từ ${fmtDate($('#mp_eff').value)}` : `Các mức này đã có hiệu lực từ ${fmtDate($('#mp_eff').value)}, không cần lưu thêm`); reload(); });
  box.querySelectorAll('[data-dc]').forEach(b => mk(b, async () => { if (await confirmBox(`Xoá ký hiệu ${b.dataset.dc}? Cùng với mức tiền ăn và % đã cài của ký hiệu này. Chỉ xoá được khi chưa có ô chấm công nào dùng.`)) { await DEL('/api/config/codes/' + encodeURIComponent(b.dataset.dc)); toast('Đã xoá'); reload(); } }));
  box.querySelectorAll('[data-dmp]').forEach(b => mk(b, async () => { await DEL('/api/config/code-meal-prices/' + b.dataset.dmp); reload(); }));
  mk('#addB', async () => { const r = await ask('Lương cơ sở mới', [{ label: 'Loại nhân sự', type: 'select', options: [{ v: '', t: 'Tất cả' }, ...EMP_TYPE_OPTS] }, { label: 'Mức (đ)', type: 'number' }, { label: 'Hiệu lực từ', type: 'date', value: today }, { label: 'Ghi chú' }]); if (r) { await POST('/api/config/base-wages', { employeeType: r[0], value: r[1], effectiveFrom: r[2], note: r[3] }); reload(); } });
  box.querySelectorAll('[data-eb]').forEach(b => mk(b, async () => { const x = c.baseWages.find(k => String(k.id) === b.dataset.eb); const r = await ask('Sửa lương cơ sở', [{ label: 'Loại nhân sự', type: 'select', options: [{ v: '', t: 'Tất cả' }, ...EMP_TYPE_OPTS], value: x.employee_type || '' }, { label: 'Mức (đ)', type: 'number', value: Number(x.value) }, { label: 'Hiệu lực từ', type: 'date', value: ymd(x.effective_from) }, { label: 'Ghi chú', value: x.note || '' }]); if (r) { await PATCH('/api/config/base-wages/' + x.id, { employeeType: r[0], value: r[1], effectiveFrom: r[2], note: r[3] }); reload(); } }));
  box.querySelectorAll('[data-db]').forEach(b => mk(b, async () => { await DEL('/api/config/base-wages/' + b.dataset.db); reload(); }));
  mk('#addU', async () => { const r = await ask('Thêm đơn giá lương', [{ label: 'Bảng lương', type: 'select', options: [{ v: '', t: 'Chung (tất cả)' }, ...o.groups.map(g => ({ v: g.id, t: g.name }))] }, { label: 'Phòng / đơn vị', type: 'select', options: [{ v: '', t: 'Tất cả phòng' }, ...o.departments.map(d => ({ v: d.id, t: d.name }))] }, { label: 'Loại nhân sự', type: 'select', options: [{ v: '', t: 'Tất cả' }, ...EMP_TYPE_OPTS] }, { label: 'Đơn giá (đ)', type: 'number' }, { label: 'Hiệu lực từ', type: 'date', value: today }, { label: 'Ghi chú' }]); if (r) { await POST('/api/config/unit-prices', { groupId: r[0], departmentId: r[1], employeeType: r[2], amount: r[3], effectiveFrom: r[4], note: r[5] }); reload(); } });
  box.querySelectorAll('[data-eu]').forEach(b => mk(b, async () => { const x = c.unitPrices.find(k => k.id === b.dataset.eu); const r = await ask('Sửa đơn giá lương', [{ label: 'Bảng lương', type: 'select', options: [{ v: '', t: 'Chung (tất cả)' }, ...o.groups.map(g => ({ v: g.id, t: g.name }))], value: x.group_id || '' }, { label: 'Phòng / đơn vị', type: 'select', options: [{ v: '', t: 'Tất cả phòng' }, ...o.departments.map(d => ({ v: d.id, t: d.name }))], value: x.department_id || '' }, { label: 'Loại nhân sự', type: 'select', options: [{ v: '', t: 'Tất cả' }, ...EMP_TYPE_OPTS], value: x.employee_type || '' }, { label: 'Đơn giá (đ)', type: 'number', value: Number(x.amount) }, { label: 'Hiệu lực từ', type: 'date', value: ymd(x.effective_from) }, { label: 'Ghi chú', value: x.note || '' }]); if (r) { await PATCH('/api/config/unit-prices/' + x.id, { groupId: r[0], departmentId: r[1], employeeType: r[2], amount: r[3], effectiveFrom: r[4], note: r[5] }); reload(); } }));
  box.querySelectorAll('[data-du]').forEach(b => mk(b, async () => { await DEL('/api/config/unit-prices/' + b.dataset.du); reload(); }));
  const kinds = [{ v: 'insurance', t: 'Bảo hiểm (× lương cơ sở)' }, { v: 'bonus', t: 'Thưởng (× đơn giá)' }, { v: 'amount', t: 'Số tiền cố định' }, { v: 'ins_amount', t: 'Lương đóng BH thỏa thuận (số tiền thay hệ số BH × lương cơ sở)' }];
  mk('#addK', async () => { const r = await ask('Thêm loại hệ số', [{ label: 'Mã (không dấu)' }, { label: 'Tên' }, { label: 'Loại', type: 'select', options: kinds, value: 'bonus' }, { label: 'Thứ tự', type: 'number', value: 100 }]); if (r) { await POST('/api/config/coefficient-types', { code: r[0], name: r[1], kind: r[2], sort_order: r[3] }); reload(); } });
  box.querySelectorAll('[data-ek]').forEach(b => mk(b, async () => { const x = c.coefTypes.find(k => k.code === b.dataset.ek); const r = await ask('Sửa hệ số ' + x.code, [{ label: 'Tên', value: x.name }, { label: 'Loại', type: 'select', options: kinds, value: x.kind }, { label: 'Thứ tự', type: 'number', value: x.sort_order }, { label: 'Trạng thái', type: 'select', options: yn, value: String(x.active) }, { label: 'Là TỔNG hệ số thưởng (chỉ loại Thưởng): tự cộng các hệ số thưởng khác, không nhập tay, hiện ở cuối bảng hệ số', type: 'select', options: [{ v: 'false', t: 'Không' }, { v: 'true', t: 'Có — tổng tự cộng' }], value: String(!!x.is_total) }]); if (r) { await PATCH('/api/config/coefficient-types/' + encodeURIComponent(x.code), { name: r[0], kind: r[1], sort_order: r[2], active: r[3], is_total: r[4] === 'true' && r[1] === 'bonus' }); reload(); } }));
  const calcs = [{ v: 'pct_insurance', t: '% của (lương bảo hiểm + phụ cấp)' }, { v: 'fixed', t: 'Số tiền cố định' }];
  const pitDed = { label: 'Được trừ khi tính thuế TNCN (BHXH, BHYT, BHTN bắt buộc: Có; kinh phí công đoàn: Không)', type: 'select', options: [{ v: 'false', t: 'Không' }, { v: 'true', t: 'Có — được trừ khi tính thuế TNCN' }] };
  mk('#addX', async () => { const r = await ask('Thêm khoản trừ định kỳ', [{ label: 'Mã' }, { label: 'Tên' }, { label: 'Cách tính', type: 'select', options: calcs }, { label: 'Giá trị (% hoặc đ)', type: 'number', step: '0.01' }, { ...pitDed, value: 'false' }]); if (r) { await POST('/api/config/deduction-types', { code: r[0], name: r[1], calc: r[2], value: r[3], pit_deductible: r[4] }); reload(); } });
  box.querySelectorAll('[data-ex]').forEach(b => mk(b, async () => { const x = c.dedTypes.find(k => k.code === b.dataset.ex); const r = await ask('Sửa khoản trừ', [{ label: 'Tên', value: x.name }, { label: 'Cách tính', type: 'select', options: calcs, value: x.calc }, { label: 'Giá trị', type: 'number', step: '0.01', value: x.value }, { label: 'Trạng thái', type: 'select', options: yn, value: String(x.active) }, { ...pitDed, value: String(!!x.pit_deductible) }]); if (r) { await PATCH('/api/config/deduction-types/' + encodeURIComponent(x.code), { name: r[0], calc: r[1], value: r[2], active: r[3], pit_deductible: r[4] }); reload(); } }));
  admPitCard(me, c, $('#pitbox'));
  if (me.isAdmin) admFundCard(c, o, $('#fundbox'), $('#addF'));
}

// ---------- Cấu hình › Thuế TNCN: biểu thuế theo năm (số bậc tuỳ ý) + trừ thuế tạm tính vào thưởng ----------
let ADM_PIT_YEAR = null;   // biểu đang chọn (giữ khi vẽ lại thẻ)
function admPitCard(me, c, el) {
  const isAdm = me.isAdmin, wh0 = c.settings.pit_withhold === 'bonus' ? 'bonus' : 'none';
  // % bảo hiểm bắt buộc được trừ khi tính thuế (chỉ để vẽ ví dụ)
  const pctIns = c.dedTypes.filter(k => k.pit_deductible && k.active && k.calc === 'pct_insurance').reduce((s, k) => s + Number(k.value || 0), 0) || 10.5;
  const capIn = v => v === null || v === undefined ? '' : Number(v);
  const toEd = s => ({ year: s.year, self_deduction: Number(s.self_deduction) || 0, dependent_deduction: Number(s.dependent_deduction) || 0, health_cap: capIn(s.health_cap), education_cap: capIn(s.education_cap), note: s.note || '',
    brackets: (s.brackets || []).map(b => ({ upto: b.upto === null || b.upto === undefined ? null : Number(b.upto), rate: Number(b.rate) })) });
  let ed = null, dirty = false, helpOpen = true;
  try { helpOpen = localStorage.getItem('pr_pit_help') !== '0'; } catch (e) {}
  const list = () => [...c.pitSchedules].sort((a, b) => a.year - b.year);
  const select = y => { const s = c.pitSchedules.find(x => x.year === y) || admPitSched(c.pitSchedules, me.now.year); ADM_PIT_YEAR = s ? s.year : null; ed = s ? toEd(s) : null; dirty = false; };
  const refetch = async y => { const r = await GET('/api/config'); c.pitSchedules = r.pitSchedules; select(y); draw(); };
  const capTxt = v => v === '' || v === null || v === undefined ? 'không giới hạn' : Number(v) === 0 ? 'không áp dụng' : money(v);
  // Ví dụ tính theo biểu đang sửa (đổi số là ví dụ đổi theo)
  const exHtml = () => {
    if (!ed || !ed.brackets.length) return '';
    const taxable = 30000000, base = 14000000, bh = Math.round(base * pctIns / 100), self = ed.self_deduction || 0, dep = ed.dependent_deduction || 0, ded = bh + self + dep, ass = Math.max(0, taxable - ded), p = admPitProgressive(ass, ed.brackets, 12);
    return `<b>Ví dụ</b> (biểu năm ${ed.year}, tháng thường, 1 người phụ thuộc): lương bảo hiểm 12.000.000 + phụ cấp 2.000.000 + thưởng 16.000.000 = thu nhập chịu thuế <b>${money(taxable)}</b>; tiền làm đêm 3.000.000 và ăn ca 1.200.000 cùng tháng <b>không</b> tính.
      Giảm trừ = bảo hiểm bắt buộc ${admPct(pctIns)}% × 14.000.000 = ${money(bh)} + bản thân ${money(self)} + 1 người phụ thuộc ${money(dep)} = <b>${money(ded)}</b>.
      Thu nhập tính thuế = ${money(taxable)} − ${money(ded)} = <b>${money(ass)}</b> → ${p.parts.map(x => `bậc ${x.level}: ${money(x.base)} × ${admPct(x.rate)}% = ${money(x.tax)}`).join('; ') || 'chưa đến mức chịu thuế'} → thuế tạm tính tháng <b>${money(p.tax)}</b>.
      <br>Tháng 12: nếu thuế cả năm theo biểu là 4.000.000 mà tháng 1–11 đã tạm tính 4.300.000 thì thuế tháng 12 = 4.000.000 − 4.300.000 = <b>−300.000</b> (được hoàn 300.000).`;
  };
  const moTxt = i => { const b = ed.brackets, last = i === b.length - 1; return last ? (i ? (b[i - 1].upto > 0 ? 'trên ' + money(b[i - 1].upto / 12) : '') : 'mọi mức') : b[i].upto > 0 ? 'đến ' + money(b[i].upto / 12) : '<span class="muted">—</span>'; };
  const draw = () => {
    const L = list(), cur = admPitSched(L, me.now.year), sel = ed && !ed.isNew ? L.find(s => s.year === ed.year) : null;
    const span = (s, i) => (i < L.length - 1 ? (L[i + 1].year - 1 > s.year ? `${s.year}–${L[i + 1].year - 1}` : `${s.year}`) : `${s.year} trở đi`) + (i === 0 ? ' (và các năm trước)' : '');
    const mIn = (id, v, label, ph) => `<div class="field"><label>${label}</label><input id="${id}" type="number" min="0" step="100000" value="${v === '' || v === null || v === undefined ? '' : v}" ${ph ? `placeholder="${ph}"` : ''}><div class="muted small" data-mv="${id}"></div></div>`;
    el.innerHTML = `<div class="muted small">Áp dụng cho người hưởng lương <b>theo hệ số</b>. Người <b>lương khoán / thù lao</b> không tính ở đây vì đã khấu trừ thuế vãng lai 10% (tỷ lệ cài từng người ở tab Nhân sự).</div>
      <details class="pithelp" ${helpOpen ? 'open' : ''}><summary>Cách tính thuế TNCN</summary><div class="cols">
        <p><b>Biểu thuế dùng cho năm nào.</b> Mỗi năm tính thuế dùng biểu có <b>năm áp dụng gần nhất nhưng không sau năm đó</b> (vd có biểu 2020 và 2026: năm 2020–2025 dùng biểu 2020; từ 2026 dùng biểu 2026 cho đến khi có biểu mới hơn). Luật đổi từ năm nào thì bấm <b>Tạo biểu cho năm mới</b> rồi sửa — không sửa biểu cũ để các năm trước giữ đúng số. Số bậc tuỳ ý; mức "đến" của mỗi bậc nhập theo <b>cả năm</b>, bậc cuối không giới hạn.</p>
        <p><b>Thu nhập chịu thuế</b> mỗi tháng = <b>lương bảo hiểm</b> (gồm phụ cấp an toàn) + <b>phụ cấp</b> + <b>thưởng</b>.<br><b>Không tính thuế:</b> tiền làm đêm, làm thêm, làm lễ tết (cả phần lương và phần thưởng) và <b>toàn bộ tiền ăn ca</b>.</p>
        <p><b>Giảm trừ</b></p><ul>
          <li>Bản thân: mức / tháng của biểu.</li>
          <li>Người phụ thuộc: số người được tính trong tháng × mức mỗi người (khai ở Nhân sự › cột Người phụ thuộc, có tháng bắt đầu / kết thúc).</li>
          <li>Bảo hiểm bắt buộc trừ vào lương: các khoản trừ đánh dấu <b>Được trừ khi tính thuế TNCN</b> (BHXH, BHYT, BHTN; không gồm kinh phí công đoàn).</li>
          <li>Chi phí y tế, giáo dục, khoản giảm trừ khác của từng người theo năm (khai cùng chỗ người phụ thuộc): y tế, giáo dục tối đa theo mức của biểu; khoản khác không giới hạn.</li></ul>
        <p><b>Tạm tính tháng 1–11</b></p><ul>
          <li>Thu nhập tính thuế = thu nhập chịu thuế − bản thân − người phụ thuộc − bảo hiểm − (y tế + giáo dục + khác của cả năm) ÷ 12; âm thì bằng 0.</li>
          <li>Thuế lũy tiến từng phần với mức trần mỗi bậc <b>÷ 12</b> (vd bậc 1 đến 120 triệu / năm → đến 10 triệu / tháng).</li>
          <li>Người có lương ở nhiều bảng lương trong cùng tháng: cộng chung thu nhập, thuế chia cho từng bảng theo tỷ lệ thu nhập chịu thuế.</li></ul>
        <p><b>Tháng 12 — quyết toán năm</b></p><ul>
          <li>Cộng thu nhập chịu thuế và bảo hiểm cả 12 tháng; giảm trừ bản thân × 12, người phụ thuộc theo tổng số tháng được tính; y tế, giáo dục (sau mức tối đa) và khoản khác: đủ số cả năm.</li>
          <li>Thuế tháng 12 = thuế cả năm theo biểu (mức trần không chia) − thuế đã tạm tính tháng 1–11. <b>Âm = được hoàn</b> (nếu đang trừ vào thưởng thì cộng trả lại vào thưởng tháng 12).</li>
          <li>Đổi biểu thuế, người phụ thuộc hay giảm trừ: các bảng lương chưa khoá liên quan được đánh dấu cần <b>Tính lại</b>; bảng đã khoá giữ nguyên số đã tính.</li></ul>
        <div class="ex" id="pit_ex">${exHtml()}</div>
        <p class="legal"><b>Lưu ý pháp lý:</b> theo Nghị định 253/2026/NĐ-CP (Điều 51), giảm trừ chi phí y tế và giáo dục do người lao động tự kê khai khi <b>tự quyết toán</b> thuế TNCN. Vì vậy số thuế công ty tính ở đây (kể cả quyết toán tháng 12) chỉ là <b>ước tính</b> để tạm khấu trừ; số phải nộp chính thức theo quyết toán của người lao động.</p></div></details>
      <h3 style="margin:12px 0 6px">Biểu thuế theo năm <span class="muted small" style="font-weight:normal">— bấm một dòng để xem / sửa</span></h3>
      <div class="scroll" style="max-height:none"><table><thead><tr><th>Năm áp dụng</th><th>Dùng cho năm</th><th class="n">Số bậc</th><th>Thuế suất các bậc</th><th class="n">Giảm trừ bản thân / tháng</th><th class="n">Mỗi người phụ thuộc / tháng</th><th class="n">Y tế tối đa / năm</th><th class="n">Giáo dục tối đa / năm</th><th>Cập nhật</th></tr></thead><tbody>
        ${L.map((s, i) => `<tr class="pitrow ${ed && !ed.isNew && ed.year === s.year ? 'on' : ''}" data-py="${s.year}"><td style="white-space:nowrap"><b>${s.year}</b>${cur && cur.year === s.year ? ` <span class="badge locked">đang áp dụng ${me.now.year}</span>` : ''}</td><td>${span(s, i)}</td><td class="n">${(s.brackets || []).length}</td><td class="small">${(s.brackets || []).map(b => admPct(b.rate) + '%').join(' · ')}</td>
          <td class="n">${money(s.self_deduction)}</td><td class="n">${money(s.dependent_deduction)}</td><td class="n small">${capTxt(s.health_cap)}</td><td class="n small">${capTxt(s.education_cap)}</td><td class="small">${s.updated_by ? `${esc(s.updated_by_name || s.updated_by)}<br>${dt(s.updated_at)}` : '<span class="muted">mẫu cài sẵn</span>'}</td></tr>`).join('')}
        ${ed && ed.isNew ? `<tr class="pitrow on"><td><b data-dy>${ed.year}</b> <span class="badge draft">mới, chưa lưu</span></td><td colspan="8" class="muted small">${ed.from ? `Sao chép từ biểu năm ${ed.from} — sửa` : 'Nhập biểu'} bên dưới rồi bấm Lưu.</td></tr>` : ''}
        ${L.length || (ed && ed.isNew) ? '' : '<tr><td colspan="9" class="muted">Chưa có biểu thuế nào — thuế TNCN chưa được tính.</td></tr>'}</tbody></table></div>
      ${ed ? `<div class="pited"><div class="row" style="margin-bottom:6px"><h3 class="grow" style="margin:0">${ed.isNew ? `Biểu thuế mới năm <span data-dy>${ed.year}</span>` : `Biểu thuế năm ${ed.year}`}</h3><span class="badge draft" id="pe_dirty" ${dirty ? '' : 'hidden'}>có thay đổi chưa lưu</span></div>
        ${sel && sel.has_locked ? `<div class="warnbox small">Từ năm ${ed.year} đã có bảng lương <b>đã khoá</b>. Sửa biểu này chỉ ảnh hưởng các bảng lương <b>chưa khoá</b> (cần bấm Tính lại); bảng đã khoá giữ nguyên số thuế đã tính. Nếu luật đổi từ một năm mới, hãy bấm "Tạo biểu cho năm mới" thay vì sửa biểu này.</div>` : ''}
        <div class="fgrid"><div class="field"><label>Năm áp dụng</label><input id="pe_y" type="number" min="2000" max="2200" value="${ed.year}" ${ed.isNew ? '' : 'disabled title="Muốn đổi năm: bấm Tạo biểu cho năm mới (sao chép), rồi xoá biểu này nếu cần"'}><div class="muted small" data-mv="pe_y"></div></div>
          ${mIn('pe_self', ed.self_deduction, 'Giảm trừ bản thân / tháng (đ)')}${mIn('pe_dep', ed.dependent_deduction, 'Giảm trừ mỗi người phụ thuộc / tháng (đ)')}
          ${mIn('pe_hc', ed.health_cap, 'Chi phí y tế được trừ tối đa / năm (đ)', 'trống = không giới hạn')}${mIn('pe_ec', ed.education_cap, 'Chi phí giáo dục được trừ tối đa / năm (đ)', 'trống = không giới hạn')}</div>
        <div class="field"><label>Ghi chú (căn cứ pháp lý)</label><textarea id="pe_note" rows="2">${esc(ed.note)}</textarea></div>
        <table class="pitbr"><thead><tr><th>Bậc</th><th class="n">Thu nhập tính thuế đến (cả năm, đ)</th><th class="n">Tương đương / tháng (÷ 12)</th><th class="n">Thuế suất (%)</th><th></th></tr></thead><tbody>
          ${ed.brackets.map((b, i) => { const last = i === ed.brackets.length - 1; return `<tr><td style="white-space:nowrap"><b>Bậc ${i + 1}</b></td>
            <td class="n">${last ? `<span class="muted" data-blast>Trên mức bậc trước${i && ed.brackets[i - 1].upto > 0 ? ` (trên ${money(ed.brackets[i - 1].upto)})` : ''}</span>` : `<input type="number" min="0" step="1000000" data-bu="${i}" value="${b.upto ?? ''}"><div class="muted small" data-bmv="${i}">${b.upto > 0 ? money(b.upto) + ' đ' : ''}</div>`}</td>
            <td class="n" data-bm="${i}">${moTxt(i)}</td><td class="n"><input type="number" class="rate" min="0" max="100" step="0.5" data-br="${i}" value="${Number.isFinite(b.rate) ? b.rate : ''}"></td>
            <td><button class="btn red sm" data-bx="${i}" ${ed.brackets.length < 2 ? 'disabled' : ''}>Xoá bậc</button></td></tr>`; }).join('')}</tbody></table>
        <div class="row" style="margin-top:6px"><button class="btn sec sm" id="pe_add">+ Thêm bậc</button><span class="muted small">Bậc mới chèn trước bậc cuối (bậc không giới hạn). Xoá bậc cuối thì bậc liền trước thành bậc không giới hạn.</span></div>
        <div class="row" style="margin:10px 0 0"><button class="btn" id="pe_save">Lưu biểu thuế</button>
          ${ed.isNew ? '<button class="btn sec" id="pe_cancel">Huỷ biểu mới</button>' : `<button class="btn sec" id="pe_new">Tạo biểu cho năm mới</button><button class="btn sec" id="pe_reset" ${dirty ? '' : 'hidden'}>Bỏ thay đổi</button><span class="grow"></span><button class="btn red" id="pe_del">Xoá biểu này</button>`}</div></div>`
      : `<div class="row" style="margin-top:8px"><button class="btn" id="pe_blank">Tạo biểu thuế</button></div>`}
      <h3 style="margin:16px 0 6px">Trừ thuế tạm tính vào lương</h3>
      <label class="pitopt"><input type="radio" name="pit_wh" value="none" ${wh0 === 'none' ? 'checked' : ''} ${isAdm ? '' : 'disabled'}> <b>Chỉ ước tính, không trừ vào lương</b> — bảng lương hiện thuế TNCN tạm tính để tham khảo, thực nhận không đổi (mặc định).</label>
      <label class="pitopt"><input type="radio" name="pit_wh" value="bonus" ${wh0 === 'bonus' ? 'checked' : ''} ${isAdm ? '' : 'disabled'}> <b>Trừ thuế tạm tính vào thưởng thực nhận</b> — mỗi tháng tự thêm khoản trừ vào thưởng "Thuế TNCN (tạm tính)"; tháng 12 là "Thuế TNCN (quyết toán năm)", số âm được cộng trả lại vào thưởng.</label>
      <div class="warnbox small" style="margin-top:6px">Nếu hằng tháng vẫn nhập tay khoản "Thuế TNCN" loại <b>Trừ vào thưởng</b> (Bảng lương › Thưởng / khoản trừ tháng) thì khi chọn "Trừ thuế tạm tính vào thưởng thực nhận" thuế sẽ bị <b>trừ hai lần</b> — hãy bỏ khoản nhập tay đó.</div>
      ${isAdm ? '<div class="row"><button class="btn" id="pit_wh_save">Lưu cách xử lý thuế</button><span class="muted small">Đổi xong bấm Tính lại các bảng lương nháp; bảng đã khoá giữ nguyên.</span></div>' : '<div class="muted small">Chỉ Admin đổi được cài đặt này.</div>'}`;
    bind();
  };
  // Cập nhật phần tính sẵn (÷ 12, số tiền dễ đọc, ví dụ) khi gõ — không vẽ lại cả thẻ để không mất con trỏ
  const hints = () => {
    if (!ed) return;
    const mv = (id, h) => { const x = el.querySelector(`[data-mv="${id}"]`); if (x) x.innerHTML = h; };
    mv('pe_y', ed.isNew ? 'Năm bắt đầu dùng biểu này' : 'Đổi năm: Tạo biểu cho năm mới');
    mv('pe_self', `${money(ed.self_deduction)} đ / tháng · ${money(ed.self_deduction * 12)} đ / năm`); mv('pe_dep', `${money(ed.dependent_deduction)} đ / người / tháng`);
    for (const [id, k] of [['pe_hc', 'health_cap'], ['pe_ec', 'education_cap']]) mv(id, ed[k] === '' ? 'Trống = không giới hạn · 0 = không áp dụng' : Number(ed[k]) === 0 ? '0 = không áp dụng (không được trừ)' : `${money(ed[k])} đ / năm · tạm tính ≈ ${money(ed[k] / 12)} / tháng`);
    ed.brackets.forEach((b, i) => { const m = el.querySelector(`[data-bm="${i}"]`), v = el.querySelector(`[data-bmv="${i}"]`); if (m) m.innerHTML = moTxt(i); if (v) v.textContent = b.upto > 0 ? money(b.upto) + ' đ' : ''; });
    const n = ed.brackets.length, lb = el.querySelector('[data-blast]'); if (lb) lb.textContent = 'Trên mức bậc trước' + (n > 1 && ed.brackets[n - 2].upto > 0 ? ` (trên ${money(ed.brackets[n - 2].upto)})` : '');
    el.querySelectorAll('[data-dy]').forEach(x => { x.textContent = ed.year || '?'; });
    const ex = el.querySelector('#pit_ex'); if (ex) ex.innerHTML = exHtml();
  };
  const touch = () => { dirty = true; const d = el.querySelector('#pe_dirty'), r = el.querySelector('#pe_reset'); if (d) d.hidden = false; if (r) r.hidden = false; hints(); };
  const bad = (sel, msg) => { const i = el.querySelector(sel); if (i) { i.classList.add('bad'); i.focus(); } throw new Error(msg); };
  function bind() {
    const q = s => el.querySelector(s);
    el.querySelector('.pithelp').ontoggle = e => { helpOpen = e.target.open; try { localStorage.setItem('pr_pit_help', helpOpen ? '1' : '0'); } catch (x) {} };
    el.querySelectorAll('[data-py]').forEach(tr => tr.onclick = () => { const y = Number(tr.dataset.py); if (ed && !ed.isNew && ed.year === y) return; if (dirty && !confirm(`Biểu năm ${ed.year} có thay đổi chưa lưu. Bỏ các thay đổi đó?`)) return; select(y); draw(); });
    if (q('#pe_blank')) q('#pe_blank').onclick = () => { ed = { year: me.now.year, self_deduction: 0, dependent_deduction: 0, health_cap: '', education_cap: '', note: '', brackets: [{ upto: null, rate: NaN }], isNew: true, from: null }; dirty = true; draw(); };
    if (!ed) return bindWh();
    el.querySelectorAll('.pited input, .pited textarea').forEach(i => i.addEventListener('input', () => i.classList.remove('bad')));
    if (ed.isNew) q('#pe_y').oninput = e => { ed.year = Number(e.target.value) || ''; touch(); };
    for (const [id, k, nullable] of [['pe_self', 'self_deduction'], ['pe_dep', 'dependent_deduction'], ['pe_hc', 'health_cap', 1], ['pe_ec', 'education_cap', 1]]) q('#' + id).oninput = e => { ed[k] = e.target.value === '' ? (nullable ? '' : 0) : Number(e.target.value); touch(); };
    q('#pe_note').oninput = e => { ed.note = e.target.value; touch(); };
    el.querySelectorAll('[data-bu]').forEach(i => i.oninput = () => { ed.brackets[+i.dataset.bu].upto = i.value === '' ? null : Number(i.value); touch(); });
    el.querySelectorAll('[data-br]').forEach(i => i.oninput = () => { ed.brackets[+i.dataset.br].rate = i.value === '' ? NaN : Number(i.value); touch(); });
    el.querySelectorAll('[data-bx]').forEach(b => b.onclick = () => { ed.brackets.splice(+b.dataset.bx, 1); const n = ed.brackets.length; if (n) ed.brackets[n - 1].upto = null; dirty = true; draw(); });
    q('#pe_add').onclick = () => { const at = Math.max(0, ed.brackets.length - 1); ed.brackets.splice(at, 0, { upto: null, rate: NaN }); dirty = true; draw(); el.querySelector(`[data-bu="${at}"]`)?.focus(); };
    q('#pe_save').onclick = guard(async () => {
      const y = Number(ed.year), n = ed.brackets.length;
      if (!Number.isInteger(y) || y < 2000 || y > 2200) bad('#pe_y', 'Năm áp dụng phải từ 2000 đến 2200');
      if (ed.isNew && c.pitSchedules.some(s => s.year === y)) bad('#pe_y', `Đã có biểu thuế năm ${y} — chọn biểu đó trong danh sách để sửa`);
      if (!n) throw new Error('Biểu thuế phải có ít nhất 1 bậc');
      ed.brackets.forEach((b, i) => {
        if (i < n - 1 && !(b.upto > 0)) bad(`[data-bu="${i}"]`, `Bậc ${i + 1}: nhập mức thu nhập tính thuế tối đa của bậc (cả năm)`);
        if (i > 0 && i < n - 1 && b.upto <= ed.brackets[i - 1].upto) bad(`[data-bu="${i}"]`, `Bậc ${i + 1}: mức tối đa phải lớn hơn bậc ${i}`);
        if (!Number.isFinite(b.rate) || b.rate < 0 || b.rate > 100) bad(`[data-br="${i}"]`, `Bậc ${i + 1}: nhập thuế suất từ 0 đến 100%`);
      });
      await PUT(`/api/config/pit-schedules/${y}`, { self_deduction: ed.self_deduction, dependent_deduction: ed.dependent_deduction, health_cap: ed.health_cap === '' ? null : ed.health_cap, education_cap: ed.education_cap === '' ? null : ed.education_cap,
        brackets: ed.brackets.map((b, i) => ({ upto: i === n - 1 ? null : b.upto, rate: b.rate })), note: ed.note });
      await refetch(y); toast(`Đã lưu biểu thuế năm ${y}. Các bảng lương chưa khoá từ năm ${y} được đánh dấu cần Tính lại.`);
    });
    if (q('#pe_cancel')) q('#pe_cancel').onclick = () => { select(ADM_PIT_YEAR); draw(); };
    if (q('#pe_reset')) q('#pe_reset').onclick = () => { select(ed.year); draw(); };
    if (q('#pe_new')) q('#pe_new').onclick = guard(async () => {
      const def = Math.max(me.now.year, ...c.pitSchedules.map(s => s.year)) + 1;
      const r = await ask('Tạo biểu thuế cho năm mới', [{ label: `Năm bắt đầu áp dụng — sao chép các số đang hiện của biểu năm ${ed.year}, sửa xong bấm "Lưu biểu thuế"`, type: 'number', value: def }], 'Tạo');
      if (!r) return; const y = Number(r[0]);
      if (!Number.isInteger(y) || y < 2000 || y > 2200) throw new Error('Năm áp dụng phải từ 2000 đến 2200');
      if (c.pitSchedules.some(s => s.year === y)) throw new Error(`Đã có biểu thuế năm ${y} — chọn biểu đó trong danh sách để sửa`);
      ed = { ...ed, brackets: ed.brackets.map(b => ({ ...b })), year: y, note: '', isNew: true, from: ed.year }; dirty = true; draw();
    });
    if (q('#pe_del')) q('#pe_del').onclick = guard(async () => {
      const L = list(), i = L.findIndex(s => s.year === ed.year), prev = L[i - 1], next = L[i + 1];
      if (L.length <= 1) throw new Error('Phải giữ ít nhất 1 biểu thuế');
      if (!await confirmBox(`Xoá biểu thuế năm ${ed.year}? ${prev ? `Các năm đang dùng biểu này sẽ dùng biểu năm ${prev.year}.` : `Các năm đang dùng biểu này sẽ dùng biểu năm ${next.year}.`} Các bảng lương chưa khoá cần Tính lại.`)) return;
      await DEL(`/api/config/pit-schedules/${ed.year}`); await refetch(null); toast('Đã xoá biểu thuế');
    });
    hints(); bindWh();
  }
  function bindWh() {
    const b = el.querySelector('#pit_wh_save'); if (!b) return;
    b.onclick = guard(async () => { const v = el.querySelector('[name=pit_wh]:checked')?.value; if (!v) throw new Error('Chọn một cách xử lý'); await PUT('/api/config/settings', { pit_withhold: v }); c.settings.pit_withhold = v; toast(v === 'bonus' ? 'Đã lưu: trừ thuế tạm tính vào thưởng. Bấm Tính lại các bảng lương nháp để áp dụng.' : 'Đã lưu: chỉ ước tính, không trừ vào lương. Bấm Tính lại các bảng lương nháp để áp dụng.'); });
  }
  select(ADM_PIT_YEAR); draw();
}

// ---------- Cấu hình › Quỹ lương (khối) để tổng hợp tiền lương theo nguồn quỹ ----------
function admFundCard(c, o, el, addBtn) {
  const RT = Object.fromEntries(ADM_FUND_RULES), yn = [{ v: 'true', t: 'Đang dùng' }, { v: 'false', t: 'Ngừng' }];
  const refresh = async withOrg => { const [r, g] = await Promise.all([GET('/api/config'), withOrg ? GET('/api/org') : null]); c.salaryFunds = r.salaryFunds; if (g) o.departments = g.departments; draw(); };
  function draw() {
    const F = c.salaryFunds, miss = ADM_FUND_RULES.filter(([r]) => r && !F.some(f => f.active && f.rule === r));
    el.innerHTML = `<div class="muted small" style="margin:6px 0 8px;line-height:1.55">Dùng để tổng hợp tiền lương theo nguồn quỹ (khối). Khi tính lương, mỗi người được xếp vào <b>một</b> quỹ theo thứ tự ưu tiên:
        <b>1)</b> quỹ chọn riêng cho người đó ở <b>Nhân sự</b> (cột Quỹ lương); <b>2)</b> quỹ của bộ phận tính lương của người đó ở <b>Tổ chức</b> (Sửa bộ phận); <b>3)</b> quy tắc tự xếp: bộ phận liên kết <b>HĐQT</b> → quỹ có quy tắc "Bộ phận HĐQT"; bộ phận <b>Ban kiểm soát</b> → "Bộ phận Ban kiểm soát"; người ở bảng lương <b>văn phòng</b> → "Bảng lương văn phòng"; ở <b>nhà máy</b>: người có kíp → "công nhân vận hành", người không có kíp → "quản lý, hành chính".
        <br>Mỗi quy tắc chỉ gắn cho một quỹ. Quỹ không có quy tắc (vd <b>Khối sửa chữa</b>) chỉ nhận người / bộ phận được chọn — vd vào Tổ chức › Sửa bộ phận Sửa chữa › Quỹ lương = Khối sửa chữa. Quỹ được ghi vào từng dòng lương lúc tính: đổi xong bấm <b>Tính lại</b> các bảng lương chưa khoá; bảng đã khoá giữ quỹ cũ. Quỹ <b>Ngừng</b> không còn tự xếp theo quy tắc và không hiện trong danh sách chọn.</div>
      ${miss.length ? `<div class="warnbox small">Chưa có quỹ đang dùng cho quy tắc: ${miss.map(([, t]) => `<b>${esc(t)}</b>`).join('; ')} — người thuộc trường hợp này (nếu không được chọn quỹ) sẽ ở mục "Chưa xếp quỹ" trên báo cáo.</div>` : ''}
      <table><thead><tr><th>Mã</th><th>Tên quỹ lương</th><th>Tự xếp theo quy tắc</th><th>Bộ phận chọn quỹ này (Tổ chức)</th><th>Ghi chú</th><th class="n">Thứ tự</th><th>Dùng</th><th></th></tr></thead><tbody>
      ${F.map(f => `<tr><td><b>${esc(f.code)}</b></td><td>${esc(f.name)}</td><td class="small">${f.rule ? esc(RT[f.rule] || f.rule) : '<span class="muted">không tự xếp</span>'}</td><td class="small">${o.departments.filter(d => d.fund_id === f.id).map(d => esc(d.name)).join(', ') || '<span class="muted">—</span>'}</td>
        <td class="small">${esc(f.note || '')}</td><td class="n">${f.sort_order}</td><td>${f.active ? '✓' : '—'}</td><td style="white-space:nowrap"><button class="btn sec sm" data-ef="${f.id}">Sửa</button> <button class="btn red sm" data-df="${f.id}">Xoá</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Chưa có quỹ lương nào.</td></tr>'}</tbody></table>`;
    el.querySelectorAll('[data-ef]').forEach(b => b.onclick = guard(() => form(F.find(f => f.id === b.dataset.ef))));
    el.querySelectorAll('[data-df]').forEach(b => b.onclick = guard(async () => {
      const f = F.find(x => x.id === b.dataset.df); if (!await confirmBox(`Xoá quỹ lương "${f.name}"? Người và bộ phận đang chọn quỹ này về "Tự xếp"; dòng lương đã tính có quỹ này sẽ được xếp lại theo cài đặt hiện tại khi tổng hợp. Nếu chỉ thôi dùng, nên đặt Trạng thái = Ngừng.`)) return;
      await DEL('/api/config/salary-funds/' + f.id); await refresh(true); toast('Đã xoá quỹ lương');
    }));
  }
  async function form(f) {
    const F = c.salaryFunds, used = r => F.find(x => x.rule === r && x.id !== f?.id);
    const r = await ask(f ? 'Sửa quỹ lương ' + f.name : 'Thêm quỹ lương', [{ label: 'Mã (ngắn, không trùng)', value: f?.code || '' }, { label: 'Tên quỹ lương', value: f?.name || '' },
      { label: 'Tự xếp theo quy tắc (mỗi quy tắc chỉ gắn 1 quỹ). Người / bộ phận đã được chọn quỹ thì không theo quy tắc', type: 'select', options: ADM_FUND_RULES.map(([v, t]) => ({ v, t: t + (v && used(v) ? ` — đang gắn: ${used(v).name}` : '') })), value: f?.rule || '' },
      { label: 'Ghi chú', value: f?.note || '' }, { label: 'Thứ tự (in / báo cáo)', type: 'number', value: f?.sort_order ?? (Math.max(0, ...F.map(x => x.sort_order)) + 10) }, { label: 'Trạng thái', type: 'select', options: yn, value: String(f?.active ?? true) }]);
    if (!r) return;
    const [code, name] = [r[0].trim(), r[1].trim()]; if (!code || !name) throw new Error('Nhập mã và tên quỹ lương');
    if (F.some(x => x.id !== f?.id && x.code === code)) throw new Error(`Đã có quỹ lương mã "${code}"`);
    const other = r[2] && used(r[2]);
    if (other && !await confirmBox(`Quy tắc "${RT[r[2]]}" đang gắn cho quỹ "${other.name}". Chuyển quy tắc này sang quỹ "${name}"?`)) return;
    if (other) await PATCH('/api/config/salary-funds/' + other.id, { rule: '' });
    const b = { code, name, rule: r[2], note: r[3], sort_order: r[4] === '' ? 0 : r[4], active: r[5] };
    f ? await PATCH('/api/config/salary-funds/' + f.id, b) : await POST('/api/config/salary-funds', b);
    await refresh(); toast('Đã lưu — bấm Tính lại các bảng lương chưa khoá để xếp lại quỹ');
  }
  if (addBtn) addBtn.onclick = guard(() => form(null));
  draw();
}

// ---------- Nhật ký ----------
async function admAudit(me, box) {
  const r = await GET('/api/audit?limit=300');
  box.innerHTML = `<div class="card"><h2>Nhật ký thao tác</h2><div class="scroll"><table><thead><tr><th>Thời gian</th><th>Người</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>${r.items.map(i => `<tr><td class="small">${dt(i.created_at)}</td><td>${esc(i.actor_name || '')}</td><td>${esc(i.action)}</td><td class="small">${esc(i.entity || '')}</td><td class="small" style="max-width:420px;word-break:break-all">${esc(i.detail ? JSON.stringify(i.detail) : '')}</td></tr>`).join('')}</tbody></table></div></div>`;
}
