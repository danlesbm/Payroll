# Cập nhật v6.23 — Lương khoán / thù lao, thuế vãng lai

## Cách cập nhật
Chép đè như các bản trước rồi `docker compose build payroll && docker compose up -d payroll`. Schema tự thêm cột / bảng mới (không xoá dữ liệu cũ) — nên sao lưu DB trước. File JS có số phiên `?v=623a` (Ctrl+F5 nếu trình duyệt còn bản cũ).

## Cách tính lương của từng người (Quản trị › Nhân sự)
- Cột mới **Cách tính lương**. Mặc định mọi người là **Theo hệ số** (như trước, không đổi gì).
- Chọn **Lương khoán** cho người nhận thù lao hoặc lao động thời vụ, rồi nhập:
  - **Số tiền/tháng**: số tiền khoán mặc định mỗi tháng.
  - **Thuế vãng lai %**: tỷ lệ khấu trừ thuế TNCN, mặc định **10%**. Người đã nộp cam kết (mẫu 08/CK-TNCN) thì đặt 0.
  - **Bảng lương khoán** sẽ tính người này.
- Bấm **Lưu thay đổi** (có **Hoàn tác** như các cột khác). Có thể đổi hàng loạt ở thanh "Áp dụng cho người đã chọn" (Cách tính lương, Bảng lương khoán, Thuế vãng lai %).
- Người lương khoán **không vào bảng lương theo hệ số** nữa (bảng nháp cần "Tính lại"). Họ vẫn có thể có trên bảng chấm công nếu cần, nhưng không được tính lương, thưởng, ăn ca ở bảng theo hệ số.
- Người không có tài khoản SSO (vd lao động thời vụ): bấm **+ Người ngoài SSO**, nhập họ tên, chức danh / nội dung, số tiền, % thuế, bảng lương khoán. Họ nằm ở mục "Người ngoài SSO (thời vụ / thù lao)", sửa được họ tên; đồng bộ SSO không động tới họ. Xoá được khi chưa có trong bảng lương nào; nếu đã có thì bỏ tick "Tính lương".

## Bảng lương khoán (Quản trị › Tổ chức)
- **+ Bảng lương**, chọn **Loại tính lương = Lương khoán / thù lao**. Tạo bao nhiêu bảng tùy ý: để mọi người lương khoán vào chung 1 bảng, hoặc chia nhiều bảng (vd "Thù lao HĐQT", "Lao động thời vụ nhà máy").
- Bảng lương khoán không dùng bảng chấm công. Nút **Chọn người lương khoán** tick nhiều người cùng lúc (mỗi người chỉ ở 1 bảng lương khoán).
- **Ngưỡng khấu trừ thuế vãng lai**: chỉ khấu trừ khi số tiền chi từ mức này trở lên. Mặc định **2.000.000 đ** (Thông tư 111/2013/TT-BTC); nhập 0 = luôn khấu trừ.
- Người chọn Lương khoán nhưng chưa thuộc bảng lương khoán nào được liệt kê riêng (khung vàng) để không bị sót.

## Tính lương khoán (Bảng lương)
- Mở bảng lương khoán như bảng lương thường, bấm **Chạy lương nháp**. Quy trình duyệt giữ nguyên: cấp 2 chốt → cấp 3 → Giám đốc khoá & ký.
- Công thức mỗi người:
  - Thuế vãng lai = Số tiền × tỷ lệ % (chỉ khi Số tiền ≥ ngưỡng của bảng; dưới ngưỡng = 0)
  - **Thực nhận = Số tiền − Thuế vãng lai**
- Khung **Số tiền tháng này**: tháng nào chi khác mức mặc định thì nhập số tiền riêng (và nội dung, vd "Thù lao HĐQT tháng 10"), bấm **Lưu & tính lại**. Để trống = dùng mức mặc định ở Nhân sự; nhập 0 = tháng này không chi.
- **Xuất Excel bảng lương khoán**: TT, Họ tên, Chức vụ, Nội dung, Số tiền, Tỷ lệ khấu trừ, Thuế TNCN khấu trừ, Thực nhận, Ký nhận, kèm người ký của bảng.
- Thống kê: thực nhận lương khoán tính vào cột Lương / Tổng thực lĩnh; thuế vãng lai vào cột Khấu trừ.
