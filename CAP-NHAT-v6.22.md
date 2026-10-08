# Cập nhật v6.22 — Chức danh tự động, sửa tay chức danh

## Chức danh tự động
Chức danh in trên bảng chấm công, bảng lương, bảng thưởng, bảng hệ số, ăn ca và thống kê lấy theo thứ tự:
1. **Chức danh sửa tay** ở *Quản trị › Nhân sự* (cột Chức danh). Nếu có thì dùng luôn.
2. Tích **Trưởng ca** → "Trưởng ca".
3. Có **Kíp** nhưng không phải trưởng ca → "ĐHV".
4. Còn lại theo chức vụ SSO. Ở nhà máy, Trưởng phòng → **"Giám đốc NM"**, Phó phòng → **"P. Giám đốc NM"**. Tên này đổi được ở *Cấu hình › Thông tin chung*; khi cập nhật, tên mặc định cũ "Giám đốc nhà máy" / "P. Giám đốc nhà máy" tự đổi sang tên gọn.

## Sửa tay chức danh
- *Quản trị › Nhân sự*: cột **Chức danh** là ô nhập. Chữ mờ trong ô là chức danh tự động; gõ vào để sửa tay, xoá trắng để về tự động. Bấm **Lưu thay đổi**. Có thể **Hoàn tác** như các cột khác.
- Đổi chức danh không cần "Tính lại" bảng lương (chức danh lấy lúc xem / xuất).

## Chọn phương pháp tính tiền làm lễ, làm thêm (v6.23)
- Admin › Cấu hình có thẻ mới **Phương pháp tính tiền làm lễ, làm thêm**, chọn một trong hai, có diễn giải công thức ngay tại chỗ:
  - **Theo Nghị định 145/2020/NĐ-CP** (Bộ luật Lao động 2019 Điều 98): ca đêm ngày lễ 300% = 390%, ca đêm vượt chuẩn tăng ca 200% = 270%.
  - **Theo quy chế lương riêng** (như bảng Excel nhà máy): tiền làm đêm bình quân cộng vào đơn giá ngày tính lễ / vượt chuẩn. **Mặc định, giữ nguyên số liệu đang dùng.**
- Đổi phương pháp thì các bảng lương nháp được đánh dấu cần **Tính lại**; bảng đã khoá giữ số cũ.
- Phương án A trước đây tính phụ cấp đêm × % lễ (lễ 400% ra 520%, tăng ca ×2 ra 260%); nay tính đúng Điều 57 NĐ 145/2020 (thêm 20% đơn giá ban ngày): lễ 400% ra 510%, tăng ca ×2 ra 270%. Lễ 300% vẫn 390%.
- Hai nhánh dự phòng (đóng băng, không có thẻ chọn): `theo-tt` chỉ tính A, `quy-che-rieng` chỉ tính B. Xem `NHANH-THEO-TT.md`.
