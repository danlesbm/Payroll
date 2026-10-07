// Công chuẩn theo lịch nghỉ + ngày lễ, công tối thiểu, tăng ca — hàm thuần, dễ kiểm thử.
const pad = n => String(n).padStart(2, '0');
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
const EPS = 1e-9;

// Ngày nghỉ hằng tuần (0 = Chủ nhật … 6 = Thứ bảy)
const WEEKLY = { sun: [0], sat_sun: [6, 0] };
const WEEKLY_LABEL = { sun: 'Nghỉ Chủ nhật (1 ngày/tuần)', sat_sun: 'Nghỉ Thứ 7 + Chủ nhật (2 ngày/tuần)' };
const MIN_LABEL = { equal: 'Bằng công chuẩn', group_min: 'Kíp thấp nhất của nhóm trực ca', fixed: 'Số cố định', minus: 'Công chuẩn trừ N ngày', pct: 'N% công chuẩn' };
const isWeekly = w => w in WEEKLY;

/** Công chuẩn của một tháng cho một lịch nghỉ.
 *  Ngày nghỉ = ngày nghỉ hằng tuần ∪ ngày lễ: ngày lễ trùng ngày nghỉ hằng tuần chỉ tính 1 ngày nghỉ
 *  (ngày nghỉ bù được nhập như một ngày lễ riêng nên đã nằm trong danh sách ngày lễ). */
function monthInfo(year, month, weeklyOff, holidays) {
  const days = dim(year, month), offDow = WEEKLY[weeklyOff] || WEEKLY.sun;
  const hol = holidays instanceof Set ? holidays : new Set(holidays || []);
  const offDays = [], weeklyDays = [], holidayDays = [], overlapDays = [];
  for (let d = 1; d <= days; d++) {
    const key = `${year}-${pad(month)}-${pad(d)}`, dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    const w = offDow.includes(dow), h = hol.has(key);
    if (w) weeklyDays.push(d);
    if (h) holidayDays.push(d);
    if (w && h) overlapDays.push(d);
    if (w || h) offDays.push(d);
  }
  return { days, weeklyOff: isWeekly(weeklyOff) ? weeklyOff : 'sun', weekly: weeklyDays.length, holidays: holidayDays.length, overlap: overlapDays.length,
    holidayCounted: holidayDays.length - overlapDays.length, offDays, weeklyDays, holidayDays, overlapDays, standard: days - offDays.length };
}
/** Công tối thiểu từ công chuẩn: equal | fixed (số cố định, không vượt công chuẩn) | minus (chuẩn − N) | pct (N% chuẩn). Luôn nằm trong [0, công chuẩn]. */
function minDays(rule, standard, groupMin) {
  const mode = rule?.min_mode || 'equal', v = num(rule?.min_value);
  let m = mode === 'group_min' ? (groupMin === undefined || groupMin === null ? standard : num(groupMin)) : mode === 'fixed' ? v : mode === 'minus' ? standard - v : mode === 'pct' ? standard * v / 100 : standard;
  return r2(Math.min(Math.max(m, 0), standard));
}
/** Quy tắc cụ thể nhất: phòng (4) > bảng lương (2) > loại nhân sự (1) — cộng điểm các tiêu chí khớp; quy tắc không khớp bị loại. */
function pickRule(rules, ctx) {
  let best = null, bestScore = -1;
  for (const r of rules || []) {
    if (r.department_id && r.department_id !== ctx.departmentId) continue;
    if (r.group_id && r.group_id !== ctx.groupId) continue;
    if (r.employee_type && r.employee_type !== ctx.employeeType) continue;
    const score = (r.department_id ? 4 : 0) + (r.group_id ? 2 : 0) + (r.employee_type ? 1 : 0);
    if (score > bestScore || (score === bestScore && String(r.updated_at) > String(best?.updated_at))) { best = r; bestScore = score; }
  }
  return best;
}
/** Hệ số công tính lương: công ≥ chuẩn → 1 + công vượt × hệ số tăng ca ÷ chuẩn; tối thiểu ≤ công < chuẩn → 1 (đủ lương); công < tối thiểu → công ÷ chuẩn. */
function payRatio(work, std, min, otMult = 1, div) {
  work = num(work); std = num(std); min = min === undefined || min === null ? std : num(min);
  if (!(std > 0)) return { ratio: 0, otDays: 0, status: 'none' };
  div = div > 0 ? num(div) : std;   // mẫu số của đơn giá ngày: công chuẩn (quản lý) hoặc công tối thiểu (công nhân trực ca kíp)
  if (work > std + EPS) { const ot = r2(work - std); return { ratio: 1 + ot * num(otMult) / div, otDays: ot, status: 'ot' }; }
  if (work >= std - EPS) return { ratio: 1, otDays: 0, status: 'full' };
  if (work >= min - EPS) return { ratio: 1, otDays: 0, status: 'tolerance' };
  return { ratio: work / div, otDays: 0, status: 'short' };
}
const STATUS_LABEL = { ot: 'Tăng ca', full: 'Đủ công', tolerance: 'Trong khoảng tối thiểu – chuẩn: hưởng đủ', short: 'Thiếu công: tính theo ngày công thực tế', none: '—' };
/** Công thực tế của một người và công của cả nhóm trực ca kíp.
 *  Công thường = tổng công các ký hiệu KHÔNG phải làm thêm (LT…), bỏ nghỉ bù/phép rơi vào ngày nghỉ.
 *  Công tối thiểu nhóm = trong mỗi kíp lấy công cao nhất của người trong kíp (đại diện cho kíp), rồi lấy kíp thấp nhất. */
