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

## Phương án A / B cho tiền làm lễ, làm thêm của ca đêm
- Công thức đang dùng (B, theo Excel nhà máy) không đổi.
- Có thêm nhánh dự phòng **`theo-tt`** tính theo phương án A (Thông tư: ca đêm ngày lễ 390%, ca đêm tăng ca 260%). Hai nhánh chỉ khác 1 dòng trong `src/lib/premium-method.js`. Cách cập nhật và chuyển server giữa 2 nhánh: xem `NHANH-THEO-TT.md`.
