# Hướng dẫn thuế TNCN, người phụ thuộc, quỹ lương (v6.24)

Tài liệu dành cho phòng lương, phòng nhân sự, các cấp kiểm soát và nhân viên. Đọc phần 1 để biết mình cần làm gì, rồi chuyển tới phần liên quan.

---

## 1. Tổng quan

### Có gì mới
- **Thuế TNCN lũy tiến** cho người hưởng lương **theo hệ số**: mỗi tháng tạm tính, **tháng 12 quyết toán cả năm** (phải nộp thêm hoặc được hoàn).
- **Biểu thuế theo năm**: số bậc, thuế suất, mức giảm trừ đều sửa được. Luật đổi thì tạo biểu cho năm mới, không phải chờ sửa chương trình.
- **Người phụ thuộc** khai theo tháng (tính từ tháng nào, đến hết tháng nào).
- **Giảm trừ y tế, giáo dục, khoản khác** của từng người theo năm.
- Chọn **chỉ ước tính** hay **trừ thuế vào thưởng thực nhận**.
- **Lương đóng BH thỏa thuận**: nhập số tiền thay cho hệ số BH × lương cơ sở.
- **Quỹ lương** (khối): HĐQT, Ban kiểm soát, văn phòng, công nhân vận hành, quản lý và hành chính nhà máy, sửa chữa… kèm báo cáo **Tổng hợp theo quỹ lương**.
- Bảng lương có tab **Lương + thuế TNCN (ước tính)**, xem cách tính thuế từng người, xuất Excel thuế TNCN.
- Thống kê năm có **Thuế TNCN theo năm**. Nhân viên xem bảng kê thuế của mình ở **Lương của tôi**.

Người **lương khoán / thù lao** không tính thuế lũy tiến: họ đã bị khấu trừ thuế vãng lai (mặc định 10%) ở bảng lương khoán.

### Ai làm gì

| Vai trò | Việc liên quan đến thuế TNCN và quỹ lương | Màn hình |
|---|---|---|
| **Admin** | Kiểm tra biểu thuế. Chọn cách xử lý thuế tạm tính. Cài quỹ lương, gán quỹ cho bộ phận. Mở khoá bảng lương khi cần tính lại. Bật **Lương của tôi** | Quản trị › Cấu hình, Tổ chức & liên kết SSO, Phân quyền; Bảng lương |
| **Người quản lý hệ số** (quyền "Quản lý hệ số, đơn giá, thưởng/trừ") | Sửa biểu thuế, đánh dấu khoản trừ được trừ khi tính thuế, nhập lương đóng BH thỏa thuận, nhập giảm trừ y tế / giáo dục / khác hàng loạt | Quản trị › Cấu hình; Hệ số; Thống kê năm › Thuế TNCN theo năm |
| **Người quản lý nhân sự** (quyền "Quản lý nhân sự") | Khai người phụ thuộc, giảm trừ theo năm của từng người, chọn quỹ lương riêng cho từng người | Quản trị › Nhân sự |
| **Cấp 2** | Chạy / tính lại lương nháp (thuế tự tính cùng lúc), nhập thưởng cuối năm, xem và xuất bảng thuế | Bảng lương |
| **Cấp 3, Giám đốc** | Kiểm tra tab **Lương + thuế TNCN**, đặc biệt tháng 12, trước khi chốt / khoá | Bảng lương; Thống kê năm |
| **Nhân viên** | Xem thuế từng tháng và quyết toán năm của mình (chỉ các tháng đã khoá) | Lương của tôi |

> Người chỉ có quyền "Quản lý hệ số" **không** mở được hộp khai người phụ thuộc, vì hộp này chỉ có ở Quản trị › Nhân sự. Việc khai người phụ thuộc giao cho Admin hoặc người có quyền "Quản lý nhân sự".

### Cách cập nhật
Chép đè như các bản trước rồi chạy `docker compose build payroll && docker compose up -d payroll`. Schema tự thêm bảng / cột mới, không xoá dữ liệu cũ. Nên sao lưu DB trước. File JS có số phiên `?v=624b` (bấm Ctrl+F5 nếu trình duyệt còn bản cũ).

Lần khởi động đầu tiên, chương trình tự cài sẵn (chỉ một lần):
- Biểu thuế **2020** (7 bậc) và **2026** (5 bậc).
- BHXH, BHYT, BHTN được đánh dấu **Được trừ khi tính thuế TNCN**. Kinh phí công đoàn thì không.
- Loại hệ số **Lương đóng BH thỏa thuận (VND)** (mã `bh_thoa_thuan`).
- Sáu quỹ lương mẫu: HDQT, BKS, VP, VH, QL, SC.
- Cách xử lý thuế: **Chỉ ước tính, không trừ vào lương**.

---

## 2. Cài đặt ban đầu (làm theo thứ tự)

### Bước 1. Kiểm tra biểu thuế 2026
Vào **Quản trị › Cấu hình**, kéo xuống thẻ **Thuế thu nhập cá nhân (TNCN)**.

1. Mở dòng **Cách tính thuế TNCN** nếu muốn đọc tóm tắt công thức và ví dụ. Ví dụ trong khung tự đổi theo biểu đang sửa.
2. Ở bảng **Biểu thuế theo năm — bấm một dòng để xem / sửa**, kiểm tra dòng **2026** (có nhãn **đang áp dụng 2026**):

| Cột | Giá trị đúng của biểu 2026 |
|---|---|
| Số bậc | 5 |
| Thuế suất các bậc | 5% · 10% · 20% · 30% · 35% |
| Giảm trừ bản thân / tháng | 15.500.000 |
| Mỗi người phụ thuộc / tháng | 6.200.000 |
| Y tế tối đa / năm | 23.000.000 |
| Giáo dục tối đa / năm | 24.000.000 |

3. Bấm vào dòng 2026 để mở khung **Biểu thuế năm 2026**. Bảng bậc thuế phải như sau. Mức "đến" nhập theo **cả năm**; cột **Tương đương / tháng (÷ 12)** tự tính.

| Bậc | Thu nhập tính thuế đến (cả năm, đ) | Tương đương / tháng (÷ 12) | Thuế suất (%) |
|---|---|---|---|
| Bậc 1 | 120.000.000 | đến 10.000.000 | 5 |
| Bậc 2 | 360.000.000 | đến 30.000.000 | 10 |
| Bậc 3 | 720.000.000 | đến 60.000.000 | 20 |
| Bậc 4 | 1.200.000.000 | đến 100.000.000 | 30 |
| Bậc 5 | Trên mức bậc trước (trên 1.200.000.000) | trên 100.000.000 | 35 |

4. Cột **Dùng cho năm** cho biết năm nào dùng biểu nào. Mỗi năm dùng biểu có **năm áp dụng gần nhất nhưng không sau năm đó**. Ví dụ có biểu 2020 và 2026: năm 2020–2025 dùng biểu 2020, từ 2026 trở đi dùng biểu 2026.

Hai ô mức tối đa y tế / giáo dục có quy ước riêng:
- **Để trống** = không giới hạn.
- **Nhập 0** = không áp dụng, tức là không được trừ. Biểu 2020 để 0 vì luật cũ không có hai khoản này.

Nếu từ năm đó đã có bảng lương **đã khoá**, khung sửa hiện cảnh báo màu cam: sửa biểu chỉ ảnh hưởng các bảng lương **chưa khoá**; bảng đã khoá giữ nguyên số thuế đã tính.

### Sửa biểu thuế khi luật đổi

**Luật đổi từ một năm mới (vd từ 2027).** Không sửa biểu 2026, để các năm trước giữ đúng số.
1. Bấm dòng 2026, rồi bấm **Tạo biểu cho năm mới**.
2. Hộp **Tạo biểu thuế cho năm mới** hỏi "Năm bắt đầu áp dụng". Nhập 2027, bấm **Tạo**. Biểu mới chép các số đang hiện của biểu 2026 và có nhãn **mới, chưa lưu**.
3. Sửa các ô giảm trừ, mức tối đa, ghi chú căn cứ pháp lý và bậc thuế:
   - **+ Thêm bậc**: bậc mới chèn **trước bậc cuối**. Bậc cuối luôn là bậc không giới hạn.
   - **Xoá bậc**: xoá dòng đó. Nếu xoá bậc cuối, bậc liền trước thành bậc không giới hạn.
   - Tối đa 20 bậc.
