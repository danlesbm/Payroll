# Hướng dẫn thay thế Payroll (bản cũ → v6)

Giả định cấu trúc như hướng dẫn V4: stack ở `/opt/appscripts-test`, app ở `apps/payroll`, service tên `payroll`, Caddy trỏ `luong.sbm.com.vn → payroll:3102`.

## 1. Sao lưu
```bash
cd /opt/appscripts-test
cp -r apps/payroll apps/payroll.bak-$(date +%F)
docker compose exec -T <tên-service-postgres> pg_dump -U postgres sbm_payroll > payroll-backup-$(date +%F).sql
```
(Đổi `<tên-service-postgres>` và tên DB cho đúng với compose của bạn.)

## 2. Thay mã nguồn, GIỮ file `.env` cũ
```bash
cp apps/payroll/.env /tmp/payroll.env.old
rm -rf apps/payroll/*            # KHÔNG dùng docker compose down -v
unzip sbm-payroll-v6.zip -d /tmp/v6 && cp -r /tmp/v6/payroll/. apps/payroll/
cp /tmp/payroll.env.old apps/payroll/.env
```

## 3. Bổ sung biến vào `apps/payroll/.env`
```
SSO_BASE_URL=<giữ nguyên giá trị cũ — địa chỉ SSO mà container payroll gọi được>
SSO_INTERNAL_API_SECRET=<TRÙNG với SSO_INTERNAL_API_SECRET trong .env của SSO / workmgr>
PAYROLL_BOOTSTRAP_EMAILS=danle.sbm@gmail.com
DB_SCHEMA=payroll_v1
SYNC_INTERVAL_MIN=30
SSO_ADMIN_IS_ADMIN=true
```
`DATABASE_URL`, `PORT` giữ như cũ. Có thể xoá `SSO_SYNC_TOKEN`, `ALLOW_DEV_AUTH` (không còn dùng).

## 4. Build và chạy
```bash
docker compose build payroll && docker compose up -d payroll
docker compose logs -f payroll
```
Log đúng sẽ có: `DB sẵn sàng (schema payroll_v1)` rồi `Đồng bộ SSO: { users: …, departments: … }`.
Kiểm tra: `curl http://127.0.0.1:3102/health`.

## 5. Thiết lập lần đầu (trong app, vào bằng tài khoản admin)
Mở app **luong** từ cổng SSO → tab **Quản trị**:
1. **Tổ chức & liên kết SSO** → "Đồng bộ từ SSO" → "Nạp cơ cấu SBM mẫu" (sửa/thêm nếu cần) → với từng phòng bấm **Liên kết SSO**, tick nhiều phòng ban SSO.
2. **Nhân sự**: kiểm tra mọi người đã có phòng; đặt loại Quản lý/Công nhân; chuyển tay người đặc biệt.
3. **Phân quyền**: chọn người → tick quyền → tick phạm vi → Gán.
4. **Cấu hình**: Lương cơ sở, Đơn giá lương, Ký hiệu công → Suất ăn, Đơn giá ăn ca, năm tối đa.
5. Tab **Hệ số**: nhập hệ số từng người (hoặc chuyển từ bản cũ, bước 6).
6. Bảng chấm công của nhà máy chấm ăn thực tế: Quản trị → Tổ chức → sửa bảng chấm công → "Chấm ăn ca thực tế".

## 6. (Tuỳ chọn) Chuyển hệ số từ bản cũ
Sau khi đã đồng bộ SSO:
```bash
docker compose exec payroll node scripts/migrate-from-v5.js
```
Kiểm tra bảng ánh xạ cột cũ → hệ số mới ở đầu file script. Chấm công/bảng lương cũ **không** chuyển, vẫn nằm nguyên ở schema `public`.

## 7. Quay lại bản cũ nếu cần
Trả `apps/payroll.bak-…` về chỗ cũ rồi build lại; dữ liệu cũ chưa bị đụng.

## Xử lý sự cố
- "SSO từ chối đọc danh bạ": `SSO_INTERNAL_API_SECRET` chưa trùng với SSO.
- "Phiên đăng nhập SSO đã hết hạn": mở lại app từ cổng SSO; kiểm tra `SSO_BASE_URL` container gọi được.
- Chọn bảng lương không thấy nhân sự: nhân sự chưa thuộc phòng nào → Quản trị → Tổ chức, xem số "người chưa thuộc phòng Payroll nào".
- Không chạy lương được: cần cấp 2 "Nhận" mọi bảng chấm công của bảng lương đó, và đã nhập Lương cơ sở.
