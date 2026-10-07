# Cập nhật v6.13

## Xuất Excel
- **Thống kê từng nhân viên theo tháng** (đủ từng loại hệ số, lương, thưởng, ăn ca, bậc lương, dòng cộng): tab Thống kê năm › Theo bộ phận, hoặc nút "Thống kê nhân viên (đủ hệ số)" ở trang chi tiết bảng lương.
- **Nhân viên tự xuất**: tab Lương của tôi — phiếu lương từng tháng (đủ hệ số, cách tính) và bảng cả năm.
- **Thống kê năm theo bộ phận**: file Excel nhiều trang — Tổng hợp năm (lương, thưởng, lương+thưởng, ăn ca, thực lĩnh, so với năm trước) + từng chỉ tiêu theo 12 tháng.

## Thống kê
- Chọn chỉ tiêu cho thống kê bộ phận: thực lĩnh, lương, thưởng, lương+thưởng, ăn ca, phụ cấp, khấu trừ, lương BHXH, ngày công.
- **Ăn ca cá nhân**: tiền ăn / số ngày ăn, so sánh giữa các năm và giữa các tháng, Excel.
- So sánh cá nhân thêm chế độ **giữa các tháng**; danh sách năm = các năm có dữ liệu (không còn giới hạn cứng).

## Năm động
- `year_min`/`year_max` để trống = tự động (nhỏ nhất: 3 năm trước hoặc năm sớm nhất có dữ liệu; lớn nhất: năm hiện tại + 10, trượt theo năm). Giá trị cũ (vd 2036) được chuyển sang tự động một lần khi khởi động. Nhập số để cố định; luôn gồm năm hiện tại và năm có dữ liệu.

## Bậc lương BH và hệ số
- Bảng mới `salary_grades` (thang, bậc, hệ số, số tháng giữ bậc); `coefficient_history` thêm `grade_scale`, `grade`.
- Tab Thống kê năm › **Bậc lương & đến hạn tăng bậc**: tạo thang bậc, danh sách đến hạn (quá hạn, 30/90 ngày, tháng/quý/năm này và tới, tuỳ chọn), Excel; cảnh báo ở trang Hệ số.
- Tab **Lịch sử tăng/giảm hệ số**: từng lần thay đổi, bậc cũ → mới, chênh lệch, % , chi tiết, Excel.
- Trang Hệ số: cột Bậc lương BH + chọn bậc khi Cập nhật/Sửa (tự lấy hệ số của bậc nếu chưa đổi tay).
- Đến hạn = ngày hưởng bậc + số tháng giữ bậc; ngày hưởng bậc tính từ bản ghi đầu của chuỗi liên tục cùng bậc.

## Triển khai
`docker compose build payroll && docker compose up -d payroll`, rồi bấm Đồng bộ từ SSO như mọi lần. Schema tự cập nhật (idempotent).
