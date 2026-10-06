# Cập nhật v6.12 — Thống kê năm, so sánh cá nhân, "Lương của tôi"

## Mới
1. **Tab "Thống kê năm › Theo bộ phận"**: bảng 12 tháng theo từng bộ phận của mỗi bảng lương, cả năm, so với năm trước (+/- %), biểu đồ cột và đường, xuất Excel.
2. **Tab "Thống kê năm › So sánh cá nhân"**: chọn bảng lương, bộ phận, chỉ tiêu, 2–6 năm; tổng cả năm từng người, % thay đổi, bấm vào người để xem biểu đồ theo tháng.
3. **Nút bật/tắt "Cho mọi nhân sự xem lương của mình"** (Quản trị › Phân quyền). Khi bật, mọi nhân sự có tab **Lương của tôi**: lương của chính mình theo tháng, chi tiết từng khoản, biểu đồ so sánh giữa các tháng và giữa các năm.

## Quy tắc
- Chỉ tháng bảng lương **đã khoá** hiện ở "Lương của tôi". Thống kê mặc định cũng chỉ tính bảng đã khoá (bỏ tick để xem cả bảng đang xử lý).
- Người quản lý chỉ thấy bảng lương mình được phân quyền xem. Lương của tôi chỉ trả dữ liệu theo tài khoản SSO đang đăng nhập.
- Mỗi lần xem "Lương của tôi" được ghi nhật ký.

## Kỹ thuật
- File mới: `src/routes/reports.js`, `public/pages-report.js`. `/api/me` trả thêm `selfView`, `canReports`.
- Cài đặt lưu ở bảng `settings` (khoá `self_view`), **không cần migrate DB**.
- Triển khai như cũ: `docker compose build payroll && docker compose up -d payroll`.
