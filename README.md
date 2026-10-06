# SBM Payroll v6 — chấm công, ăn ca, bảng lương

Ứng dụng con của SSO Portal. **Không sửa SSO.** SSO cấp danh tính + danh bạ (nhân sự, chức vụ, phòng ban); Payroll tự quản lý phân quyền, chấm công, lương.

## Cách hoạt động
- Đăng nhập: SSO mở app kèm `?token=...` → Payroll gọi `GET {SSO}/api/auth/introspect` để xác thực.
- Danh bạ: Payroll gọi `GET {SSO}/api/internal/directory` (header `X-Internal-Secret`) — cùng cơ chế workmgr đang dùng.
- Dữ liệu nằm trong **schema mới `payroll_v1`** của cùng Postgres, **không đụng bảng cũ** ở schema `public`.

## Mô hình tổ chức (cấu hình trong Quản trị → Tổ chức & liên kết SSO)
Bảng lương → Bảng chấm công → Phòng/đơn vị → (nhiều) phòng ban SSO.
Mẫu SBM có sẵn nút "Nạp cơ cấu SBM mẫu": Khối văn phòng (4 bảng chấm công: Kỹ thuật, Kế toán, Kế hoạch, Văn phòng gồm HĐQT/BGĐ/BKS), Thoong Gót, Nà Tẩu, Suối Sập, Cụm Nậm Công – Tà Cọ (1 bảng chấm công, 1 bảng lương).

## Quy trình công
`Đang chấm` → (người chấm) **Gửi** → `Chờ cấp 1` → (cấp 1) **Duyệt** → `Chờ cấp 2` → (cấp 2) **Nhận** → `Cấp 2 điều chỉnh`
→ chạy/tính lại lương nháp → (cấp 2) **Chốt & gửi kiểm soát cuối** → `Chờ kiểm soát cuối` → (cấp 3 hoặc Giám đốc) **Hoàn thành** → khoá cả bảng lương + chấm công → Giám đốc **ký**.
- Sau khi cấp 2 "Nhận": người chấm chỉ xem; bản gốc được lưu, ô cấp 2 sửa có viền cam; sửa công → lương nháp tự tính lại.
- Mọi thay đổi ô công và chuyển trạng thái có **lịch sử**. Sau khi khoá chỉ Admin mở khoá (bắt buộc lý do, có nhật ký).
- Tháng chưa đến: chưa mở chấm công. Tháng đã khoá: không sửa được.

## Công thức lương
- Lương bảo hiểm = Σ hệ số "Bảo hiểm" × lương cơ sở × (công thực tế / công chuẩn)
- Thưởng = Σ hệ số "Thưởng" × đơn giá × (công / công chuẩn) + thưởng thêm trong tháng
- Đơn giá chọn theo độ cụ thể: phòng > bảng lương > chung, kèm loại nhân sự (quản lý / công nhân), có ngày hiệu lực.
- Phụ cấp = Σ hệ số loại "Số tiền" (vd. phụ cấp an toàn)
- Khoản trừ = trừ định kỳ (% lương bảo hiểm, mặc định BHXH 8% + BHYT 1,5% + BHTN 1% — chỉnh được) + trừ trong tháng (ủng hộ…)
- Thực lĩnh = Lương BH + Thưởng + Phụ cấp + Tiền ăn − Khoản trừ (tắt "cộng tiền ăn" ở Cấu hình nếu không muốn)
- Bấm vào từng dòng trong bảng lương để xem chi tiết cách tính.

## Chạy kiểm thử logic
`npm install && npm test` (kiểm thử công thức, quy trình, phân quyền).