4. Bấm **Lưu biểu thuế**. Thông báo: "Đã lưu biểu thuế năm 2027. Các bảng lương chưa khoá từ năm 2027 được đánh dấu cần Tính lại."
5. Đổi ý trước khi lưu: bấm **Huỷ biểu mới**.

**Luật sửa ngay cho năm đang áp dụng (cả năm).** Bấm dòng của năm đó, sửa số, bấm **Lưu biểu thuế**. Muốn quay lại số cũ trước khi lưu thì bấm **Bỏ thay đổi**. Xem thêm phần 8 (biểu thuế đổi giữa năm).

**Xoá biểu.** Bấm **Xoá biểu này**. Hộp xác nhận báo năm đó sẽ dùng biểu nào thay thế, ví dụ "Xoá biểu thuế năm 2027? Các năm đang dùng biểu này sẽ dùng biểu năm 2026. Các bảng lương chưa khoá cần Tính lại." Chương trình luôn giữ ít nhất 1 biểu.

**Các lỗi hay gặp khi lưu:**
- "Bậc 5: nhập mức thu nhập tính thuế tối đa của bậc (cả năm)": bậc chưa phải bậc cuối thì phải có mức "đến".
- "Bậc 3: mức tối đa phải lớn hơn bậc 2".
- "Bậc 2: nhập thuế suất từ 0 đến 100%".
- "Đã có biểu thuế năm 2027 — chọn biểu đó trong danh sách để sửa".

Sửa biểu thuế: Admin hoặc người có quyền "Quản lý hệ số" **toàn hệ thống**. Người chỉ "Quản lý hệ số" của một bảng lương xem được biểu nhưng các nút lưu / tạo / xoá bị mờ, kèm dòng "Bạn chỉ xem được biểu thuế…". Cột **Cập nhật** ghi người sửa và thời điểm sửa; biểu cài sẵn ghi "mẫu cài sẵn".

### Bước 2. Chọn cách xử lý thuế tạm tính (chỉ Admin)
Ngay dưới bảng biểu thuế, mục **Trừ thuế tạm tính vào lương** có hai lựa chọn:

| Lựa chọn | Ý nghĩa |
|---|---|
| **Chỉ ước tính, không trừ vào lương** (mặc định) | Bảng lương chỉ hiện thuế tạm tính để tham khảo. Thực nhận không đổi. |
| **Trừ thuế tạm tính vào thưởng thực nhận** | Mỗi tháng tự thêm khoản trừ vào thưởng tên **"Thuế TNCN (tạm tính)"**. Tháng 12 là **"Thuế TNCN (quyết toán năm)"**; nếu số âm (được hoàn) thì cộng trả lại vào thưởng. |

Bấm **Lưu cách xử lý thuế**, rồi **Tính lại** các bảng lương nháp. Bảng đã trình Giám đốc hoặc đã khoá giữ nguyên.

> **Cảnh báo trừ hai lần.** Nếu trước đây hằng tháng vẫn nhập tay một khoản "Thuế TNCN" loại **Trừ vào thưởng (vào bảng thưởng)** ở **Bảng lương › Thưởng / khoản trừ tháng**, thì khi chọn "Trừ thuế tạm tính vào thưởng thực nhận" thuế sẽ bị **trừ hai lần**. Phải xoá khoản nhập tay đó ở các tháng chưa khoá.

Lưu ý thêm:
- Nếu thuế của tháng lớn hơn thưởng thực nhận còn lại của tháng đó (vd tháng nghỉ phép không có thưởng), chương trình chỉ trừ vào thưởng đến hết số thưởng, **phần còn lại trừ vào lương thực lĩnh** (khoản "Thuế TNCN (tạm tính) — phần thưởng không đủ trừ" ở bảng lương). Thưởng thực nhận không bao giờ âm.
- Đổi từ "Chỉ ước tính" sang "Trừ vào thưởng" giữa năm: các tháng trước chỉ ước tính, chưa trừ đồng nào. Quyết toán tháng 12 sẽ lấy **thuế cả năm − số đã thực trừ** nên thu nốt thuế của các tháng chưa trừ (xem phần 5, Tháng 12).
- Người không phải Admin vẫn xem được lựa chọn nhưng thấy dòng "Chỉ Admin đổi được cài đặt này."

### Bước 3. Khoản trừ được trừ khi tính thuế
Ở thẻ **Khoản trừ định kỳ**, cột **Thuế TNCN** cho biết khoản nào được trừ:
- **Được trừ khi tính thuế TNCN**: BHXH (8%), BHYT (1,5%), BHTN (1%), tức là bảo hiểm bắt buộc người lao động đóng.
- **Không trừ khi tính thuế**: kinh phí công đoàn và các khoản trừ khác.

Muốn đổi thì bấm **Sửa** ở khoản đó, chọn ô "Được trừ khi tính thuế TNCN" là **Có — được trừ khi tính thuế TNCN** hoặc **Không**. Khoản trừ mới thêm mặc định là **Không**.

### Bước 4. Quỹ lương và gán quỹ cho bộ phận (Admin)
Thẻ **Quỹ lương (tổng hợp lương theo khối)** nằm cuối Quản trị › Cấu hình. Quỹ lương **chỉ dùng để tổng hợp báo cáo**, không làm đổi tiền lương hay thuế.

Khi tính lương, mỗi người được xếp vào **một** quỹ theo thứ tự ưu tiên:
1. Quỹ chọn riêng cho người đó ở **Quản trị › Nhân sự** (cột **Quỹ lương**).
2. Quỹ của bộ phận tính lương của người đó ở **Tổ chức & liên kết SSO** (Sửa bộ phận).
3. Quy tắc tự xếp của quỹ:

| Quy tắc tự xếp | Ai thuộc | Quỹ mẫu |
|---|---|---|
| Bộ phận HĐQT | Bộ phận liên kết với "Hội đồng quản trị (SSO)" | HDQT — Hội đồng quản trị |
| Bộ phận Ban kiểm soát | Bộ phận liên kết với "Ban Kiểm Soát (SSO)" | BKS — Ban kiểm soát |
| Bảng lương văn phòng (người còn lại) | Người ở bảng lương loại văn phòng | VP — Khối văn phòng (còn lại) |
| Nhà máy: người có kíp (công nhân vận hành) | Người ở nhà máy có chọn Kíp | VH — Khối công nhân vận hành (ca kíp) |
| Nhà máy: người không có kíp (quản lý, hành chính) | Người ở nhà máy không có Kíp | QL — Khối quản lý và hành chính nhà máy |
| Không tự xếp | Chỉ người / bộ phận được chọn | SC — Khối sửa chữa |

**Gán Khối sửa chữa cho bộ phận Sửa chữa:**
1. Vào **Quản trị › Tổ chức & liên kết SSO**. Ở dòng bộ phận **Sửa chữa**, bấm **Sửa**.
2. Ô **Quỹ lương (tổng hợp lương theo khối)** đang là "Tự xếp theo quy tắc (hiện: …)". Chọn **Khối sửa chữa**, bấm **Lưu**.
3. Cột **Quỹ lương** của bảng bộ phận hiện chữ đậm **Khối sửa chữa**. Bộ phận chưa chọn quỹ thì hiện chữ mờ, ví dụ "Tự xếp: có kíp → Khối công nhân vận hành (ca kíp); không kíp → Khối quản lý và hành chính nhà máy".
4. Bấm **Tính lại** các bảng lương chưa khoá để xếp lại quỹ. Bảng đã khoá giữ quỹ cũ.

**Một người thuộc khối khác bộ phận của mình** (vd thợ sửa chữa ngồi ở bộ phận Vận hành):
1. Vào **Quản trị › Nhân sự**. Ở cột **Quỹ lương** của người đó, chọn quỹ.
2. Bấm **Lưu thay đổi (n)** trên thanh vàng.

Dưới ô chọn **Tự xếp** luôn có dòng chữ mờ "→ …" cho biết người đó đang được xếp vào quỹ nào. Muốn đổi cho nhiều người cùng lúc: tick ô đầu dòng, chọn **Quỹ lương** ở thanh "Áp dụng cho người đã chọn" (có lựa chọn "Tự xếp (theo bộ phận / quy tắc)"), rồi bấm **Áp dụng cho người đã chọn**.

