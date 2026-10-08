# Phương pháp tính tiền làm lễ, làm thêm và các nhánh dự phòng

## Nhánh chính `v6.19`: chọn trong Cấu hình
Admin › Cấu hình › thẻ **Phương pháp tính tiền làm lễ, làm thêm**. Lưu ở `settings.premium_method` (`A` / `B`, mặc định `B`).
Đổi xong bấm **Tính lại** các bảng lương nháp; bảng đã khoá giữ số cũ. Popup chi tiết từng người ghi rõ đang tính theo phương pháp nào (dòng Làm lễ, tết).

Code: `src/lib/premium-method.js` (tên, mặc định, hằng số 20%), `src/lib/workdays.js` → `premiumDays`, `src/lib/calc.js` → `calcLine`, `src/services/payroll.js` đọc cài đặt.

## Hai phương pháp
Chỉ khác ở **tiền làm lễ, tết** và **tiền công vượt chuẩn** khi có ca đêm. Lương, thưởng, tiền làm đêm 30%, bảo hiểm, ăn ca, ký hiệu LT, phụ cấp sửa chữa như nhau.

Đơn giá ngày = (lương bảo hiểm + phụ cấp + thưởng) ÷ công tối thiểu (hoặc công chuẩn).

**A — Theo Nghị định 145/2020/NĐ-CP** (Điều 55, 56, 57; hướng dẫn Điều 98 Bộ luật Lao động 2019), tính theo từng ca:
- Tiền làm đêm = đơn giá ngày × công đêm × 30%
- Tiền làm lễ = đơn giá ngày × công lễ × (% lễ − 100%) + đơn giá ngày × công đêm ngày lễ × 20% × % lễ
- Tiền công vượt chuẩn = đơn giá ngày × công vượt chuẩn × % tăng ca + đơn giá ngày × công đêm vượt chuẩn × 20% × % tăng ca
- Ca ngày ngày lễ 300% = 300%. Ca đêm ngày lễ 300% = 300% + 30% + 20% × 300% = 390%. Ca đêm vượt chuẩn (tăng ca 200%) = 200% + 30% + 40% = 270%.

**B — Theo quy chế lương riêng** (như bảng Excel nhà máy):
- Tiền làm đêm = đơn giá ngày × công đêm × 30%
- Đơn giá ngày có đêm = (lương bảo hiểm + phụ cấp + thưởng + tiền làm đêm cả tháng) ÷ công tối thiểu
- Tiền làm lễ = đơn giá ngày có đêm × công lễ × (% lễ − 100%)
- Tiền công vượt chuẩn = đơn giá ngày có đêm × công vượt chuẩn × % tăng ca
- Excel: T = công đêm × S × 30% ÷ 22, U = (S + T) × công làm thêm × 2 ÷ 22, với S = lương + thưởng + phụ cấp.

## Nhánh dự phòng (đóng băng)
| Nhánh | Tính theo | Ghi chú |
|---|---|---|
| `theo-tt` | chỉ A (NĐ 145/2020) | `const PREMIUM_METHOD = 'A'` trong `src/lib/premium-method.js` |
| `quy-che-rieng` | chỉ B (quy chế lương riêng) | bản v6.19 trước khi có thẻ chọn trong Cấu hình |

Hai nhánh này giữ nguyên code tại thời điểm tạo (không có thẻ chọn), dùng khi cần quay về một bản chỉ tính một cách. Tính năng mới chỉ làm trên `v6.19`.

## Chạy server theo nhánh nào
Trên server test, dán **từng dòng một** (đổi `v6.19` thành `theo-tt` hoặc `quy-che-rieng` nếu cần bản dự phòng):
```
cd /opt/payroll-src && git fetch origin && git checkout v6.19 && git pull && git log --oneline -1
```
```
cp -r /opt/payroll-src/{public,src,db,scripts,package.json,Dockerfile} /opt/appscripts-test/apps/payroll/ && cd /opt/appscripts-test && docker compose build payroll && docker compose up -d payroll
```
Sau đó Ctrl+F5 và bấm **Tính lại** các bảng lương nháp.
