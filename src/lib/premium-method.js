// ═══════════════════════════════════════════════════════════════════════════════════════════════
//  CÔNG THỨC TIỀN LÀM LỄ / LÀM THÊM CỦA CA ĐÊM — PHƯƠNG ÁN A HAY B
//
//  ĐÂY LÀ CHỖ DUY NHẤT KHÁC NHAU GIỮA 2 NHÁNH CODE (xem NHANH-THEO-TT.md):
//    • nhánh chính  v6.19  → 'B'  (theo bảng Excel nhà máy — ĐANG DÙNG)
//    • nhánh        theo-tt → 'A'  (theo Thông tư / Bộ luật Lao động — DỰ PHÒNG)
//  Khi đưa code mới từ v6.19 sang theo-tt (git merge v6.19) thì KHÔNG sửa dòng PREMIUM_METHOD ở dưới.
//
//  A — theo Nghị định 145/2020/NĐ-CP (Điều 55–57, hướng dẫn Điều 98 Bộ luật Lao động 2019), tính theo từng ca:
//      làm thêm vào ban đêm (ca đêm ngày lễ, ca đêm vượt công chuẩn) được trả: tiền làm thêm + 30% làm đêm
//      + 20% × đơn giá ban ngày của công đó (NIGHT_OT_EXTRA).
//      Ca đêm ngày lễ 300%: 300% + 30% + 20% × 300% = 390%.
//      Ca đêm vượt công chuẩn, tăng ca ×2: 200% + 30% + 20% × 200% = 270%.
//      Ca ngày chỉ nhân % lễ / tăng ca trên đơn giá ngày (không có phần đêm).
//  B — như bảng Excel nhà máy: tiền làm lễ / công vượt chuẩn tính trên đơn giá ngày ĐÃ GỒM tiền làm đêm
//      bình quân của tháng: (lương + thưởng + phụ cấp + tiền đêm cả tháng) ÷ công chuẩn × số công × (% − 100%),
//      cho mọi công lễ / vượt chuẩn (cả ca ngày). Tiền làm đêm 30% vẫn chỉ tính trên công đêm.
//  Cả hai: tiền làm đêm 30% (cột Làm đêm) như nhau; ký hiệu LT, sửa chữa… như nhau.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const PREMIUM_METHOD = 'A';

// NĐ 145/2020 Điều 57: làm thêm giờ vào ban đêm được trả thêm 20% tiền lương làm việc ban ngày của ngày đó (chỉ dùng ở phương án A)
const NIGHT_OT_EXTRA = 0.2;

module.exports = { PREMIUM_METHOD, NIGHT_OT_EXTRA };