**Thêm hoặc sửa quỹ.** Bấm **+ Quỹ lương** hoặc **Sửa**, rồi nhập các ô **Mã (ngắn, không trùng)**, **Tên quỹ lương**, **Tự xếp theo quy tắc**, **Ghi chú**, **Thứ tự (in / báo cáo)**, **Trạng thái**.
- Mỗi quy tắc chỉ gắn cho một quỹ. Nếu chọn quy tắc đang gắn ở quỹ khác, chương trình hỏi có chuyển quy tắc sang quỹ này không.
- Nếu một quy tắc chưa có quỹ nào đang dùng, thẻ hiện cảnh báo vàng. Người thuộc trường hợp đó sẽ nằm ở mục **Chưa xếp quỹ** trên báo cáo.

**Thôi dùng một quỹ.** Đặt **Trạng thái = Ngừng**. Quỹ ngừng không còn tự xếp và không hiện trong danh sách chọn.
- Quỹ đã có trong bảng lương thì **không xoá được**. Chương trình báo "Không thể xoá/đổi vì còn dữ liệu đang dùng mục này. Hãy tắt "đang dùng" thay vì xoá.", nghĩa là phải đặt Trạng thái = Ngừng.
- Chỉ quỹ chưa từng dùng mới xoá hẳn được.

### Bước 5. Lương đóng BH thỏa thuận (trang Hệ số)
Dùng cho người đóng bảo hiểm theo **một số tiền thỏa thuận** thay vì hệ số BH × lương cơ sở.

1. Vào trang **Hệ số**, tìm người đó (vd Quản lý B).
2. Bấm **Cập nhật hệ số mới** nếu mức thay đổi từ một ngày nhất định (nhập **Hiệu lực từ**), hoặc **Sửa hệ số** nếu chỉ sửa chỗ nhập sai.
3. Nhập ô **Lương đóng BH thỏa thuận (VND)** bằng **số tiền** (vd 20000000). Để **0** nếu người đó đóng theo hệ số BH × lương cơ sở.
4. Bấm **Lưu bản ghi mới** (hoặc **Lưu**), rồi **Tính lại** bảng lương nháp.

Cách chương trình dùng số này:
- Khi số tiền > 0, **lương bảo hiểm** = số tiền thỏa thuận × tỷ lệ công × hệ số xếp loại lao động (nếu có), thay cho hệ số BH × lương cơ sở.
- Các khoản trừ % bảo hiểm (BHXH, BHYT, BHTN, công đoàn) tính trên số này.
- Ô hệ số BH vẫn giữ để tham khảo nhưng không dùng nữa.

Ví dụ ở chi tiết dòng lương: "Lương bảo hiểm = lương đóng BH thỏa thuận 20.000.000 (thay cho hệ số BH 5 × lương cơ sở 2.340.000) × 1" ra **20.000.000**, BHXH 8% = 1.600.000.

Trên Excel **Bảng lương** xuất hiện thêm cột **Lương đóng BH thỏa thuận** khi bảng có người dùng số này. Cột **Hệ số lương** bên cạnh vẫn ghi hệ số BH cũ, chỉ để tham khảo.

Loại hệ số này do Admin quản lý ở **Quản trị › Cấu hình › Loại hệ số**, loại "Lương đóng BH thỏa thuận (số tiền thay hệ số BH × lương cơ sở)".

---

## 3. Người phụ thuộc

Chỉ khai cho người hưởng lương **theo hệ số**. Ở người lương khoán, cột **Người phụ thuộc** hiện "—".

### Mở hộp khai
1. Vào **Quản trị › Nhân sự**.
2. Cột **Người phụ thuộc** là một nút số:
   - `1` = đang tính 1 người trong tháng hiện tại.
   - `1 (2)` = đang tính 1 người, tổng đã khai 2 người (người kia đã thôi hoặc chưa đến tháng bắt đầu).
3. Bấm vào số để mở hộp **Thuế TNCN — <họ tên>**. Hộp có hai phần: **Người phụ thuộc** và **Giảm trừ theo năm (y tế, giáo dục, khác)**.

### Thêm người phụ thuộc
1. Bấm **+ Thêm người phụ thuộc**.
2. Nhập các ô:
   - **Họ và tên người phụ thuộc \*** (bắt buộc).
   - **Quan hệ với người nộp thuế**: gõ hoặc chọn gợi ý (Con, Vợ, Chồng, Cha đẻ, Mẹ đẻ…).
   - **Ngày sinh**, **Số CCCD / định danh cá nhân**, **Mã số thuế người phụ thuộc**.
   - **Tính giảm trừ từ tháng \*** (bắt buộc; mặc định là tháng hiện tại).
   - **Đến hết tháng (trống = đang tính)**.
   - **Ghi chú**.
3. Bấm **Lưu**. Thông báo "Đã thêm người phụ thuộc".

Được giảm trừ từ tháng phát sinh nghĩa vụ nuôi dưỡng, ví dụ tháng sinh con. Mỗi người phụ thuộc chỉ được tính cho **một** người nộp thuế.

### "Tính từ tháng" và "đến hết tháng"
- Người phụ thuộc được giảm trừ **cả tháng bắt đầu** và **cả tháng cuối**.
- **Đến hết tháng** để trống = vẫn đang tính, không có hạn.
- Cột **Trạng thái**:
  - **Đang tính**: được tính trong tháng hiện tại, kể cả khi đã đặt tháng cuối là tháng này.
  - **Từ MM/YYYY**: tháng bắt đầu còn ở tương lai.
  - **Đã thôi**: tháng cuối đã qua.

Ví dụ:

| Khai | Được giảm trừ các tháng (năm 2026) | Số tháng trong năm |
|---|---|---|
| Con, từ 01/2026, đến hết: trống | 1 → 12 | 12 |
| Mẹ, từ 05/2025, đến hết 06/2026 | 1 → 6 | 6 |
| Con mới sinh, từ 08/2026, đến hết: trống | 8 → 12 | 5 |
| Con đi làm, từ 01/2020, đến hết 09/2026 | 1 → 9 | 9 |

Với hai dòng đầu, tháng 1–6 được 2 người, tháng 7–12 được 1 người. Quyết toán cả năm tính **18 tháng-người** × 6.200.000 = 111.600.000.

### Sửa, thôi tính, xoá
- **Sửa**: sửa thông tin hoặc tháng bắt đầu / tháng cuối.
- **Thôi tính**: dùng khi người đó **không còn là người phụ thuộc**, ví dụ con đã đi làm hoặc đã chuyển cho người khác nhận giảm trừ.
  1. Hộp **Thôi tính giảm trừ — <tên>** hỏi "Tháng cuối cùng còn được giảm trừ (từ tháng sau không tính nữa)". Mặc định là tháng hiện tại.
  2. Chọn tháng, bấm **Thôi tính**. Thông báo, ví dụ: "Đã thôi tính Con 1 từ sau tháng 10/2026".
  3. Tháng cuối không được trước tháng bắt đầu. Chương trình báo "Tháng cuối phải từ 01/2026 trở đi (nếu khai nhầm thì bấm Xoá)".
- **Xoá**: **chỉ dùng khi khai nhầm**. Xoá hẳn thì các tháng đã tính cũng mất giảm trừ khi bấm Tính lại. Người thôi là người phụ thuộc thì dùng **Thôi tính**, đừng xoá.

Sau mỗi lần thêm, sửa, thôi tính hay xoá:
- Các bảng lương **chưa khoá** có người này (từ năm liên quan) được đánh dấu **Cần tính lại**.
- Bảng đã khoá giữ nguyên. Phần chênh lệch được bù ở quyết toán tháng 12 (xem phần 8).

---

## 4. Giảm trừ y tế, giáo dục, khoản khác theo năm

Nhập **số cả năm** của từng người cho từng năm:
- **Chi phí y tế** và **chi phí giáo dục**: chỉ được trừ tối đa theo mức của biểu thuế năm đó. Năm 2026 là 23.000.000 và 24.000.000.
- **Khoản giảm trừ khác** (từ thiện, nhân đạo, khuyến học, quỹ hưu trí tự nguyện…): không giới hạn.

Cách chương trình trừ:
- **Tạm tính hằng tháng**: trừ 1/12 số cả năm của từng khoản (sau khi áp mức tối đa).
- **Quyết toán tháng 12**: trừ đủ số cả năm.

