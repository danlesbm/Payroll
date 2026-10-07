// Làm sạch tên lấy từ SSO.
//  Quản lý: "Chức vụ - Họ và tên"   (vd "Phó phòng kỹ thuật - Phạm Văn Hảo")
//  Nhân viên: "Họ và tên - NV bộ phận xxx" (vd "Nguyễn Vân Kiều - NV Văn phòng")
const POS = /(chủ tịch|hđqt|\bbks\b|thành viên|hành chính|giám đốc|\bgđ\b|phó|trưởng|chánh|phụ trách|kế toán|\bnv\b|nhân viên|lái xe|kỹ thuật|kỹ sư|vận hành|thủ quỹ|văn thư|bảo vệ|tạp vụ|nmtđ|nhà máy|phòng|bộ phận|ban |hội đồng|kiểm soát)/i;
const BOARD = /(hội đồng quản trị|ban kiểm soát)/i;
const MANAGER = /(giám đốc|phó gđ|trưởng phòng|phó phòng|hội đồng quản trị|kiểm soát)/i;
function cleanName(raw, positions = '') {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  // Dấu ngăn cách: - – — _ ; có cách hai đầu, một đầu hoặc không cách
  const parts = s.split(/\s*[-–—_]\s*/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return s;
  const a = parts[0], b = parts.slice(1).join(' - ');
  const aPos = POS.test(a), bPos = POS.test(b);
  if (BOARD.test(String(positions || '')) && aPos) return b;   // HĐQT / Ban kiểm soát: đoạn đầu là chức danh, sau dấu - hoặc _ là họ tên
  if (aPos && !bPos) return b;
  if (bPos && !aPos) return a;
  if (!aPos && !bPos && !/\s[-–—_]\s/.test(s)) return s;   // vd tên có gạch nối liền (Nguyễn Thị Hoa-Lan): không tách
  return MANAGER.test(String(positions || '')) ? b : a;
}
// Chức danh in trên biểu mẫu. Công ty chỉ dùng các chức danh sau; chức danh gõ trước dấu - / _ trong tên SSO được dùng nếu thuộc danh sách
// (riêng HĐQT / Ban kiểm soát thì luôn lấy đoạn đầu làm chức danh).
const TITLE_CANON = {
  'nhân viên': 'Nhân viên', 'phó phòng': 'Phó phòng', 'trưởng phòng': 'Trưởng phòng',
  'phó giám đốc': 'P. Giám đốc', 'phó gđ': 'P. Giám đốc', 'p. giám đốc': 'P. Giám đốc', 'p.giám đốc': 'P. Giám đốc', 'p. gđ': 'P. Giám đốc', 'giám đốc': 'Giám đốc',
  'kế toán trưởng': 'Kế toán trưởng', 'chánh văn phòng': 'Chánh văn phòng',
  'giám đốc nhà máy': 'Giám đốc nhà máy', 'phó giám đốc nhà máy': 'P. Giám đốc nhà máy', 'p. giám đốc nhà máy': 'P. Giám đốc nhà máy', 'p.giám đốc nhà máy': 'P. Giám đốc nhà máy',
  'chủ tịch hđqt': 'Chủ tịch HĐQT', 'thành viên hđqt': 'Thành viên HĐQT', 'trưởng ban kiểm soát': 'Trưởng ban kiểm soát', 'trưởng ban bks': 'Trưởng ban kiểm soát', 'thành viên bks': 'Thành viên BKS',
  'kỹ thuật': 'Kỹ thuật', 'hành chính': 'Hành chính'
};
const normT = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
function extractTitle(raw, positions = '') {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  const parts = s.split(/\s*[-–—_]\s*/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const a = parts[0], b = parts.slice(1).join(' - ');
  if (!POS.test(a) || POS.test(b)) return '';          // chức danh phải đứng đầu ("Chức danh - Họ tên")
  if (BOARD.test(String(positions || ''))) return TITLE_CANON[normT(a)] || a;
  return TITLE_CANON[normT(a)] || '';
}
// Tài khoản dùng chung (admin, email phòng...) cần loại: mỗi dòng là một cụm từ, không phân biệt hoa thường, so với tên / tài khoản / email
function isExcluded(rec, patterns) {
  // Chỉ so với tên người (đã bỏ chức danh phía sau " - "), tài khoản và email. Không so với tên SSO đầy đủ: chức danh kiểu
  // "Nguyễn Văn A - NVVH NMTĐ Suối Sập 3" chứa tên nhà máy nên cụm "NMTĐ Suối Sập 3" sẽ loại nhầm cả nhà máy.
  const personal = String(rec.sso_name || '').split(/\s+[-–—]\s+/)[0];
  const hay = [personal, rec.full_name, rec.username, rec.email].filter(Boolean).join(' | ').toLowerCase();
  return (patterns || []).some(p => p && hay.includes(String(p).toLowerCase()));
}
const parsePatterns = text => String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
// Thứ bậc chức vụ (số nhỏ = cao hơn): dùng để xếp người chức to đứng trước
const RANKS = [['Hội đồng quản trị', 5], ['Ban Kiểm Soát', 6], ['Giám đốc', 10], ['Phó GĐ', 20], ['Trưởng phòng', 30], ['Phó phòng', 40], ['Người phụ trách', 50], ['Văn thư', 60], ['Nhân viên', 70]];
function posRank(positions, title = '') {
  const t = normT(title);
  if (t === 'chủ tịch hđqt') return 4;
  if (t === 'trưởng ban kiểm soát') return 5;
  const list = String(positions || '').split(',').map(x => x.trim().toLowerCase());
  let best = 80; for (const [k, v] of RANKS) if (list.includes(k.toLowerCase()) && v < best) best = v;
  return best;
}
const looksLead = raw => /trưởng ca/i.test(String(raw || ''));
const looksWorker = raw => /(trưởng ca|điều hành viên|vận hành)/i.test(String(raw || ''));
// Chức danh hiển thị: ưu tiên chức danh gõ trong tên SSO; nếu không có thì suy từ chức vụ SSO — chỉ lấy MỘT chức danh cao nhất,
// bỏ "Người phụ trách", "Văn thư" đi kèm (Văn thư một mình = Nhân viên). Ở nhà máy: "Trưởng phòng" = "Giám đốc nhà máy", "Phó phòng" = "P. Giám đốc nhà máy".
function dispPositions(positions, kind, st = {}, title = '') {
  let t = title ? String(title).trim() : '';
  if (!t) {
    const list = String(positions || '').split(',').map(x => x.trim()).filter(Boolean);
    const has = k => list.some(x => x.toLowerCase() === k);
    t = has('giám đốc') ? 'Giám đốc' : has('phó gđ') ? 'P. Giám đốc' : has('hội đồng quản trị') ? 'Thành viên HĐQT' : has('ban kiểm soát') ? 'Thành viên BKS'
      : has('trưởng phòng') ? 'Trưởng phòng' : has('phó phòng') ? 'Phó phòng' : list.length ? 'Nhân viên' : '';
  }
  if (kind === 'plant') { const k = normT(t); if (k === 'trưởng phòng' && st.plant_title_head) return st.plant_title_head; if (k === 'phó phòng' && st.plant_title_deputy) return st.plant_title_deputy; }
  return t;
}
module.exports = { extractTitle, TITLE_CANON, dispPositions, posRank, looksLead, looksWorker, cleanName, isExcluded, parsePatterns };
