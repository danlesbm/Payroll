// Phiên làm việc riêng của Payroll: sau khi SSO xác thực 1 lần, Payroll cấp token ký HMAC sống lâu (mặc định 7 ngày, gia hạn mỗi lần mở app)
// -> không bị văng ra khi token SSO ngắn hạn hết hạn. Đặt PAYROLL_SESSION_HOURS để đổi.
const crypto = require('crypto');
const PREFIX = 'ps1.';
const secret = () => process.env.PAYROLL_SESSION_SECRET || process.env.SSO_INTERNAL_API_SECRET || 'payroll-dev-secret';
const hours = () => Number(process.env.PAYROLL_SESSION_HOURS) > 0 ? Number(process.env.PAYROLL_SESSION_HOURS) : 168;
const sign = body => crypto.createHmac('sha256', secret()).update(body).digest('base64url');
function issue(user) {
  const body = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + hours() * 3600 * 1000 })).toString('base64url');
  return PREFIX + body + '.' + sign(body);
}
function verify(token) {
  if (!token || !token.startsWith(PREFIX)) return null;
  const [body, sig] = token.slice(PREFIX.length).split('.');
  if (!body || !sig) return null;
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return d.exp > Date.now() && d.u?.id ? d.u : null; } catch (e) { return null; }
}
const isSession = t => typeof t === 'string' && t.startsWith(PREFIX);
module.exports = { issue, verify, isSession };
