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
