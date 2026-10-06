# Cập nhật v6.5

1. **Tên từ SSO được làm sạch** khi đồng bộ: "Chức vụ - Họ tên" (quản lý) và "Họ tên - NV bộ phận…" (nhân viên) đều chỉ còn Họ tên. Tên gốc giữ ở cột `sso_name`.
2. **Loại trừ tài khoản dùng chung** (Admin, email chung của phòng/nhà máy…): Quản trị › Cấu hình › "Loại trừ tài khoản dùng chung" — mỗi dòng một cụm từ, khớp với tên/tài khoản/email. Lưu là áp dụng ngay; những tài khoản này biến mất khỏi mọi bảng.
3. **Excel bảng chấm công**: tiêu đề tên công ty = Cài đặt chung › Tên công ty; dòng 2 = "Tiêu đề in" của bảng chấm công (trống = tên bảng). Người ký để trống tên thì tự điền: Giám đốc (chức vụ "Giám đốc" ở SSO), Phụ trách bộ phận (Trưởng phòng, không có thì Phó phòng), Người chấm công (người được gán quyền "Người chấm công" của bảng). Gõ tên cụ thể ở ô người ký thì dùng tên đó.
4. **Xếp loại** (Tổ chức › Sửa bảng chấm công: bật/tắt từng loại):
   - An toàn tháng A/B → A hưởng 100% **Phụ cấp an toàn** của từng người (hệ số ở trang Hệ số), B mất phụ cấp này; tỷ lệ chỉnh được ở Cấu hình. Chưa chấm = 100% và có cảnh báo ở bảng lương.
   - Lao động A–E → hệ số cấu hình (mặc định A 1.1, B 1, C 0.8, D 0.5, E 0) nhân vào **lương theo hệ số** và **thưởng định kỳ**; không nhân vào thưởng/trừ đột xuất. % trừ bảo hiểm vẫn tính trên lương BH gốc. Chưa chấm = ×1.
   - Nhập ngay trên bảng chấm công (cột An toàn / Xếp loại LĐ), có lịch sử thay đổi; hiện trong Excel chấm công, lương, thưởng.
5. **Hệ số**: xem hệ số có hiệu lực tại ngày bất kỳ; nút Lịch sử hiện đủ các lần thay đổi, tô dòng đang áp dụng, người có quyền Quản lý hệ số xoá được dòng nhập sai.

Triển khai: build lại, rồi bấm **Đồng bộ từ SSO** (để làm sạch tên + áp dụng loại trừ).

Sửa trong v6.5: lỗi "Cannot set properties of null" ở Quản trị; ô chọn xếp loại phải bấm giữ mới chọn được (do bảng tự vẽ lại khi click); xếp loại an toàn chỉ còn A/B tác động lên phụ cấp an toàn.

v6.6: tên SSO tách được cả dấu "-" và "_" dù có cách hai đầu, một đầu hoặc không cách (vd "Vũ Văn Nam_lái xe", "Giám đốc NMTĐ SS3_ Lò Văn Thanh"). Sau khi cập nhật bấm "Đồng bộ từ SSO" để áp dụng.
