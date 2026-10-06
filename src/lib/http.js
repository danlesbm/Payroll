class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (msg, status = 400) => { throw new HttpError(status, msg); };
const forbid = (msg = 'Bạn không có quyền thực hiện thao tác này') => { throw new HttpError(403, msg); };
const str = v => (v === undefined || v === null ? '' : String(v).trim());
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = v => uuidRe.test(String(v || ''));
// Bọc handler: trả giá trị -> res.json. Lỗi async đi vào error middleware của Express 5.
const api = fn => async (req, res, next) => {
  const out = await fn(req, res, next);
  if (!res.headersSent) res.json(out === undefined ? { ok: true } : out);
};
const slug = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'nhom';
const sendXlsx = (res, buf, name) => { res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': buf.length }); res.send(buf); };
module.exports = { slug, sendXlsx, HttpError, bad, forbid, str, isUuid, api };