function shiftGroupMin(rows) {
  const byKip = {};
  for (const r of rows || []) { if (!r.shiftNo) continue; const k = String(r.shiftNo); byKip[k] = Math.max(byKip[k] ?? 0, num(r.work)); }
  const ks = Object.keys(byKip); if (!ks.length) return null;
  const lowest = ks.reduce((b, k) => (byKip[k] < byKip[b] ? k : b), ks[0]);
  return { min: r2(byKip[lowest]), lowestKip: Number(lowest), byKip, cohort: (rows || []).filter(r => r.shiftNo).length };
}
/** Số "ngày tương đương" làm đêm / làm thêm / làm lễ của một người trong tháng.
 *  Mỗi ngày công: c = %ký hiệu ÷ 100 (theo nhóm phụ cấp, mặc định 1), h = %ngày lễ ÷ 100 (mặc định 1).
 *  Phụ cấp của ký hiệu (vd làm đêm 30%) = cơ sở × (c − 1); cơ sở = công đêm (nhóm 'night') hoặc toàn bộ công ('extra').
 *  Phần lễ = công × (h − 1) (+ phụ cấp sửa chữa × (h − 1)). Vd K1,3 ngày lễ 300%: làm đêm 0,3, làm lễ 2 × 2 = 4.
 *  Làm đêm KHÔNG nhân % lễ / tăng ca ở đây: calcLine tính tiền làm lễ / tăng ca trên đơn giá ngày đã gồm tiền làm đêm
 *  bình quân của tháng = (lương + thưởng + phụ cấp + tiền làm đêm) ÷ công chuẩn, như bảng Excel nhà máy. */
function premiumDays(entries, o) {
  const out = { night: 0, extra: 0, holiday: 0 };
  const std = num(o.std), otM = num(o.otMult); let cum = 0;
  const list = [...(entries || [])].sort((a, b) => num(a.day) - num(b.day));
  for (const e of list) {
    const w = o.work[e.code]; if (!w || (o.skip && o.skip(e))) continue;
    const val = num(w.value); if (!(val > 0)) continue;
    const kind = o.kind[e.code], c = o.pct(e.code) / 100, h = o.holPct(e.day) / 100;
    // Ký hiệu làm thêm (LT1–LT4…): trả nguyên % của ký hiệu (đã gồm đêm/lễ), không nhân thêm % ngày lễ
    if (o.ot && o.ot(e.code)) { out.extra += val * c; continue; }
    const over = std > 0 ? Math.max(0, Math.min(val, cum + val - std)) / val : 0; cum += val;   // phần công của ngày này vượt công tiêu chuẩn
    if (kind === 'night') out.night += (num(w.night) > 0 ? num(w.night) : val) * (c - 1);
    else if (kind) {   // phụ cấp kiểu sửa chữa…: phần phụ cấp cũng nhân % lễ / tăng ca
      const add = val * (c - 1); out.extra += add;
      if (h !== 1) out.holiday += add * (h - 1);
      if (over > 0 && otM > 1) out.extra += add * (otM - 1) * over;
    }
    if (h !== 1) out.holiday += val * (h - 1);
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10000) / 10000;
  return out;
}
/** Công tối thiểu theo TỪNG NHÀ MÁY (phòng/bộ phận tính lương): mỗi nhà máy có lịch kíp riêng nên tính riêng, dù cùng bảng lương. */
function shiftGroupMinBy(rows) {
  const by = {}; for (const r of rows || []) if (r.shiftNo) (by[r.dept || ''] ||= []).push(r);
  const out = {}; for (const k of Object.keys(by)) out[k] = shiftGroupMin(by[k]);
  return out;
}
module.exports = { shiftGroupMinBy, shiftGroupMin, premiumDays, monthInfo, minDays, pickRule, payRatio, WEEKLY, WEEKLY_LABEL, MIN_LABEL, STATUS_LABEL, isWeekly, dim, pad };
