# Hai nhánh code: `v6.19` (phương án B) và `theo-tt` (phương án A)

## Khác nhau ở đâu
Hai nhánh giống hệt nhau, **chỉ khác 1 dòng** trong `src/lib/premium-method.js`:

| Nhánh | Dòng | Ý nghĩa |
|---|---|---|
| `v6.19` (nhánh chính, **đang dùng**) | `const PREMIUM_METHOD = 'B';` | Theo bảng Excel nhà máy |
| `theo-tt` (**dự phòng**) | `const PREMIUM_METHOD = 'A';` | Theo Thông tư / Bộ luật Lao động |

Cả hai nhánh đều có sẵn code của cả 2 phương án (`src/lib/workdays.js` → `premiumDays`, `src/lib/calc.js` → `calcLine`); dòng trên chọn phương án nào chạy.

## Hai phương án
Chỉ khác cách tính **tiền làm lễ và tiền làm thêm (công vượt chuẩn)** khi có ca đêm. Tiền làm đêm 30%, lương, thưởng, bảo hiểm, ăn ca… như nhau.

- **A — theo từng ca (Thông tư):** phụ cấp đêm 30% của ca đêm cũng được nhân % lễ / % tăng ca.
  Ca đêm ngày lễ 300% = 100% lương + 30% làm đêm + 260% làm lễ (= 390%). Ca ngày ngày lễ = 100% + 200%.
  Ca đêm vượt công chuẩn (tăng ca ×2) = 200% + 30% làm đêm + 30% làm thêm (= 260%).
- **B — như Excel nhà máy:** tiền làm lễ / làm thêm = (lương + thưởng + phụ cấp + tiền làm đêm cả tháng) ÷ công tối thiểu × số công × (% − 100%), cho mọi công lễ / vượt chuẩn (cả ca ngày).

Ví dụ anh Hồ Đăng Thành, tháng 9/2026, ngày 2/9 làm K1,3 (2 công lễ): **B = 3.134.581**, **A = 3.250.201**.

## Cập nhật code mới cho cả 2 nhánh
1. Mọi thay đổi mới làm trên `v6.19` như bình thường (PR vào `v6.19`).
2. Sau khi merge, đưa sang `theo-tt`:
   ```
   git fetch origin && git checkout theo-tt && git pull && git merge origin/v6.19 && git push origin theo-tt
   ```
3. **Không sửa dòng `PREMIUM_METHOD`** khi merge. Nếu git báo xung đột ở `src/lib/premium-method.js` thì giữ `'A'` cho `theo-tt`.
4. Nếu cần sửa công thức của một phương án: sửa nhánh `v6.19` (code có cả A và B, test có cả A và B), rồi merge sang `theo-tt` như bước 2.

## Chạy server theo nhánh nào
Trên server test (dán **từng dòng một**):
```
cd /opt/payroll-src && git fetch origin && git checkout theo-tt && git pull && git log --oneline -1
```
(đổi `theo-tt` thành `v6.19` để về phương án B), rồi:
```
cp -r /opt/payroll-src/{public,src,db,scripts,package.json,Dockerfile} /opt/appscripts-test/apps/payroll/ && cd /opt/appscripts-test && docker compose build payroll && docker compose up -d payroll
```
Xem server đang chạy phương án nào:
```
grep "^const PREMIUM_METHOD" /opt/appscripts-test/apps/payroll/src/lib/premium-method.js
```
Đổi nhánh xong nhấn Ctrl+F5 và bấm **Tính lại** các bảng lương nháp. Bảng lương đã khoá giữ nguyên số cũ. Popup chi tiết từng người ghi rõ đang tính theo phương án nào ở dòng Làm lễ, tết.
