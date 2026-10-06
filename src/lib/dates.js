// Tiện ích ngày tháng theo giờ Việt Nam.
function nowVN(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthStart = (y, m) => `${y}-${String(m).padStart(2, '0')}-01`;
const monthEnd = (y, m) => `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
// Tháng đã đến (<= tháng hiện tại) mới được mở chấm công; tháng chưa đến thì khoá.
const isMonthOpen = (y, m, now = nowVN()) => y * 12 + m <= now.year * 12 + now.month;
function validYM(y, m) { y = Number(y); m = Number(m); return Number.isInteger(y) && Number.isInteger(m) && y >= 2000 && y <= 2200 && m >= 1 && m <= 12; }
module.exports = { nowVN, daysInMonth, monthStart, monthEnd, isMonthOpen, validYM };
