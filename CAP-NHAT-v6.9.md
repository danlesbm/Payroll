# Cập nhật v6.9

1. **Ăn ca:** bỏ "Ăn ca thực tế" (loại suất, đơn giá suất, lưới nhập suất). Chỉ còn ăn ca theo ký hiệu công. Schema tự chuyển mọi bảng chấm công về chế độ này.
2. **Lương cơ sở theo loại nhân sự** (Quản lý / Công nhân / Tất cả), có ngày hiệu lực như đơn giá thưởng. Cần nhập mức cho cả Quản lý và Công nhân (hoặc 1 mức "Tất cả") trước khi chạy lương. Mức cũ đã nhập mặc định thành "Tất cả".
3. **Cấp 1 và Giám đốc tự động từ SSO:** Trưởng phòng (nhà máy: Giám đốc nhà máy) là cấp 1 của bảng chấm công phòng đó; phòng chưa có Trưởng thì Phó phòng; chức vụ "Giám đốc" = Giám đốc công ty. Hiện nhãn "tự động" ở Phân quyền; vẫn gán tay thêm được.
4. **Hệ số:** mỗi người có nút **Cập nhật hệ số mới** (bản ghi mới theo ngày hiệu lực) và **Sửa hệ số** (sửa bản ghi đang áp dụng, có nhật ký). Bỏ lưới sửa hàng loạt.
5. **Xếp loại an toàn A/B** tự hiện cho người có phụ cấp an toàn (không phụ thuộc cờ của bảng); A = 100%, B = 0%.
6. **Ca → Kíp** ở mọi nơi. Kíp/Trưởng ca chỉ chọn được với Công nhân; Quản lý tự bỏ kíp.
7. Hướng dẫn Word có lưu đồ chấm công → phê duyệt → tính lương → chốt cuối → khoá.

Triển khai: `docker compose build payroll && docker compose up -d payroll`, bấm "Đồng bộ từ SSO", nhập lương cơ sở theo loại, kiểm tra lại cột Loại ở Nhân sự.

8. Lương cơ sở và đơn giá lương có nút **Sửa**; Cấp 1 / Giám đốc bỏ nút thêm tay (hoàn toàn tự động).
