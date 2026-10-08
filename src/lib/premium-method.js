// ═══════════════════════════════════════════════════════════════════════════════════════════════
//  PHƯƠNG PHÁP TÍNH TIỀN LÀM LỄ / LÀM THÊM KHI CÓ CA ĐÊM
//
//  Chọn ở Admin › Cấu hình › "Phương pháp tính tiền làm lễ, làm thêm" (settings.premium_method, mặc định 'B').
//  Diễn giải đầy đủ công thức hiển thị ngay ở thẻ đó (public/pages-admin.js) và trong NHANH-THEO-TT.md.
//
//  A — Theo Nghị định 145/2020/NĐ-CP (Điều 55–57, hướng dẫn Điều 98 Bộ luật Lao động 2019), tính theo từng ca:
//      làm thêm vào ban đêm (ca đêm ngày lễ, ca đêm vượt công chuẩn) được trả: tiền làm thêm + 30% làm đêm
//      + 20% × đơn giá ban ngày của công đó (NIGHT_OT_EXTRA).
//      Ca đêm ngày lễ 300%: 300% + 30% + 20% × 300% = 390%.
//      Ca đêm vượt công chuẩn, tăng ca ×2: 200% + 30% + 20% × 200% = 270%.
//      Ca ngày chỉ nhân % lễ / tăng ca trên đơn giá ngày (không có phần đêm).
//  B — Theo quy chế lương riêng (như bảng Excel nhà máy): tiền làm lễ / công vượt chuẩn tính trên đơn giá ngày ĐÃ GỒM
//      tiền làm đêm bình quân của tháng: (lương + thưởng + phụ cấp + tiền đêm cả tháng) ÷ công chuẩn × số công × (% − 100%),
//      cho mọi công lễ / vượt chuẩn (cả ca ngày). Tiền làm đêm 30% vẫn chỉ tính trên công đêm.
//  Cả hai: tiền làm đêm 30% (cột Làm đêm) như nhau; ký hiệu LT, sửa chữa… như nhau.
//
//  Nhánh dự phòng (đóng băng, không có lựa chọn này): theo-tt = chỉ A, quy-che-rieng = chỉ B.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const METHODS = { A: 'Theo Nghị định 145/2020/NĐ-CP', B: 'Theo quy chế lương riêng' };
const DEFAULT_METHOD = 'B';
const methodOf = v => (Object.hasOwn(METHODS, v) ? v : DEFAULT_METHOD);

// NĐ 145/2020 Điều 57: làm thêm giờ vào ban đêm được trả thêm 20% tiền lương làm việc ban ngày của ngày đó (chỉ dùng ở phương án A)
const NIGHT_OT_EXTRA = 0.2;

module.exports = { METHODS, DEFAULT_METHOD, methodOf, NIGHT_OT_EXTRA };
