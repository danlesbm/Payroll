# Cập nhật v6.3

1. **Phân quyền theo phòng/bảng**: chọn bảng (Toàn hệ thống / bảng lương / bảng chấm công) ở cột trái → bên phải là từng quyền kèm danh sách người đang giữ; gõ tên để thêm, ✕ để gỡ. Vẫn còn bảng "Tổng hợp theo người".
2. **Nhân sự trong phòng**: chỉ Trưởng phòng, Phó phòng, Nhân viên nằm trong phòng. "Người phụ trách", Giám đốc, Phó GĐ, HĐQT, BKS không tính vào phòng.
3. **Phó GĐ kiêm Trưởng phòng**: chấm công ở phòng; bảng lương/thưởng/ăn ca/hệ số/Excel hiển thị ở **Ban Giám đốc** (cột mới `pay_department_id`).
4. **Người chưa thuộc phòng nào** bị ẩn khỏi màn Nhân sự/Tổ chức (vẫn chọn được khi gán quyền).

Triển khai: `docker compose build payroll && docker compose up -d payroll`, rồi Quản trị → Tổ chức → **Đồng bộ từ SSO** để tính lại phòng. Schema tự nâng cấp.
