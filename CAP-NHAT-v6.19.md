# SBM Payroll v6.19 — cập nhật (gồm toàn bộ v6.18, v6.17, v6.16)

## Cách cập nhật
Chép thư mục `payroll/` đè lên (KHÔNG đụng `.env` / `docker-compose.yml`), rồi `docker compose build payroll && docker compose up -d payroll`. Schema tự cập nhật (thêm bảng `employee_snapshots`).

## Mới trong v6.19 — tab Nhân sự: lưu có kiểm soát + hoàn tác
1. **Không còn lưu ngay khi tick/đổi ô.** Ô vừa sửa tô vàng; thanh vàng phía trên có **Lưu thay đổi (n)** và **Bỏ thay đổi**. Đổi lại giá trị cũ thì ô tự hết dấu; rời tab khi chưa lưu có cảnh báo; lọc/tải lại vẫn giữ các ô chưa lưu.
2. **Hoàn tác**: mỗi lần *Lưu thay đổi*, *Áp dụng cho người đã chọn* và *Tự nhận loại + lịch nghỉ* đều được chụp trạng thái trước đó. Nút **Hoàn tác lần này** (dưới thanh công cụ) trả đúng những người bị ảnh hưởng về như cũ (kể cả dấu 🔒), bấm tiếp để lùi dần (giữ 30 lần gần nhất).
3. Chọn Loại = Quản lý thì ô Kíp / Trưởng ca của người đó tự mờ đi ngay khi chọn.
4. API mới: `POST /api/employees-batch`, `GET/POST /api/employees-undo`.
5. **Bảng hệ số gọn lại**: chữ nhỏ hơn, tiêu đề cột tự xuống dòng, các nút Nhập/Sửa/Lịch sử xếp dọc → vừa màn hình, không phải kéo ngang (nếu màn quá hẹp vẫn cuộn được, cột Họ tên và cột nút giữ nguyên).
6. **Chấm công — sao chép/dán**: quét chọn ô → Ctrl+C, chọn ô đích → Ctrl+V (Ctrl+X = cắt). Dán 1 ô vào vùng lớn = điền cả vùng; dán được từ Excel; hoàn tác bằng Ctrl+Z.

## Mới trong v6.18
1. **Tự nhận loại + lịch nghỉ**: Quản lý + nghỉ T7/CN cho khối văn phòng và GĐ/PGĐ nhà máy; còn lại Công nhân nghỉ CN. Có xem trước; người đã chỉnh tay (🔒) được giữ nguyên, chỉ ghi đè khi tick.
2. **Phân quyền**: sửa lỗi "s is not defined"; thẻ "Quản trị viên — quyền như Admin" để cấp toàn quyền cho Giám đốc/người khác.
3. **Hệ số hoàn thành kế hoạch** bị khoá khi bảng lương tháng đó đã được Giám đốc khoá.
4. **Thứ tự**: Giám đốc trước Phó giám đốc; HĐQT → BKS → BGĐ → phòng (màn Ăn ca và Excel ăn ca).
5. **Excel**: chú thích ký hiệu chấm công nằm trong khung; thống kê NV/thưởng/hệ số: hết dấu "." thừa, hệ số 0 để trống, tối đa 3 số thập phân; bảng thưởng: cột D = công tối thiểu, bỏ hệ số lương, xếp loại LĐ căn giữa, "Thưởng tháng" và "Khoản trừ vào thưởng" chỉ hiện khi có số liệu.
6. **Kiểu tính ăn ca theo bộ phận** (Tổ chức & liên kết SSO): Kiểu 1 tự động theo ký hiệu công; Kiểu 2 bảng chấm ăn ca riêng; Kiểu 1 + 3 tự động + bảng chấm ăn chờ ca. Đơn giá suất ăn riêng/chờ ca đặt ở Cấu hình.