### Nhập cho từng người (Quản trị › Nhân sự)
1. Bấm số ở cột **Người phụ thuộc** của người đó. Kéo xuống phần **Giảm trừ theo năm (y tế, giáo dục, khác)**.
2. Dòng cuối là dòng trống để thêm năm mới. Chọn năm, nhập **Chi phí y tế (cả năm)**, **Chi phí giáo dục (cả năm)**, **Giảm trừ khác (cả năm)**, **Ghi chú**, rồi bấm **Thêm**. Năm đã có thì sửa số rồi bấm **Lưu**.
3. Cột **Được trừ (sau mức tối đa)** tính sẵn "Cả năm …" và "Mỗi tháng ≈ …". Vượt mức thì có dòng cam, ví dụ "Y tế: vượt mức tối đa, chỉ trừ 23.000.000".
4. Xoá cả năm: bấm **Xoá**. Hoặc xoá trắng cả ba khoản và ghi chú rồi bấm **Lưu**.

Thông báo sau khi lưu: "Đã lưu giảm trừ năm 2026 — các bảng lương chưa khoá năm 2026 có người này cần Tính lại".

### Nhập hàng loạt (Thống kê năm)
1. Vào **Thống kê năm › Thuế TNCN theo năm**, chọn năm. Bấm **Nhập giảm trừ y tế, giáo dục, khác**.
2. Hộp **Giảm trừ chi phí y tế, giáo dục và khoản khác — năm 2026** liệt kê mọi người hưởng lương theo hệ số. Chọn bảng lương hoặc gõ **Tìm tên…** để lọc.
3. Gõ số tiền cả năm vào các cột **Chi phí y tế**, **Chi phí giáo dục**, **Khoản khác**, **Ghi chú**. Để trống = 0.
   - Ô vượt mức tối đa tô **cam**.
   - Dòng đã sửa tô vàng, góc trên hiện "n người đã sửa, chưa lưu".
4. Bấm **Lưu thay đổi**. Thông báo "Đã lưu giảm trừ năm 2026 của n người".

Cột **Người phụ thuộc** trong hộp này là số người phụ thuộc **có tính ít nhất một tháng trong năm**. Con số này có thể khác số ở trang Nhân sự (trang đó chỉ đếm người đang tính trong tháng hiện tại).

Người chỉ có quyền "Quản lý hệ số" của một bảng lương chỉ thấy bảng lương của mình. Admin và người "Quản lý nhân sự" thấy **Tất cả bảng lương**.

### Lưu ý pháp lý
Theo **Nghị định 253/2026/NĐ-CP (Điều 51)**, giảm trừ chi phí y tế, giáo dục do người lao động **tự kê khai khi tự quyết toán** thuế TNCN. Số nhập ở đây chỉ để công ty tạm tính và quyết toán dự kiến trên bảng lương.

Vì vậy số thuế công ty tính (kể cả quyết toán tháng 12) là **ước tính**. Số phải nộp chính thức theo quyết toán của người lao động.

---

## 5. Cách tính thuế

### Thu nhập chịu thuế
Mỗi tháng:

> **Thu nhập chịu thuế = lương bảo hiểm (gồm phụ cấp an toàn) + phụ cấp + thưởng**

"Thưởng" gồm thưởng theo hệ số và các khoản **Thưởng thêm** nhập ở **Thưởng / khoản trừ tháng**, ví dụ thưởng cuối năm.

**Không tính thuế** (cột **Không tính thuế**):
- Tiền **làm đêm**, cả phần lương và phần thưởng.
- Tiền **làm thêm**, cả phần lương và phần thưởng.
- Tiền **làm lễ, tết**, cả phần lương và phần thưởng.
- **Toàn bộ tiền ăn ca**.

### Các khoản giảm trừ

| Khoản | Tạm tính tháng 1–11 | Quyết toán tháng 12 |
|---|---|---|
| Bảo hiểm bắt buộc | Các khoản trừ có đánh dấu **Được trừ khi tính thuế TNCN** của tháng | Cộng cả 12 tháng |
| Bản thân | 15.500.000 | 12 tháng × 15.500.000 = 186.000.000 |
| Người phụ thuộc | Số người được tính trong tháng × 6.200.000 | Tổng số tháng-người trong năm × 6.200.000 |
| Y tế, giáo dục (sau mức tối đa), khác | Số cả năm ÷ 12 | Đủ số cả năm |

Nếu tổng giảm trừ lớn hơn thu nhập chịu thuế thì thu nhập tính thuế bằng 0.

### Tạm tính hằng tháng: bậc thuế cả năm ÷ 12
Thuế lũy tiến từng phần, mức trần mỗi bậc lấy mức cả năm chia 12. Biểu 2026 khi tạm tính tháng:

| Bậc | Thu nhập tính thuế / tháng | Thuế suất |
|---|---|---|
| 1 | đến 10.000.000 | 5% |
| 2 | trên 10.000.000 đến 30.000.000 | 10% |
| 3 | trên 30.000.000 đến 60.000.000 | 20% |
| 4 | trên 60.000.000 đến 100.000.000 | 30% |
| 5 | trên 100.000.000 | 35% |

### Ví dụ a — một tháng thường (biểu 2026)
Một người có 1 người phụ thuộc, khai y tế 6.000.000 / năm và giáo dục 12.000.000 / năm. Tháng này có lương BH 9.360.000 (hệ số BH 4 × lương cơ sở 2.340.000), phụ cấp 500.000, thưởng 18.000.000. Nếu có tiền làm đêm hay ăn ca thì không cộng vào.

| Bước | Số tiền |
|---|---|
| Thu nhập chịu thuế = 9.360.000 + 500.000 + 18.000.000 | **27.860.000** |
| (−) BH bắt buộc 10,5% × (9.360.000 + 500.000) = 10,5% × 9.860.000 | −1.035.300 |
| (−) Bản thân | −15.500.000 |
| (−) 1 người phụ thuộc | −6.200.000 |
| (−) Y tế 6.000.000 ÷ 12 | −500.000 |
| (−) Giáo dục 12.000.000 ÷ 12 | −1.000.000 |
| Tổng giảm trừ | 24.235.300 |
| **Thu nhập tính thuế** = 27.860.000 − 24.235.300 | **3.624.700** |
| Bậc 1: 3.624.700 × 5% | 181.235 |
| **Thuế tạm tính tháng** | **181.235** |

BH 10,5% = BHXH 8% + BHYT 1,5% + BHTN 1%. Kinh phí công đoàn 0,5% không được trừ.

### Tháng 12: quyết toán trên thu nhập cả năm
1. Cộng thu nhập chịu thuế và BH bắt buộc của **cả 12 tháng**. Gồm cả tháng ở bảng lương khác và tháng tính trước khi có chức năng thuế.
2. Trừ: bản thân 12 tháng, người phụ thuộc theo tổng số tháng-người, y tế / giáo dục (sau mức tối đa) và khoản khác đủ số cả năm.
3. Tính thuế lũy tiến theo biểu **cả năm** (mức trần **không** chia 12).
4. **Thuế tháng 12 = thuế cả năm − thuế đã tạm tính tháng 1–11.**
   - Số **dương** = phải nộp thêm.
   - Số **âm** = được hoàn (trả lại cho người lao động).
   - Khi đang **Trừ thuế tạm tính vào thưởng**, "đã tạm tính" chỉ cộng các tháng **đã thực trừ** vào lương / thưởng (dòng ghi "Đã khấu trừ tháng 1–11"). Tháng chỉ ước tính, chưa trừ (tháng tính khi còn để "Chỉ ước tính", hoặc tính trước khi có chức năng thuế) được ghi "chưa trừ vào lương / thưởng — thu khi quyết toán", và thuế của tháng đó được thu nốt ở tháng 12. Nhờ vậy tổng số đã trừ qua bảng lương cả năm đúng bằng thuế cả năm.

### Ví dụ b — tháng 12 có thưởng cuối năm 60.000.000
Cùng người ở ví dụ a. Tháng 1–11 thu nhập như nhau. Tháng 12 có thêm thưởng cuối năm 60.000.000.

