require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { pool, rows, one, initDb, SCHEMA } = require('./db');
const { auth } = require('./auth');
const { syncDirectory } = require('./sso');
const { api } = require('./lib/http');
const { ROLES } = require('./lib/permissions');
const { nowVN } = require('./lib/dates');
const session = require('./lib/session');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
// Cho phép nhúng iframe từ SSO Portal
const FRAME = process.env.FRAME_ANCESTORS || "'self' https://*.sbm.com.vn";
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': `frame-ancestors ${FRAME}` }); next(); });
app.use(express.static(path.join(__dirname, '../public'), { maxAge: 0, etag: true }));

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'sbm-payroll', schema: SCHEMA }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.post('/api/internal/sync', async (req, res) => {
  const expected = process.env.SSO_INTERNAL_API_SECRET;
  if (!expected || req.get('X-Internal-Secret') !== expected) return res.status(401).json({ error: 'Sai secret nội bộ' });
  try { res.json({ ok: true, ...(await syncDirectory()) }); } catch (e) { res.status(502).json({ error: e.message }); }
});

// Năm hiển thị trong ô chọn: động. Để trống cài đặt = tự động (nhỏ nhất: 3 năm trước hoặc năm sớm nhất có dữ liệu; lớn nhất: năm hiện tại + 10, trượt theo thời gian). Có nhập số = dùng số đó (nhưng luôn gồm năm hiện tại và mọi năm đã có dữ liệu).
async function yearRange(s, now) {
  const d = await one(`SELECT LEAST((SELECT min(year) FROM periods), (SELECT min(year) FROM payroll_runs)) AS lo, GREATEST((SELECT max(year) FROM periods), (SELECT max(year) FROM payroll_runs)) AS hi`);
  const lo = Number(d?.lo) || now.year, hi = Number(d?.hi) || now.year;
  const sMin = Number(s.year_min) || 0, sMax = Number(s.year_max) || 0;
  return { yearMin: Math.min(sMin || now.year - 3, lo, now.year), yearMax: Math.max(sMax || now.year + 10, hi, now.year) };
}
app.use('/api', auth);
app.get('/api/me', api(async req => {
  const s = Object.fromEntries((await rows(`SELECT key, value FROM settings WHERE key IN ('company_name','year_min','year_max')`)).map(r => [r.key, r.value]));
  const now = nowVN();
  return {
    user: { id: req.auth.user.id, name: req.auth.user.name, email: req.auth.user.email }, isAdmin: req.auth.isAdmin,
    assignments: req.auth.assignments.map(a => ({ role: a.role, label: ROLES[a.role], scope_type: a.scope_type, scope_id: a.scope_id })),
    session: session.issue(req.auth.user),   // token phiên dài của Payroll (client cất lại, dùng thay token SSO ngắn hạn)
    roleLabels: ROLES, selfView: await reports.selfTab(req), canReports: req.auth.isAdmin || (await reports.allowedGroups(req)).length > 0, companyName: s.company_name || 'SBM',
    ...(await yearRange(s, now)), now
  };
}));
const { payroll, coefficients, items } = require('./routes/payroll');
const reports = require('./routes/reports');
app.use('/api/org', require('./routes/org'));
app.use('/api', require('./routes/people'));
app.use('/api/config', require('./routes/config'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/payroll', payroll);
app.use('/api/coefficients', coefficients);
app.use('/api/items', items);
app.use('/api/reports', reports);
app.use('/api/reports', require('./routes/grades'));
app.use('/api/workdays', require('./routes/workdays'));
app.use('/api', (req, res) => res.status(404).json({ error: `Không có API ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.code === '23505' ? 409 : 500);
  if (status >= 500) console.error('[Payroll]', req.method, req.originalUrl, err);
  res.status(status).json({ error: status >= 500 ? `Lỗi hệ thống: ${err.message}` : err.message });
});

const port = Number(process.env.PORT) || 3102;
(async () => {
  await initDb();
  console.log(`[Payroll] DB sẵn sàng (schema ${SCHEMA})`);
  app.listen(port, () => console.log(`[Payroll] http://0.0.0.0:${port}`));
  const run = () => syncDirectory().then(r => console.log('[Payroll] Đồng bộ SSO:', r)).catch(e => console.error('[Payroll] Đồng bộ SSO lỗi:', e.message));
  run();
  const min = Number(process.env.SYNC_INTERVAL_MIN ?? 30);
  if (min > 0) setInterval(run, min * 60 * 1000).unref();
})().catch(e => { console.error('[Payroll] Không khởi động được:', e); process.exit(1); });
