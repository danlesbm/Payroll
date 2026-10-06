# Cập nhật v6.2

Chạy lại: thay thư mục `apps/payroll` (giữ `.env`), rồi `docker compose build payroll && docker compose up -d payroll`. CSDL tự nâng cấp.

Mới: sơ đồ Bảng lương ▸ Bảng chấm công ▸ Bộ phận (chọn nhiều, xoá, tạo từ SSO); phiên đăng nhập 7 ngày (đổi bằng PAYROLL_SESSION_HOURS);
tiền ăn ca theo ký hiệu công; khoản thưởng/trừ linh hoạt (cố định hoặc hệ số × đơn giá, nhiều người một lần);
xuất Excel lương/thưởng/hệ số/ăn ca/chấm công theo nhóm; quyền "Chỉ xem chấm công" và "Chỉ xem lương".
Lưu ý: đã thêm khoản trừ định kỳ "Kinh phí công đoàn 0,5%" — tắt ở Cấu hình nếu không dùng.