| Bước | Số tiền |
|---|---|
| Thu nhập chịu thuế tháng 1–11: 11 × 27.860.000 | 306.460.000 |
| Thu nhập chịu thuế tháng 12: 27.860.000 + 60.000.000 | 87.860.000 |
| **Thu nhập chịu thuế cả năm** | **394.320.000** |
| (−) BH bắt buộc 12 × 1.035.300 | −12.423.600 |
| (−) Bản thân 12 × 15.500.000 | −186.000.000 |
| (−) Người phụ thuộc 12 tháng-người × 6.200.000 | −74.400.000 |
| (−) Y tế cả năm | −6.000.000 |
| (−) Giáo dục cả năm | −12.000.000 |
| **Tổng giảm trừ cả năm** | **290.823.600** |
| **Thu nhập tính thuế cả năm** | **103.496.400** |
| Bậc 1 (đến 120.000.000): 103.496.400 × 5% | 5.174.820 |
| **Thuế cả năm** | **5.174.820** |
| (−) Đã tạm tính tháng 1–11: 11 × 181.235 | −1.993.585 |
| **Tháng 12 phải nộp** | **3.181.235** |

Nếu tính riêng tháng 12 bằng bảng thuế tháng, thu nhập tính thuế 87.860.000 − 24.235.300 = 63.624.700. Con số này rơi tới bậc 4 (30%) và thuế lên tới **9.587.410**.

Quyết toán theo cả năm thì khoản thưởng được dàn trên thu nhập cả năm và chỉ ở bậc 5%. Vì vậy tháng 12 chỉ còn phải nộp 3.181.235. Màn hình tháng 12 vẫn hiện số tạm tính theo tháng ở dòng "Thuế tạm tính theo tháng (chỉ để tham khảo — tháng 12 tính theo quyết toán cả năm bên dưới)".

### Được hoàn
Thuế tháng 12 âm khi số đã tạm tính lớn hơn thuế cả năm. Thường gặp khi:
- Khai thêm người phụ thuộc hoặc giảm trừ muộn.
- Thu nhập các tháng cuối năm giảm.

Cách chương trình xử lý số hoàn:
- Đang **trừ thuế vào thưởng**: số hoàn **cộng vào thưởng tháng 12**. Chi tiết dòng lương ghi "+ hoàn Thuế TNCN (quyết toán năm)".
- **Chỉ ước tính**: cột **Thực lĩnh sau thuế** = thực lĩnh + số được hoàn.

Ví dụ thật trên chương trình (anh A, phần 8) được hoàn 776.140.

### Người có lương ở hai bảng lương trong cùng tháng
Ví dụ một người chuyển từ nhà máy lên văn phòng giữa tháng:
- Thuế tính trên **tổng** thu nhập và tổng BH của người đó ở mọi bảng lương trong tháng. Giảm trừ bản thân và người phụ thuộc chỉ tính **một lần**.
- Số thuế chia cho từng bảng **theo tỷ lệ thu nhập chịu thuế**.
- Ở tab thuế, dưới tên người đó có dòng nhỏ "chia theo tỷ lệ với bảng lương khác cùng tháng". Rê chuột lên để xem tổng.

Khi một bảng tính lại làm đổi thu nhập của người này, hoặc người này bị bỏ khỏi bảng (bỏ khỏi bảng chấm công, thôi tính lương, chuyển lương khoán), bảng lương kia cùng tháng và bảng lương tháng 12 (nếu chưa khoá) tự bị đánh dấu **Cần tính lại**. Hãy tính lại bảng đó để phần chia khớp.

Nếu bảng lương kia **đã trình Giám đốc hoặc đã khoá**, phần thuế đã lưu ở đó được giữ nguyên; bảng đang tính nhận **thuế cả tháng trừ phần của bảng đã khoá**. Tổng hai bảng luôn bằng thuế tính trên tổng thu nhập của tháng.

### Người lương khoán / thù lao
Không tính thuế lũy tiến. Họ đã bị khấu trừ thuế vãng lai ở bảng lương khoán (mặc định 10%, xem hướng dẫn v6.23).
- Không có trong tab thuế, báo cáo thuế năm và quyết toán tháng 12.
- Ở báo cáo quỹ lương, họ vẫn được cộng vào cột **Lương khoán / thù lao**.

---

## 6. Màn hình Bảng lương

Mở **Bảng lương**, chọn năm / tháng, bấm vào bảng lương. Khi đã có lương nháp, dưới các nút có **hai tab**:
- **Bảng lương**: như trước.
- **Lương + thuế TNCN (ước tính)**: thuế từng người. Khi bảng lương được tính với cài đặt "Trừ thuế tạm tính vào thưởng", tab tên là **Lương + thuế TNCN** (thuế đã trừ thật, không còn là ước tính).

Tab đang chọn được giữ khi đổi tháng hay đổi bảng lương. Thuế được tính cùng lúc với lương: mỗi lần **Chạy lương nháp / Tính lại lương nháp** (cấp 2) hay **Tính lại lương** (cấp 3), thuế cũng được tính lại.

### Phần đầu tab thuế
- Dòng xanh nêu:
  - Biểu thuế đang dùng (vd "Biểu thuế năm 2026 — giảm trừ bản thân 15.500.000 đ/tháng…").
  - Cách xử lý thuế: **Chỉ ước tính, chưa trừ vào lương** hoặc **Đã trừ vào thưởng thực nhận**.
  - Nhắc lại thu nhập chịu thuế, khoản không tính thuế và các khoản giảm trừ.
- Các cảnh báo có thể gặp:
  - "Cấu hình hiện tại: … nhưng bảng lương này được tính khi cấu hình là …": Admin đã đổi cách xử lý thuế sau khi bảng này được tính. Bảng nháp thì bấm tính lại. Bảng đã trình Giám đốc hoặc đã khoá thì giữ nguyên.
  - "n người chưa có số thuế TNCN (bảng lương tính trước khi có thuế lũy tiến)": xem mục "Chưa tính thuế" bên dưới.
  - "Chưa có biểu thuế TNCN cho năm này…": chỉ gặp khi không còn biểu thuế nào.
- Nút **Xuất Excel bảng thuế TNCN**. Nút này nằm **trong tab thuế**, không nằm ở hàng "Xuất Excel (in)".

### Các cột (tháng 1–11)

| Cột | Ý nghĩa |
|---|---|
| Thu nhập chịu thuế | Lương BH + phụ cấp + thưởng của dòng này |
| Không tính thuế | Làm đêm + làm thêm + làm lễ tết + ăn ca |
| BH bắt buộc | BHXH, BHYT, BHTN người lao động đóng |
| Bản thân | Giảm trừ bản thân / tháng |
| Người phụ thuộc | Số tiền, dòng nhỏ bên dưới ghi "1 × 6.200.000" |
| Y tế / giáo dục / khác | Số cả năm ÷ 12 (sau mức tối đa) |
| Thu nhập tính thuế | Thu nhập chịu thuế − các khoản giảm trừ |
| **Thuế TNCN tháng** | Thuế tạm tính |
| Thực lĩnh | Như tab Bảng lương. Nếu đang trừ thuế vào thưởng thì đã là sau thuế |
| **Thực lĩnh sau thuế** | Chỉ ước tính: thực lĩnh − thuế. Trừ vào thưởng: bằng cột Thực lĩnh |

Rê chuột lên ô số để xem cách cộng, ví dụ "Lương BH … + phụ cấp … + thưởng …" hay thuế từng bậc.

Với người có lương ở hai bảng lương trong tháng: hai cột **Thu nhập chịu thuế** và **BH bắt buộc** là số **của bảng này**. Các cột của cả người (**Bản thân**, **Người phụ thuộc**, **Y tế / giáo dục / khác**, **Thu nhập tính thuế**) có dấu **\*** và **không cộng vào dòng Tổng cộng** của bảng này, để không tính hai lần giữa hai bảng. Cột thuế là phần được chia cho bảng này. Bấm vào dòng để xem đủ số.

### Tháng 12
Có thêm khung vàng **"Tháng 12 — quyết toán thuế TNCN cả năm 2026"**. Các cột đổi thành:

| Cột | Ý nghĩa |
|---|---|
| Thu nhập chịu thuế tháng 12 | Của riêng tháng 12, gồm thưởng cuối năm |
| Không tính thuế | Làm đêm, thêm, lễ, ăn ca của tháng 12 |
| Thu nhập chịu thuế cả năm | Tháng 1–11 + tháng 12 |
| Tổng giảm trừ cả năm | BH + bản thân 12 tháng + người phụ thuộc + y tế / giáo dục / khác |
| Thu nhập tính thuế cả năm | |
| Thuế cả năm | Theo biểu cả năm |
| Đã tạm tính T1–T11 (hoặc **Đã khấu trừ T1–T11** khi đang trừ thuế vào thưởng) | Tổng thuế tháng 1–11; khi trừ vào thưởng thì chỉ các tháng đã thực trừ. Rê chuột để xem số tạm tính đầy đủ |
| **Phải nộp thêm (+) / được hoàn (−)** | Thuế cả năm − đã tạm tính |
| Thực lĩnh, Thực lĩnh sau thuế | Như các tháng khác |

