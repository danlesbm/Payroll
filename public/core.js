// ===== Tiện ích dùng chung =====
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const money = n => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n || 0)));
const dt = d => d ? new Date(d).toLocaleString('vi-VN') : '';
const ymd = d => d ? String(d).slice(0, 10) : '';
const fmtDate = d => ymd(d).split('-').reverse().join('/');
const STATUS = { draft: 'Đang chấm', pending_l1: 'Cấp 1 kiểm soát', pending_l2: 'Cấp 2 xử lý & chạy lương', adjusting: 'Cấp 2 xử lý & chạy lương', pending_l3: 'Cấp 3 kiểm soát', pending_dir: 'Chờ Giám đốc khoá', locked: 'Đã khoá (chính thức)', not_started: 'Chưa tạo', submitted: 'Cấp 3 kiểm soát', none: 'Chưa tính' };
// Loại nhân sự
const EMP_TYPE = { manager: 'Quản lý', admin: 'Hành chính', worker: 'Công nhân' };
const empType = t => EMP_TYPE[t] || EMP_TYPE.worker;
const EMP_TYPE_OPTS = [{ v: 'manager', t: 'Quản lý' }, { v: 'admin', t: 'Hành chính' }, { v: 'worker', t: 'Công nhân' }];
const badge = s => `<span class="badge ${esc(s)}">${esc(STATUS[s] || s)}</span>`;

// Token SSO: SSO mở app với ?token=...  -> cất vào sessionStorage rồi xoá khỏi URL
(function () {
  const u = new URL(location.href), t = u.searchParams.get('token');
  if (t) { try { sessionStorage.setItem('sso_token', t); sessionStorage.removeItem('pr_session'); } catch (e) {} u.searchParams.delete('token'); u.searchParams.delete('parent'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
})();
// Có token SSO mới trên URL -> bỏ phiên cũ. Sau khi vào được, Payroll cấp phiên dài (pr_session) dùng thay token SSO ngắn hạn.
const token = () => { try { return sessionStorage.getItem('pr_session') || sessionStorage.getItem('sso_token') || ''; } catch (e) { return ''; } };
const saveSession = s => { try { if (s) sessionStorage.setItem('pr_session', s); } catch (e) {} };

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) }, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Lỗi ' + r.status); e.status = r.status; throw e; }
  return d;
}
const GET = u => api('GET', u), POST = (u, b) => api('POST', u, b ?? {}), PATCH = (u, b) => api('PATCH', u, b), PUT = (u, b) => api('PUT', u, b), DEL = u => api('DELETE', u);

function toast(msg, bad) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } const d = document.createElement('div'); if (bad) d.className = 'bad'; d.textContent = msg; t.appendChild(d); setTimeout(() => d.remove(), bad ? 6000 : 2800); }
// Bọc hành động nút: bắt lỗi -> toast
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };

function modal(html, wide) {
  const b = document.createElement('div'); b.className = 'modalback';
  b.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
  b.addEventListener('mousedown', e => { if (e.target === b) b.remove(); });
  document.body.appendChild(b);
  const x = b.querySelector('.x'); if (x) x.onclick = () => b.remove();
  b.close = () => b.remove();
  return b;
}
function ask(title, fields, okLabel = 'Lưu') {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}<span class="x">✕</span></h2>${fields.map((f, i) => `<div class="field"><label>${esc(f.label)}</label>${
      f.type === 'select' ? `<select id="f${i}">${f.options.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(f.value ?? '') ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>` :
      f.type === 'textarea' ? `<textarea id="f${i}" rows="3">${esc(f.value ?? '')}</textarea>` :
      `<input id="f${i}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''}>`}</div>`).join('')}
      <div class="row"><button class="btn" id="ok">${esc(okLabel)}</button><button class="btn sec" id="no">Huỷ</button></div>`);
    m.querySelector('#no').onclick = () => { m.close(); res(null); };
    m.querySelector('.x').onclick = () => { m.close(); res(null); };
    m.querySelector('#ok').onclick = () => { const out = fields.map((f, i) => m.querySelector('#f' + i).value); m.close(); res(out); };
  });
}
const confirmBox = async msg => !!(await ask('Xác nhận', [{ label: msg, type: 'hidden', value: '' }], 'Đồng ý'));

function opts(list, valKey, textKey, blank) { return (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') + list.map(x => `<option value="${esc(x[valKey])}">${esc(typeof textKey === 'function' ? textKey(x) : x[textKey])}</option>`).join(''); }

async function download(url, name) {
  const r = await fetch(url, { headers: token() ? { Authorization: 'Bearer ' + token() } : {} });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Không tải được'); }
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// Bộ chọn năm/tháng dùng chung (năm lấy theo cấu hình, không cố định)
const ymState = { year: 0, month: 0 };
function initYm(me) { if (!ymState.year || !ymState.month) { ymState.year = me.now.year; ymState.month = me.now.month; } }
function ymPicker(me, onChange) {
  if (!ymState.year) { ymState.year = me.now.year; ymState.month = me.now.month; }
  const years = []; for (let y = me.yearMin; y <= me.yearMax; y++) years.push(y);
  return `<select id="selY">${years.map(y => `<option ${y === ymState.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
  <select id="selM">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === ymState.month ? 'selected' : ''}>Tháng ${i + 1}</option>`).join('')}</select>`;
}
function bindYm(onChange) { $('#selY').onchange = e => { ymState.year = +e.target.value; onChange(); }; $('#selM').onchange = e => { ymState.month = +e.target.value; onChange(); }; }
