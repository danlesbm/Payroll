window.PAGES = window.PAGES || {};
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ================= CHẤM CÔNG =================
PAGES.attendance = async (me, root) => {
  let sel = null;   // sheetId đang mở
  async function list() {
    const r = await GET(`/api/attendance/sheets?year=${ymState.year}&month=${ymState.month}`);
    root.innerHTML = `<div class="card"><div class="row"><h2 class="grow">Bảng chấm công</h2>${ymPicker(me)}</div>
      ${r.open ? '' : `<div class="info">Tháng ${ymState.month}/${ymState.year} chưa đến nên chưa mở chấm công (chỉ xem được tháng đã có dữ liệu).</div>`}
      ${r.sheets.length ? `<div class="grid">${r.sheets.map(s => `<div class="tile" data-id="${s.id}"><b>${esc(s.name)}</b><div class="muted small">${esc(s.group_name)} · ${s.employee_count} người</div><div style="margin-top:8px">${badge(s.status)}</div></div>`).join('')}</div>`
        : '<div class="muted">Bạn chưa được phân quyền chấm/kiểm soát bảng chấm công nào.</div>'}</div>`;
    bindYm(list);
    root.querySelectorAll('.tile').forEach(t => t.onclick = () => { sel = t.dataset.id; open(); });
  }
  async function open() {
    const sheetId = sel;
    const d = await GET(`/api/attendance/${sel}/${ymState.year}/${ymState.month}`);
    if (!d.period) { root.innerHTML = `<div class="card"><button class="btn sec" id="back">← Danh sách</button><div class="info" style="margin-top:10px">${esc(d.message)}</div></div>`; $('#back').onclick = list; return; }
    const dirty = new Map();   // "empId:day" -> code
    const mealDirty = new Map();
    const rateDirty = new Map();   // empId -> { safety?, labor? }
    const rv = (e, k) => rateDirty.get(e)?.[k] !== undefined ? rateDirty.get(e)[k] : (d.ratings?.[e]?.[k] || '');
    const gradeSel = (e, k, list) => `<select data-r="${k}" data-e="${e}" ${d.canEdit && edOf[e] !== false ? '' : 'disabled'} style="width:38px"><option value=""></option>${list.map(g => `<option ${rv(e, k) === g ? 'selected' : ''}>${g}</option>`).join('')}</select>`;
    let cur = d.codes[0]?.code || '', mealType = d.mealTypes[0]?.id || '';
    const codeBy = Object.fromEntries(d.codes.map(c => [c.code, c]));
    const days = Array.from({ length: d.days }, (_, i) => i + 1);
    const wk = day => new Date(Date.UTC(d.year, d.month - 1, day)).getUTCDay();
    const val = (e, day) => dirty.has(e + ':' + day) ? dirty.get(e + ':' + day) : (d.entries[e]?.[day] || '');
    const edOf = Object.fromEntries(d.employees.map(e => [e.id, e.editable !== false]));
    const schOf = Object.fromEntries(d.employees.map(e => [e.id, e.sch || {}]));
    const holDay = Object.fromEntries((d.holidays || []).map(h => [Number(h.date.slice(8)), h.name]));
    const isOff = (e, day) => (schOf[e]?.offDays || []).includes(day);
    // Ký hiệu nghỉ bù / nghỉ phép rơi vào ngày nghỉ hằng tuần hoặc ngày lễ không cộng công
    const cw = (e, day, k) => { const c = codeBy[val(e, day)]; return c && !(c.off_zero && isOff(e, day)) ? Number(c[k] || 0) : 0; };
    // Phân loại công để hiển thị (chỉ trên phần mềm, file Excel xuất ra giữ nguyên): làm thêm (LT…) tách riêng, không nằm trong công thường
    const cat = c => !c ? '' : c.is_ot ? 'ot' : c.off_zero ? 'leave' : c.pct_kind === 'extra' ? 'sc' : 'work';
    const bucket = (e, k) => days.reduce((s, day) => { const c = codeBy[val(e, day)]; if (!c || (c.off_zero && isOff(e, day))) return s; const t = cat(c), v = Number(c.work_value || 0);
      if (k === 'day') return s + (t === 'work' ? Number(c.work_day || 0) : 0); if (k === 'night') return s + (t === 'work' ? Number(c.work_night || 0) : 0);
      if (k === 'sc') return s + (t === 'sc' ? v : 0); if (k === 'leave') return s + (t === 'leave' ? v : 0); if (k === 'ot') return s + (t === 'ot' ? v : 0); return s; }, 0);
    const total = e => ['day', 'night', 'sc', 'leave'].reduce((s, k) => s + bucket(e, k), 0);
    const part = (e, k) => days.reduce((s, day) => s + cw(e, day, k), 0);
    const stat = e => { const sc = schOf[e] || {}, t = total(e); if (!sc.standard) return ''; const col = t > sc.standard ? '#1d4ed8' : t >= sc.standard ? '#15803d' : t >= sc.min ? '#a16207' : '#b91c1c';
      return `<div class="small" style="color:${col}" title="Chuẩn ${f2(sc.standard)} · tối thiểu ${f2(sc.min)}. Công ≥ chuẩn: đủ lương (vượt chuẩn = tăng ca). Từ tối thiểu đến chuẩn: vẫn hưởng đủ. Dưới tối thiểu: tính theo ngày công thực tế.">/${f2(sc.standard)}</div>`; };
    const f2 = n => String(Math.round(n * 100) / 100);
    const secOf = e => e.employee_type === 'manager' ? 'Bộ phận quản lý' : e.employee_type === 'admin' ? 'Bộ phận hành chính' : (e.shift_no ? `Công nhân vận hành — Kíp ${e.shift_no}` : 'Công nhân vận hành');
    function paint() {
      let lastSec = null;
      const secRow = e => { if (d.sheet.group_kind !== 'plant') return ''; const t = secOf(e); if (t === lastSec) return ''; lastSec = t; return `<tr class="secrow"><td colspan="${days.length + 8 + (d.sheet.show_safety ? 1 : 0) + (d.sheet.use_labor ? 1 : 0)}" style="background:#f1f5f9;font-weight:600;font-style:italic">${esc(t)}</td></tr>`; };
      root.innerHTML = `<div class="card"><div class="row"><button class="btn sec" id="back">← Danh sách</button><h2 class="grow" style="margin:0">${esc(d.sheet.name)} — ${d.month}/${d.year}</h2>${badge(d.period.status)}
        ${d.partial ? '' : '<button class="btn sec" id="xl">Xuất Excel</button>'}<button class="btn sec" id="hist">Lịch sử thay đổi</button></div>
        ${d.nextStep ? `<div class="info">${esc(d.nextStep)}</div>` : ''}
        ${d.period.note && d.period.status === 'draft' ? `<div class="warnbox"><b>Bị trả lại:</b> ${esc(d.period.note)}</div>` : ''}
        ${!d.canEdit ? `<div class="muted small" style="margin-bottom:8px">Bạn đang ở chế độ <b>chỉ xem</b> — ${!d.open ? 'tháng chưa đến' : d.period.status === 'locked' ? 'bảng đã khoá, chỉ Admin mở khoá được' : 'bảng chưa đến lượt bạn sửa, hoặc đã chuyển lên cấp trên'}.</div>` : ''}
        ${d.canEdit ? '<div id="attbar" class="attbar"></div>' : ''}
        <div class="scroll attwrap"><table class="att main"><thead><tr><th>Họ tên</th><th class="pos">Chức danh</th>${days.map(day => `<th class="c ${holDay[day] ? 'hol' : wk(day) === 0 ? 'sun' : ''}" data-d="${day}" title="${esc(holDay[day] || '')}" title2="" style="cursor:${d.canEdit ? 'pointer' : 'default'}">${day}<br><span class="muted">${WD[wk(day)]}</span></th>`).join('')}<th class="n" title="Công ca ngày (K1, K2…)">Ngày</th><th class="n" title="Công ca đêm (K3, K1,3…)">Đêm</th><th class="n" title="Công sửa chữa (SC1, SC2…)">SC</th><th class="n" title="Nghỉ phép / nghỉ bù có lương">Phép/<wbr>bù</th><th class="n" title="Công thường = ngày + đêm + sửa chữa + phép/bù (chưa gồm làm thêm)">Công</th><th class="n" title="Công làm thêm (LT1–LT4…), trả riêng theo % ký hiệu">Làm thêm</th>${d.sheet.show_safety ? '<th class="rt" title="Xếp loại an toàn A/B — chỉ người có phụ cấp an toàn">An toàn<br><span class="muted">A / B</span></th>' : ''}${d.sheet.use_labor ? '<th class="rt">Xếp loại LĐ</th>' : ''}</tr></thead>
        <tbody>${d.employees.map(e => secRow(e) + `<tr data-e="${e.id}"><td class="name" style="cursor:${d.canEdit ? 'pointer' : 'default'}">${d.canEdit && edOf[e.id] ? `<button class="rowtool" data-rt="${e.id}" title="Điền nhanh cả hàng / theo chu kỳ kíp (vd 4 làm – 4 nghỉ)">⋯</button>` : ''}<b>${esc(e.full_name)}</b><div class="muted small">${esc(e.department_name || '')}${e.is_lead ? ' <span class="badge">Trưởng ca</span>' : ''}${e.shift_no ? ` <span class="badge">Kíp ${e.shift_no}</span>` : ''}</div></td><td class="pos">${esc(e.pos_disp || '')}</td>
          ${days.map(day => { const v = val(e.id, day), o = d.original?.[e.id]?.[day] || ''; const c = codeBy[v];
            return `<td class="c ${holDay[day] ? 'hol' : isOff(e.id, day) ? 'sun' : ''} ${d.original && (v || '') !== o ? 'chg' : ''} ${dirty.has(e.id + ':' + day) ? 'dirty' : ''} ${d.canEdit && !edOf[e.id] ? 'ro' : ''}" data-e="${e.id}" data-d="${day}" style="${c ? 'background:' + esc(c.color) : ''}" title="${d.original && (v || '') !== o ? 'Bản gốc: ' + esc(o || '(trống)') : ''}">${esc(v)}</td>`; }).join('')}
          ${['day', 'night', 'sc', 'leave'].map(k => `<td class="n" data-b="${k}">${bucket(e.id, k) ? f2(bucket(e.id, k)) : '<span class="muted">·</span>'}</td>`).join('')}<td class="n" id="t${e.id}"><b>${f2(total(e.id))}</b>${stat(e.id)}</td><td class="n" data-b="ot">${bucket(e.id, 'ot') ? `<b style="color:#1d4ed8">${f2(bucket(e.id, 'ot'))}</b>` : '<span class="muted">·</span>'}</td>${d.sheet.show_safety ? `<td class="rt">${e.has_safety || d.sheet.use_safety ? gradeSel(e.id, 'safety', d.safetyGrades) : '<span class="muted small">—</span>'}</td>` : ''}${d.sheet.use_labor ? `<td class="rt">${gradeSel(e.id, 'labor', d.laborGrades.map(x => x.grade))}</td>` : ''}</tr>`).join('')}</tbody></table></div>
        ${d.sheet.show_safety ? `<div class="muted small" style="margin-top:6px">Xếp loại an toàn (chỉ người có phụ cấp an toàn): A = hưởng 100% phụ cấp, B = không hưởng. Chưa chấm = hưởng 100%.</div>` : ''}
        ${d.sheet.use_labor ? `<div class="muted small" style="margin-top:6px">Xếp loại lao động: ${d.laborGrades.map(g => `${g.grade} = ×${Number(g.factor)}`).join(' · ')} (nhân vào lương theo hệ số và thưởng định kỳ; chưa chấm = ×1).</div>` : ''}
        ${(d.holidays || []).length ? `<div class="muted small" style="margin-top:6px">Cột <span style="background:#ffe0b2;padding:0 4px">cam</span> = ngày lễ / nghỉ bù: ${d.holidays.map(h => `${Number(h.date.slice(8))}/${d.month} ${esc(h.name)}`).join('; ')}. Cột <span style="background:#ffe4e6;padding:0 4px">hồng</span> = ngày nghỉ hằng tuần của từng người (theo cài đặt Công chuẩn).</div>` : ''}
        ${d.original ? '<div class="muted small" style="margin-top:6px">Ô viền cam = đã được cấp 2 điều chỉnh so với bản gốc người chấm gửi lên.</div>' : ''}
        <div id="mealgrid"></div>
        <div class="row" style="margin-top:12px">${d.canEdit ? `<button class="btn" id="save">Lưu${dirty.size + rateDirty.size + mealDirty.size ? ` (${dirty.size + rateDirty.size + mealDirty.size} thay đổi)` : ''}</button>` : ''}
        ${d.actions.map(a => `<button class="btn ${a.key.includes('return') ? 'red' : 'warn'}" data-a="${a.key}" data-n="${a.needNote ? 1 : 0}">${esc(a.label)}</button>`).join('')}</div></div>`;
      wire();
    }
    // ---------- Thao tác chấm công thông minh ----------
    // Vùng chọn: hình chữ nhật (hàng r1..r2 × ngày d1..d2). Bấm/kéo chuột = tô ký hiệu đang chọn; bấm tên = chọn cả hàng; bấm số ngày = chọn cả cột.
    // Bàn phím: mũi tên (Shift = mở rộng vùng), gõ ký hiệu rồi Enter, Space/Enter = điền, Delete = xoá, Ctrl+Z = hoàn tác.
    const nEmp = d.employees.length, undo = [], empIdx = Object.fromEntries(d.employees.map((e, i) => [e.id, i]));
    let pk = null, painting = null, typed = '', typedTimer = null, hlPrev = [];
    const cellEl = (r, day) => root.querySelector(`td.c[data-e="${d.employees[r]?.id}"][data-d="${day}"]`);
    const setVal = (e, day, code) => { const k = e + ':' + day, orig = d.entries[e]?.[day] || ''; if (code === orig) dirty.delete(k); else dirty.set(k, code); };
    function drawCell(e, day) {
      const td = root.querySelector(`td.c[data-e="${e}"][data-d="${day}"]`); if (!td) return;
      const v = val(e, day), o = d.original?.[e]?.[day] || '', c = codeBy[v];
      td.textContent = v; td.style.background = c ? c.color : '';
      td.classList.toggle('dirty', dirty.has(e + ':' + day)); td.classList.toggle('chg', !!d.original && (v || '') !== o);
    }
    function refreshRow(e) {
      const tr = root.querySelector(`tr[data-e="${e}"]`); if (!tr) return;
      for (const k of ['day', 'night', 'sc', 'leave', 'ot']) { const td = tr.querySelector(`td[data-b="${k}"]`), v = bucket(e, k); if (td) td.innerHTML = v ? (k === 'ot' ? `<b style="color:#1d4ed8">${f2(v)}</b>` : f2(v)) : '<span class="muted">·</span>'; }
      const t = tr.querySelector('#t' + e); if (t) t.innerHTML = `<b>${f2(total(e))}</b>${stat(e)}`;
    }
    function updateBar() { const sv = $('#save'); if (sv) sv.textContent = `Lưu${dirty.size + rateDirty.size + mealDirty.size ? ` (${dirty.size + rateDirty.size + mealDirty.size} thay đổi)` : ''}`; drawBar(); }
    // list = [[empId, day, code]]; ghi 1 lần để hoàn tác được cả cụm
    function put(list) {
      const batch = []; const rows = new Set();
      for (const [e, day, code] of list) { if (!edOf[e]) continue; const prev = val(e, day); if (prev === code) continue; batch.push([e, day, prev]); setVal(e, day, code); drawCell(e, day); rows.add(e); }
      if (batch.length) { if (painting && painting.ref) painting.ref.push(...batch); else { undo.push(batch); if (painting) painting.ref = batch; if (undo.length > 100) undo.shift(); } rows.forEach(refreshRow); updateBar(); }
      return batch.length;
    }
    function doUndo() { const b = undo.pop(); if (!b) return toast('Không còn thao tác để hoàn tác'); const rows = new Set(); for (const [e, day, prev] of b.reverse()) { setVal(e, day, prev); drawCell(e, day); rows.add(e); } rows.forEach(refreshRow); updateBar(); }
    const rect = () => pk && { r1: Math.min(pk.ar, pk.fr), r2: Math.max(pk.ar, pk.fr), d1: Math.min(pk.ad, pk.fd), d2: Math.max(pk.ad, pk.fd) };
    function selCells() { const R = rect(), out = []; if (!R) return out; for (let r = R.r1; r <= R.r2; r++) { const e = d.employees[r]; if (e && edOf[e.id]) for (let day = R.d1; day <= R.d2; day++) out.push([e.id, day]); } return out; }
    function drawSel() {
      root.querySelectorAll('.selc,.selfocus').forEach(x => x.classList.remove('selc', 'selfocus'));
      const R = rect(); if (!R) return;
      for (let r = R.r1; r <= R.r2; r++) for (let day = R.d1; day <= R.d2; day++) cellEl(r, day)?.classList.add('selc');
      cellEl(pk.fr, pk.fd)?.classList.add('selfocus'); drawBar();
    }
    const selectOne = (r, day) => { pk = { ar: r, ad: day, fr: r, fd: day }; drawSel(); };
    function fillSel(code) { const n = put(selCells().map(([e, day]) => [e, day, code])); if (!n) toast('Không có ô nào thay đổi'); }
    function drawBar() {
      const bar = $('#attbar'); if (!bar) return; const c = codeBy[cur], n = selCells().length;
      bar.innerHTML = `<div class="row" style="gap:10px;align-items:center">
        <div class="curcode" title="Ký hiệu đang chọn: bấm/kéo vào ô ngày sẽ điền ký hiệu này">Đang chọn: <span class="chip on" style="background:${esc(c?.color || '#eee')}">${cur ? esc(cur) : '✕ Xoá ô'}</span> <span class="muted small">${c ? esc(c.name) : 'bấm/kéo vào ô sẽ xoá ô đó'}</span></div>
        <div class="grow"></div>
        ${n ? `<span class="small"><b>Vùng chọn: ${n} ô</b></span><button class="btn sm" id="selfill">Điền "${cur || 'xoá'}" vào vùng chọn</button><button class="btn sec sm" id="selclr">Xoá vùng chọn</button>` : '<span class="muted small">Bấm tên = chọn cả hàng · bấm số ngày = chọn cả cột</span>'}
        <button class="btn sec sm" id="undo" ${undo.length ? '' : 'disabled'} title="Ctrl+Z">↶ Hoàn tác</button><button class="btn sec sm" id="keys">⌨ Phím tắt</button></div>
        <div class="palette" style="margin-top:6px">${d.codes.map(c => `<span class="chip ${c.code === cur ? 'on' : ''}" data-c="${esc(c.code)}" style="background:${esc(c.color)}" title="${esc(c.name)} · ${c.work_day} công ngày + ${c.work_night} công đêm">${esc(c.code)}</span>`).join('')}<span class="chip ${cur === '' ? 'on' : ''}" data-c="" style="background:#eee">✕ Xoá</span>${typed ? `<span class="typed">Gõ: <b>${esc(typed)}</b> ⏎</span>` : ''}</div>`;
      bar.querySelectorAll('.chip').forEach(ch => ch.onclick = () => { cur = ch.dataset.c; drawBar(); });
      const f = $('#selfill'); if (f) f.onclick = () => fillSel(cur); const x = $('#selclr'); if (x) x.onclick = () => fillSel('');
      $('#undo').onclick = doUndo;
      $('#keys').onclick = () => modal(`<h2>Cách chấm công nhanh<span class="x">✕</span></h2><div class="small" style="line-height:1.8">
        <b>Chuột:</b> chọn ký hiệu ở thanh trên → <b>bấm hoặc kéo chuột</b> qua các ô để tô nhanh. <b>Shift + bấm</b> = tô cả vùng từ ô trước đến ô này.<br>
        <b>Bấm tên người</b> = chọn cả hàng, <b>bấm số ngày</b> = chọn cả cột (chưa thay đổi gì cho đến khi bấm "Điền").<br>
        <b>Nút ⋯ cạnh tên:</b> điền cả hàng hoặc điền theo chu kỳ kíp (vd 4 ngày làm – 4 ngày nghỉ), áp dụng cho một người, cả kíp hoặc cả bảng.<br>
        <b>Sao chép:</b> quét chọn vài ô → <b>Ctrl+C</b>, bấm ô đích (hoặc quét chọn vùng đích) → <b>Ctrl+V</b>. Dán 1 ô vào vùng lớn = điền cả vùng. Dán được cả từ Excel. <b>Ctrl+X</b> = cắt.<br>
        <b>Bàn phím:</b> mũi tên = di chuyển · Shift + mũi tên = mở rộng vùng chọn · gõ ký hiệu (vd K1) rồi <b>Enter</b> = điền và sang ngày kế · <b>Space</b> = điền ký hiệu đang chọn · <b>Delete</b> = xoá ô · <b>Ctrl+Z</b> = hoàn tác.<br>
        Ô viền xanh = đã sửa chưa lưu. Nhớ bấm <b>Lưu</b>.</div>`);
    }
    function moveSel(dr, dd, extend) {
      if (!pk) { selectOne(0, 1); return; }
      const fr = Math.max(0, Math.min(nEmp - 1, pk.fr + dr)), fd = Math.max(1, Math.min(d.days, pk.fd + dd));
      pk = extend ? { ...pk, fr, fd } : { ar: fr, ad: fd, fr, fd }; drawSel(); cellEl(fr, fd)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function commitTyped() {
      clearTimeout(typedTimer); const t = typed.trim().toUpperCase(); typed = '';
      if (!t) return drawBar();
      const c = d.codes.find(x => x.code.toUpperCase() === t);
      if (!c) { toast(`Không có ký hiệu "${t}"`); return drawBar(); }
      cur = c.code; if (!pk) selectOne(0, 1);
      fillSel(cur); if (pk.ar === pk.fr && pk.ad === pk.fd) moveSel(0, 1, false); else drawBar();
    }
    function onKey(ev) {
      if (!root.querySelector('table.att') || !d.canEdit) { document.removeEventListener('keydown', onKey); return; }
      const t = ev.target; if (document.querySelector('.modalback') || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      const k = ev.key;
      if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'z') { ev.preventDefault(); return doUndo(); }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const mv = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[k];
      if (mv) { ev.preventDefault(); commitTyped(); return moveSel(mv[0], mv[1], ev.shiftKey); }
      if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); if (typed) { typed = typed.slice(0, -1); return drawBar(); } return fillSel(''); }
      if (k === 'Escape') { typed = ''; pk = null; drawSel(); return; }
      if (k === 'Enter') { ev.preventDefault(); if (typed) return commitTyped(); if (pk) { fillSel(cur); if (pk.ar === pk.fr && pk.ad === pk.fd) moveSel(0, 1, false); } return; }
      if (k === ' ') { ev.preventDefault(); if (typed) return commitTyped(); if (pk) fillSel(cur); return; }
      if (k.length === 1 && /[A-Za-z0-9,]/.test(k)) { ev.preventDefault(); typed += k; drawBar(); clearTimeout(typedTimer); typedTimer = setTimeout(commitTyped, 1500); }
    }
    // Sao chép / dán (Ctrl+C, Ctrl+X, Ctrl+V): dùng được với vùng chọn, dán được cả từ Excel (các ô cách nhau bằng Tab)
    let clip = null;
    const inField = t => /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || document.querySelector('.modalback');
    function copyText(cut) {
      const R = rect(); if (!R) return null; const lines = [];
      for (let r = R.r1; r <= R.r2; r++) { const e = d.employees[r]; const row = []; for (let day = R.d1; day <= R.d2; day++) row.push(e ? val(e.id, day) || '' : ''); lines.push(row); }
      clip = lines; if (cut) fillSel(''); return lines.map(l => l.join('\t')).join('\n');
    }
    function pasteText(txt) {
      let grid = txt != null && txt.trim() !== '' ? txt.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t').map(x => x.trim().toUpperCase())) : clip;
      if (!grid || !grid.length) return toast('Chưa có gì để dán — hãy quét chọn vài ô rồi Ctrl+C');
      const bad = new Set(); grid = grid.map(l => l.map(x => { if (x && !codeBy[x]) { bad.add(x); return null; } return x; }));
      if (!pk) return toast('Bấm chọn ô đích trước khi dán');
      const R = rect(), list = [];
      const single = grid.length === 1 && grid[0].length === 1;
      if (single && (R.r2 > R.r1 || R.d2 > R.d1)) { for (const [e, day] of selCells()) if (grid[0][0] !== null) list.push([e, day, grid[0][0]]); }
      else for (let i = 0; i < grid.length; i++) for (let j = 0; j < grid[i].length; j++) { const e = d.employees[R.r1 + i], day = R.d1 + j; if (!e || day > d.days || grid[i][j] === null) continue; list.push([e.id, day, grid[i][j]]); }
      const n = put(list); const sk = list.length - n;
      pk = single ? pk : { ar: R.r1, ad: R.d1, fr: Math.min(nEmp - 1, R.r1 + grid.length - 1), fd: Math.min(d.days, R.d1 + grid[0].length - 1) }; drawSel();
      toast(n ? `Đã dán ${n} ô${bad.size ? ` — bỏ qua ký hiệu lạ: ${[...bad].join(', ')}` : ''} (Ctrl+Z để hoàn tác)` : bad.size ? `Không dán được — ký hiệu lạ: ${[...bad].join(', ')}` : 'Không có ô nào thay đổi', !n && bad.size > 0);
    }
    const onCopy = ev => { if (!root.querySelector('table.att') || inField(ev.target) || !pk) return; const t = copyText(ev.type === 'cut'); if (t != null) { ev.clipboardData.setData('text/plain', t); ev.preventDefault(); if (ev.type === 'copy') toast(`Đã chép ${rect().r2 - rect().r1 + 1}×${rect().d2 - rect().d1 + 1} ô — chọn ô đích rồi Ctrl+V`); } };
    const onPaste = ev => { if (!root.querySelector('table.att') || inField(ev.target) || !d.canEdit) return; ev.preventDefault(); pasteText(ev.clipboardData.getData('text/plain')); };
    for (const [n, f] of [['copy', onCopy], ['cut', onCopy], ['paste', onPaste]]) { const k = '__att_' + n; if (window[k]) document.removeEventListener(n, window[k]); window[k] = f; document.addEventListener(n, f); }
    // Chu kỳ kíp / điền cả hàng
    async function rowTool(empId) {
      const r = d.employees.findIndex(e => e.id === empId), e = d.employees[r];
      const codeOpts = (blank) => [...(blank ? [{ v: '', t: '(để trống)' }] : []), ...d.codes.map(c => ({ v: c.code, t: `${c.code} — ${c.name}` }))];
      const scopeOpts = [{ v: 'one', t: 'Chỉ ' + e.full_name }, ...(e.shift_no ? [{ v: 'shift', t: `Cả Kíp ${e.shift_no} (cùng bảng)` }] : []), { v: 'all', t: 'Tất cả người trong bảng' }];
      const a = await ask('Điền nhanh — ' + e.full_name, [
        { label: 'Cách điền', type: 'select', options: [{ v: 'fill', t: 'Một ký hiệu cho cả dải ngày' }, { v: 'cycle', t: 'Theo chu kỳ làm / nghỉ (kíp)' }, { v: 'clear', t: 'Xoá dải ngày' }], value: e.shift_no ? 'cycle' : 'fill' },
        { label: 'Áp dụng cho', type: 'select', options: scopeOpts },
        { label: 'Từ ngày', type: 'number', value: 1 }, { label: 'Đến ngày', type: 'number', value: d.days },
        { label: 'Ký hiệu (điền 1 ký hiệu) / ký hiệu ngày làm (chu kỳ)', type: 'select', options: codeOpts(false), value: cur || d.codes[0]?.code },
        { label: 'Ký hiệu ngày nghỉ trong chu kỳ (vd NP, hoặc để trống)', type: 'select', options: codeOpts(true) },
        { label: 'Chu kỳ: số ngày làm liên tiếp', type: 'number', value: 4 }, { label: 'Chu kỳ: số ngày nghỉ liên tiếp', type: 'number', value: 4 },
        { label: 'Ngày đầu của dải là ngày thứ mấy trong chu kỳ (1 = ngày làm đầu tiên)', type: 'number', value: 1 }], 'Điền');
      if (!a) return;
      const [mode, scope, f, t, code, rest, nW, nR, st] = a, from = Math.max(1, +f || 1), to = Math.min(d.days, +t || d.days), W = Math.max(1, +nW || 1), R0 = Math.max(0, +nR || 0), S = Math.max(1, +st || 1);
      const targets = scope === 'all' ? d.employees : scope === 'shift' ? d.employees.filter(x => x.shift_no === e.shift_no) : [e];
      const list = [];
      for (const x of targets) for (let day = from; day <= to; day++) {
        let c = mode === 'clear' ? '' : code;
        if (mode === 'cycle') { const pos = ((day - from) + (S - 1)) % (W + R0); c = pos < W ? code : rest; }
        list.push([x.id, day, c]);
      }
      const n = put(list); toast(n ? `Đã điền ${n} ô (chưa lưu — bấm Lưu)` : 'Không có ô nào thay đổi');
    }
    function setHl(td) {
      hlPrev.forEach(x => x.classList.remove('hl')); hlPrev = [];
      if (!td) return; const tr = td.parentElement, th = root.querySelector(`th.c[data-d="${td.dataset.d}"]`), nm = tr.querySelector('td.name');
      for (const x of [th, nm]) if (x) { x.classList.add('hl'); hlPrev.push(x); }
    }
    function wireAtt() {
      const tbl = root.querySelector('table.att'); if (!tbl) return;
      tbl.addEventListener('mouseover', ev => setHl(ev.target.closest('td.c')));
      tbl.addEventListener('mouseleave', () => setHl(null));
      if (!d.canEdit) return;
      const cellAt = td => ({ r: empIdx[td.dataset.e], day: +td.dataset.d, e: td.dataset.e });
      tbl.addEventListener('mousedown', ev => {
        const td = ev.target.closest('td.c'); if (!td || ev.button !== 0) return;
        const c = cellAt(td); if (!edOf[c.e]) return; ev.preventDefault(); commitTyped();
        if (ev.shiftKey && pk) { const R = rect(); pk = { ar: pk.ar, ad: pk.ad, fr: c.r, fd: c.day }; const n = put(selCells().map(([e, day]) => [e, day, cur])); drawSel(); return; }
        painting = []; const b0 = c; selectOne(c.r, c.day); painting.push(c.e + ':' + c.day); put([[c.e, c.day, cur]]);
      });
      tbl.addEventListener('mouseover', ev => {
        if (!painting) return; const td = ev.target.closest('td.c'); if (!td) return; const c = cellAt(td), k = c.e + ':' + c.day;
        if (!edOf[c.e] || painting.includes(k)) return; painting.push(k); put([[c.e, c.day, cur]]); pk = { ...pk, fr: c.r, fd: c.day, ar: c.r, ad: c.day }; drawSel();
      });
      document.addEventListener('mouseup', () => { painting = null; });
      tbl.addEventListener('click', ev => {
        const th = ev.target.closest('th.c'), nm = ev.target.closest('td.name'), rt = ev.target.closest('.rowtool');
        if (rt) { ev.stopPropagation(); return rowTool(rt.dataset.rt); }
        if (th) { const day = +th.dataset.d; pk = { ar: 0, ad: day, fr: nEmp - 1, fd: day }; drawSel(); }
        else if (nm) { const r = empIdx[nm.parentElement.dataset.e]; pk = { ar: r, ad: 1, fr: r, fd: d.days }; drawSel(); }
      });
      document.removeEventListener('keydown', window.__attKey); window.__attKey = onKey; document.addEventListener('keydown', onKey);
      drawBar();
    }
    function wire() {
      $('#back').onclick = () => { document.removeEventListener('keydown', onKey); list(); }; $('#hist').onclick = guard(history);
      if ($('#xl')) $('#xl').onclick = guard(() => download(`/api/attendance/${sheetId}/${ymState.year}/${ymState.month}/export`, `bang-cham-cong-${d.sheet.name}-${ymState.year}-${String(ymState.month).padStart(2, '0')}.xlsx`));
      root.querySelectorAll('select[data-r]').forEach(sl => sl.onchange = () => { const o = rateDirty.get(sl.dataset.e) || {}; o[sl.dataset.r] = sl.value; rateDirty.set(sl.dataset.e, o); sl.style.background = '#fef9c3'; });
      if (d.canEdit) $('#save').onclick = guard(async () => { await saveAll(); await open(); });
      wireAtt(); mealGrid();
      root.querySelectorAll('[data-a]').forEach(b => b.onclick = guard(async () => {
        let note = '';
        if (b.dataset.n === '1') { const r = await ask('Lý do trả lại', [{ label: 'Lý do', type: 'textarea' }], 'Trả lại'); if (!r) return; note = r[0]; }
        if (dirty.size || mealDirty.size || rateDirty.size) await saveAll();
        await POST(`/api/attendance/${d.period.id}/action`, { action: b.dataset.a, note }); toast('Đã thực hiện: ' + b.textContent); await open();
      }));
    }
    async function saveAll() {
      if (dirty.size) { await POST(`/api/attendance/${d.period.id}/cells`, { changes: [...dirty].map(([k, code]) => { const [employeeId, day] = k.split(':'); return { employeeId, day: +day, code }; }) }); }
      if (mealDirty.size) {
        const byT = new Map(); for (const [k, qty] of mealDirty) { const [t, rest] = k.split('|'), [employeeId, day] = rest.split(':'); (byT.get(t) || byT.set(t, []).get(t)).push(typeof qty === 'string' ? { employeeId, day: +day, code: qty, qty: 0 } : { employeeId, day: +day, qty }); }
        for (const [mealTypeId, changes] of byT) await POST(`/api/attendance/${d.period.id}/meal-cells`, { mealTypeId, changes });
      }
      if (rateDirty.size) { await POST(`/api/attendance/${d.period.id}/ratings`, { changes: [...rateDirty].map(([employeeId, o]) => ({ employeeId, ...o })) }); }
      dirty.clear(); mealDirty.clear(); rateDirty.clear(); toast('Đã lưu');
    }
    // Bảng chấm ăn ca riêng (Kiểu 2) / ăn chờ ca (Kiểu 3): chỉ hiện cho người thuộc bộ phận được cài kiểu đó (Quản trị › Tổ chức & liên kết SSO)
    // Chấm bằng ký hiệu công như bảng chấm công; mỗi ký hiệu = số suất ở cột "Suất ăn" (Cấu hình › Ký hiệu công). Ô số cũ (dữ liệu trước đây) vẫn giữ và tính.
    const mealSel = {}, mealCur = {}; let mealPaint = null;
    document.addEventListener('mouseup', () => { mealPaint = null; }, { once: false });
    function mealGrid() {
      const box = $('#mealgrid'); if (!box) return;
      const act = d.employees.filter(e => e.meal_mode === 'actual'), wait = d.employees.filter(e => e.meal_mode === 'auto_wait');
      const secs = [];
      if (act.length) secs.push({ key: 'act', title: 'Bảng chấm ăn ca riêng (Kiểu 2)', hint: 'Bộ phận này tính tiền ăn theo bảng này (không tính theo bảng chấm công phía trên).', emps: act, types: d.mealTypes.filter(t => !t.is_wait) });
      if (wait.length) secs.push({ key: 'wait', title: 'Bảng chấm ăn chờ ca (Kiểu 3)', hint: 'Ngoài ăn ca tự động theo ký hiệu công, bộ phận này được thêm tiền ăn chờ ca theo bảng này.', emps: wait, types: d.mealTypes.filter(t => t.is_wait) });
      const mk = (t, e, day) => `${t}|${e}:${day}`, orig = (t, e, day) => d.mealActual?.[t]?.[e]?.[day] ?? '';
      const raw = (t, e, day) => mealDirty.has(mk(t, e, day)) ? mealDirty.get(mk(t, e, day)) : orig(t, e, day);
      const qtyOf = v => typeof v === 'number' ? v : v ? Number(d.mealQty?.[v] ?? codeBy[v]?.meal_qty ?? 0) : 0;
      const tot = (t, e) => f2(days.reduce((a, x) => a + qtyOf(raw(t, e, x)), 0));
      const cellHtml = (t, e, x) => { const v = raw(t, e, x), c = typeof v === 'string' ? codeBy[v] : null, q = qtyOf(v), ed = d.canEdit && edOf[e];
        return `<td class="c ${holDay[x] ? 'hol' : isOff(e, x) ? 'sun' : ''} ${mealDirty.has(mk(t, e, x)) ? 'dirty' : ''} ${d.canEdit && !ed ? 'ro' : ''}" data-mt2="${t}" data-e="${e}" data-d="${x}" style="${c ? 'background:' + esc(c.color) + ';' : ''}cursor:${ed ? 'pointer' : 'default'}" title="${v === '' ? '' : typeof v === 'number' ? 'Số suất nhập tay (dữ liệu cũ): ' + v : esc(v) + ' = ' + q + ' suất'}">${typeof v === 'number' ? `<i class="muted">${v}</i>` : `${esc(v)}${v && !q ? '<sup style="color:#b91c1c">0</sup>' : ''}`}</td>`; };
      box.innerHTML = secs.map(sc => {
        const t = sc.types.find(x => x.id === mealSel[sc.key]) || sc.types[0]; if (!t) return `<div class="warnbox">Chưa có loại suất ăn cho "${esc(sc.title)}" — vào Quản trị › Cấu hình để thêm.</div>`; mealSel[sc.key] = t.id;
        if (!(sc.key in mealCur)) mealCur[sc.key] = (d.codes.find(c => Number(c.meal_qty) > 0) || d.codes[0] || {}).code || '';
        const cur = mealCur[sc.key];
        return `<div class="mealsec" data-k="${sc.key}" style="margin-top:14px"><div class="row"><h3 class="grow" style="margin:0">${esc(sc.title)}</h3>${d.canEdit ? `<button class="btn sec sm" data-mcopy="${sc.key}" title="Điền các ô còn trống bằng ký hiệu ở bảng chấm công phía trên (chỉ ký hiệu có suất ăn > 0)">Chép từ bảng chấm công</button>` : ''}${sc.types.length > 1 ? `<select data-mt="${sc.key}">${sc.types.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : `<span class="badge">${esc(t.name)}</span>`}</div>
          <div class="muted small" style="margin:4px 0">${esc(sc.hint)} Chọn ký hiệu rồi bấm/kéo vào ô ngày như bảng chấm công, xong bấm <b>Lưu</b>. Mỗi ký hiệu tính theo số suất ở cột "Suất ăn" của ký hiệu (Quản trị › Cấu hình › Ký hiệu công); số nhỏ đỏ <sup style="color:#b91c1c">0</sup> = ký hiệu không tính suất ăn.</div>
          ${d.canEdit ? `<div class="palette" style="margin:4px 0 6px">${d.codes.map(c => `<span class="chip ${c.code === cur ? 'on' : ''}" data-mc="${esc(c.code)}" data-k="${sc.key}" style="background:${esc(c.color)}${Number(c.meal_qty) > 0 ? '' : ';opacity:.55'}" title="${esc(c.name)} · ${Number(c.meal_qty) || 0} suất">${esc(c.code)}${Number(c.meal_qty) !== 1 ? `<sub>${Number(c.meal_qty) || 0}</sub>` : ''}</span>`).join('')}<span class="chip ${cur === '' ? 'on' : ''}" data-mc="" data-k="${sc.key}" style="background:#eee">✕ Xoá</span></div>` : ''}
          <div class="scroll attwrap" style="max-height:420px"><table class="att"><thead><tr><th>Họ tên</th>${days.map(x => `<th class="c ${holDay[x] ? 'hol' : wk(x) === 0 ? 'sun' : ''}" style="cursor:default">${x}<br><span class="muted">${WD[wk(x)]}</span></th>`).join('')}<th class="n" title="Tổng số suất">Suất</th></tr></thead><tbody>${sc.emps.map(e => `<tr data-me="${e.id}"><td class="name"><b>${esc(e.full_name)}</b><div class="muted small">${esc(e.department_name || '')}</div></td>${days.map(x => cellHtml(t.id, e.id, x)).join('')}<td class="n" data-tot="${e.id}">${tot(t.id, e.id)}</td></tr>`).join('')}</tbody></table></div></div>`;
      }).join('');
      const setCell = (t, e, x, v) => {
        if (!(d.canEdit && edOf[e])) return;
        const o = orig(t, e, x); if (v === o || (v === '' && o === '')) mealDirty.delete(mk(t, e, x)); else mealDirty.set(mk(t, e, x), v);
        const td = box.querySelector(`td[data-mt2="${t}"][data-e="${e}"][data-d="${x}"]`); if (td) td.outerHTML = cellHtml(t, e, x);
        const tt = box.querySelector(`[data-tot="${e}"]`); if (tt) tt.textContent = tot(t, e);
      };
      const secOfEl = el => el.closest('.mealsec')?.dataset.k;
      box.querySelectorAll('select[data-mt]').forEach(sl => sl.onchange = () => { mealSel[sl.dataset.mt] = sl.value; mealGrid(); });
      box.querySelectorAll('[data-mc]').forEach(ch => ch.onclick = () => { mealCur[ch.dataset.k] = ch.dataset.mc; mealGrid(); });
      box.querySelectorAll('tbody').forEach(tb => {
        tb.onmousedown = ev => { const td = ev.target.closest('td[data-mt2]'); if (!td || !d.canEdit) return; ev.preventDefault(); mealPaint = mealCur[secOfEl(td)] ?? ''; setCell(td.dataset.mt2, td.dataset.e, +td.dataset.d, mealPaint); updateBar(); };
        tb.onmouseover = ev => { if (mealPaint === null) return; const td = ev.target.closest('td[data-mt2]'); if (td) { setCell(td.dataset.mt2, td.dataset.e, +td.dataset.d, mealPaint); updateBar(); } };
      });
      box.querySelectorAll('[data-mcopy]').forEach(b => b.onclick = () => {
        const sc = secs.find(x => x.key === b.dataset.mcopy), t = mealSel[sc.key]; let n = 0;
        for (const e of sc.emps) for (const x of days) { const code = val(e.id, x); if (raw(t, e.id, x) === '' && code && qtyOf(code) > 0) { setCell(t, e.id, x, code); n++; } }
        updateBar(); toast(n ? `Đã điền ${n} ô từ bảng chấm công — bấm Lưu để ghi` : 'Không có ô trống nào để điền');
      });
    }
    async function history() {
      const h = await GET(`/api/attendance/${d.period.id}/history`);
      modal(`<h2>Lịch sử thay đổi<span class="x">✕</span></h2><div class="scroll"><table><thead><tr><th>Thời gian</th><th>Người sửa</th><th>Nhân sự</th><th>Ngày</th><th>Nội dung</th><th>Giai đoạn</th></tr></thead><tbody>${h.items.map(i => `<tr><td>${dt(i.changed_at)}</td><td>${esc(i.changed_by_name || '')}</td><td>${esc(i.employee_name || '')}</td><td>${i.day || ''}</td><td>${i.field === 'status' ? 'Trạng thái: ' + esc(i.old_value) + ' → ' + esc(i.new_value) : (({ meal: 'Ăn ca ', safety: 'Xếp loại an toàn ', labor: 'Xếp loại lao động ' })[i.field] || 'Công ') + esc(i.old_value || '(trống)') + ' → ' + esc(i.new_value || '(trống)')}</td><td>${esc(i.stage || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Chưa có thay đổi</td></tr>'}</tbody></table></div>`, true);
    }
    paint();
  }
  await list();
};

// ================= BẢNG LƯƠNG =================
// Tab đang xem ở bảng lương theo hệ số: 'pay' = Bảng lương, 'pit' = Lương + thuế TNCN (giữ nguyên khi đổi tháng / bảng lương)
let PAY_TAB = 'pay';
PAGES.payroll = async (me, root) => {
  // Thuế TNCN của dòng lương (detail.pit): null = dòng tính trước khi có thuế lũy tiến hoặc chưa có biểu thuế (missing)
  const pitOf = l => (l.detail?.pit && !l.detail.pit.missing ? l.detail.pit : null), nz = v => Number(v) || 0;
  // Thu nhập chịu thuế / không tính thuế của dòng: lấy số đã lưu khi tính thuế, dòng cũ thì suy từ các cột lương (cùng công thức)
  const pitTaxable = l => l.detail?.pit ? nz(l.detail.pit.lineTaxable) : nz(l.insurance_salary) + nz(l.allowance) + nz(l.bonus);
  const pitExempt = l => { const e = l.detail?.pit?.exempt; return e ? { night: nz(e.night), extra: nz(e.extra), holiday: nz(e.holiday), meal: nz(e.meal) } : { night: nz(l.night_salary) + nz(l.night_bonus), extra: nz(l.extra_salary) + nz(l.extra_bonus), holiday: nz(l.holiday_salary) + nz(l.holiday_bonus), meal: nz(l.meal_amount) }; };
  const exSum = e => e.night + e.extra + e.holiday + e.meal;
  // Thực lĩnh sau thuế: đã trừ thuế vào thưởng thì thực lĩnh đã là sau thuế; chỉ ước tính thì = thực lĩnh − thuế
  const pitAfter = l => { const p = pitOf(l); return !p ? null : p.withheld ? nz(l.net) : nz(l.net) - nz(l.pit_tax); };
  const PIT_MODE = { none: 'Chỉ ước tính, chưa trừ vào lương', bonus: 'Đã trừ vào thưởng thực nhận' };
  async function list() {
    const r = await GET(`/api/payroll/groups?year=${ymState.year}&month=${ymState.month}`);
    root.innerHTML = `<div class="card"><div class="row"><h2 class="grow">Bảng lương</h2>${ymPicker(me)}</div>
      ${r.groups.length ? `<div class="grid">${r.groups.map(g => `<div class="tile" data-id="${g.id}"><b>${esc(g.name)}</b><div style="margin:6px 0">${badge(g.run?.status || 'none').replace(/>[^<]*</, '>' + esc(g.runLabel) + '<')}${g.run?.stale ? ' <span class="badge draft">Cần tính lại</span>' : ''}</div>
        <div class="small muted">${g.pay_type === 'fixed' ? `Bảng lương khoán · ${g.fixed_count} người` : g.sheets.map(s => esc(s.name) + ': ' + esc(s.statusLabel)).join('<br>') || 'Chưa có bảng chấm công'}</div>
        ${g.line_count ? `<div style="margin-top:6px"><b>${money(g.total_net)}</b> <span class="muted small">thực lĩnh · ${g.line_count} người</span></div>` : ''}</div>`).join('')}</div>` : '<div class="muted">Bạn chưa được phân quyền với bảng lương nào.</div>'}</div>`;
    bindYm(list); root.querySelectorAll('.tile').forEach(t => t.onclick = () => detail(t.dataset.id));
  }
  async function detail(gid) {
    const d = await GET(`/api/payroll/${gid}/${ymState.year}/${ymState.month}`);
    if (d.group.pay_type === 'fixed') return fixedDetail(gid, d);
    const sum = k => d.lines.reduce((s, l) => s + Number(l[k]), 0);
    // Lương thực lĩnh / thưởng thực nhận (như chi tiết từng người); bảng tính trước khi có 2 số này thì suy từ các cột cũ
    const salNet = l => Number(l.detail.salaryNet ?? (+l.insurance_salary + +l.allowance - +l.deduction)), bonNet = l => Number(l.detail.bonusNet ?? l.bonus);
    // Bảng lương trên màn hình: gọn cho vừa một màn hình — chỉ hiện cột Phòng khi bảng có nhiều phòng; cột làm đêm/thêm/lễ, LT ẩn khi cả bảng bằng 0
    function payTable() {
      const L = d.lines, any = f => L.some(l => Number(f(l)) !== 0), tot = f => L.reduce((s, l) => s + Number(f(l) || 0), 0);
      const nightV = l => +l.night_salary + +l.night_bonus, extraV = l => +l.extra_salary + +l.extra_bonus, holV = l => +l.holiday_salary + +l.holiday_bonus;
      const diff = l => { const v = l.detail.diffStd; return `<span style="color:${(v || 0) > 0 ? '#1d4ed8' : (v || 0) < 0 ? '#b91c1c' : '#15803d'}">${v > 0 ? '+' : ''}${v ?? ''}</span>`; };
      const multiDept = new Set(L.map(l => l.department_name || '')).size > 1;
      // [tiêu đề, tooltip, giá trị ô (html), hàm số để cộng tổng | null, class thêm]
      const cols = [
        ['Công', '', l => String(Math.round(Number(l.work_days) * 100) / 100)], ['Chuẩn', 'Công tiêu chuẩn theo hợp đồng của người này trong tháng', l => l.detail.standardDays ?? ''], ['+/−', 'Công thực tế trừ công tiêu chuẩn', diff],
        any(l => l.detail.otWork || 0) && ['LT', 'Công làm thêm (ký hiệu LT)', l => l.detail.otWork || '·'],
        ['Lương BH', 'Lương bảo hiểm, gồm phụ cấp an toàn', l => money(l.insurance_salary), l => l.insurance_salary], ['Thưởng', '', l => money(l.bonus), l => l.bonus],
        any(nightV) && ['Làm đêm', 'Lương + thưởng làm đêm', l => money(nightV(l)), nightV],
        any(extraV) && ['Làm thêm', 'Lương + thưởng làm thêm (công vượt chuẩn, sửa chữa…)', l => money(extraV(l)), extraV],
        any(holV) && ['Làm lễ/tết', 'Lương + thưởng làm ngày lễ, tết', l => money(holV(l)), holV],
        ['Phụ cấp', '', l => money(l.allowance), l => l.allowance], ['Tiền ăn', '', l => money(l.meal_amount), l => l.meal_amount], ['Khoản trừ', '', l => money(l.deduction), l => l.deduction],
        ['Lương thực lĩnh', 'Lương BH + phần làm đêm/thêm/lễ theo hệ số lương + phụ cấp − khoản trừ', l => money(salNet(l)), salNet],
        ['Thưởng thực lĩnh', 'Thưởng + phần làm đêm/thêm/lễ theo hệ số thưởng − khoản trừ vào thưởng', l => money(bonNet(l)), bonNet],
        ['Thực lĩnh tổng', 'Lương thực lĩnh + thưởng thực lĩnh (+ tiền ăn nếu cài cộng vào thực lĩnh)', l => `<b>${money(l.net)}</b>`, l => l.net]].filter(Boolean);
      const firstSum = cols.findIndex(c => c[3]);
      return `<div class="scroll" style="margin-top:10px"><table class="paytb"><thead><tr><th>#</th><th>Họ tên</th><th>Chức danh</th>${multiDept ? '<th>Phòng</th>' : ''}${cols.map(c => `<th class="n"${c[1] ? ` title="${esc(c[1])}"` : ''}>${c[0]}</th>`).join('')}</tr></thead>
        <tbody>${L.map((l, i) => `<tr data-i="${i}" style="cursor:pointer"><td>${i + 1}</td><td class="nm"><b>${esc(l.full_name)}</b>${(l.detail.warnings || []).length ? ` <span class="badge draft" title="${esc(l.detail.warnings.join(', '))}">!</span>` : ''}</td><td class="ps">${esc(l.positions || '')}</td>${multiDept ? `<td class="dp">${esc(l.department_name || '')}</td>` : ''}${cols.map(c => `<td class="n">${c[2](l)}</td>`).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="${3 + (multiDept ? 1 : 0) + firstSum}">Tổng cộng</th>${cols.slice(firstSum).map(c => `<th class="n">${c[3] ? money(tot(c[3])) : ''}</th>`).join('')}</tr></tfoot></table></div>`;
    }
    // Tab "Lương + thuế TNCN (ước tính)": mỗi người một dòng, nhóm theo phòng như bảng lương; tháng 12 = quyết toán thuế cả năm
    function pitTable() {
      const L = d.lines, s12 = d.month === (d.pit?.settleMonth || 12), withP = L.filter(pitOf), A = l => pitOf(l)?.annual || null;
      const sch = d.pit?.schedule || null, p0 = withP[0]?.detail.pit, sy = p0?.scheduleYear || sch?.year;
      const mode = withP.length ? (withP.some(l => l.detail.pit.withheld) ? 'bonus' : 'none') : (d.pit?.withhold || 'none'), cfgMode = d.pit?.withhold || 'none';
      const editable = !d.run || ['draft', 'submitted'].includes(d.run.status), noPit = L.filter(l => !l.detail.pit).length, noSch = L.some(l => l.detail.pit?.missing);
      const exTip = p => { const y = p.extrasYear || {}, x = p.extras || {}; return `Y tế ${money(x.health)} + giáo dục ${money(x.education)} + khác ${money(x.other)} / tháng (cả năm: y tế ${money(y.health)}, giáo dục ${money(y.education)}, khác ${money(y.other)} ÷ 12; y tế, giáo dục tối đa theo biểu thuế)`; };
      const shareTip = (l, p) => p.shared ? ` — người này có lương ở ${p.shared.lines} bảng lương trong tháng: thuế tính trên tổng thu nhập rồi chia theo tỷ lệ thu nhập chịu thuế, bảng này chịu ${money(l.pit_tax)} / ${money(p.tax)}` : '';
      const dedTip = a => `BH bắt buộc ${money(a.insurance)} + bản thân ${a.selfMonths} tháng ${money(a.self)} + người phụ thuộc ${a.dependentMonths} tháng-người × ${money(a.dependentAmount)} = ${money(a.dependent)} + y tế ${money(a.extras?.health)} + giáo dục ${money(a.extras?.education)} + khác ${money(a.extras?.other)}`;
      const sgn = v => `<b class="${v < 0 ? 'pitneg' : ''}">${v > 0 ? '+' : ''}${money(v)}</b>`;
      // {h: tiêu đề, t: tooltip tiêu đề, v: số của dòng (null = trống), tip: tooltip ô, need: chỉ có khi đã tính thuế, b: in đậm, cell: hiển thị riêng}
      const cols = [
        { h: s12 ? 'Thu nhập chịu thuế tháng 12' : 'Thu nhập chịu thuế', t: 'Lương BH (gồm phụ cấp an toàn) + phụ cấp + thưởng', v: pitTaxable, tip: l => `Lương BH ${money(l.insurance_salary)} + phụ cấp ${money(l.allowance)} + thưởng ${money(l.bonus)}` },
        { h: 'Không tính thuế', t: 'Làm đêm + làm thêm + làm lễ tết + tiền ăn ca: không chịu thuế', v: l => exSum(pitExempt(l)), tip: l => { const e = pitExempt(l); return `Làm đêm ${money(e.night)} + làm thêm ${money(e.extra)} + làm lễ ${money(e.holiday)} + ăn ca ${money(e.meal)}`; } },
        ...(s12 ? [
          { h: 'Thu nhập chịu thuế cả năm', t: 'Tháng 1–11 (số đã tính ở các tháng) + tháng 12', need: 1, v: l => A(l)?.taxable, tip: l => `Tháng 1–11: ${money(A(l).taxable - pitOf(l).taxable)} + tháng 12: ${money(pitOf(l).taxable)}` },
          { h: 'Tổng giảm trừ cả năm', t: 'BH bắt buộc + bản thân 12 tháng + người phụ thuộc theo số tháng + y tế / giáo dục / khác cả năm (áp mức tối đa)', need: 1, v: l => A(l)?.totalDeduction, tip: l => dedTip(A(l)) },
          { h: 'Thu nhập tính thuế cả năm', t: 'Thu nhập chịu thuế cả năm − tổng giảm trừ cả năm', need: 1, v: l => A(l)?.assessable },
          { h: 'Thuế cả năm', t: 'Thuế lũy tiến theo biểu thuế cả năm', need: 1, v: l => A(l)?.tax, tip: l => (A(l).parts || []).map(b => `Bậc ${b.level} (${b.rate}%): ${money(b.tax)}`).join(' + ') },
          { h: 'Đã tạm tính T1–T11', t: 'Tổng thuế TNCN tạm tính tháng 1–11', need: 1, v: l => A(l)?.priorTax },
          { h: 'Phải nộp thêm (+) / được hoàn (−)', t: 'Thuế cả năm − đã tạm tính tháng 1–11 (âm = được hoàn)', need: 1, b: 1, v: l => pitOf(l) ? nz(l.pit_tax) : null, cell: sgn, tip: l => `${money(A(l).tax)} − ${money(A(l).priorTax)} = ${money(A(l).settle)}${shareTip(l, pitOf(l))}` }
        ] : [
          { h: 'BH bắt buộc', t: 'BHXH, BHYT, BHTN người lao động đóng (khoản trừ được trừ khi tính thuế)', need: 1, v: l => pitOf(l)?.lineInsurance },
          { h: 'Bản thân', t: 'Giảm trừ gia cảnh cho bản thân / tháng', need: 1, v: l => pitOf(l)?.self },
          { h: 'Người phụ thuộc', t: 'Số người phụ thuộc × mức giảm trừ / người / tháng', need: 1, v: l => pitOf(l)?.dependent, tip: l => `${pitOf(l).dependents} người × ${money(pitOf(l).dependentAmount)}`, cell: (v, l) => `${money(v)}${pitOf(l).dependents ? `<div class="pitsub">${pitOf(l).dependents} × ${money(pitOf(l).dependentAmount)}</div>` : ''}` },
          { h: 'Y tế / giáo dục / khác', t: 'Giảm trừ cả năm của từng người ÷ 12 (y tế, giáo dục tối đa theo biểu thuế)', need: 1, v: l => pitOf(l) ? nz(pitOf(l).extras?.health) + nz(pitOf(l).extras?.education) + nz(pitOf(l).extras?.other) : null, tip: l => exTip(pitOf(l)) },
          { h: 'Thu nhập tính thuế', t: 'Thu nhập chịu thuế − các khoản giảm trừ', need: 1, v: l => pitOf(l)?.assessable, tip: l => { const p = pitOf(l); return `${money(p.taxable)} − giảm trừ ${money(p.totalDeduction)}${p.shared ? ` (tổng thu nhập ở ${p.shared.lines} bảng lương trong tháng)` : ''}`; } },
          { h: 'Thuế TNCN tháng', t: 'Thuế lũy tiến tạm tính: mức trần từng bậc cả năm ÷ 12', need: 1, b: 1, v: l => pitOf(l) ? nz(l.pit_tax) : null, tip: l => (pitOf(l).parts || []).map(b => `Bậc ${b.level} (${b.rate}%): ${money(b.tax)}`).join(' + ') + shareTip(l, pitOf(l)) }
        ]),
        { h: 'Thực lĩnh', t: mode === 'bonus' ? 'Tổng thực lĩnh — đã trừ thuế TNCN vào thưởng thực nhận' : 'Tổng thực lĩnh như tab Bảng lương (chưa trừ thuế TNCN)', v: l => nz(l.net) },
        { h: 'Thực lĩnh sau thuế', t: mode === 'bonus' ? 'Thuế đã trừ vào thưởng thực nhận: bằng cột Thực lĩnh' : 'Thực lĩnh − thuế TNCN (ước tính)', need: 1, b: 1, v: pitAfter, tip: l => pitOf(l).withheld ? 'Đã trừ thuế vào thưởng thực nhận — thực lĩnh đã là sau thuế' : `${money(l.net)} − ${money(l.pit_tax)}` }];
      const multiDept = new Set(L.map(l => l.department_name || '')).size > 1, ncol = 2 + cols.length;
      let lastD = null;
      const tr = (l, i) => {
        const p = pitOf(l), cells = [];
        for (let k = 0; k < cols.length;) {
          const c = cols[k];
          if (c.need && !p) {   // dòng chưa có thuế: gộp các cột thuế liền nhau thành 1 ô ghi chú
            let j = k; while (j + 1 < cols.length && cols[j + 1].need) j++;
            cells.push(j > k ? `<td colspan="${j - k + 1}" class="muted small">${l.detail.pit?.missing ? 'Chưa có biểu thuế TNCN của năm — Admin nhập ở Quản trị › Cấu hình, rồi bấm Tính lại lương' : 'Chưa tính thuế — bấm Tính lại lương'}</td>` : '<td class="n muted">—</td>');
            k = j + 1; continue;
          }
          const v = c.v(l), tp = c.tip ? c.tip(l) : '';
          cells.push(`<td class="n"${tp ? ` title="${esc(tp)}"` : ''}>${v === null || v === undefined ? '' : c.cell ? c.cell(v, l) : c.b ? `<b>${money(v)}</b>` : money(v)}</td>`);
          k++;
        }
        const dh = multiDept && (l.department_name || '') !== lastD ? `<tr class="pitdpt"><td colspan="${ncol}">${esc((lastD = l.department_name || '') || 'Chưa xếp bộ phận')}</td></tr>` : '';
        return `${dh}<tr data-i="${i}" style="cursor:pointer"><td>${i + 1}</td><td class="nm"><b>${esc(l.full_name)}</b>${p?.shared ? `<div class="pitnote" title="${esc(`Lương ở ${p.shared.lines} bảng lương trong tháng: thu nhập chịu thuế cộng chung ${money(p.shared.taxable)}, BH bắt buộc ${money(p.shared.insurance)}; thuế cả tháng ${money(p.tax)}, bảng này chịu ${money(l.pit_tax)}`)}">chia theo tỷ lệ với bảng lương khác cùng tháng</div>` : ''}</td>${cells.join('')}</tr>`;
      };
      const tot = c => L.reduce((s, l) => { if (c.need && !pitOf(l)) return s; const v = c.v(l); return s + nz(v); }, 0);
      return `<div class="info small pithead"><b>${sy ? `Biểu thuế năm ${sy}` : 'Chưa có biểu thuế TNCN'}</b>${p0 || sch ? ` — giảm trừ bản thân ${money(p0 ? p0.self : sch.selfDeduction)} đ/tháng, người phụ thuộc ${money(p0 ? p0.dependentAmount : sch.dependentDeduction)} đ/người/tháng` : ''}${sch && sch.year === sy ? `, ${sch.brackets.length} bậc lũy tiến (mức trần bậc cả năm ÷ 12 khi tạm tính tháng)` : ''}.
          · <b>${PIT_MODE[mode]}</b>${mode === 'bonus' ? ' (khoản "Thuế TNCN" ở bảng thưởng; cột Thực lĩnh đã là sau thuế)' : ''}.
          <br>Thu nhập chịu thuế = lương BH (gồm phụ cấp an toàn) + phụ cấp + thưởng. <b>Không tính thuế:</b> tiền ăn ca, làm đêm, làm thêm, làm lễ tết. Giảm trừ: BH bắt buộc (BHXH, BHYT, BHTN), bản thân, người phụ thuộc, y tế / giáo dục / khác (số cả năm ÷ 12).</div>
        ${s12 ? `<div class="pitbanner"><b>Tháng 12 — quyết toán thuế TNCN cả năm ${d.year}</b><div class="small">Thuế cả năm tính trên tổng thu nhập chịu thuế 12 tháng (giảm trừ bản thân 12 tháng, người phụ thuộc theo số tháng được tính, y tế / giáo dục / khác cả năm theo mức tối đa) rồi trừ số đã tạm tính tháng 1–11. Số dương = phải nộp thêm, số âm = được hoàn.</div></div>` : ''}
        ${!sch || noSch ? '<div class="warnbox small">Chưa có biểu thuế TNCN cho năm này — Admin nhập ở Quản trị › Cấu hình, rồi bấm "Tính lại lương".</div>' : ''}
        ${withP.length && cfgMode !== mode ? `<div class="warnbox small">Cấu hình hiện tại: <b>${PIT_MODE[cfgMode] || cfgMode}</b>, nhưng bảng lương này được tính khi cấu hình là "${PIT_MODE[mode]}"${editable ? ' — bấm "Tính lại lương" để áp dụng.' : ' (bảng đã trình Giám đốc / đã khoá nên giữ nguyên).'}</div>` : ''}
        ${noPit ? `<div class="warnbox small">${noPit} người chưa có số thuế TNCN (bảng lương tính trước khi có thuế lũy tiến) — ${editable ? 'bấm "Tính lại lương".' : 'bảng đã trình Giám đốc / đã khoá: Admin mở khoá rồi tính lại nếu cần.'}</div>` : ''}
        <div class="row small" style="margin:8px 0 0">${d.run ? '<button class="btn sec sm" id="xpit">Xuất Excel bảng thuế TNCN</button>' : ''}<span class="muted">Bấm vào một dòng để xem cách tính thuế từng bước; rê chuột lên ô số để xem cách cộng.</span></div>
        <div class="scroll" style="margin-top:8px"><table class="paytb pittb"><thead><tr><th>#</th><th>Họ tên</th>${cols.map(c => `<th class="n${c.b ? ' pitkey' : ''}" title="${esc(c.t || '')}">${c.h}</th>`).join('')}</tr></thead>
          <tbody>${L.map(tr).join('')}</tbody>
          <tfoot><tr><th colspan="2">Tổng cộng</th>${cols.map(c => `<th class="n">${c.cell === sgn ? sgn(tot(c)) : money(tot(c))}</th>`).join('')}</tr></tfoot></table></div>`;
    }
    root.innerHTML = `<div class="card"><div class="row"><button class="btn sec" id="back">← Danh sách</button><h2 class="grow" style="margin:0">${esc(d.group.name)} — ${d.month}/${d.year}</h2>${badge(d.run?.status || 'none').replace(/>[^<]*</, '>' + esc(d.runLabel) + '<')}${d.run?.stale ? '<span class="badge draft">Cần tính lại</span>' : ''}</div>
      <div class="small muted" style="margin-bottom:8px">${d.sheets.map(s => `${esc(s.name)}: <b>${esc(s.statusLabel)}</b>`).join(' · ')}</div>
      ${d.run?.note ? `<div class="warnbox">Ghi chú: ${esc(d.run.note)}</div>` : ''}
      ${d.run?.provisional_note ? `<div class="info"><b>Lương nháp tạm tính</b> — số liệu cập nhật tự động theo chấm công hiện tại; còn bảng chưa tới cấp 2: ${esc(d.run.provisional_note)}.</div>` : ''}
      <div class="row">${!d.run || ['draft', 'submitted'].includes(d.run.status) ? `<label title="Để trống: mỗi người dùng công chuẩn theo lịch nghỉ + ngày lễ (Quản trị › Công chuẩn). Nhập số: ghi đè cho cả bảng lương này.">Công chuẩn nhập tay</label><input id="std" type="number" step="0.5" style="width:80px" value="${d.run?.std_override || ''}" placeholder="theo lịch">` : ''}
        ${d.actions.map(a => `<button class="btn ${a.key === 'return' || a.key === 'dreturn' || a.key === 'reopen' ? 'red' : a.key === 'calculate' ? '' : 'warn'}" data-a="${a.key}" ${a.enabled ? '' : 'disabled'} title="${esc(a.hint || '')}">${esc(a.label)}</button>`).join('')}
        <button class="btn sec" id="items">Thưởng / khoản trừ tháng</button></div>
      <div class="row small"><b>Xuất Excel (in):</b>${d.run ? `<button class="btn sec sm" id="xemp" title="Từng nhân viên: đủ hệ số, lương, thưởng, ăn ca">Thống kê nhân viên (đủ hệ số)</button><button class="btn sec sm" data-x="luong">Bảng lương</button><button class="btn sec sm" data-x="thuong">Bảng thưởng</button><button class="btn sec sm" data-x="an-ca">Tiền ăn ca</button>` : ''}<button class="btn sec sm" data-x="he-so">Bảng hệ số</button><button class="btn sec sm" data-x="cham-cong">Bảng chấm công</button>${d.run ? '' : '<span class="muted">(lương, thưởng, ăn ca xuất được sau khi chạy lương nháp)</span>'}</div>
      ${d.actions.filter(a => !a.enabled && a.hint).map(a => `<div class="muted small">⚠ ${esc(a.label)}: ${esc(a.hint)}</div>`).join('')}
      ${d.run ? `<div class="small muted">Tính lúc ${dt(d.run.calculated_at)}${d.names[d.run.calculated_by] ? ' bởi ' + esc(d.names[d.run.calculated_by]) : ''}${d.run.locked_at ? ' · Hoàn thành ' + dt(d.run.locked_at) : ''}${d.run.signed_at ? ' · Giám đốc ký ' + dt(d.run.signed_at) : ''}</div>` : ''}
      ${d.lines.length ? `<div class="sub" style="margin:12px 0 0">${[['pay', 'Bảng lương'], ['pit', 'Lương + thuế TNCN (ước tính)']].map(([k, t]) => `<button class="btn ${PAY_TAB === k ? '' : 'sec'}" data-pt="${k}">${t}</button>`).join('')}</div>
        <div id="pt_pay"${PAY_TAB === 'pit' ? ' hidden' : ''}>${payTable()}<div class="muted small">Bấm vào một dòng để xem chi tiết cách tính. Dấu "!" = thiếu hệ số hoặc đơn giá. Cột làm đêm / làm thêm / làm lễ không có ai phát sinh thì tự ẩn.</div></div>
        <div id="pt_pit"${PAY_TAB === 'pit' ? '' : ' hidden'}>${pitTable()}</div>` : '<div class="muted" style="margin-top:12px">Chưa có bảng lương nháp. Khi cấp 2 đã nhận các bảng chấm công, bấm "Chạy lương nháp".</div>'}</div>`;
    $('#back').onclick = list;
    root.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { PAY_TAB = b.dataset.pt; root.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('sec', x.dataset.pt !== PAY_TAB)); $('#pt_pay').hidden = PAY_TAB === 'pit'; $('#pt_pit').hidden = PAY_TAB !== 'pit'; });
    if ($('#xpit')) $('#xpit').onclick = guard(() => download(`/api/payroll/${gid}/${ymState.year}/${ymState.month}/export/pit`, `${ymState.month === 12 ? 'quyet-toan-thue-tncn' : 'thue-tncn'}-${d.group.name}-${ymState.year}-${String(ymState.month).padStart(2, '0')}.xlsx`));
    root.querySelectorAll('[data-a]').forEach(b => b.onclick = guard(async () => {
      const k = b.dataset.a, a = d.actions.find(x => x.key === k); let body = {};
      if (a.needNote) { const r = await ask(a.label, [{ label: 'Lý do', type: 'textarea' }]); if (!r) return; body.note = r[0]; }
      else if (a.needConfirm && !await confirmBox('Khoá toàn bộ bảng lương và bảng chấm công của tháng này? Sau khi khoá không ai sửa được, chỉ Admin mở khoá được (có ghi lịch sử).')) return;
      if (k === 'calculate') body.standardDays = $('#std')?.value || '';
      const r = await POST(`/api/payroll/${gid}/${ymState.year}/${ymState.month}/${k}`, body);
      toast(k === 'calculate' ? `Đã tính ${r.count} người${r.warnings ? ` (${r.warnings} người thiếu hệ số/đơn giá)` : ''}` : 'Đã thực hiện'); detail(gid);
    }));
    if ($('#xemp')) $('#xemp').onclick = guard(() => download(`/api/reports/employee-month/export?groupId=${gid}&year=${ymState.year}&month=${ymState.month}`, `thong-ke-luong-nhan-vien-${ymState.year}-${String(ymState.month).padStart(2, '0')}.xlsx`));
    root.querySelectorAll('[data-x]').forEach(b => b.onclick = guard(() => { const k = b.dataset.x, y = ymState.year, m = ymState.month;
      return download(k === 'cham-cong' ? `/api/attendance/export/group/${gid}/${y}/${m}` : `/api/payroll/${gid}/${y}/${m}/export/${k}`, `${k}-${d.group.name}-${y}-${String(m).padStart(2, '0')}.xlsx`); }));
    $('#items').onclick = guard(() => items(gid, d));
    root.querySelectorAll('tbody tr[data-i]').forEach(tr => tr.onclick = () => lineDetail(d, d.lines[+tr.dataset.i]));
  }
  // Bảng lương khoán: số tiền khoán − thuế vãng lai = thực nhận; số tiền từng tháng sửa ngay trên bảng (trống = mặc định ở Nhân sự, 0 = tháng này không chi)
  function fixedDetail(gid, d) {
    const L = d.lines, byEmp = new Map(L.map(l => [l.employee_id, l])), tot = f => L.reduce((s, l) => s + Number(f(l) || 0), 0);
    const pct = l => l.detail.taxed ? Number(l.detail.taxPct) + '%' : `<span class="muted" title="Dưới ngưỡng ${money(l.detail.taxThreshold)} đ">không trừ</span>`;
    const table = `<div class="scroll" style="margin-top:10px"><table class="paytb"><thead><tr><th>#</th><th>Họ tên</th><th>Chức danh</th><th>Nội dung</th><th class="n">Số tiền</th><th class="n" title="Tỷ lệ khấu trừ thuế TNCN vãng lai">Thuế VL</th><th class="n">Thuế khấu trừ</th><th class="n">Thực nhận</th></tr></thead>
      <tbody>${L.map((l, i) => `<tr data-i="${i}" style="cursor:pointer"><td>${i + 1}</td><td class="nm"><b>${esc(l.full_name)}</b></td><td class="ps">${esc(l.positions || '')}</td><td class="small">${esc(l.detail.note || '')}</td><td class="n">${money(l.detail.amount)}</td><td class="n">${pct(l)}</td><td class="n">${money(l.deduction)}</td><td class="n"><b>${money(l.net)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="4">Tổng cộng</th><th class="n">${money(tot(l => l.detail.amount))}</th><th></th><th class="n">${money(tot(l => l.deduction))}</th><th class="n">${money(tot(l => l.net))}</th></tr></tfoot></table></div>`;
    const ed = d.fixedEdit && (d.members || []).length ? `<div class="card" style="margin-top:12px;background:#faf5ff"><div class="row"><h3 class="grow" style="margin:0">Số tiền tháng ${d.month}/${d.year}</h3><button class="btn" id="fx_save">Lưu & tính lại</button></div>
      <div class="muted small">Để trống = dùng số tiền mặc định ở Quản trị › Nhân sự. Nhập số tiền khác nếu tháng này chi khác (vd lao động thời vụ); nhập 0 nếu tháng này không chi.</div>
      <table><thead><tr><th>Họ tên</th><th class="n">Mặc định</th><th class="n">Thuế VL</th><th>Số tiền tháng này</th><th>Nội dung</th></tr></thead><tbody>${d.members.map(m => `<tr data-fx="${m.id}"><td>${esc(m.full_name)}</td><td class="n">${money(m.fixed_amount)}</td><td class="n">${Number(m.fixed_tax_pct)}%</td>
        <td><input type="number" min="0" step="100000" style="width:130px;text-align:right" data-amt value="${m.month_amount === null || m.month_amount === undefined ? '' : Number(m.month_amount)}" placeholder="${money(m.fixed_amount)}"></td><td><input data-note style="width:220px" maxlength="200" value="${esc(m.month_note || '')}" placeholder="vd Thù lao HĐQT tháng ${d.month}"></td></tr>`).join('')}</tbody></table></div>` : '';
    root.innerHTML = `<div class="card"><div class="row"><button class="btn sec" id="back">← Danh sách</button><h2 class="grow" style="margin:0">${esc(d.group.name)} — ${d.month}/${d.year}</h2><span class="badge">Lương khoán</span>${badge(d.run?.status || 'none').replace(/>[^<]*</, '>' + esc(d.runLabel) + '<')}${d.run?.stale ? '<span class="badge draft">Cần tính lại</span>' : ''}</div>
      <div class="small muted" style="margin-bottom:8px">Thực nhận = số tiền − thuế TNCN vãng lai (tỷ lệ của từng người, cài ở Quản trị › Nhân sự; chỉ trừ khi số tiền từ ${money(d.group.tax_threshold)} đ trở lên). Người trong bảng: chọn ở Quản trị › Nhân sự (cột Cách tính lương) hoặc Tổ chức › Chọn người lương khoán.</div>
      ${d.run?.note ? `<div class="warnbox">Ghi chú: ${esc(d.run.note)}</div>` : ''}
      <div class="row">${d.actions.map(a => `<button class="btn ${a.key === 'return' || a.key === 'dreturn' || a.key === 'reopen' ? 'red' : a.key === 'calculate' ? '' : 'warn'}" data-a="${a.key}" ${a.enabled ? '' : 'disabled'} title="${esc(a.hint || '')}">${esc(a.label)}</button>`).join('')}
        ${d.run ? '<button class="btn sec" id="xfx">Xuất Excel bảng lương khoán</button>' : ''}</div>
      ${d.actions.filter(a => !a.enabled && a.hint).map(a => `<div class="muted small">⚠ ${esc(a.label)}: ${esc(a.hint)}</div>`).join('')}
      ${d.run ? `<div class="small muted">Tính lúc ${dt(d.run.calculated_at)}${d.names[d.run.calculated_by] ? ' bởi ' + esc(d.names[d.run.calculated_by]) : ''}${d.run.locked_at ? ' · Hoàn thành ' + dt(d.run.locked_at) : ''}${d.run.signed_at ? ' · Giám đốc ký ' + dt(d.run.signed_at) : ''}</div>` : ''}
      ${L.length ? table : `<div class="muted" style="margin-top:12px">${d.run ? 'Tháng này không có ai được chi.' : 'Chưa tính. Bấm "Chạy lương nháp".'}</div>`}${ed}</div>`;
    $('#back').onclick = list;
    root.querySelectorAll('[data-a]').forEach(b => b.onclick = guard(async () => {
      const k = b.dataset.a, a = d.actions.find(x => x.key === k); let body = {};
      if (a.needNote) { const r = await ask(a.label, [{ label: 'Lý do', type: 'textarea' }]); if (!r) return; body.note = r[0]; }
      else if (a.needConfirm && !await confirmBox('Khoá bảng lương khoán tháng này? Sau khi khoá không ai sửa được, chỉ Admin mở khoá được (có ghi lịch sử).')) return;
      const r = await POST(`/api/payroll/${gid}/${ymState.year}/${ymState.month}/${k}`, body);
      toast(k === 'calculate' ? `Đã tính ${r.count} người` : 'Đã thực hiện'); detail(gid);
    }));
    if ($('#xfx')) $('#xfx').onclick = guard(() => download(`/api/payroll/${gid}/${ymState.year}/${ymState.month}/export/khoan`, `bang-luong-khoan-${d.group.name}-${ymState.year}-${String(ymState.month).padStart(2, '0')}.xlsx`));
    if ($('#fx_save')) $('#fx_save').onclick = guard(async () => {
      const items = [...root.querySelectorAll('tr[data-fx]')].map(tr => ({ employeeId: tr.dataset.fx, amount: tr.querySelector('[data-amt]').value, note: tr.querySelector('[data-note]').value }));
      const r = await PUT(`/api/payroll/${gid}/${ymState.year}/${ymState.month}/fixed-amounts`, { items }); toast(`Đã lưu và tính lại: ${r.count} người được chi`); detail(gid);
    });
    root.querySelectorAll('tbody tr[data-i]').forEach(tr => tr.onclick = () => { const l = L[+tr.dataset.i], x = l.detail, row = (t, v, b) => `<tr><td>${t}</td><td class="n">${b ? '<b>' + v + '</b>' : v}</td></tr>`;
      modal(`<h2>${esc(l.full_name)}<span class="x">✕</span></h2><div class="muted small">${esc(l.positions || '')} · Lương khoán</div><table><tbody>
        ${row(`Số tiền khoán <span class="muted small">(${x.amountSource === 'month' ? 'nhập riêng tháng này' : 'số tiền mặc định ở Nhân sự'})</span>`, money(x.amount))}
        ${row(x.taxed ? `Thuế TNCN vãng lai = ${money(x.amount)} × ${x.taxPct}%` : `Thuế TNCN vãng lai <span class="muted small">(số tiền dưới ngưỡng ${money(x.taxThreshold)} đ: không khấu trừ)</span>`, '−' + money(l.deduction))}
        ${row('Thực nhận', money(l.net), 1)}</tbody></table>${x.note ? `<div class="muted small" style="margin-top:6px">Nội dung: ${esc(x.note)}</div>` : ''}`); });
  }
  function lineDetail(d, l) {
    const x = l.detail, cn = Object.fromEntries(d.coefTypes.map(c => [c.code, c.name])), kd = Object.fromEntries(d.coefTypes.map(c => [c.code, c.kind])), ex = k => (x.extras || []).filter(e => e.kind === k);
    const how = e => e.calc === 'pit' ? 'thuế TNCN lũy tiến, xem phần THUẾ TNCN bên dưới' : e.calc === 'coef_price' ? `${e.basis === 'insurance' ? 'hệ số BH' : 'hệ số thưởng'} × ${money(e.value)}` : 'số tiền cố định';
    const row = (t, v, b) => `<tr><td>${t}</td><td class="n">${b ? '<b>' + v + '</b>' : v}</td></tr>`;
    modal(`<h2>${esc(l.full_name)}<span class="x">✕</span></h2><div class="muted small">${esc(l.positions || '')} · ${esc(l.department_name || '')} · ${empType(l.employee_type)}</div>
      ${(x.warnings || []).length ? `<div class="warnbox">${esc(x.warnings.join('; '))} — bổ sung ở trang Hệ số / Quản trị → Cấu hình.</div>` : ''}
      <table><tbody>
      ${row('Công thực tế', `${l.work_days} (ngày ${x.workDay ?? '—'}, đêm ${x.workNight ?? '—'})${x.zeroedOffDays ? ` <span class="muted small">— ${x.zeroedOffDays} ngày nghỉ bù/phép trùng ngày nghỉ không cộng công</span>` : ''}`)}
      ${x.minDays !== undefined ? row(`Công chuẩn <span class="muted small">(${x.weeklyOff === 'sat_sun' ? 'nghỉ T7+CN' : 'nghỉ CN'}${x.holidayDays ? `, ${x.holidayDays} ngày lễ` : ''}${x.overridden ? ', nhập tay' : ''}) · công tối thiểu</span>`, `${x.standardDays} · ${x.minDays}`) : row('Công chuẩn', x.standardDays)}
      ${x.rateBasis === 'min' ? row(`Đơn giá ngày = hệ số × đơn giá ÷ công tối thiểu <span class="muted small">${x.shiftNo ? '(kíp ' + x.shiftNo + (x.groupMin != null ? ', kíp thấp nhất của nhà máy = ' + x.groupMin : '') + ')' : ''}</span>`, `${money(x.dailySalary)} lương · ${money(x.dailyBonus)} thưởng`) : ''}
      ${x.planFactor !== undefined && Number(x.planFactor) !== 1 ? row('Hệ số hoàn thành kế hoạch (nhân vào thưởng)', '×' + x.planFactor) : ''}
      ${x.workSalary !== undefined && x.workSalary !== x.workBonus ? row('Công tính lương / công tính thưởng <span class="muted small">(nghỉ phép chỉ tính lương)</span>', `${x.workSalary} / ${x.workBonus}`) : ''}
      ${x.otWork ? row('Công làm thêm (ký hiệu LT, trả riêng theo %)', x.otWork) : ''}
      ${x.diffStd !== undefined ? row('Công thực tế − công tiêu chuẩn', (x.diffStd > 0 ? '+' : '') + x.diffStd) : ''}
      ${x.payStatus ? row('Kết quả so với chuẩn', ({ ot: `Tăng ca ${x.otDays} ngày (lương ×${x.otSalary}, thưởng ×${x.otBonus}) — tỷ lệ lương ${x.ratio}, thưởng ${x.ratioBonus}`, full: 'Đủ công — hưởng đủ', tolerance: 'Trong khoảng tối thiểu – chuẩn — hưởng đủ', short: `Thiếu công (dưới tối thiểu) — tính theo công thực tế, tỷ lệ ${x.ratio}`, none: '—' })[x.payStatus]) : row('Tỷ lệ công', x.ratio)}
      ${x.dailySalary ? row('Đơn giá ngày: lương · thưởng <span class="muted small">(lương: (lương BH + phụ cấp) ÷ công chuẩn; thưởng: hệ số × đơn giá ÷ công chuẩn) — căn cứ tính làm đêm/thêm/lễ</span>', `${money(x.dailySalary)} · ${money(x.dailyBonus)}`) : ''}
      <tr><th colspan="2">LƯƠNG</th></tr>
      ${x.laborGrade ? row(`Xếp loại lao động <b>${esc(x.laborGrade)}</b> → nhân ×${x.laborFactor} vào lương & thưởng`, '') : ''}
      ${row(`Lương bảo hiểm = ${nz(x.insAmount) > 0 ? `lương đóng BH thỏa thuận ${money(x.insAmount)} <span class="muted small">(thay cho hệ số BH ${x.insCoef} × lương cơ sở ${money(x.baseWage)})</span>` : `hệ số BH ${x.insCoef} × lương cơ sở ${money(x.baseWage)}`} × ${Math.min(x.ratio, 1)}${x.laborGrade ? ' × ' + x.laborFactor : ''}${x.safetyInInsurance && x.safetyAllowance ? ` <span class="muted small">(${money(x.insuranceCoefSalary)}) + phụ cấp an toàn ${money(x.safetyAllowance)}${x.safetyGrade ? ' (xếp loại ' + esc(x.safetyGrade) + ': ×' + x.safetyFactor + ')' : ''}</span>` : ''}`, money(l.insurance_salary), 1)}
      ${!x.premiumInBonus && (x.nightSalary || x.extraSalary || x.holidaySalary) ? `${row(`Làm đêm <span class="muted small">(${x.premiumDays?.night || 0} ngày tương đương × ${money(x.dailySalary)})</span>`, money(x.nightSalary))}
      ${row(`Làm thêm / sửa chữa <span class="muted small">(${x.otDays || 0} công vượt chuẩn = ${money(x.otSalaryAmt)}; ${x.premiumDays?.extra || 0} ngày tương đương theo % ký hiệu)</span>`, money(x.extraSalary))}
      ${row(`Làm lễ, tết <span class="muted small">(${x.premiumDays?.holiday || 0} ${x.premiumMethod === 'A' ? 'ngày tương đương theo % ngày lễ, ca đêm lễ thêm 20% × % lễ; theo Nghị định 145/2020' : 'công × % lễ, đơn giá gồm tiền đêm bình quân; theo quy chế lương riêng'})</span>`, money(x.holidaySalary))}` : ''}
      ${row('Phụ cấp' + (x.safetyInInsurance ? (x.safetyAllowance ? ' <span class="muted small">(phụ cấp khác; phụ cấp an toàn đã gộp vào lương bảo hiểm)</span>' : '') : (x.safetyGrade ? ` <span class="muted small">(gồm phụ cấp an toàn xếp loại ${esc(x.safetyGrade)}: ×${x.safetyFactor})</span>` : '')), money(l.allowance))}
      ${x.insuranceBase !== undefined ? row(`Mức lương đóng bảo hiểm <span class="muted small">(lương BH chưa xếp loại ${money(x.insuranceFull)} + phụ cấp ${money(x.insuranceBase - x.insuranceFull)})</span>`, money(x.insuranceBase)) : ''}
      ${(x.deductions || []).map(t => row('&nbsp;&nbsp;trừ ' + esc(t.name), '−' + money(t.amount))).join('')}
      ${ex('deduction').map(e => row(`&nbsp;&nbsp;trừ ${esc(e.label)} <span class="muted small">(${how(e)})</span>`, '−' + money(e.amount))).join('')}
      ${row('Lương thực lĩnh', money(x.salaryNet ?? (l.insurance_salary + l.allowance - l.deduction)), 1)}
      <tr><th colspan="2">THƯỞNG</th></tr>
      ${row(`Thưởng theo hệ số = ${x.bonusCoef} × đơn giá ${money(x.unitPrice)} × ${Math.min(x.ratioBonus ?? x.ratio, 1)}${x.laborGrade ? ' × ' + x.laborFactor : ''}`, money(x.bonusBase))}
      
      ${x.nightBonus || x.extraBonus || x.holidayBonus ? (x.premiumInBonus ? (() => { const ps = x.premSal || {}, pb = x.premBon || {}, pd = x.premiumDays || {}, sp = k => `<span class="muted small">(theo hệ số lương ${money(ps[k])} + theo hệ số thưởng ${money(pb[k])}`;
        return `${row(`Thưởng làm đêm ${sp('night')}; ${pd.night || 0} ngày tương đương)</span>`, money(x.nightBonus))}${row(`Thưởng làm thêm / sửa chữa ${sp('extra')}; ${x.otDays || 0} công vượt chuẩn = ${money((x.otSalaryAmt || 0) + (x.otBonusAmt || 0))}; ${pd.extra || 0} ngày tương đương theo % ký hiệu)</span>`, money(x.extraBonus))}${row(`Thưởng làm lễ, tết ${sp('holiday')}; ${pd.holiday || 0} ${x.premiumMethod === 'A' ? 'ngày tương đương theo % ngày lễ, ca đêm lễ thêm 20% × % lễ; theo Nghị định 145/2020' : `công × % lễ, đơn giá gồm tiền đêm bình quân: (lương + thưởng + phụ cấp + tiền đêm) ÷ ${x.rateDiv || ''}; theo quy chế lương riêng`})</span>`, money(x.holidayBonus))}`; })()
        : `${row('Thưởng làm đêm', money(x.nightBonus))}${row(`Thưởng làm thêm / sửa chữa <span class="muted small">(gồm ${money(x.otBonusAmt)} công vượt chuẩn)</span>`, money(x.extraBonus))}${row('Thưởng làm lễ, tết', money(x.holidayBonus))}`) : ''}
      ${ex('bonus').map(e => row(`&nbsp;&nbsp;+ ${esc(e.label)} <span class="muted small">(${how(e)})</span>`, money(e.amount))).join('')}
      ${ex('bonus_deduction').map(e => Number(e.amount) < 0 ? row(`&nbsp;&nbsp;+ hoàn ${esc(e.label)} <span class="muted small">(${how(e)})</span>`, '+' + money(-e.amount)) : row(`&nbsp;&nbsp;trừ ${esc(e.label)} <span class="muted small">(${how(e)})</span>`, '−' + money(e.amount))).join('')}
      ${row('Thưởng thực nhận', money(x.bonusNet ?? l.bonus), 1)}
      <tr><th colspan="2">ĂN CA</th></tr>
      ${Object.entries(x.mealCodes || {}).map(([k, v]) => row(`&nbsp;&nbsp;${esc(k)}: ${v.n} ngày × ${money(v.price)}`, money(v.n * v.price))).join('')}
      ${row('Tiền ăn ca', money(l.meal_amount), 1)}
      <tr><th colspan="2">TỔNG</th></tr>
      ${row('Tổng thực lĩnh (lương + thưởng + ăn ca)', money(l.net), 1)}
      ${pitRows(d, l, row)}</tbody></table>
      <div class="muted small" style="margin-top:8px">Hệ số áp dụng (hiệu lực ${ymd(x.coefEffectiveFrom) || '—'}): ${Object.entries(x.coefs || {}).map(([k, v]) => `${esc(cn[k] || k)} = ${['amount', 'ins_amount'].includes(kd[k]) ? money(v) + ' đ' : v}`).join('; ') || 'chưa có'}</div>`, true);
  }
  // Phần "Thuế TNCN" trong chi tiết từng người: tính từng bước (thu nhập chịu thuế → giảm trừ → thu nhập tính thuế → từng bậc → thuế); tháng 12 thêm quyết toán cả năm
  function pitRows(d, l, row) {
    const p = l.detail.pit, neg = v => (nz(v) ? '−' + money(v) : '0'), sp = s => `<span class="muted small">${s}</span>`, s12 = d.month === (d.pit?.settleMonth || 12);
    let h = `<tr><th colspan="2">THUẾ TNCN${s12 ? ` — THÁNG 12: QUYẾT TOÁN NĂM ${d.year}` : ' (TẠM TÍNH THÁNG)'}</th></tr>`;
    if (!p) return h + row('<span class="muted">Chưa tính thuế — bấm "Tính lại lương" (dòng lương này tính trước khi có thuế TNCN lũy tiến)</span>', '');
    const e = pitExempt(l), sch = d.pit?.schedule, ey = p.extrasYear || {}, x = p.extras || {};
    h += row(`Thu nhập chịu thuế = lương BH ${money(l.insurance_salary)} + phụ cấp ${money(l.allowance)} + thưởng ${money(l.bonus)}`, money(p.lineTaxable), 1);
    h += row(`Không tính thuế ${sp(`(làm đêm ${money(e.night)}, làm thêm ${money(e.extra)}, làm lễ ${money(e.holiday)}, ăn ca ${money(e.meal)})`)}`, `<span class="muted">${money(exSum(e))}</span>`);
    if (p.missing) return h + row('<span class="muted">Chưa có biểu thuế TNCN của năm này — Admin nhập ở Quản trị › Cấu hình, rồi bấm "Tính lại lương"</span>', '');
    if (p.shared) h += row(`Cộng thu nhập chịu thuế ở ${p.shared.lines} bảng lương trong tháng ${sp('(người chuyển bảng lương trong tháng: thuế tính trên tổng thu nhập)')}`, money(p.taxable), 1);
    // Bảng chi tiết từng bậc lũy tiến (phần thu nhập rơi vào mỗi bậc × thuế suất)
    const brk = (parts, what) => `<tr><td colspan="2" style="padding:4px 8px 8px"><table class="pitbrk"><thead><tr><th>Bậc</th><th>Phần thu nhập tính thuế ${what}</th><th class="n">Thu nhập trong bậc</th><th class="n">Thuế suất</th><th class="n">Tiền thuế</th></tr></thead>
      <tbody>${(parts || []).map(b => `<tr><td>${b.level}</td><td>${b.from ? `trên ${money(b.from)}` : 'từ 0'}${b.to === null ? ' trở lên' : ` đến ${money(b.to)}`}</td><td class="n">${money(b.base)}</td><td class="n">${b.rate}%</td><td class="n">${money(b.tax)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Thu nhập tính thuế bằng 0 — không phải nộp thuế</td></tr>'}</tbody>
      <tfoot><tr><th colspan="2">Cộng</th><th class="n">${money((parts || []).reduce((s, b) => s + nz(b.base), 0))}</th><th></th><th class="n">${money((parts || []).reduce((s, b) => s + nz(b.tax), 0))}</th></tr></tfoot></table></td></tr>`;
    const capTxt = (k, c) => nz(ey[k]) > 0 && Math.round(nz(ey[k]) / 12) > nz(x[k]) ? `, áp mức tối đa${sch && sch.year === p.scheduleYear && c !== null && c !== undefined ? ' ' + money(c) : ''}` : '';
    const extra = (k, t, c) => nz(ey[k]) || nz(x[k]) ? row(`&nbsp;&nbsp;trừ ${t} ${sp(`(cả năm ${money(ey[k])}${capTxt(k, c)} ÷ 12)`)}`, neg(x[k])) : '';
    h += row(`&nbsp;&nbsp;trừ BH bắt buộc ${sp(`(BHXH, BHYT, BHTN người lao động đóng${p.shared ? ` ở ${p.shared.lines} bảng lương; bảng này ${money(p.lineInsurance)}` : ''})`)}`, neg(p.insurance))
      + row('&nbsp;&nbsp;trừ giảm trừ bản thân', neg(p.self))
      + row(`&nbsp;&nbsp;trừ người phụ thuộc ${sp(`(${p.dependents} người × ${money(p.dependentAmount)})`)}`, neg(p.dependent))
      + extra('health', 'chi phí y tế', sch?.healthCap) + extra('education', 'chi phí giáo dục', sch?.educationCap) + extra('other', 'khoản giảm trừ khác', null)
      + row('Tổng giảm trừ', neg(p.totalDeduction))
      + row(`Thu nhập tính thuế = ${money(p.taxable)} − ${money(p.totalDeduction)}`, money(p.assessable), 1)
      + brk(p.parts, '(tháng: mức trần bậc cả năm ÷ 12)')
      + row(s12 ? `Thuế tạm tính theo tháng ${sp('(chỉ để tham khảo — tháng 12 tính theo quyết toán cả năm bên dưới)')}` : 'Thuế TNCN tạm tính tháng', money(p.monthTax), !s12);
    const a = p.annual;
    if (s12 && a) {
      const ms = p.months || {}, mrow = m => { const o = ms[m]; return o ? `<tr><td>Tháng ${m}</td><td class="n">${money(o.taxable)}</td><td class="n">${money(o.insurance)}</td><td class="n">${o.dependents}</td><td class="n">${money(o.tax)}</td><td class="small muted">${[o.source === 'estimate' ? 'ước tính lại (tháng tính trước khi có thuế lũy tiến)' : '', o.lines > 1 ? `${o.lines} bảng lương` : ''].filter(Boolean).join('; ')}</td></tr>` : `<tr class="muted"><td>Tháng ${m}</td><td colspan="5" class="small">không có lương theo hệ số</td></tr>`; };
      h += `<tr><th colspan="2">Quyết toán: cộng thu nhập cả năm</th></tr><tr><td colspan="2" style="padding:4px 8px 8px"><table class="pitbrk"><thead><tr><th>Tháng</th><th class="n">Thu nhập chịu thuế</th><th class="n">BH bắt buộc</th><th class="n">Người phụ thuộc</th><th class="n">Thuế đã tạm tính</th><th>Ghi chú</th></tr></thead>
        <tbody>${Array.from({ length: 11 }, (_, i) => mrow(i + 1)).join('')}<tr><td>Tháng 12</td><td class="n">${money(p.taxable)}</td><td class="n">${money(p.insurance)}</td><td class="n">${p.dependents}</td><td class="n muted">quyết toán</td><td></td></tr></tbody>
        <tfoot><tr><th>Cả năm</th><th class="n">${money(a.taxable)}</th><th class="n">${money(a.insurance)}</th><th class="n">${a.dependentMonths} tháng-người</th><th class="n">${money(a.priorTax)}</th><th></th></tr></tfoot></table></td></tr>`;
      const ax = a.extras || {}, aex = (k, t) => nz(ax[k]) ? row(`&nbsp;&nbsp;trừ ${t} cả năm ${sp(`(đã nhập ${money(ey[k])}${nz(ey[k]) > nz(ax[k]) ? ', áp mức tối đa' : ''})`)}`, neg(ax[k])) : '';
      h += row('Thu nhập chịu thuế cả năm', money(a.taxable), 1)
        + row('&nbsp;&nbsp;trừ BH bắt buộc cả năm', neg(a.insurance))
        + row(`&nbsp;&nbsp;trừ giảm trừ bản thân ${sp(`(${a.selfMonths} tháng × ${money(p.self)})`)}`, neg(a.self))
        + row(`&nbsp;&nbsp;trừ người phụ thuộc ${sp(`(${a.dependentMonths} tháng-người × ${money(a.dependentAmount)})`)}`, neg(a.dependent))
        + aex('health', 'chi phí y tế') + aex('education', 'chi phí giáo dục') + aex('other', 'khoản giảm trừ khác')
        + row('Tổng giảm trừ cả năm', neg(a.totalDeduction))
        + row(`Thu nhập tính thuế cả năm = ${money(a.taxable)} − ${money(a.totalDeduction)}`, money(a.assessable), 1)
        + brk(a.parts, '(cả năm)')
        + row('Thuế TNCN cả năm', money(a.tax), 1)
        + row('&nbsp;&nbsp;trừ thuế đã tạm tính tháng 1–11', neg(a.priorTax))
        + row(a.settle < 0 ? 'Được hoàn khi quyết toán (−)' : 'Phải nộp thêm khi quyết toán (+)', `<span class="${a.settle < 0 ? 'pitneg' : ''}">${money(a.settle)}</span>`, 1);
    }
    if (p.shared) h += row(`Thuế của bảng lương này ${sp(`(chia theo tỷ lệ thu nhập chịu thuế ${money(p.lineTaxable)} / ${money(p.taxable)} của ${money(p.tax)})`)}`, money(l.pit_tax), 1);
    const t = nz(l.pit_tax);
    h += p.withheld ? row(`Thuế TNCN ${t < 0 ? 'được hoàn đã cộng' : 'đã trừ'} vào thưởng thực nhận ${sp('(khoản "Thuế TNCN" ở phần thưởng — tổng thực lĩnh ở trên đã là sau thuế)')}`, money(Math.abs(t)))
      : row(`Thực lĩnh ${money(l.net)} ${t < 0 ? 'cộng thuế TNCN được hoàn' : 'trừ thuế TNCN'} ${sp('(chỉ ước tính, chưa trừ vào lương)')}`, t < 0 ? '+' + money(-t) : neg(t));
    return h + row(p.withheld ? 'Thực lĩnh sau thuế' : 'Thực lĩnh sau thuế (ước tính)', money(pitAfter(l)), 1);
  }
  // Thưởng / khoản trừ trong tháng: thêm cho 1 hoặc nhiều người; mỗi khoản có cách tính linh hoạt
  async function items(gid, d) {
    const r = await GET(`/api/items?groupId=${gid}&year=${ymState.year}&month=${ymState.month}`);
    const KIND = { bonus: 'Thưởng thêm (vào bảng thưởng)', deduction: 'Trừ vào lương (vào bảng lương)', bonus_deduction: 'Trừ vào thưởng (vào bảng thưởng)' };
    const emps = (await GET(`/api/items/roster?groupId=${gid}`)).employees.map(l => ({ id: l.id, name: l.full_name, dept: l.department_name || 'Chưa xếp bộ phận' }));
    const depts = [...new Set(emps.map(e => e.dept))];
    const editable = !d.run || ['draft', 'submitted'].includes(d.run.status);
    const groups = new Map(); for (const i of r.items) { const k = [i.kind, i.label, i.calc, i.basis, i.value, i.calc === 'fixed' ? i.amount : ''].join('|'); (groups.get(k) || groups.set(k, []).get(k)).push(i); }
    const how = i => i.calc === 'coef_price' ? `hệ số ${i.basis === 'insurance' ? 'bảo hiểm' : 'thưởng'} × ${money(i.value)}` : `${money(i.amount)} / người`;
    const m = modal(`<h2>Thưởng / khoản trừ tháng ${ymState.month}/${ymState.year}<span class="x">✕</span></h2>
      <div class="muted small">Khoản <b>thưởng thêm</b> và <b>trừ vào thưởng</b> hiện ở bảng thưởng; khoản <b>trừ vào lương</b> hiện ở bảng lương. Thêm/xoá sẽ làm bảng lương nháp "cần tính lại"; chỉ sửa được khi bảng lương còn nháp.</div>
      ${!editable ? '<div class="warnbox">Bảng lương đã trình Giám đốc / đã khoá — chỉ xem.</div>' : ''}
      ${editable ? `<div class="box" style="margin:10px 0"><h3>Thêm khoản mới</h3>
        <div class="row"><select id="ik">${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input id="il" placeholder="Nội dung (vd: ủng hộ lũ lụt, thuế TNCN)" style="min-width:240px"></div>
        <div class="row"><select id="ic"><option value="fixed">Số tiền như nhau cho mọi người được chọn</option><option value="coef_price">Theo hệ số của từng người × đơn giá</option></select>
          <select id="ib" style="display:none"><option value="insurance">hệ số lương (bảo hiểm)</option><option value="bonus">hệ số thưởng</option></select>
          <input id="iv" type="number" min="0" placeholder="Số tiền (đ)" style="width:150px"></div>
        <div class="muted small" id="ihint">Mỗi người được chọn bị/được cộng đúng số tiền này.</div>
        <div class="row" style="margin-top:8px"><b>Áp dụng cho:</b><button class="btn sec sm" id="sel_all">Tất cả</button><button class="btn sec sm" id="sel_none">Bỏ chọn</button>${depts.map((dp, i) => `<button class="btn sec sm" data-dept="${i}">${esc(dp)}</button>`).join('')}</div>
        <div class="optlist" style="max-height:200px;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">${emps.map(e => `<label class="opt"><input type="checkbox" data-e="${e.id}" data-d="${esc(e.dept)}"><span>${esc(e.name)}<small>${esc(e.dept)}</small></span></label>`).join('')}</div>
        <button class="btn" id="ia_add" style="margin-top:8px">Thêm cho người đã chọn</button></div>` : ''}
      <h3>Các khoản đã nhập</h3><table><thead><tr><th>Loại</th><th>Nội dung</th><th>Cách tính</th><th>Áp dụng</th><th></th></tr></thead><tbody>${[...groups.values()].map(list => { const i = list[0]; return `<tr><td>${esc(KIND[i.kind].split(' (')[0])}</td><td>${esc(i.label)}</td><td>${how(i)}</td><td class="small">${list.length} người: ${esc(list.slice(0, 4).map(x => x.full_name).join(', '))}${list.length > 4 ? '…' : ''}</td><td>${editable ? `<button class="btn red sm" data-delg="${list.map(x => x.id).join(',')}">Xoá</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Chưa có</td></tr>'}</tbody></table>`, true);
    if (editable) {
      const ck = () => [...m.querySelectorAll('[data-e]')];
      m.querySelector('#ic').onchange = e => { const cp = e.target.value === 'coef_price'; m.querySelector('#ib').style.display = cp ? '' : 'none'; m.querySelector('#iv').placeholder = cp ? 'Đơn giá (đ)' : 'Số tiền (đ)'; m.querySelector('#ihint').textContent = cp ? 'Số tiền của từng người = hệ số của người đó × đơn giá (nên người hệ số cao bị/được nhiều hơn).' : 'Mỗi người được chọn bị/được cộng đúng số tiền này.'; };
      m.querySelector('#sel_all').onclick = () => ck().forEach(i => i.checked = true); m.querySelector('#sel_none').onclick = () => ck().forEach(i => i.checked = false);
      m.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => ck().forEach(i => { if (i.dataset.d === depts[+b.dataset.dept]) i.checked = true; }));
      m.querySelector('#ia_add').onclick = guard(async () => {
        const ids = ck().filter(i => i.checked).map(i => i.dataset.e); if (!ids.length) throw new Error('Hãy chọn ít nhất một người');
        const calc = m.querySelector('#ic').value;
        await POST('/api/items', { employeeIds: ids, kind: m.querySelector('#ik').value, label: m.querySelector('#il').value, calc, basis: calc === 'coef_price' ? m.querySelector('#ib').value : null, value: m.querySelector('#iv').value, year: ymState.year, month: ymState.month });
        m.close(); toast(`Đã thêm cho ${ids.length} người`); detail(gid);
      });
      m.querySelectorAll('[data-delg]').forEach(b => b.onclick = guard(async () => { await POST('/api/items/delete-many', { ids: b.dataset.delg.split(',') }); m.close(); detail(gid); }));
    }
  }
  await list();
};

// ================= HỆ SỐ =================
PAGES.coef = async (me, root, asOf) => {
  const d = await GET('/api/coefficients' + (asOf ? '?asOf=' + asOf : ''));
  // Hệ số "tổng" (Hệ số thưởng) = cộng các hệ số thưởng khác (không gồm hệ số bảo hiểm) và đặt cuối cùng
  const CT = [...d.coefTypes.filter(c => !c.is_total), ...d.coefTypes.filter(c => c.is_total)];
  // Loại hệ số nhập bằng số tiền (VND): phụ cấp cố định và lương đóng BH thỏa thuận — cột rộng, định dạng tiền
  const isAmt = c => c.kind === 'amount' || c.kind === 'ins_amount';
  const KIND_DESC = { insurance: '× lương cơ sở → lương bảo hiểm', bonus: '× đơn giá → thưởng', amount: 'số tiền cộng cố định', ins_amount: 'số tiền thỏa thuận → lương đóng bảo hiểm (thay hệ số BH × lương cơ sở)' };
  const totalOf = e => { const comp = CT.filter(c => c.kind === 'bonus' && !c.is_total).reduce((s, c) => s + (Number(e.vals[c.code]) || 0), 0); return comp > 0 ? Math.round(comp * 1e4) / 1e4 : null; };
  const gsum = await GET('/api/reports/grade-summary').catch(() => null);
  const today = d.today || new Date().toISOString().slice(0, 10);
  const canAny = d.employees.some(e => e.editable);
  root.innerHTML = `<div class="card"><h2>Hệ số nhân sự</h2><div class="muted small">Mỗi người có 2 nút: <b>Cập nhật hệ số mới</b> (thêm một bản ghi mới theo ngày hiệu lực — lịch sử cũ giữ nguyên, dùng khi hệ số thay đổi thật) và <b>Sửa hệ số</b> (sửa ngay bản ghi đang áp dụng, dùng khi nhập sai). Chỉ người được bấm mới thay đổi, những người khác giữ nguyên. Bảng lương dùng hệ số có hiệu lực tại cuối tháng tính lương.</div>
    <div class="info"><b>Các loại hệ số đang dùng:</b> ${CT.map(c => `${esc(c.name)} <span class="muted">(${KIND_DESC[c.kind] || esc(c.kind)})</span>`).join(' · ') || 'chưa có'}.
      ${me.isAdmin ? ' <a href="#/admin" id="gocfg">Thêm / sửa loại hệ số, lương cơ sở, đơn giá → Quản trị › Cấu hình</a>' : ' Loại hệ số, lương cơ sở và đơn giá do Admin cấu hình ở Quản trị › Cấu hình.'}</div>
    <div id="pfcard" style="margin:10px 0"></div>
    ${gsum && (gsum.overdue || gsum.soon) ? `<div class="warnbox"><b>Bậc lương bảo hiểm:</b> ${gsum.overdue ? `<b style="color:#b91c1c">${gsum.overdue} người đã QUÁ HẠN tăng bậc</b>` : ''}${gsum.overdue && gsum.soon ? ' · ' : ''}${gsum.soon ? `${gsum.soon} người đến hạn trong 30 ngày tới` : ''}. <a href="#/reports" id="gograde">Xem danh sách đến hạn →</a></div>` : ''}
    ${d.employees.length ? '' : `<div class="err">Chưa có nhân sự nào thuộc bảng lương mà bạn được xem. ${me.isAdmin ? 'Vào Quản trị › Tổ chức &amp; liên kết SSO → bấm "Đồng bộ từ SSO", rồi "Liên kết SSO" cho từng phòng để đưa nhân sự vào bảng lương.' : 'Hãy nhờ Admin kiểm tra liên kết phòng ban và phân quyền cho bạn.'}</div>`}
    <div class="row" style="margin-top:8px"><label>Xem hệ số có hiệu lực tại ngày</label><input id="asof" type="date" value="${d.asOf}"><button class="btn sec sm" id="goasof">Xem</button>${d.asOf !== d.today ? `<button class="btn sec sm" id="nowasof">Về hôm nay</button><span class="badge draft">Đang xem quá khứ/tương lai — nhập mới sẽ ghi theo ngày "Hiệu lực từ"</span>` : ''}</div>
    <div class="row" style="margin-top:8px"><input id="q" placeholder="Tìm tên…"><select id="g"><option value="">Tất cả bảng lương</option>${[...new Set(d.employees.map(e => e.group_name))].map(n => `<option>${esc(n)}</option>`).join('')}</select>
    <span class="muted">|</span><label>Xuất Excel hệ số tháng</label>${ymPicker(me)}<button class="btn sec sm" id="xhs">Xuất Excel</button>
    </div>
    <div class="scroll"><table class="coeftb"><thead><tr><th class="sk">Họ tên</th><th class="dp">Phòng</th><th class="ps">Chức vụ</th><th class="tp">Loại</th>${CT.map(c => `<th class="n cf${isAmt(c) ? ' amt' : ''}" title="${esc(KIND_DESC[c.kind] || c.kind)}">${esc(c.name)}</th>`).join('')}<th class="gr">Bậc lương BH</th><th class="dt">Hiệu lực từ</th><th class="skr"></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  // Hệ số hoàn thành kế hoạch: thưởng = hệ số thưởng × đơn giá × hệ số này (toàn công ty, theo tháng; trống = 1)
  async function planCard(year) {
    const box = $('#pfcard'); if (!box) return;
    let pf; try { pf = await GET('/api/workdays/plan-factors?year=' + year); } catch (e) { box.innerHTML = ''; return; }
    const edit = me.isAdmin || canAny;
    const yrs = []; for (let y = (me.yearMin || year - 2); y <= (me.yearMax || year + 1); y++) yrs.push(y);
    box.innerHTML = `<div class="info"><div class="row"><b class="grow">Hệ số hoàn thành kế hoạch của công ty — năm</b><select id="pfy">${yrs.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      <div class="muted small" style="margin:4px 0">Thưởng = hệ số thưởng × đơn giá × <b>hệ số hoàn thành kế hoạch</b> của tháng đó (áp dụng cho thưởng theo công, làm thêm/đêm/lễ phần thưởng; không áp dụng cho khoản thưởng nhập thêm). Để trống = 1 (hoàn thành 100%). Ví dụ 0,95 = hoàn thành 95% kế hoạch.${edit ? '' : ' Bạn chỉ được xem.'}</div>
      <div class="row" style="flex-wrap:wrap">${pf.months.map(m => `<label class="small">T${m.month}${m.locked ? ' 🔒' : ''}<input type="number" step="0.01" min="0" max="10" placeholder="1" data-pf="${m.month}" value="${m.factor ?? ''}" ${edit && !m.locked ? '' : 'disabled'} title="${m.locked ? 'Bảng lương tháng này đã được Giám đốc khoá — không đổi được' : ''}" style="width:74px;margin-left:4px"></label>`).join('')}${edit ? '<button class="btn sm" id="pfsave">Lưu hệ số</button>' : ''}</div></div>`;
    $('#pfy').onchange = e => planCard(+e.target.value);
    if ($('#pfsave')) $('#pfsave').onclick = guard(async () => {
      let n = 0;
      for (const i of box.querySelectorAll('[data-pf]')) { const m = +i.dataset.pf, old = pf.months[m - 1].factor, now = i.value === '' ? null : Number(i.value); if (now !== old) { await PUT(`/api/workdays/plan-factors/${year}/${m}`, { factor: i.value }); n++; } }
      toast(n ? `Đã lưu ${n} tháng. Bảng lương nháp của các tháng này cần "Tính lại".` : 'Không có thay đổi'); planCard(year);
    });
  }
  planCard(me.now?.year || new Date().getFullYear());
  function rows() {
    const q = $('#q').value.toLowerCase(), g = $('#g').value;
    // Chia nhóm như bảng lương: dòng tiêu đề bảng lương (khi xem tất cả) và dòng tiêu đề phòng
    const ncol = 4 + CT.length + 3; let lastG = null, lastD = null;
    const head = e => { let h = '';
      if (!g && e.group_name !== lastG) { lastG = e.group_name; lastD = null; h += `<tr class="grprow"><td colspan="${ncol}">${esc(e.group_name || '')}</td></tr>`; }
      if ((e.department_name || '') !== lastD) { lastD = e.department_name || ''; h += `<tr class="dptrow"><td colspan="${ncol}">${esc(lastD || 'Chưa có phòng')}</td></tr>`; }
      return h; };
    $('#tb').innerHTML = d.employees.filter(e => (!q || e.full_name.toLowerCase().includes(q)) && (!g || e.group_name === g)).map(e => `${head(e)}<tr data-e="${e.id}"><td class="sk"><b>${esc(e.full_name)}</b></td><td class="dp">${esc(e.department_name || '')}</td><td class="ps">${esc(e.positions || '')}</td><td class="tp">${empType(e.employee_type)}</td>
      ${CT.map(c => `<td class="n cf${isAmt(c) ? ' amt' : ''}"${c.is_total ? ' style="background:#f8fafc" title="Tự cộng các hệ số thưởng khác (không gồm hệ số bảo hiểm)"' : ''}>${(c.is_total && totalOf(e) !== null ? totalOf(e) : e.vals[c.code]) ? (isAmt(c) ? money(e.vals[c.code]) : '<b>' + (c.is_total && totalOf(e) !== null ? totalOf(e) : e.vals[c.code]) + '</b>') : '<span class="muted">—</span>'}</td>`).join('')}<td class="small gr">${e.grade ? `<b>${esc(e.grade.label)}</b>${e.grade.due ? `<div class="${e.grade.due < today ? '' : 'muted'}" style="${e.grade.due < today ? 'color:#b91c1c' : ''}">lên bậc: ${esc(e.grade.due)}${e.grade.due < today ? ' (quá hạn)' : ''}</div>` : '<div class="muted">bậc cuối / chưa đặt hạn</div>'}` : '<span class="muted">chưa gán</span>'}</td><td class="small dt" style="white-space:nowrap">${ymd(e.effective_from) || '<span class="muted">chưa có</span>'}</td><td class="skr">${e.editable ? `<button class="btn sm" data-new="${e.id}">${e.history_id ? 'Cập nhật hệ số mới' : 'Nhập hệ số'}</button> ${e.history_id ? `<button class="btn sec sm" data-edit="${e.id}">Sửa hệ số</button> ` : ''}` : ''}<button class="btn sec sm" data-h="${e.id}">Lịch sử</button></td></tr>`).join('');
    const gradeOpts = [{ v: '', t: '— Không gán bậc —' }, ...d.grades.map(g => ({ v: `${g.scale}|${g.grade}`, t: `${g.scale} · Bậc ${g.grade} (hệ số ${Number(g.coefficient)}${g.months_to_next ? ', giữ ' + g.months_to_next + ' tháng' : ''})` }))];
    const fields = (e, withDate) => [{ label: 'Hiệu lực từ', type: 'date', value: withDate }, ...CT.map(c => ({ label: c.is_total ? `${c.name} — TỔNG (tự cộng các hệ số thưởng ở trên; chỉ nhập tay khi chưa tách thành phần)` : `${c.name} (${({ insurance: 'BH', bonus: 'thưởng', amount: 'số tiền, đ', ins_amount: 'lương đóng BH thỏa thuận, đ — để 0 nếu đóng theo hệ số BH × lương cơ sở' })[c.kind] || c.kind})`, type: 'number', step: isAmt(c) ? '1000' : '0.0001', value: (c.is_total && totalOf(e) !== null ? totalOf(e) : e.vals[c.code]) ?? 0 })),
      { label: 'Bậc lương BH (chọn bậc sẽ tự lấy hệ số của bậc nếu bạn chưa đổi ô hệ số)', type: 'select', options: gradeOpts, value: e.grade ? `${e.grade.scale}|${e.grade.grade}` : '' }, { label: 'Ghi chú (tuỳ chọn)' }];
    // Chọn bậc: nếu ô hệ số BH chưa bị đổi tay thì lấy hệ số theo bậc
    const applyGrade = (e, r) => { const gk = r[r.length - 2]; if (!gk || !d.gradeCoef) return; const g = d.grades.find(x => `${x.scale}|${x.grade}` === gk); if (!g) return;
      const i = CT.findIndex(c => c.code === d.gradeCoef); if (i < 0) return; if ((Number(r[i + 1]) || 0) === (Number(e.vals[d.gradeCoef]) || 0) && Number(g.coefficient) !== Number(r[i + 1])) { r[i + 1] = String(g.coefficient); toast(`Đã lấy hệ số theo ${g.scale} · Bậc ${g.grade}: ${Number(g.coefficient)}`); } };
    const readVals = r => Object.fromEntries(CT.map((c, i) => [c.code, Number(r[i + 1]) || 0]));
    $('#tb').querySelectorAll('[data-new]').forEach(b => b.onclick = guard(async () => {
      const e = d.employees.find(x => x.id === b.dataset.new);
      const r = await ask(`${e.history_id ? 'Cập nhật hệ số mới' : 'Nhập hệ số'} — ${e.full_name}`, fields(e, today), 'Lưu bản ghi mới'); if (!r) return;
      applyGrade(e, r);
      const res = await POST('/api/coefficients/bulk', { effectiveFrom: r[0], note: r[r.length - 1], rows: [{ employeeId: e.id, grade: r[r.length - 2], vals: readVals(r) }] });
      toast(res.saved ? 'Đã thêm bản ghi hệ số mới' : 'Hệ số không đổi so với hiện tại — không tạo bản ghi'); PAGES.coef(me, root, asOf);
    }));
    $('#tb').querySelectorAll('[data-edit]').forEach(b => b.onclick = guard(async () => {
      const e = d.employees.find(x => x.id === b.dataset.edit);
      const r = await ask(`Sửa hệ số đang áp dụng — ${e.full_name}`, fields(e, ymd(e.effective_from)), 'Lưu sửa'); if (!r) return;
      applyGrade(e, r);
      await PATCH('/api/coefficients/history/' + e.history_id, { effectiveFrom: r[0], grade: r[r.length - 2], ...(r[r.length - 1] ? { note: r[r.length - 1] } : {}), vals: readVals(r) });
      toast('Đã sửa hệ số'); PAGES.coef(me, root, asOf);
    }));
    $('#tb').querySelectorAll('[data-h]').forEach(b => b.onclick = guard(async () => showHist(b.dataset.h)));
  }
  async function showHist(empId) {
    const h = await GET(`/api/coefficients/${empId}/history`);
    const cur = h.items.find(i => ymd(i.effective_from) <= d.asOf);
    const m = modal(`<h2>Lịch sử hệ số — ${esc(h.employee.full_name)}<span class="x">✕</span></h2>
      <div class="muted small">Mỗi dòng là một lần thay đổi hệ số, có hiệu lực từ ngày ghi bên trái đến khi có dòng mới hơn. Dòng <b>tô xanh</b> là bản đang áp dụng tại ${ymd(d.asOf)}. ${h.canDelete ? 'Nhập sai thì bấm Xoá dòng đó (bảng lương nháp sẽ được đánh dấu cần tính lại).' : ''}</div>
      <div class="scroll"><table><thead><tr><th>Hiệu lực từ</th><th>Hệ số</th><th>Bậc</th><th>Ghi chú</th><th>Người nhập</th><th>Lúc nhập</th>${h.canDelete ? '<th></th>' : ''}</tr></thead><tbody>${h.items.map(i => `<tr style="${cur && cur.id === i.id ? 'background:#ecfdf5' : ''}"><td style="white-space:nowrap"><b>${ymd(i.effective_from)}</b></td><td>${Object.entries(i.vals).filter(([, v]) => Number(v)).map(([k, v]) => { const c = CT.find(t => t.code === k); return `${esc(c?.name || k)}: <b>${c && isAmt(c) ? money(v) + ' đ' : v}</b>`; }).join('<br>') || '<span class="muted">(toàn bộ = 0)</span>'}</td><td>${i.grade ? esc((i.grade_scale ? i.grade_scale + ' · ' : '') + 'Bậc ' + i.grade) : '<span class="muted">—</span>'}</td><td>${esc(i.note || '')}</td><td>${esc(i.created_by_name || '')}</td><td class="small">${dt(i.created_at)}</td>${h.canDelete ? `<td><button class="btn red sm" data-delh="${i.id}">Xoá</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="6" class="muted">Chưa có bản ghi nào</td></tr>'}</tbody></table></div>`, true);
    (m?.querySelectorAll ? m : document).querySelectorAll('[data-delh]').forEach(x => x.onclick = guard(async () => { if (!await confirmBox('Xoá bản ghi hệ số này?')) return; await DEL('/api/coefficients/history/' + x.dataset.delh); toast('Đã xoá'); m.close(); PAGES.coef(me, root, asOf); }));
  }
  bindYm(() => {});
  $('#goasof').onclick = () => PAGES.coef(me, root, $('#asof').value);
  if ($('#nowasof')) $('#nowasof').onclick = () => PAGES.coef(me, root);
  $('#xhs').onclick = guard(async () => {
    const gname = $('#g').value, gid = (d.employees.find(e => e.group_name === gname) || {}).group_id;
    if (!gid) throw new Error('Chọn một bảng lương ở ô "Tất cả bảng lương" trước khi xuất');
    await download(`/api/payroll/${gid}/${ymState.year}/${ymState.month}/export/he-so`, `bang-he-so-${gname}-${ymState.year}-${String(ymState.month).padStart(2, '0')}.xlsx`);
  });
  if ($('#gograde')) $('#gograde').onclick = () => { RP_TAB = 'grades'; };
  if ($('#gocfg')) $('#gocfg').onclick = () => { ADM_TAB = 'cfg'; };
  rows(); $('#q').oninput = rows; $('#g').onchange = rows;
};

// ================= ĂN CA =================
PAGES.meals = async (me, root) => {
  const groups = (await GET(`/api/payroll/groups?year=${ymState.year}&month=${ymState.month}`)).groups;
  let gid = groups[0]?.id;
  async function show() {
    root.innerHTML = `<div class="card"><div class="row"><h2 class="grow">Bảng ăn ca</h2>${ymPicker(me)}<select id="gg">${opts(groups, 'id', 'name')}</select></div><div id="mb"><div class="muted">Đang tải…</div></div></div>`;
    if (gid) $('#gg').value = gid; bindYm(show); $('#gg').onchange = e => { gid = e.target.value; show(); };
    if (!gid) { $('#mb').innerHTML = '<div class="muted">Chưa có bảng lương nào.</div>'; return; }
    try {
      const r = await GET(`/api/payroll/meals/${gid}/${ymState.year}/${ymState.month}`);
      const note = x => [Object.entries(x.codes || {}).map(([k, v]) => `${esc(k)}×${v.n} (${money(v.price)})`).join('; '), x.actualQty ? `Ăn ca riêng: ${x.actualQty} suất` : '', x.waitQty ? `Chờ ca: ${x.waitQty} suất` : ''].filter(Boolean).join('; '), MODE = { actual: 'Kiểu 2 — bảng ăn ca riêng', auto_wait: 'Kiểu 1 + 3 — theo công + chờ ca' };
      $('#mb').innerHTML = r.rows.length ? `<div class="row small"><button class="btn sec sm" id="xl">Xuất Excel tiền ăn ca</button><span class="muted">Mức tiền ăn theo ký hiệu công cấu hình ở Quản trị › Cấu hình › Tiền ăn ca theo ký hiệu công.</span></div><div class="scroll"><table><thead><tr><th>Họ tên</th><th>Bộ phận</th><th>Bảng chấm công</th><th>Cách tính</th><th class="n">Số công ăn ca</th><th>Chi tiết</th><th class="n">Thành tiền</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.department || '')}</td><td>${esc(x.sheet)}</td><td>${MODE[x.mode] || 'Kiểu 1 — theo ký hiệu công'}</td><td class="n">${x.mode === 'actual' ? x.actualQty : x.days}</td><td class="small">${note(x)}</td><td class="n">${money(x.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="6">Tổng</th><th class="n">${money(r.total)}</th></tr></tfoot></table></div>` : '<div class="muted">Chưa có dữ liệu chấm công tháng này.</div>';
      if ($('#xl')) $('#xl').onclick = guard(() => download(`/api/payroll/${gid}/${ymState.year}/${ymState.month}/export/an-ca`, `tien-an-ca-${ymState.year}-${String(ymState.month).padStart(2, '0')}.xlsx`));
    } catch (e) { $('#mb').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
  await show();
};