### Chi tiết thuế từng người
Bấm vào một dòng (ở tab nào cũng được) để mở chi tiết dòng lương. Phần cuối có mục **THUẾ TNCN (TẠM TÍNH THÁNG)**, gồm các bước:
1. Thu nhập chịu thuế và khoản không tính thuế.
2. Từng khoản giảm trừ. Khoản y tế vượt mức ghi "áp mức tối đa".
3. Thu nhập tính thuế.
4. Bảng **từng bậc**: phần thu nhập trong bậc, thuế suất, tiền thuế.
5. Thuế tạm tính tháng.
6. Thực lĩnh sau thuế.

Tháng 12 mục này tên là **THUẾ TNCN — THÁNG 12: QUYẾT TOÁN NĂM 2026** và có thêm:
- Bảng **Quyết toán: cộng thu nhập cả năm**: từng tháng có thu nhập chịu thuế, BH, số người phụ thuộc, thuế đã tạm tính. Tháng có 2 bảng lương ghi "2 bảng lương". Tháng ước tính lại ghi "ước tính lại (tháng tính trước khi có thuế lũy tiến)".
- Các bước quyết toán cả năm và bảng bậc thuế cả năm.
- Dòng cuối là **Phải nộp thêm khi quyết toán (+)** hoặc **Được hoàn khi quyết toán (−)**.

Nếu đang trừ thuế vào thưởng, phần **THƯỞNG** của chi tiết có dòng "trừ Thuế TNCN (tạm tính)" (tháng 12: "trừ Thuế TNCN (quyết toán năm)" hoặc "+ hoàn Thuế TNCN (quyết toán năm)").

### "Chưa tính thuế — bấm Tính lại lương"
Các cột thuế của dòng gộp thành một ô ghi **Chưa tính thuế — bấm Tính lại lương**. Nghĩa là dòng lương này được tính **trước khi có chức năng thuế TNCN**, nên chưa lưu số thuế.

| Trạng thái bảng lương | Cần làm |
|---|---|
| Nháp | Cấp 2 bấm **Tính lại lương nháp** |
| Cấp 3 đang kiểm soát | Cấp 3 bấm **Tính lại lương** |
| Đã trình Giám đốc / đã khoá | Không bắt buộc tính lại. Báo cáo năm và quyết toán tháng 12 tự **ước tính lại** thuế các tháng này (đánh dấu \*). Chỉ khi thật cần, Admin bấm **Mở khoá / đưa về cấp 2 (Admin)** rồi tính lại và duyệt lại |

### Xuất Excel thuế TNCN
Bấm **Xuất Excel bảng thuế TNCN** trong tab thuế.

| Tháng | Tên file | Tiêu đề trên file | Cột |
|---|---|---|---|
| 1–11 | `thue-tncn-<bảng lương>-2026-10.xlsx` | "BẢNG TÍNH THUẾ TNCN TẠM TÍNH …" | Thu nhập chịu thuế (Lương BH, Phụ cấp, Thưởng, Cộng), Không tính thuế, Các khoản giảm trừ (BH bắt buộc, Bản thân, Số người phụ thuộc, Người phụ thuộc, Y tế giáo dục khác), Thu nhập tính thuế, Thuế TNCN tháng, Thực lĩnh, Thực lĩnh sau thuế, Ghi chú |
| 12 | `quyet-toan-thue-tncn-<bảng lương>-2026-12.xlsx` | "BẢNG QUYẾT TOÁN THUẾ TNCN NĂM 2026 …", "TÍNH VÀO LƯƠNG THÁNG 12 NĂM 2026" | Các cột cả năm như trên màn hình |

Thông tin chung của file:
- File nhóm người theo bộ phận như bảng lương và có khối ký (Giám đốc, Kế toán trưởng, Người lập biểu).
- Cột **Ghi chú** ghi các trường hợp đặc biệt: "Chưa tính thuế — bấm Tính lại lương", hoặc "Chia theo tỷ lệ với bảng lương khác cùng tháng (2 bảng lương, thuế cả tháng …)".
- Bảng lương khoán không có file này.

---

## 7. Báo cáo

### 7.1. Thống kê năm › Thuế TNCN theo năm
Báo cáo thuế cả năm của mọi người hưởng lương theo hệ số mà bạn được xem.

**Bộ lọc:**
- Năm.
- **Tất cả bảng lương** hoặc một bảng lương theo hệ số (bảng lương khoán không có trong danh sách). Chọn một bảng thì vẫn cộng thu nhập của người đó ở mọi bảng lương khác, nếu bạn được xem các bảng đó (xem "Người có lương ở bảng lương bạn không được xem" bên dưới).
- **Chỉ tháng đã khoá** (mặc định **không** tick, để theo dõi cả bảng nháp trong năm).
- **Tìm tên…**

**Nút:** **Nhập giảm trừ y tế, giáo dục, khác** (phần 4; chỉ hiện với Admin, người "Quản lý nhân sự" và người "Quản lý hệ số") và **Xuất Excel**.

**Các cột:**

| Cột | Ý nghĩa |
|---|---|
| Họ tên, Phòng | |
| T1 … T11 | Thuế tạm tính từng tháng |
| T12 (QT) | Thuế tháng 12 (quyết toán), số âm màu xanh = được hoàn |
| Tổng thu nhập chịu thuế | Cả năm |
| Tổng giảm trừ | Cả năm |
| Thu nhập tính thuế cả năm | |
| Thuế cả năm | |
| Đã tạm tính (T1–T11) | |
| Tháng 12 quyết toán | "chưa có" nếu chưa có bảng lương tháng 12 |
| **Còn phải nộp / được hoàn** | Thuế cả năm − tổng thuế các tháng. **+** đỏ = còn phải nộp, **−** xanh = được hoàn |

**Ký hiệu trong bảng:**
- **\*** cạnh số tháng: **ước tính**. Bảng lương tháng đó tính trước khi có chức năng thuế nên số được tính lại để theo dõi.
- Ô **chữ nghiêng màu xám**: bảng lương tháng đó chưa khoá.
- **·**: tháng đó người này không có lương theo hệ số.
- Rê chuột lên ô tháng để xem thu nhập chịu thuế, BH, số người phụ thuộc và khoản không tính thuế của tháng.

**Quyết toán dự kiến giữa năm.** Khi **chưa có tháng 12**, cột **Còn phải nộp / được hoàn** (chữ nghiêng) là **quyết toán dự kiến**. Chương trình coi như năm chỉ có số tháng đã có lương, ví dụ 9 tháng:
- Mức trần bậc thuế và mức tối đa y tế / giáo dục quy về 9/12.
- Y tế / giáo dục / khác lấy 9/12 số cả năm.
- Bản thân 9 tháng; người phụ thuộc trong 9 tháng đó.

Thu nhập đều thì số này gần bằng 0. Nó lệch nhiều khi có khai bổ sung người phụ thuộc / giảm trừ hoặc thu nhập dao động. Số chính thức tính ở bảng lương tháng 12 (bản thân đủ 12 tháng, cộng thưởng cuối năm).

**Người có lương ở bảng lương bạn không được xem.** Thuế luôn tính trên mọi dòng lương của người đó, nhưng mỗi người xem chỉ thấy số của các bảng lương mình được phân quyền. Ví dụ người chỉ được xem bảng lương Nhà máy, còn Chủ tịch H ở Văn phòng có 1 tháng làm ở Nhà máy:
- Cạnh tên có biểu tượng **◐**; đầu trang có dòng giải thích.
- Tháng chỉ có lương ở bảng khác hiện chữ **ẩn**. Tháng có cả hai bảng chỉ hiện phần của bảng được xem (ghi "chỉ phần ở Nhà máy").
- Không hiện các cột cả năm và quyết toán (vì gồm thu nhập ở bảng khác). Excel cũng ẩn như vậy.

