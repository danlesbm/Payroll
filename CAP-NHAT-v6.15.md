# Cập nhật v6.15

## Nhân sự và quy tắc
- Nút **Tự nhận loại + lịch nghỉ**: Quản lý = toàn bộ khối văn phòng (HĐQT, Ban kiểm soát, Ban giám đốc, các phòng) + Giám đốc/Phó giám đốc/Trưởng-Phó phòng nhà máy; còn lại = Công nhân. Đồng thời xoá lịch nghỉ riêng để theo quy tắc.
- Quy tắc mẫu (chỉ tạo khi chưa có quy tắc nào): **Quản lý nghỉ T7 + CN**, **Công nhân nghỉ CN**. Mọi quy tắc đều sửa/xoá được; không quy tắc khớp = nghỉ CN, tối thiểu = chuẩn.
- Cột **Nhóm phụ cấp** ở tab Nhân sự (sửa từng người hoặc hàng loạt); quản lý nhóm ở Cấu hình › Nhóm tính phụ cấp.

## Ngày lễ
- **Sửa** được từng ngày (tên, ngày, %), thêm cột **Hưởng khi đi làm (%)** (mặc định 100).

## % so với công tiêu chuẩn
- Ký hiệu công: nút **Cài %**: loại tăng (**Làm đêm** tính trên công đêm / **Làm thêm – sửa chữa** tính trên toàn bộ công), % cho mọi nhóm và % riêng từng nhóm phụ cấp; trống = 100%.
- Ngày lễ × ký hiệu nhân với nhau: lễ 400% × đêm 130% = 520%; lễ 400% × sửa chữa 135% = 540%.
- Áp dụng cho cả lương và thưởng, cộng trước khi trừ các khoản phải trừ. Khoản trừ % bảo hiểm tính trên lương chính (không gồm đêm/thêm/lễ).
- Công vượt công chuẩn tính vào nhóm "làm thêm" (nhân hệ số tăng ca); phần chính tối đa 1 lần công chuẩn.

## Tách cột
- `payroll_lines`: night/extra/holiday × salary/bonus. Bảng lương hiện cột Làm đêm / Làm thêm / Làm lễ-tết; chi tiết dòng lương giải thích từng khoản; Excel bảng lương/thưởng, thống kê năm theo bộ phận (thêm trang tính), thống kê từng nhân viên; chỉ tiêu mới trong thống kê (lương chính, thưởng chính, đêm, thêm, lễ, tổng).
- Tổng "Lương", "Thưởng", "Thực lĩnh" gồm cả các khoản này.

## Lương nháp tự chạy
- Mỗi hành động chấm công (lưu công, xếp loại, gửi duyệt) tự chạy/tính lại lương nháp; bảng chưa tới cấp 2 được ghi chú "tạm tính". Quy tắc trình, chốt, khoá giữ nguyên.

## Lưu ý
- Lương nháp cũ sẽ tính lại theo công thức mới khi bấm Tính lại; bảng đã khoá giữ nguyên.
- Ngày lễ mặc định hưởng 100% — hãy nhập % thực tế (vd 300/400) cho từng ngày lễ.
- Nếu DB đã có sẵn quy tắc, quy tắc mẫu không tạo thêm.

Triển khai: `docker compose build payroll && docker compose up -d payroll`, bấm Đồng bộ từ SSO. Schema tự cập nhật.
