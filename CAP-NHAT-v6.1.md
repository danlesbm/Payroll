# Cập nhật v6.1 (sửa theo 10 lỗi đã báo)

Chạy lại (ở thư mục chứa docker-compose.yml): thay thư mục apps/payroll bằng bản mới (giữ nguyên .env), rồi:

    docker compose build payroll && docker compose up -d payroll

Cơ sở dữ liệu tự nâng cấp (thêm cột công ngày / công đêm), không mất dữ liệu.

Sau khi chạy: Quản trị › Tổ chức & liên kết SSO › **Đồng bộ từ SSO** → ở mỗi phòng bấm **Liên kết SSO** và tick phòng ban SSO tương ứng.
HĐQT / Ban Kiểm Soát / Ban Giám Đốc của SSO xuất hiện dưới tên "… (SSO)".