Họ tên người phụ thuộc và ghi chú giảm trừ chỉ Admin, người "Quản lý nhân sự" và người "Quản lý hệ số" của bảng lương có người đó xem được. Người khác chỉ thấy "Người thứ 1, 2…" kèm tháng được tính.

**Khung "Tháng 12 cần tính lại"** và nhãn **tháng 12 cần tính lại** cạnh tên người: số quyết toán đã tính ở bảng lương tháng 12 khác số tính lại hiện nay. Nguyên nhân là sau khi tính tháng 12 đã đổi người phụ thuộc, giảm trừ hoặc lương tháng 1–11.
- Tháng 12 còn nháp: tính lại.
- Tháng 12 đã khoá: Admin **Mở khoá / đưa về cấp 2 (Admin)** trước, rồi tính lại.

**Bảng kê từng người.** Bấm vào một người để mở **Thuế TNCN năm 2026 — <tên>**, gồm:
1. **Thu nhập và thuế từng tháng**: thu nhập chịu thuế, không tính thuế, BH được trừ, số người phụ thuộc, thuế, ghi chú (vd "gồm Nhà máy + Văn phòng", "\* ước tính", "bảng lương chưa khoá").
2. **Quyết toán thuế cả năm**, từng bước và từng bậc. Chưa có tháng 12 thì tiêu đề ghi "(dự kiến theo n tháng đã có lương)".
3. **Người phụ thuộc**: từ, đến, số tháng trong năm.
4. **Giảm trừ theo năm**: số đã kê và số được trừ sau mức tối đa.

**Xuất Excel** (`thue-tncn-nam-2026.xlsx`) có hai sheet:
- **Tổng hợp thuế 2026**: STT, Họ tên, Mã NV, Bộ phận, Bảng lương, Thuế T1…T12, các cột cả năm, Ghi chú (vd "Tháng 12 cần tính lại", "ước tính: T2", "2 người phụ thuộc").
- **Chi tiết**: bảng kê từng người như hộp trên màn hình.

### 7.2. Thống kê năm › Tổng hợp theo quỹ lương
Tổng hợp tiền lương theo quỹ (khối).

**Bộ lọc:** năm, **Từ** tháng … **đến** tháng …, **Chỉ tháng đã khoá** (mặc định **có** tick, tức là chỉ số chính thức). Nút **Xuất Excel**.

Đầu trang nhắc thứ tự xếp quỹ và danh sách quỹ kèm quy tắc tự xếp. Mỗi người được xếp vào quỹ lúc **tính lương**, và quỹ được ghi vào dòng lương. Vì vậy:
- Các tháng đã tính **không đổi** khi sau này điều chuyển người.
- Bảng chưa khoá: bấm tính lại để xếp lại.

**Bảng "Toàn công ty theo quỹ lương"**, rồi một bảng cho **từng bảng lương** (nhãn nhà máy / văn phòng / lương khoán / thù lao). Các cột:

| Cột | Ý nghĩa |
|---|---|
| Số người | Số người khác nhau có dòng lương trong kỳ |
| Lương BH, Phụ cấp, Thưởng | |
| Làm đêm / thêm / lễ | Phần lương và phần thưởng |
| Lương khoán / thù lao | Số tiền khoán (người lương khoán) |
| **Tổng quỹ lương** | Lương BH + Phụ cấp + Thưởng + Làm đêm / thêm / lễ, hoặc số tiền khoán. **Chưa gồm ăn ca** |
| Ăn ca | |
| Khấu trừ | Gồm thuế vãng lai của lương khoán |
| Thuế TNCN | Thuế lũy tiến (tạm tính / quyết toán) của người hưởng lương theo hệ số |
| **Thực lĩnh** | Sau khấu trừ. Chỉ trừ thuế TNCN nếu đang cài trừ thuế vào thưởng |

Người chuyển quỹ hoặc chuyển bảng lương được đếm ở mỗi nơi, nên cộng cột **Số người** các dòng có thể lớn hơn dòng **Cộng**.
- Dòng **Chưa xếp quỹ**: người không khớp quỹ nào. Xem cảnh báo ở thẻ Quỹ lương.
- Dòng lương tính trước khi có quỹ lương được xếp theo cài đặt hiện tại.

**Excel**: `quy-luong-2026-t1-12.xlsx`, gồm bảng toàn công ty rồi từng bảng lương, kèm chú thích cách tính.

### 7.3. Lương của tôi (nhân viên)
Admin bật ở **Quản trị › Phân quyền**, thẻ **Cho mọi nhân sự xem lương của mình**, nút **Bật cho tất cả nhân sự**.

Nhân viên mở **Lương của tôi**. Dưới bảng chi tiết năm có thẻ **Thuế TNCN năm 2026**:
- **Chỉ tính các tháng bảng lương đã được Giám đốc khoá.** Tháng 1–11 là tạm tính, tháng 12 là quyết toán.
- Nội dung giống bảng kê ở 7.1:
  1. Thu nhập và thuế từng tháng.
  2. Quyết toán cả năm.
  3. Người phụ thuộc.
  4. Giảm trừ theo năm.
- Chưa có tháng 12 đã khoá: phần quyết toán là **dự kiến** theo số tháng đã khoá, có giải thích ngay bên dưới. Ví dụ với 11 tháng, mức trần bậc 1 hiện là 110.000.000 thay vì 120.000.000.
- Nút **Xuất Excel bảng kê thuế 2026** tải `thue-tncn-ca-nhan-2026.xlsx`.
- Chưa có tháng nào đã khoá: thẻ báo "Chưa có tháng nào đã khoá được tính thuế TNCN năm …". Người lương khoán xem khoản thuế 10% ở phiếu lương từng tháng.

Nhân viên **không sửa được** người phụ thuộc hay giảm trừ. Nếu thấy sai, báo phòng nhân sự để sửa trong Quản trị › Nhân sự.

---

## 8. Câu hỏi thường gặp và xử lý tình huống

**Người phụ thuộc khai muộn.** Ví dụ con sinh tháng 8 nhưng tháng 11 mới báo.
- Khai với **Tính giảm trừ từ tháng** = 08/2026 (tháng phát sinh), không phải tháng khai.
- Các tháng 8–11 đã khoá giữ nguyên thuế cũ.
- **Tháng 12 tự bù**: quyết toán đếm đủ số tháng-người trong năm theo danh sách hiện tại.
- Nếu tháng 12 đã tính rồi mới khai, báo cáo năm hiện **tháng 12 cần tính lại**. Phải tính lại tháng 12, mở khoá trước nếu đã khoá.

Ví dụ thật trên chương trình (anh A, biểu 2026):
- Mỗi tháng thu nhập chịu thuế 18.360.000, BH 982.800. Tháng 1–11 mỗi tháng tạm tính 93.860, cộng 1.032.460.
- Sau đó khai con từ 11/2026 và y tế 5.000.000.
- Tháng 12: thu nhập cả năm 220.320.000 − giảm trừ 215.193.600 (BH 11.793.600 + bản thân 186.000.000 + 2 tháng-người 12.400.000 + y tế 5.000.000) = 5.126.400.
- Thuế cả năm 256.320, nên tháng 12 **được hoàn 776.140**.
- Trong bảng "Quyết toán: cộng thu nhập cả năm", cột người phụ thuộc tháng 11 vẫn ghi 0 (số lưu lúc tính tháng 11). Dòng **Cả năm** ghi "2 tháng-người" theo danh sách mới. Đây là đúng, không phải lỗi.

**Biểu thuế đổi giữa năm.**
- Luật áp dụng cho **cả năm**: sửa biểu của năm đó (phần 2). Bảng chưa khoá được đánh dấu cần tính lại. Tháng đã khoá giữ số cũ. **Quyết toán tháng 12 dùng biểu mới** trên thu nhập cả năm và trừ đúng số đã tạm tính, nên chênh lệch tự được điều chỉnh ở tháng 12.
- Luật áp dụng **từ năm sau**: dùng **Tạo biểu cho năm mới**.
- Chương trình chỉ có biểu theo **năm**, không có biểu áp dụng từ một tháng giữa năm.

