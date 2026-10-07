# Cập nhật v6.7

1. **Tự điền người ký ở mọi biểu mẫu** (lương, thưởng, hệ số, ăn ca, chấm công), khi ô tên ở "Người ký" để trống:
   - Giám đốc → người có chức vụ "Giám đốc" ở SSO.
   - Kế toán trưởng → trưởng phòng của phòng có tên "kế toán" (không có thì phó phòng, hoặc người có chữ "Kế toán trưởng" trong tên SSO).
   - Người lập biểu → người đã bấm chạy lương nháp (không có thì người cấp 2 của bảng lương).
   - Phụ trách bộ phận / Người chấm công như v6.4.
2. **Thứ tự trên biểu in Excel**: I. Hội đồng quản trị → II. Ban kiểm soát → III. Ban giám đốc → các phòng/nhà máy theo thứ tự cấu hình. Trong phòng: chức cao đứng trước (Giám đốc, Phó GĐ, Trưởng phòng, Phó phòng, Người phụ trách, Văn thư, Nhân viên).
3. **Nhà máy** (bảng lương loại "Nhà máy"): mỗi phòng chia mục "Bộ phận quản lý" rồi "Công nhân vận hành — Ca 1, Ca 2…", trưởng ca đứng đầu mỗi ca. Áp dụng cho chấm công, lương, thưởng, hệ số, ăn ca và màn hình chấm công.
4. **Quản trị › Nhân sự**: thêm cột Ca, Trưởng ca; tick nhiều người (hoặc cả phòng) rồi gán ca/loại/trưởng ca một lần; nút "Tự nhận loại theo chức vụ".
   Nhân sự mới từ SSO tự nhận trưởng ca / điều hành viên nếu tên SSO có chữ "trưởng ca", "điều hành viên", "vận hành".

Triển khai: build lại → Đồng bộ từ SSO → Nhân sự › "Tự nhận loại theo chức vụ" (một lần) → gán ca cho công nhân nhà máy.