## Lưu ý
- Bộ phận đang ở Kiểu 2: tiền ăn chỉ theo suất nhập tay (ký hiệu công không còn tạo tiền ăn). Cần nhập đơn giá "Ăn ca" ở Cấu hình trước, nếu không tiền ăn = 0.
- Mặc định mọi bộ phận là Kiểu 1 nên bảng lương hiện có không đổi.
# SBM Payroll v6.17 — cập nhật (gồm toàn bộ v6.16)

## Mới trong v6.17
1. **Hệ số hoàn thành kế hoạch** (toàn công ty, theo tháng): trang *Hệ số* › thẻ phía trên. Thưởng = hệ số thưởng × đơn giá × hệ số hoàn thành. Để trống = 1. Chỉ người có quyền *Quản lý hệ số* / Admin sửa.
2. **Bảng hệ số**: cố định cột tên khi cuộn ngang; "Hệ số thưởng" nằm cột cuối = tổng các hệ số thưởng khác (không gồm bảo hiểm), tự cộng khi lưu. Dữ liệu cũ chỉ có tổng vẫn giữ.
3. **Phân quyền bổ sung**: quyền mới *Cài đặt chấm công* và *Quản lý nhân sự* (Toàn hệ thống); *Quản lý hệ số, đơn giá* nay sửa được loại hệ số, khoản trừ…; phạm vi mới **Bộ phận** cho *Người chấm công* và *Chỉ xem chấm công* (chỉ thấy/chấm nhân sự bộ phận đó; không xuất Excel cả bảng). Tab *Quản trị* hiện cho những người này với đúng các mục họ có quyền.
4. **Giao diện chấm công mới**: thanh ký hiệu cố định phía trên, bấm/kéo để tô, bấm tên/số ngày = chọn hàng/cột rồi bấm Điền, nút ⋯ điền theo chu kỳ kíp (vd 4 làm – 4 nghỉ), bàn phím (mũi tên, gõ ký hiệu + Enter, Space, Delete, Ctrl+Z), tên và tiêu đề cố định, rê chuột sáng hàng/cột, cập nhật ngay không tải lại trang.

## Triển khai
`docker compose build payroll && docker compose up -d payroll` (schema tự cập nhật, chạy lại nhiều lần an toàn). Sau đó vào *Phân quyền* gán quyền mới nếu cần.

## Lưu ý
- Người chấm công theo Bộ phận không gửi duyệt cả bảng được (cần quyền ở cấp bảng chấm công).
- Hệ số hoàn thành nhân vào thưởng cơ bản, thưởng làm thêm và thưởng theo ngày; khoản thưởng cố định nhập tay không bị nhân.
- Các dữ liệu mặc định (hệ số "thưởng" tự cộng) chỉ khởi tạo một lần.

# Cập nhật v6.16

## Lỗi đã sửa
- **Tiền ăn ca bằng 0**: bảng giá chỉ có hiệu lực từ ngày nhập (06/10) nên các tháng trước (tháng 9) không tìm thấy mức. Nay mức nhập lần đầu áp dụng cho cả các tháng trước.
- **Tiền ăn: một mức chung** cho mọi bảng lương (bỏ các cột theo nhóm); mức theo từng ký hiệu công. Mức riêng cũ theo bảng lương không còn dùng.

## Công thường – làm thêm – lương/thưởng
- Ký hiệu công có **Tính cho**: lương + thưởng (mặc định) / chỉ lương / chỉ thưởng. Nghỉ phép (P) mặc định *chỉ lương*.
- Ký hiệu **Làm thêm** (LT1–LT4…): không vào công thường, trả riêng = công × % × đơn giá ngày (đã gồm đêm/lễ, không nhân thêm % ngày lễ).
- Mẫu cài một lần: K3/K1,3 130%; SC1 135%; SC2 175,5%; LT1 150%; LT2 195%; LT3 300%; LT4 390% (chỉ cho ký hiệu đã tồn tại; LT3/LT4 được tạo nếu chưa có). Sửa ở Cấu hình › Ký hiệu công › Cài %.