**Một người chuyển bảng lương (chuyển nhóm).**
- Chuyển hẳn từ tháng sau: không cần làm gì. Quyết toán tháng 12 ở bảng lương mới tự cộng các tháng ở bảng lương cũ.
- Trong một tháng có lương ở cả hai bảng: thuế tính trên tổng và chia theo tỷ lệ (phần 5). Khi được báo **Cần tính lại** thì tính lại bảng kia. Bảng kia đã khoá thì giữ nguyên, bảng đang tính nhận phần còn lại.
- Quỹ lương của các tháng đã tính giữ nguyên. Tháng sau theo bộ phận / quỹ mới.

**Một người chuyển sang lương khoán giữa năm.**
- Các tháng hưởng theo hệ số vẫn nằm ở báo cáo thuế năm. Các tháng lương khoán không tính lũy tiến (đã khấu trừ 10%).
- Nếu tháng 12 người đó không còn ở bảng lương theo hệ số thì **không có quyết toán tự động**. Báo cáo năm chỉ hiện **quyết toán dự kiến** theo số tháng đã có.
- Phòng lương tự xử lý quyết toán của người này, hoặc hướng dẫn họ tự quyết toán.
- Người **nghỉ việc trước tháng 12** cũng vậy.

**Các tháng tính trước khi có chức năng thuế.**
- Tab thuế ghi "Chưa tính thuế — bấm Tính lại lương". Báo cáo năm đánh dấu **\*** (ước tính).
- Quyết toán tháng 12 dùng số **ước tính lại** cho các tháng này: thu nhập đã lưu, người phụ thuộc và giảm trừ hiện tại, biểu thuế của năm.
- Không cần mở khoá các tháng cũ.
- **Lưu ý:** "Đã tạm tính" của các tháng này là số chương trình ước tính, **không phải số đã khấu trừ thật**. Nếu đang **Trừ thuế tạm tính vào thưởng**, quyết toán tháng 12 không coi các tháng này là đã trừ và thu nốt thuế của chúng. Nếu trước đây có nhập tay khoản thuế cho các tháng này, phòng lương nên đối chiếu số đã khấu trừ thực tế trước khi chốt quyết toán tháng 12.

**Được hoàn tiền thuế.**
- Tháng 12 âm = được hoàn.
- Đang trừ thuế vào thưởng: số hoàn tự cộng vào thưởng tháng 12.
- Chỉ ước tính: số hoàn chỉ hiện ở cột **Thực lĩnh sau thuế**. Việc trả lại do phòng lương / kế toán làm.

**Tháng đã khoá.**
- Đổi biểu thuế, người phụ thuộc, giảm trừ, quỹ lương, cách xử lý thuế đều **không làm đổi** bảng lương đã khoá.
- Phần chênh lệch về thuế được bù ở quyết toán tháng 12.
- Muốn tính lại một tháng đã khoá: Admin bấm **Mở khoá / đưa về cấp 2 (Admin)** (ghi **Lý do**), cấp 2 bấm **Tính lại lương nháp**, rồi duyệt lại từ đầu.

**Tính lại một tháng 1–11 sau khi đã tính tháng 12.** Bảng lương tháng 12 (nếu chưa khoá) tự bị đánh dấu **Cần tính lại**. Phải tính lại tháng 12 trước khi chốt.

**Thưởng cuối năm nhập ở đâu?**
1. Vào bảng lương tháng 12, bấm **Thưởng / khoản trừ tháng**.
2. Chọn loại **Thưởng thêm (vào bảng thưởng)**, nhập nội dung và số tiền, chọn người.
3. Bấm **Thêm cho người đã chọn**, rồi tính lại.

Khoản này vào thu nhập chịu thuế của tháng 12 và được quyết toán cùng cả năm.

**Có còn nhập tay khoản "Thuế TNCN" không?**
- Đang **Trừ thuế tạm tính vào thưởng thực nhận**: **không**, vì sẽ trừ hai lần.
- Đang **Chỉ ước tính**: khoản nhập tay (nếu có) là khoản trừ riêng, chương trình không đối chiếu với số thuế ước tính.

**Người vào làm giữa năm.** Quyết toán tháng 12 luôn trừ bản thân **đủ 12 tháng**, nên thường được hoàn so với số đã tạm tính. Người phụ thuộc thì tính theo các tháng khai trong danh sách.

**Người lương khoán có cần khai người phụ thuộc không?** Không. Chương trình không cho khai (cột hiện "—").

---

## 9. Ghi chú pháp lý và các mặc định

### Căn cứ đã cài sẵn trong biểu thuế
- **Từ kỳ tính thuế 2026**:
  - Luật Thuế thu nhập cá nhân số **109/2025/QH15**.
  - Nghị quyết **110/2025/UBTVQH15** về mức giảm trừ gia cảnh.
  - Nghị định **253/2026/NĐ-CP**.
  - Nội dung: 5 bậc (5% – 35%), giảm trừ bản thân 15,5 triệu, người phụ thuộc 6,2 triệu / tháng; chi phí y tế tối đa 23 triệu, giáo dục tối đa 24 triệu / năm. Theo Điều 51 Nghị định 253/2026/NĐ-CP, giảm trừ y tế, giáo dục thực hiện khi người lao động **tự quyết toán**.
- **Các năm trước 2026** (biểu 2020, dùng cho 2020–2025 và các năm trước):
  - Luật Thuế TNCN 2007 (sửa đổi 2012, 2014), Nghị quyết 954/2020/UBTVQH14.
  - Nội dung: 7 bậc (5% – 35%), mức trần cả năm 60 / 120 / 216 / 384 / 624 / 960 triệu (tháng: 5 / 10 / 18 / 32 / 52 / 80 triệu). Giảm trừ bản thân 11 triệu, người phụ thuộc 4,4 triệu / tháng. Không có giảm trừ y tế, giáo dục.

Ô **Ghi chú (căn cứ pháp lý)** của từng biểu ghi căn cứ. Khi có văn bản mới, hãy cập nhật ghi chú cùng với số liệu.

### Các mặc định của chương trình

| Nội dung | Mặc định |
|---|---|
| Đối tượng tính thuế lũy tiến | Người hưởng lương theo hệ số. Lương khoán / thù lao: khấu trừ vãng lai (mặc định 10%) |
| Thu nhập chịu thuế | Lương BH (gồm phụ cấp an toàn) + phụ cấp + thưởng |
| Không tính thuế | Toàn bộ tiền làm đêm, làm thêm, làm lễ tết (cả phần lương và thưởng) và toàn bộ tiền ăn ca |
| BH được trừ | BHXH, BHYT, BHTN người lao động đóng. Kinh phí công đoàn không được trừ |
| Tạm tính tháng | Bậc cả năm ÷ 12. Y tế, giáo dục, khác = cả năm ÷ 12 |
| Quyết toán | Ở bảng lương tháng 12, trên thu nhập cả năm. Bản thân đủ 12 tháng. Khi trừ vào thưởng: thuế cả năm − số đã thực trừ tháng 1–11 |
| Thuế lớn hơn thưởng còn lại (khi trừ vào thưởng) | Trừ vào thưởng đến hết, phần còn lại trừ vào lương thực lĩnh |
| Cách xử lý thuế | Chỉ ước tính, không trừ vào lương |
| Người có lương ở nhiều bảng trong tháng | Tính trên tổng, chia theo tỷ lệ thu nhập chịu thuế; bảng đã trình / đã khoá giữ phần đã lưu |
| Báo cáo thuế năm | Người xem chỉ thấy số của bảng lương mình được phân quyền; tên người phụ thuộc chỉ người quản lý nhân sự / hệ số xem được |
| Lương đóng BH thỏa thuận | Số tiền > 0 thì thay hệ số BH × lương cơ sở |
| Quỹ lương | HDQT, BKS, VP, VH, QL tự xếp theo quy tắc; SC chỉ nhận người / bộ phận được chọn |

### Lưu ý cho kế toán thuế
- Việc **không tính thuế toàn bộ** tiền làm đêm, làm thêm, làm lễ tết và tiền ăn ca là **quy ước của công ty** cho chương trình. Quy định thuế có thể chỉ miễn một phần các khoản này, ví dụ phần tiền làm đêm / làm thêm trả cao hơn ngày thường, hay tiền ăn giữa ca trong mức quy định. Kế toán thuế nên đối chiếu khi lập tờ khai và quyết toán chính thức.
- Số thuế trên chương trình, kể cả quyết toán tháng 12, là **số ước tính để tạm khấu trừ**. Số phải nộp chính thức theo quyết toán thuế (của công ty nếu được ủy quyền, hoặc người lao động tự quyết toán).
