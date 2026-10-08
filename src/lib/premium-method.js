// ═══════════════════════════════════════════════════════════════════════════════════════════════
//  CÔNG THỨC TIỀN LÀM LỄ / LÀM THÊM CỦA CA ĐÊM — PHƯƠNG ÁN A HAY B
//
//  ĐÂY LÀ CHỖ DUY NHẤT KHÁC NHAU GIỮA 2 NHÁNH CODE (xem NHANH-THEO-TT.md):
//    • nhánh chính  v6.19  → 'B'  (theo bảng Excel nhà máy — ĐANG DÙNG)
//    • nhánh        theo-tt → 'A'  (theo Thông tư / Bộ luật Lao động — DỰ PHÒNG)
//  Khi đưa code mới từ v6.19 sang theo-tt (git merge v6.19) thì KHÔNG sửa dòng PREMIUM_METHOD ở dưới.
//
//  A — tính theo từng ca: phụ cấp đêm 30% của ca đêm cũng được nhân % lễ / % tăng ca.
//      Ca đêm ngày lễ 300%: 100% (lương) + 30% (làm đêm) + 260% (làm lễ) = 390%.
//      Ca đêm vượt công chuẩn, tăng ca ×2: 200% (làm thêm) + 30% (làm đêm) + 30% (làm thêm) = 260%.
//      Ca ngày chỉ nhân % lễ / tăng ca trên đơn giá ngày (không có phần đêm).
//  B — như bảng Excel nhà máy: tiền làm lễ / công vượt chuẩn tính trên đơn giá ngày ĐÃ GỒM tiền làm đêm
//      bình quân của tháng: (lương + thưởng + phụ cấp + tiền đêm cả tháng) ÷ công chuẩn × số công × (% − 100%),
//      cho mọi công lễ / vượt chuẩn (cả ca ngày). Tiền làm đêm 30% vẫn chỉ tính trên công đêm.
//  Cả hai: tiền làm đêm 30% (cột Làm đêm) như nhau; ký hiệu LT, sửa chữa… như nhau.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const PREMIUM_METHOD = 'B';

module.exports = { PREMIUM_METHOD };
