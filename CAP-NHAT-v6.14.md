# Cập nhật v6.14 — Công chuẩn theo lịch, công tối thiểu, tăng ca

## Công chuẩn không còn là số cố định 26
- **Công chuẩn tháng = số ngày trong tháng − ngày nghỉ hằng tuần − ngày lễ.** Ngày lễ trùng ngày nghỉ hằng tuần chỉ tính **một** ngày nghỉ; ngày nghỉ bù nhập như một ngày lễ riêng.
- Mỗi người có lịch nghỉ hằng tuần: **nghỉ Chủ nhật** hoặc **nghỉ Thứ 7 + Chủ nhật**.
- Công chuẩn tính riêng cho từng người, nên một bảng lương có thể có nhiều mức công chuẩn (vd Văn phòng 22, Công nhân 27).

## Quản trị › Công chuẩn (tab mới)
- **Quy tắc** theo phạm vi: Toàn công ty / Loại nhân sự (Quản lý, Công nhân) / Bảng lương / Phòng; áp dụng quy tắc **cụ thể nhất** (Phòng > Bảng lương > Loại). Quy tắc mặc định toàn công ty có sẵn (nghỉ CN, công tối thiểu bằng chuẩn, tăng ca ×1) và không xoá được.
- **Công tối thiểu** cài động: bằng công chuẩn / số cố định (vd 23, 26) / công chuẩn − N / N% công chuẩn.
- **Hệ số tăng ca** riêng cho lương và thưởng (mặc định ×1).
- **Ngày lễ / nghỉ bù theo năm**: nhập khoảng ngày + tên; nút thêm ngày lễ cố định (1/1, 30/4, 1/5, 2/9); sao chép từ năm trước. Tết Âm lịch, Giỗ Tổ phải tự nhập.
- Bảng xem trước công chuẩn và công tối thiểu 12 tháng của từng quy tắc.
- Tab **Nhân sự**: cột **Nghỉ hằng tuần** (đặt riêng từng người hoặc hàng loạt; trống = theo quy tắc), ưu tiên hơn quy tắc.
- Ô "Công chuẩn" chung trong Cấu hình đã bỏ; ô **Công chuẩn nhập tay** ở trang Bảng lương vẫn dùng để ghi đè cả bảng (trống = theo lịch).

## Công thức
- Đơn giá ngày = hệ số × đơn giá ÷ công chuẩn của người đó.
- Công từ **tối thiểu đến chuẩn**: hưởng đủ (đơn giá ngày × công chuẩn). Công **dưới tối thiểu**: đơn giá ngày × công thực tế. Công **vượt chuẩn**: đủ + công vượt × hệ số tăng ca. Áp dụng cho lương và thưởng.
- Với cài đặt mặc định (tối thiểu = chuẩn, tăng ca ×1) kết quả trùng công thức cũ công ÷ chuẩn, chỉ khác là công chuẩn lấy theo lịch.
- Ký hiệu **NB, P** rơi vào ngày nghỉ hằng tuần/ngày lễ **không cộng công** (cờ "Không tính ngày nghỉ" ở Cấu hình › Ký hiệu công, sửa được).

## Màn hình và biểu mẫu
- Chấm công: cột ngày lễ tô cam, ngày nghỉ hằng tuần của từng người tô hồng, dưới tổng công hiện "/ chuẩn N · tối thiểu M" (xanh = đủ, vàng = trong khoảng tối thiểu, đỏ = dưới tối thiểu, xanh dương = tăng ca). Excel chấm công áp dụng cùng quy tắc.
- Chi tiết dòng lương: công chuẩn (kèm lịch nghỉ, số ngày lễ), công tối thiểu, kết quả so với chuẩn, đơn giá ngày.
- Excel thống kê nhân viên: thêm công tối thiểu, công tăng ca, đơn giá ngày, tỷ lệ công lương/thưởng.

## Lưu ý khi triển khai
- Lần chạy đầu: công chuẩn chuyển từ 26 sang tính theo lịch (mặc định nghỉ Chủ nhật), nên **cần nhập ngày lễ năm nay** và đặt quy tắc Văn phòng (T7 + CN) rồi bấm **Tính lại** các bảng lương nháp. Bảng đã khoá giữ nguyên số cũ.
- Đặt hệ số tăng ca = 1,0 (mặc định) nếu chưa có chính sách trả thêm.

## Triển khai
`docker compose build payroll && docker compose up -d payroll`, rồi bấm Đồng bộ từ SSO. Schema tự cập nhật (idempotent: bảng `holidays`, `schedule_rules`; cột `employees.weekly_off`, `payroll_runs.std_override`, `attendance_codes.off_day_zero`).
