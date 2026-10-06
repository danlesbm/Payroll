// Điều hướng + khởi động. Mỗi trang là hàm render(me, root) đăng ký trong PAGES.
let ME = null;
const PAGES = window.PAGES = window.PAGES || {};
function tabsFor(me) {
  const a = me.assignments, has = (...r) => me.isAdmin || a.some(x => r.includes(x.role));
  const t = [];
  if (has('timekeeper', 'l1', 'l2', 'l3', 'director', 'view_att')) t.push(['attendance', 'Chấm công']);
  if (has('l2', 'l3', 'director', 'hr', 'view_pay')) t.push(['payroll', 'Bảng lương'], ['coef', 'Hệ số'], ['meals', 'Ăn ca']);
  if (me.canReports) t.push(['reports', 'Thống kê năm']);
  if (me.selfView) t.push(['mypay', 'Lương của tôi']);
  if (me.isAdmin || a.some(x => ['hr', 'cfg_att', 'people'].includes(x.role))) t.push(['admin', 'Quản trị']);
  return t;
}
async function route() {
  const root = $('#view'); if (!root) return;
  const tabs = tabsFor(ME); const want = (location.hash || '').replace('#/', '').split('/')[0];
  const page = tabs.find(t => t[0] === want) ? want : (tabs[0] || [])[0];
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.p === page));
  if (!page) { root.innerHTML = `<div class="card"><h2>Chưa được phân quyền</h2><p>Tài khoản <b>${esc(ME.user.email)}</b> chưa được Quản trị Payroll cấp quyền. Hãy liên hệ quản trị viên.</p></div>`; return; }
  root.innerHTML = '<div class="center muted">Đang tải…</div>';
  try { await PAGES[page](ME, root); } catch (e) { root.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function boot() {
  const app = $('#app');
  try { ME = await GET('/api/me'); saveSession(ME.session); initYm(ME); }
  catch (e) {
    app.innerHTML = `<div class="center"><h2>Chưa đăng nhập</h2><p class="muted">${esc(e.message)}</p><p>Hãy mở ứng dụng <b>luong</b> từ <b>Cổng đăng nhập SSO</b>.</p></div>`; return;
  }
  const tabs = tabsFor(ME);
  app.innerHTML = `<header class="top"><div class="bar"><span class="brand">${esc(ME.companyName)} · Chấm công & Lương</span>
    ${tabs.map(t => `<button class="tab" data-p="${t[0]}">${esc(t[1])}</button>`).join('')}
    <div class="me"><b>${esc(ME.user.name)}</b><div class="muted">${ME.isAdmin ? 'Quản trị Payroll' : esc([...new Set(ME.assignments.map(a => a.label))].join(' · '))}</div></div></div></header><main id="view"></main>`;
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.p; });
  window.addEventListener('hashchange', route);
  route();
}
boot();
