# Cập nhật v6.10 — quy trình duyệt mới

Chấm công → Cấp 1 → Cấp 2 → Cấp 3 → Giám đốc khoá. **Mỗi cấp chỉ sửa được khi bảng đến lượt mình**; trình lên cấp trên là cấp dưới hết quyền sửa.

- Người chấm: sửa → **Gửi kiểm soát**.
- Cấp 1 (tự động từ SSO): sửa được, **Cấp 1 duyệt, trình cấp 2** (chỉnh sửa lưu kèm) hoặc trả lại người chấm.
- Cấp 2: sửa công, **chạy lương nháp ngay** (bỏ bước "Nhận"), thưởng/trừ, **Cấp 2 chốt, trình cấp 3**, hoặc trả lại người chấm.
- Cấp 3: sửa công/thưởng-trừ, tính lại, **Cấp 3 chốt, trình Giám đốc**, hoặc trả lại cấp 2.
- Giám đốc: **Khoá & ký** (bảng lương + toàn bộ chấm công khoá, không ai sửa) hoặc trả lại cấp 3.
- Chỉ Admin **Mở khoá / đưa về cấp 2** (bắt buộc lý do), có lịch sử chấm công + nhật ký.
- Bản gốc của người chấm được lưu lúc gửi; ô bị cấp trên sửa có viền cam.
- Schema tự chuyển trạng thái cũ "adjusting" thành "pending_l2" (bảng cũ không mất dữ liệu).
