const { rows } = require('./db');
const { introspect, tokenFrom } = require('./sso');
const { can, canAny, deptIds } = require('./lib/permissions');
const autoroles = require('./lib/autoroles');
const { HttpError, forbid } = require('./lib/http');
const session = require('./lib/session');
const list = v => String(v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

async function auth(req, res, next) {
  const tk = tokenFrom(req);
  let user = session.isSession(tk) ? session.verify(tk) : await introspect(tk);
  if (user && session.isSession(tk)) {   // phiên Payroll: vẫn chặn người đã bị khoá ở SSO
    const e = await rows('SELECT sso_status FROM employees WHERE sso_user_id=$1', [user.id]);
    if (e[0] && e[0].sso_status === 'locked') user = null;
  }
  if (!user) throw new HttpError(401, 'Phiên đăng nhập SSO đã hết hạn. Hãy mở lại ứng dụng từ SSO Portal.');
  const manual = await rows('SELECT id, role, scope_type, scope_id FROM role_assignments WHERE sso_user_id=$1', [user.id]);
  const assignments = [...manual, ...(await autoroles.forUser(user.id))];   // thủ công + tự động theo chức vụ SSO
  const bootstrap = list(process.env.PAYROLL_BOOTSTRAP_EMAILS).includes(user.email.toLowerCase()) || list(process.env.PAYROLL_BOOTSTRAP_SSO_IDS).includes(user.id.toLowerCase());
  const ssoAdmin = process.env.SSO_ADMIN_IS_ADMIN !== 'false' && user.ssoRole === 'admin';
  const isAdmin = bootstrap || ssoAdmin || assignments.some(a => a.role === 'admin');
  req.auth = {
    token: tk,
    user, assignments, isAdmin,
    can: (role, ctx) => can(assignments, role, ctx, isAdmin),
    canAny: (roles, ctx) => canAny(assignments, roles, ctx, isAdmin),
    deptIds: roles => deptIds(assignments, roles),
    need(role, ctx, msg) { if (!this.can(role, ctx)) forbid(msg); },
    needAdmin() { if (!isAdmin) forbid('Chỉ Quản trị Payroll mới được thực hiện thao tác này'); }
  };
  next();
}
async function audit(req, action, entity, entityId, detail) {
  try {
    await rows('INSERT INTO audit_logs(actor, actor_name, action, entity, entity_id, detail) VALUES($1,$2,$3,$4,$5,$6)',
      [req.auth?.user.id || null, req.auth?.user.name || null, action, entity || null, entityId ? String(entityId) : null, detail ? JSON.stringify(detail) : null]);
  } catch (e) { console.error('[audit]', e.message); }
}
module.exports = { auth, audit };
