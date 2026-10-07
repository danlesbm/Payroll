# SBM Payroll v6.21 — cập nhật (gồm toàn bộ v6.20)

## Cách cập nhật
Chép thư mục `payroll/` đè lên (KHÔNG đụng `.env` / `docker-compose.yml`), rồi `docker compose build payroll && docker compose up -d payroll`. Schema tự cập nhật. File CSS/JS có số phiên `?v=621a` (nếu trình duyệt còn bản cũ thì Ctrl+F5).

## Loại nhân sự mới: Hành chính
- Ngoài **Quản lý** và **Công nhân**, nay có thêm loại **Hành chính**.
- *Cấu hình › Lương cơ sở* và *Cấu hình › Đơn giá lương (để tính thưởng)*: ô "Loại nhân sự" có thêm **Hành chính** → đặt mức lương cơ sở và đơn giá riêng. Nếu chưa có mức riêng cho Hành chính thì dùng mức "Tất cả" (nếu có).
- Gán loại ở *Nhân sự* (cột Loại, hoặc áp dụng hàng loạt). Hành chính không thuộc kíp, không làm trưởng ca. Nút **Tự nhận loại** không đổi người đã là Hành chính.
- *Công chuẩn*: quy tắc nghỉ hằng tuần / công tối thiểu có thể đặt riêng cho Hành chính; chưa đặt thì theo quy tắc chung.
- Bảng chấm công / bảng in ở nhà máy: Hành chính đứng thành mục **Bộ phận hành chính**, sau Bộ phận quản lý, trước Công nhân vận hành.
- Sau khi gán loại và nhập mức, bấm **Tính lại** các bảng lương nháp.

## Mức lương đóng bảo hiểm gồm phụ cấp
- Các khoản trừ "% lương bảo hiểm" (BHXH, BHYT, BHTN…) nay tính trên **lương bảo hiểm + phụ cấp** (cột Phụ cấp, gồm phụ cấp an toàn sau xếp loại an toàn).
- Lương bảo hiểm trong mức đóng vẫn tối đa = hệ số BH × lương cơ sở (đủ công chuẩn), không gồm làm đêm/thêm/lễ, không nhân xếp loại lao động.
- Tiền làm đêm / làm thêm / làm lễ phần theo lương cũng lấy căn cứ là **(lương bảo hiểm + phụ cấp) ÷ công chuẩn** cho mỗi ngày tương đương. Công vượt chuẩn cũng tính trên căn cứ này.
- Cột **Lương bảo hiểm** (màn hình, Excel "Tiền lương", báo cáo) nay hiển thị gồm **phụ cấp an toàn** (sau xếp loại an toàn); cột **Phụ cấp** chỉ còn các phụ cấp khác. Tổng lương, thực lĩnh không đổi.
- Phụ cấp vẫn nằm ở bảng lương (không vào bảng thưởng). Bảng lương nháp cần bấm "Tính lại".

## Tiền làm lễ / làm thêm tính như bảng Excel nhà máy
- Đơn giá ngày để tính làm lễ và công vượt chuẩn nay **gồm tiền làm đêm bình quân của tháng**: (lương + thưởng + phụ cấp + tiền làm đêm) ÷ công chuẩn (công tối thiểu với công nhân ca kíp) × số công × (% lễ − 100%).
- Không còn cộng riêng 30% đêm × % lễ cho ca đêm ngày lễ (trước đây K1,3 ngày lễ 300% = 4,6 ngày tương đương; nay 4 công × đơn giá đã gồm tiền đêm).
- Đối chiếu bảng THƯỞNG NMTĐ Suối Sập 3 tháng 9/2026: khớp tất cả mọi người. Bấm "Tính lại" bảng lương nháp.
