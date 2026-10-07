# SBM Payroll v6.20 — cập nhật (gồm toàn bộ v6.19)

## Cách cập nhật
Chép thư mục `payroll/` đè lên (KHÔNG đụng `.env` / `docker-compose.yml`), rồi `docker compose build payroll && docker compose up -d payroll`. Schema tự cập nhật. Sau đó bấm **Tính lại** các bảng lương nháp. File CSS/JS có số phiên `?v=620b`.

## 1. Bảng chấm ăn ca riêng (Kiểu 2) / ăn chờ ca (Kiểu 3) chấm bằng ký hiệu công
- Không còn ô nhập số. Mỗi bảng có thanh ký hiệu giống bảng chấm công: chọn ký hiệu rồi **bấm hoặc kéo** qua các ô ngày, chọn "✕ Xoá" để xoá ô, xong bấm **Lưu**.
- Nút **Chép từ bảng chấm công**: điền các ô còn trống bằng ký hiệu đã chấm ở bảng chấm công phía trên (chỉ những ký hiệu có suất ăn > 0), rồi sửa lại ngày nào khác.
- Mỗi ký hiệu có cột mới **Suất ăn (bảng riêng)** ở *Cấu hình › Ký hiệu công* (nút Sửa): số suất khi ký hiệu được chấm ở bảng ăn ca riêng / chờ ca (vd K1 = 1, K1,3 = 2, P/OM = 0). Tiền = tổng suất × đơn giá của loại suất (Cấu hình › Suất ăn riêng / ăn chờ ca).
- Cài sẵn một lần: ký hiệu đang có tiền ăn ca (Kiểu 1) = 1 suất, còn lại = 0.
- Ô đã nhập số trước đây vẫn được giữ và tính (hiện chữ nghiêng màu xám), có thể tô đè bằng ký hiệu.

## 2. Công không trả lương nhưng vẫn tính ăn ca
- *Tính cho* của ký hiệu có thêm lựa chọn **Không tính lương, thưởng**: không trả lương, thưởng, làm đêm/thêm/lễ cho ngày đó.
- Ngày chấm ký hiệu này **vẫn cộng vào ngày công** (cột Ngày/Đêm/Công ở bảng chấm công, số công thực tế ở bảng lương) nhưng không vào công tính lương, công tính thưởng.
- Tiền ăn vẫn tính độc lập: Kiểu 1 theo mức "Tiền ăn ca theo ký hiệu công", Kiểu 2/3 theo "Suất ăn" của ký hiệu. Ví dụ tạo ký hiệu HT (học tập): Tính cho = Không tính lương, Tiền ăn ca = 35.000, Suất ăn = 1.

## 3. Tiền làm đêm, làm thêm/sửa chữa, làm lễ tết chuyển sang bảng thưởng
- Bảng lương chỉ còn đến **lương đóng bảo hiểm**: bỏ 3 cột Làm đêm / Làm thêm / Làm lễ, Tổng tiền lương và phụ cấp = Tiền lương + Phụ cấp.
- Phần tiền đó (tính theo hệ số lương) được cộng vào 3 cột **Làm đêm / Làm thêm, sửa chữa / Làm lễ, tết** của bảng thưởng, cùng với phần theo hệ số thưởng → một bảng thưởng duy nhất.
- Tổng thực lĩnh (lương + thưởng + ăn ca) không đổi; khấu trừ bảo hiểm vẫn tính trên lương bảo hiểm như cũ.
- Chi tiết dòng lương và phiếu lương ghi rõ mỗi khoản thưởng làm đêm/thêm/lễ gồm bao nhiêu theo hệ số lương, bao nhiêu theo hệ số thưởng.
- File Excel bảng lương / bảng thưởng luôn theo cách mới, kể cả bảng tính trước bản này (tổng lương + thưởng của mỗi người không đổi). Màn hình chi tiết của bảng nháp cần bấm **Tính lại** để hiện đúng.

## 4. Tiền ăn ca: lưu được khi chỉ đổi ngày hiệu lực
- Bấm *Lưu bảng tiền ăn* luôn gửi mọi mức đang nhập; chỉ đổi *Hiệu lực từ* (không đổi số tiền) vẫn lưu. Mức nào đã đúng tại ngày đó thì bỏ qua.

## Ghi chú bảo hiểm
- Các khoản trừ theo % (BHXH, BHYT, BHTN, kinh phí công đoàn) chỉ tính trên lương bảo hiểm theo công thường (hệ số BH × lương cơ sở × công tính lương, tối đa công chuẩn), không gồm làm đêm, làm thêm, lễ tết, phụ cấp.