## Công nhân trực ca kíp
- Quy tắc công tối thiểu mới **"Kíp thấp nhất của nhóm trực ca"**: mỗi kíp lấy công cao nhất của người trong kíp, công tối thiểu chung = kíp thấp nhất (theo kíp ở tab Nhân sự, **tính riêng từng nhà máy/bộ phận** dù cùng bảng lương, vì mỗi nhà máy có lịch kíp riêng).
- Quy tắc có **Đơn giá ngày chia cho: công tối thiểu** (công nhân) hoặc công tiêu chuẩn (quản lý).
- Thực tế < tối thiểu: công × đơn giá ngày; tối thiểu ≤ thực tế ≤ chuẩn: đủ (đơn giá × công tối thiểu); > chuẩn: làm thêm.
- Quy tắc mẫu "Công nhân" được chuyển sang cách trên một lần (chỉ khi còn là "bằng công chuẩn"). Khối quản lý giữ cách cũ theo công tiêu chuẩn hợp đồng.

- Tiền ăn ca có bảng **Lịch sử thay đổi** (hiệu lực từ, mức cũ → mới, chênh lệch, người nhập, thời điểm, xoá dòng nhập sai).

- Ký hiệu công có cột **Công nghỉ** (số công trực bị nghỉ): NP1 = 1, NP2 = 2 (tạo thêm ký hiệu nếu cần, vd ngày K1,3 = 2 công xin nghỉ thì chấm NP2). Công nghỉ được đếm vào công của kíp khi xác định công tối thiểu của nhà máy, không cộng vào công của người nghỉ. Mẫu cài một lần: NP, N, OM, KL = 1; **nếu dùng các ký hiệu này để đánh dấu cả ngày nghỉ luân phiên của kíp thì đặt Công nghỉ = 0** để công tối thiểu không bị đẩy lên.

## Sửa lỗi mất nhân sự sau đồng bộ (vd Suối Sập 3 chỉ còn 1 người)
- Nghi vấn chính: ở Cấu hình › **Loại trừ tài khoản** có cụm kiểu `NMTĐ Suối Sập 3`; tên SSO của nhân viên là "Nguyễn Văn A - NVVH NMTĐ Suối Sập 3" nên **bị loại nhầm cả 15 người** (còn trưởng phòng không có cụm này trong tên nên vẫn hiện).
- Nay cụm loại trừ chỉ so với **tên người** (phần trước " - "), tài khoản và email, không so với chức danh.
- Mỗi cụm loại trừ hiện kèm "→ loại N người" (đỏ nếu > 3) để phát hiện loại nhầm. Sau khi cập nhật bấm **Đồng bộ từ SSO** lại.

- Ký hiệu công: **Sửa** có thêm ô đổi tên ký hiệu (các ô chấm công, mức tiền ăn, % cũ tự đi theo); nút **Xoá** ký hiệu (chỉ khi chưa ô chấm công nào dùng, nếu đã dùng thì chuyển sang *Ngừng*).

## Giao diện và thống kê
- Bảng chấm công (chỉ trên phần mềm): cột Ngày | Đêm | SC | Phép/bù | Công | Làm thêm; Excel giữ nguyên.
- Bảng lương nháp: cột Chuẩn, +/−, LT; chi tiết dòng giải thích đơn giá ngày, công lương/thưởng.
- Thống kê: chỉ tiêu *Công tiêu chuẩn*, *Công thực tế − tiêu chuẩn*, *Công làm thêm*; "Lương của tôi" có Chuẩn, +/−, Làm thêm; Excel thống kê nhân viên và phiếu lương có thêm 2 cột.

## Lưu ý
- Bấm **Tính lại** các bảng lương nháp sau khi cập nhật. Bảng đã khoá giữ nguyên.
- Công của kíp = công cao nhất trong kíp (để một người nghỉ dài không kéo cả kíp xuống) — nếu muốn định nghĩa khác, báo để chỉnh.
- Công vượt công tiêu chuẩn mà không chấm LT vẫn được trả ×hệ số tăng ca của quy tắc (mặc định ×1).

Triển khai: `docker compose build payroll && docker compose up -d payroll`, bấm Đồng bộ từ SSO. Schema tự cập nhật.
