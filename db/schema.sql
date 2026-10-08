-- SBM Payroll v1 — schema sạch, chạy lại nhiều lần an toàn.
-- Bảng lương (groups) 1-N Bảng chấm công (sheets) 1-N Phòng/đơn vị (departments) N-1 Phòng ban SSO
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY, value text NOT NULL, note text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  kind text NOT NULL DEFAULT 'plant' CHECK (kind IN ('plant','office')),
  active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  group_id uuid NOT NULL REFERENCES groups(id),
  meal_mode text NOT NULL DEFAULT 'auto' CHECK (meal_mode IN ('auto','actual')),
  active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
UPDATE sheets SET meal_mode='auto' WHERE meal_mode<>'auto';   -- v6.9: bỏ "ăn ca thực tế", chỉ còn ăn ca theo ký hiệu công
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  sheet_id uuid NOT NULL REFERENCES sheets(id),
  active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Mỗi phòng ban SSO chỉ thuộc 1 phòng Payroll; 1 phòng Payroll nhận được NHIỀU phòng ban SSO
CREATE TABLE IF NOT EXISTS department_sso_map (
  sso_department_id text PRIMARY KEY,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sso_departments_cache (
  id text PRIMARY KEY, name text NOT NULL, synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sso_user_id text UNIQUE NOT NULL,
  employee_code text, full_name text NOT NULL, email text, username text,
  positions text,
  sso_dept_ids text[] NOT NULL DEFAULT '{}',
  mapped_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  override_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  employee_type text NOT NULL DEFAULT 'worker' CHECK (employee_type IN ('manager','admin','worker')),
  sso_status text NOT NULL DEFAULT 'active',
  payroll_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  synced_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- sso_unit_ids: đơn vị "không phải phòng" của SSO (HĐQT/BKS/BGĐ) suy từ chức vụ cấp công ty; pay_department_id: bộ phận hiển thị trên bảng lương/thưởng (vd PGĐ kiêm trưởng phòng: chấm công ở phòng, lương hiển thị ở Ban giám đốc)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sso_unit_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_no int;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pos_rank int NOT NULL DEFAULT 80;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sso_name text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS title text;
-- v6.14: lịch nghỉ hằng tuần riêng của từng người (NULL = theo quy tắc công chuẩn của bảng lương/loại nhân sự)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekly_off text CHECK (weekly_off IN ('sun','sat_sun'));
-- v6.18: người đã được chỉnh tay loại / lịch nghỉ thì nút "Tự nhận loại + lịch nghỉ" không ghi đè
ALTER TABLE employees ADD COLUMN IF NOT EXISTS type_locked boolean NOT NULL DEFAULT false;
-- v6.15: nhóm tính phụ cấp (đêm / sửa chữa… hưởng % khác nhau theo nhóm đối tượng) — phải có trước view v_employees
CREATE TABLE IF NOT EXISTS allowance_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, note text
);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS allowance_group_id uuid REFERENCES allowance_groups(id) ON DELETE SET NULL;
-- Chức danh sửa tay (tab Nhân sự): ưu tiên hơn chức danh tự động (Trưởng ca / ĐHV / theo SSO)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS title_manual text;
ALTER TABLE sheets ADD COLUMN IF NOT EXISTS print_title text;
ALTER TABLE sheets ADD COLUMN IF NOT EXISTS use_safety boolean NOT NULL DEFAULT false;
ALTER TABLE sheets ADD COLUMN IF NOT EXISTS use_labor boolean NOT NULL DEFAULT true;
-- Thứ tự in: HĐQT (I) → Ban kiểm soát (II) → Ban giám đốc (III) → các phòng/nhà máy theo thứ tự cấu hình
CREATE OR REPLACE FUNCTION dept_order(dept uuid, so int) RETURNS int LANGUAGE sql STABLE AS $f$
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM department_sso_map m WHERE m.department_id=dept AND m.sso_department_id='role:HDQT') THEN 0
               WHEN EXISTS (SELECT 1 FROM department_sso_map m WHERE m.department_id=dept AND m.sso_department_id='role:BKS') THEN 1
               WHEN EXISTS (SELECT 1 FROM department_sso_map m WHERE m.department_id=dept AND m.sso_department_id='role:BGD') THEN 2 ELSE 3 END) * 100000 + LEAST(GREATEST(COALESCE(so,0),0),99999) $f$;
DROP VIEW IF EXISTS v_employees;
CREATE VIEW v_employees AS
SELECT e.*, COALESCE(e.override_department_id, e.mapped_department_id) AS department_id,
       d.name AS department_name, dept_order(d.id, d.sort_order) AS department_sort,
       s.id AS sheet_id, s.name AS sheet_name, g.id AS group_id, g.name AS group_name, g.kind AS group_kind,
       COALESCE(e.pay_department_id, e.override_department_id, e.mapped_department_id) AS pay_dept_id,
       pd.name AS pay_department_name, dept_order(pd.id, pd.sort_order) AS pay_department_sort,
       (CASE e.employee_type WHEN 'manager' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END) * 1000000 + COALESCE(e.shift_no,0) * 10000 + (CASE WHEN e.is_lead THEN 0 ELSE 1 END) * 1000 + e.pos_rank AS emp_order,
       pg.id AS pay_group_id, pg.name AS pay_group_name
FROM employees e
LEFT JOIN departments d ON d.id = COALESCE(e.override_department_id, e.mapped_department_id)
LEFT JOIN departments pd ON pd.id = COALESCE(e.pay_department_id, e.override_department_id, e.mapped_department_id)
LEFT JOIN sheets s ON s.id = d.sheet_id
LEFT JOIN groups g ON g.id = s.group_id
LEFT JOIN sheets ps ON ps.id = pd.sheet_id
LEFT JOIN groups pg ON pg.id = ps.group_id;

-- Phân quyền: 1 người - nhiều quyền - nhiều phạm vi
CREATE TABLE IF NOT EXISTS role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sso_user_id text NOT NULL, role text NOT NULL,
  scope_type text NOT NULL DEFAULT 'all' CHECK (scope_type IN ('all','group','sheet')),
  scope_id text NOT NULL DEFAULT '',
  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sso_user_id, role, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS attendance_codes (
  code text PRIMARY KEY, name text NOT NULL,
  work_value numeric(6,2) NOT NULL DEFAULT 1,
  color text NOT NULL DEFAULT '#e8f0fe',
  active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS meal_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS code_meals (
  code text NOT NULL REFERENCES attendance_codes(code) ON UPDATE CASCADE ON DELETE CASCADE,
  meal_type_id uuid NOT NULL REFERENCES meal_types(id) ON DELETE CASCADE,
  quantity numeric(6,2) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (code, meal_type_id)
);
CREATE TABLE IF NOT EXISTS meal_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_type_id uuid NOT NULL REFERENCES meal_types(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL, effective_from date NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now()
);

-- Kỳ chấm công = bảng chấm công x tháng
-- draft -> pending_l1 -> pending_l2 -> pending_l3 -> pending_dir -> locked
CREATE TABLE IF NOT EXISTS periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES sheets(id),
  year int NOT NULL, month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_l1','pending_l2','adjusting','pending_l3','pending_dir','locked')),
  submitted_by text, submitted_at timestamptz, l1_by text, l1_at timestamptz,
  received_by text, received_at timestamptz, final_by text, final_at timestamptz, note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, year, month)
);
CREATE TABLE IF NOT EXISTS period_employees (
  period_id uuid NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (period_id, employee_id)
);
CREATE TABLE IF NOT EXISTS attendance_entries (
  period_id uuid NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  day int NOT NULL CHECK (day BETWEEN 1 AND 31),
  code text NOT NULL REFERENCES attendance_codes(code) ON UPDATE CASCADE,
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period_id, employee_id, day)
);
CREATE TABLE IF NOT EXISTS attendance_original (
  period_id uuid NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL, day int NOT NULL, code text NOT NULL,
  PRIMARY KEY (period_id, employee_id, day)
);
CREATE TABLE IF NOT EXISTS meal_actual (
  period_id uuid NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  meal_type_id uuid NOT NULL REFERENCES meal_types(id),
  day int NOT NULL CHECK (day BETWEEN 1 AND 31),
  quantity numeric(6,2) NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (period_id, employee_id, meal_type_id, day)
);
CREATE TABLE IF NOT EXISTS attendance_changes (
  id bigserial PRIMARY KEY, period_id uuid NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  employee_id uuid, day int, field text NOT NULL DEFAULT 'code',
  old_value text, new_value text, stage text, changed_by text, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_att_changes_period ON attendance_changes(period_id, changed_at DESC);

-- Hệ số: loại cấu hình được; giá trị lưu theo lịch sử hiệu lực (chỉ thêm, không ghi đè)
CREATE TABLE IF NOT EXISTS coefficient_types (
  code text PRIMARY KEY, name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('insurance','bonus','amount')),
  active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS coefficient_history (
  id bigserial PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from date NOT NULL, vals jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text, created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coef_emp ON coefficient_history(employee_id, effective_from DESC, id DESC);
CREATE TABLE IF NOT EXISTS company_params (
  id bigserial PRIMARY KEY, key text NOT NULL, value numeric(16,4) NOT NULL,
  effective_from date NOT NULL, note text, created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE company_params ADD COLUMN IF NOT EXISTS employee_type text;
CREATE TABLE IF NOT EXISTS unit_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  employee_type text CHECK (employee_type IN ('manager','admin','worker')),
  amount numeric(14,2) NOT NULL, effective_from date NOT NULL, note text, created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deduction_types (
  code text PRIMARY KEY, name text NOT NULL,
  calc text NOT NULL CHECK (calc IN ('pct_insurance','fixed')),
  value numeric(14,4) NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS monthly_items (
  id bigserial PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id),
  year int NOT NULL, month int NOT NULL, kind text NOT NULL CHECK (kind IN ('bonus','deduction')),
  label text NOT NULL, amount numeric(16,2) NOT NULL CHECK (amount >= 0),
  created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_month ON monthly_items(year, month, employee_id);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id), year int NOT NULL, month int NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','pending_dir','locked')),
  standard_days numeric(5,2) NOT NULL DEFAULT 26,
  stale boolean NOT NULL DEFAULT false, calculated_at timestamptz, calculated_by text,
  submitted_by text, submitted_at timestamptz, locked_by text, locked_at timestamptz,
  signed_by text, signed_at timestamptz, note text,
  UNIQUE (group_id, year, month)
);
CREATE TABLE IF NOT EXISTS payroll_lines (
  run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  work_days numeric(8,2) NOT NULL DEFAULT 0,
  insurance_salary numeric(16,2) NOT NULL DEFAULT 0, bonus numeric(16,2) NOT NULL DEFAULT 0,
  allowance numeric(16,2) NOT NULL DEFAULT 0, meal_amount numeric(16,2) NOT NULL DEFAULT 0,
  deduction numeric(16,2) NOT NULL DEFAULT 0, net numeric(16,2) NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, employee_id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY, actor text, actor_name text, action text NOT NULL,
  entity text, entity_id text, detail jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);

-- ===== Dữ liệu mặc định (không ghi đè) =====
INSERT INTO settings(key,value,note) VALUES
 ('company_name','SBM','Tên hiển thị'),
 ('year_min','','Năm nhỏ nhất trong danh sách chọn (trống = tự động theo dữ liệu)'),
 ('year_max','','Năm lớn nhất trong danh sách chọn (trống = tự động: năm hiện tại + 10, luôn trượt theo thời gian)'),
 ('standard_days','26','Số ngày công chuẩn mặc định của tháng'),
 ('meal_in_net','true','Cộng tiền ăn vào thực lĩnh'),
 ('require_l1','true','Bắt buộc cấp 1 duyệt trước khi gửi văn phòng')
ON CONFLICT (key) DO NOTHING;
INSERT INTO attendance_codes(code,name,work_value,color,sort_order) VALUES
 ('K1','K1 (cả ngày)',1,'#dcfce7',10),('K2','K2',1,'#dcfce7',20),('K3','K3',1,'#dcfce7',30),
 ('K1,3','K1,3',1,'#dcfce7',40),('K4','K4',1,'#dcfce7',50),('K5','K5',1,'#dcfce7',60),
 ('NB','Nghỉ bù',1,'#e0f2fe',70),('CT','Công tác',1,'#e0f2fe',80),('LT','Làm thêm',1,'#fef9c3',90),
 ('P','Nghỉ phép',1,'#e0f2fe',100),('OM','Ốm',0,'#fee2e2',110),('KL','Không lương',0,'#fee2e2',120)
ON CONFLICT (code) DO NOTHING;
INSERT INTO meal_types(code,name,sort_order) VALUES ('AN_CA','Ăn ca',10) ON CONFLICT (code) DO NOTHING;
INSERT INTO coefficient_types(code,name,kind,sort_order) VALUES
 ('bhxh','Hệ số đóng bảo hiểm','insurance',10),('chuc_vu','Hệ số chức vụ','bonus',20),
 ('tham_nien','Hệ số thâm niên','bonus',30),('ky_nang','Hệ số kỹ năng','bonus',40),
 ('kiem_nhiem','Hệ số kiêm nhiệm','bonus',50),('vung','Hệ số vùng','bonus',60),
 ('nha_may_lon','Hệ số nhà máy lớn','bonus',70),('thuong','Hệ số thưởng','bonus',75),
 ('khac','Hệ số khác','bonus',80),('an_toan','Phụ cấp an toàn (VND)','amount',90)
ON CONFLICT (code) DO NOTHING;
INSERT INTO deduction_types(code,name,calc,value,sort_order) VALUES
 ('bhxh','BHXH (người lao động 8%)','pct_insurance',8,10),
 ('bhyt','BHYT (người lao động 1,5%)','pct_insurance',1.5,20),
 ('bhtn','BHTN (người lao động 1%)','pct_insurance',1,30)
ON CONFLICT (code) DO NOTHING;

-- v6.1: ký hiệu công tách công ngày / công đêm (work_value = ngày + đêm); nới độ rộng số để tránh "numeric field overflow"
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS work_day numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS work_night numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE attendance_codes ALTER COLUMN work_value TYPE numeric(8,2);
ALTER TABLE code_meals ALTER COLUMN quantity TYPE numeric(8,2);
ALTER TABLE meal_actual ALTER COLUMN quantity TYPE numeric(8,2);
UPDATE attendance_codes SET work_day = work_value WHERE work_day = 0 AND work_night = 0 AND work_value > 0;

-- v6.2: người ký trên bảng in; tiền ăn ca theo ký hiệu công; khoản thưởng/trừ linh hoạt
ALTER TABLE groups ADD COLUMN IF NOT EXISTS signers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sheets ADD COLUMN IF NOT EXISTS signers jsonb NOT NULL DEFAULT '[]'::jsonb;
INSERT INTO settings(key, value) VALUES ('place','Hà Nội') ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS code_meal_prices (
  id bigserial PRIMARY KEY,
  code text NOT NULL REFERENCES attendance_codes(code) ON UPDATE CASCADE ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,          -- NULL = áp dụng chung
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  effective_from date NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmp_code ON code_meal_prices(code, effective_from);

ALTER TABLE monthly_items ADD COLUMN IF NOT EXISTS calc text NOT NULL DEFAULT 'fixed';      -- fixed | coef_price
ALTER TABLE monthly_items ADD COLUMN IF NOT EXISTS basis text;                              -- insurance | bonus (hệ số lấy làm gốc khi calc=coef_price)
ALTER TABLE monthly_items ADD COLUMN IF NOT EXISTS value numeric(16,4) NOT NULL DEFAULT 0;  -- đơn giá khi calc=coef_price
ALTER TABLE monthly_items DROP CONSTRAINT IF EXISTS monthly_items_kind_check;
ALTER TABLE monthly_items ADD CONSTRAINT monthly_items_kind_check CHECK (kind IN ('bonus','deduction','bonus_deduction'));
INSERT INTO deduction_types(code,name,calc,value,sort_order) VALUES ('kpcd','Kinh phí công đoàn 0,5%','pct_insurance',0.5,40) ON CONFLICT (code) DO NOTHING;
-- Cho phép bộ phận chưa gán bảng chấm công / bảng chấm công chưa gán bảng lương (cấu hình linh hoạt)
ALTER TABLE departments ALTER COLUMN sheet_id DROP NOT NULL;
ALTER TABLE sheets ALTER COLUMN group_id DROP NOT NULL;

-- v6.4: xếp loại an toàn / lao động theo từng kỳ chấm công
CREATE TABLE IF NOT EXISTS labor_grades (grade text PRIMARY KEY, factor numeric(6,3) NOT NULL DEFAULT 1, sort_order int NOT NULL DEFAULT 0);
INSERT INTO labor_grades(grade,factor,sort_order) VALUES ('A',1.1,1),('B',1,2),('C',0.8,3),('D',0.5,4),('E',0,5) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS safety_grades (grade text PRIMARY KEY, amount numeric(14,0) NOT NULL DEFAULT 0, sort_order int NOT NULL DEFAULT 0);
ALTER TABLE safety_grades ADD COLUMN IF NOT EXISTS factor numeric(6,3) NOT NULL DEFAULT 1;
-- v6.5: an toàn chỉ có A (hưởng 100% phụ cấp an toàn) và B (mất phụ cấp); chạy 1 lần
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='safety_v65') THEN
    DELETE FROM safety_grades WHERE grade='C';
    INSERT INTO safety_grades(grade,amount,factor,sort_order) VALUES ('A',0,1,1),('B',0,0,2) ON CONFLICT (grade) DO UPDATE SET factor=EXCLUDED.factor;
    INSERT INTO settings(key,value) VALUES ('safety_v65','1');
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS period_ratings (
  period_id uuid NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  safety text, labor text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period_id, employee_id)
);

-- v6.8: chức danh hiển thị ở nhà máy (Trưởng phòng -> Giám đốc nhà máy ...); để trống = giữ nguyên
INSERT INTO settings(key,value) VALUES ('plant_title_head','Giám đốc NM'),('plant_title_deputy','P. Giám đốc NM') ON CONFLICT (key) DO NOTHING;
-- v6.23: phương pháp tính tiền làm lễ, làm thêm (A = Nghị định 145/2020, B = quy chế lương riêng); giữ B như đang dùng
INSERT INTO settings(key,value,note) VALUES ('premium_method','B','Phương pháp tính tiền làm lễ, làm thêm: A = Nghị định 145/2020/NĐ-CP, B = quy chế lương riêng') ON CONFLICT (key) DO NOTHING;

-- v6.10: quy trình mới (cấp 1 → cấp 2 → cấp 3 → Giám đốc). Mở rộng ràng buộc trạng thái; "adjusting" cũ gộp vào "pending_l2".
ALTER TABLE periods DROP CONSTRAINT IF EXISTS periods_status_check;
ALTER TABLE periods ADD CONSTRAINT periods_status_check CHECK (status IN ('draft','pending_l1','pending_l2','adjusting','pending_l3','pending_dir','locked'));
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_status_check CHECK (status IN ('draft','submitted','pending_dir','locked'));
UPDATE periods SET status='pending_l2' WHERE status='adjusting';

-- ===== v6.13: năm động, bậc lương bảo hiểm =====
-- Một lần: chuyển năm nhỏ nhất/lớn nhất sang chế độ tự động (trước đây là số cố định theo năm cài đặt, ví dụ 2036)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='year_auto_v613') THEN
    UPDATE settings SET value='' WHERE key IN ('year_min','year_max');
    INSERT INTO settings(key,value,note) VALUES('year_auto_v613','1','Đã chuyển năm hiển thị sang tự động');
  END IF;
END $$;
ALTER TABLE coefficient_history ADD COLUMN IF NOT EXISTS grade_scale text;
ALTER TABLE coefficient_history ADD COLUMN IF NOT EXISTS grade int;
-- Thang bậc lương BH: mỗi (thang, bậc) có hệ số và số tháng giữ bậc trước khi được xét lên bậc kế
CREATE TABLE IF NOT EXISTS salary_grades (
  scale text NOT NULL, grade int NOT NULL, coefficient numeric(10,4) NOT NULL DEFAULT 0,
  months_to_next int CHECK (months_to_next IS NULL OR months_to_next > 0), note text,
  PRIMARY KEY (scale, grade)
);

-- ===== v6.14: công chuẩn theo lịch nghỉ + ngày lễ, công tối thiểu, tăng ca =====
-- Ngày nghỉ lễ của công ty (kể cả ngày nghỉ bù, nhập như một ngày lễ). Trùng ngày nghỉ hằng tuần chỉ tính 1 ngày nghỉ.
CREATE TABLE IF NOT EXISTS holidays (
  id bigserial PRIMARY KEY, hdate date NOT NULL UNIQUE, name text NOT NULL DEFAULT '',
  created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
-- Quy tắc theo phạm vi (bảng lương / phòng / loại nhân sự; để trống = áp dụng rộng hơn). Quy tắc cụ thể nhất thắng: phòng > bảng lương > loại nhân sự > mặc định.
CREATE TABLE IF NOT EXISTS schedule_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  employee_type text CHECK (employee_type IN ('manager','admin','worker')),
  weekly_off text NOT NULL DEFAULT 'sun' CHECK (weekly_off IN ('sun','sat_sun')),
  min_mode text NOT NULL DEFAULT 'equal' CHECK (min_mode IN ('equal','fixed','minus','pct')),   -- công tối thiểu: = công chuẩn | số cố định | công chuẩn − N | N% công chuẩn
  min_value numeric(8,2) NOT NULL DEFAULT 0,
  ot_salary numeric(6,2) NOT NULL DEFAULT 1, ot_bonus numeric(6,2) NOT NULL DEFAULT 1,           -- hệ số tăng ca cho phần công vượt công chuẩn (lương / thưởng)
  note text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_rules_scope ON schedule_rules ((coalesce(group_id::text,'')), (coalesce(department_id::text,'')), (coalesce(employee_type,'')));
-- Quy tắc mẫu (chỉ khi chưa có quy tắc nào): Quản lý nghỉ T7 + CN, Công nhân nghỉ CN. Không có quy tắc khớp = nghỉ CN, công tối thiểu bằng công chuẩn.
INSERT INTO schedule_rules(employee_type, weekly_off, min_mode, note) SELECT 'manager', 'sat_sun', 'equal', 'Khối văn phòng + giám đốc/phó giám đốc nhà máy'
  WHERE NOT EXISTS (SELECT 1 FROM schedule_rules);
INSERT INTO schedule_rules(employee_type, weekly_off, min_mode, note) SELECT 'worker', 'sun', 'equal', 'Khối công nhân'
  WHERE NOT EXISTS (SELECT 1 FROM schedule_rules WHERE employee_type='worker') AND EXISTS (SELECT 1 FROM schedule_rules WHERE employee_type='manager' AND note='Khối văn phòng + giám đốc/phó giám đốc nhà máy');
-- Số công chuẩn nhập tay (ghi đè cho cả bảng lương); trống = tự tính theo lịch nghỉ + ngày lễ
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS std_override numeric(5,2);
-- Ký hiệu nghỉ hưởng lương (Nghỉ bù, Phép): vào ngày nghỉ hằng tuần / ngày lễ thì không cộng công (vì ngày đó đã được trừ khỏi công chuẩn)
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS off_day_zero boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='v614_offday_codes') THEN
    UPDATE attendance_codes SET off_day_zero=true WHERE code IN ('NB','P');
    INSERT INTO settings(key,value,note) VALUES('v614_offday_codes','1','Đã đặt NB, P là ký hiệu nghỉ hưởng lương');
  END IF;
END $$;

-- ===== v6.15: % hưởng theo ngày lễ, theo ký hiệu công / nhóm phụ cấp; tách lương làm đêm, làm thêm, làm lễ =====
-- Làm vào ngày lễ / nghỉ bù được hưởng bao nhiêu % so với một ngày công tiêu chuẩn (mặc định 100; vd 400)
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS pay_pct numeric(7,2) NOT NULL DEFAULT 100;
-- Ký hiệu công thuộc nhóm 'night' (phụ cấp làm đêm, tính trên công đêm) hoặc 'extra' (làm thêm / sửa chữa…, tính trên toàn bộ công của ký hiệu); NULL = không tăng
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS pct_kind text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attendance_codes_pct_kind_chk') THEN
    ALTER TABLE attendance_codes ADD CONSTRAINT attendance_codes_pct_kind_chk CHECK (pct_kind IS NULL OR pct_kind IN ('night','extra'));
  END IF;
END $$;
-- % hưởng của ký hiệu so với công tiêu chuẩn (vd 130, 135), theo nhóm phụ cấp; nhóm trống = áp dụng mọi nhóm chưa có dòng riêng; không có dòng = 100%
CREATE TABLE IF NOT EXISTS code_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL REFERENCES attendance_codes(code) ON UPDATE CASCADE ON DELETE CASCADE,
  allowance_group_id uuid REFERENCES allowance_groups(id) ON DELETE CASCADE,
  pct numeric(7,2) NOT NULL CHECK (pct >= 0 AND pct <= 2000)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_code_pay_rates ON code_pay_rates (code, (coalesce(allowance_group_id::text,'')));
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS night_salary numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS night_bonus numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS extra_salary numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS extra_bonus numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS holiday_salary numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS holiday_bonus numeric(16,2) NOT NULL DEFAULT 0;
-- Lương nháp tạm tính khi còn bảng chấm công chưa được cấp 2 nhận
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS provisional_note text;

-- ===== v6.16: công thường / làm thêm (LT), phạm vi lương-thưởng của ký hiệu, công tối thiểu theo nhóm trực ca kíp =====
-- Đơn giá ngày chia cho: công tiêu chuẩn (khối quản lý) hoặc công tối thiểu (công nhân trực ca kíp)
ALTER TABLE schedule_rules ADD COLUMN IF NOT EXISTS rate_basis text NOT NULL DEFAULT 'standard';
ALTER TABLE schedule_rules DROP CONSTRAINT IF EXISTS schedule_rules_rate_basis_check;
ALTER TABLE schedule_rules ADD CONSTRAINT schedule_rules_rate_basis_check CHECK (rate_basis IN ('standard','min'));
-- min_mode thêm 'group_min': công tối thiểu = số công của kíp thấp nhất trong nhóm công nhân trực của bảng lương
ALTER TABLE schedule_rules DROP CONSTRAINT IF EXISTS schedule_rules_min_mode_check;
ALTER TABLE schedule_rules ADD CONSTRAINT schedule_rules_min_mode_check CHECK (min_mode IN ('equal','fixed','minus','pct','group_min'));
-- Ký hiệu công: tính cho lương / thưởng / cả hai; ký hiệu làm thêm (LT…) không tính vào công thường mà tính riêng
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS pay_scope text NOT NULL DEFAULT 'both';
ALTER TABLE attendance_codes DROP CONSTRAINT IF EXISTS attendance_codes_pay_scope_check;
ALTER TABLE attendance_codes ADD CONSTRAINT attendance_codes_pay_scope_check CHECK (pay_scope IN ('both','salary','bonus','none'));   -- v6.20: thêm 'none' (không tính lương)
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS is_ot boolean NOT NULL DEFAULT false;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS min_info jsonb;
-- Cài đặt mẫu một lần theo mô tả của công ty (sửa được ở Cấu hình › Ký hiệu công và Công chuẩn)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='v616_seed') THEN
    UPDATE attendance_codes SET pay_scope='salary' WHERE code='P';
    INSERT INTO attendance_codes(code, name, work_value, work_day, work_night, color, sort_order)
      SELECT 'LT3', 'Làm thêm ngày lễ ban ngày', 1, 1, 0, '#fef9c3', 90 WHERE NOT EXISTS (SELECT 1 FROM attendance_codes WHERE code='LT3');
    INSERT INTO attendance_codes(code, name, work_value, work_day, work_night, color, sort_order)
      SELECT 'LT4', 'Làm thêm ngày lễ ban đêm', 1, 0, 1, '#fef9c3', 91 WHERE NOT EXISTS (SELECT 1 FROM attendance_codes WHERE code='LT4');
    UPDATE attendance_codes SET is_ot=true WHERE code IN ('LT','LT1','LT2','LT3','LT4');
    UPDATE attendance_codes SET pct_kind='night' WHERE code IN ('K3','K1,3') AND pct_kind IS NULL;
    UPDATE attendance_codes SET pct_kind='extra' WHERE code IN ('SC','SC1','SC2') AND pct_kind IS NULL;
    INSERT INTO code_pay_rates(code, allowance_group_id, pct)
      SELECT a.code, NULL, v.pct FROM attendance_codes a JOIN (VALUES ('K3',130),('K1,3',130),('SC1',135),('SC2',175.5),('LT1',150),('LT2',195),('LT3',300),('LT4',390)) AS v(code, pct) ON v.code=a.code
      WHERE NOT EXISTS (SELECT 1 FROM code_pay_rates r WHERE r.code=a.code);
    UPDATE schedule_rules SET min_mode='group_min', rate_basis='min', note=COALESCE(note,'') || ' (công tối thiểu = kíp thấp nhất)'
      WHERE employee_type='worker' AND group_id IS NULL AND department_id IS NULL AND min_mode='equal';
    INSERT INTO settings(key,value,note) VALUES('v616_seed','1','Đã cài mẫu % ký hiệu SC/LT/đêm, công nhân theo công tối thiểu nhóm trực');
  END IF;
END $$;
-- v6.16b: ký hiệu nghỉ vắng vào ngày trực theo lịch (vd NP) vẫn được tính là ngày trực khi xác định công tối thiểu của nhà máy
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS sched_day boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='v616b_seed') THEN
    UPDATE attendance_codes SET sched_day=true WHERE code IN ('NP','N','OM','KL');
    INSERT INTO settings(key,value,note) VALUES('v616b_seed','1','Ký hiệu nghỉ vắng (NP, N, OM, KL) tính là ngày trực khi lấy công tối thiểu');
  END IF;
END $$;
-- v6.16c: "công nghỉ" của ký hiệu = số công trực bị nghỉ (vd NP1 = 1, NP2 = 2). Dùng để đếm công tối thiểu của nhà máy; không cộng vào công của người nghỉ.
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS leave_value numeric(5,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='v616c_seed') THEN
    UPDATE attendance_codes SET leave_value=1 WHERE sched_day AND leave_value=0;
    INSERT INTO settings(key,value,note) VALUES('v616c_seed','1','sched_day chuyển thành leave_value (công nghỉ)');
  END IF;
END $$;
-- v6.17: hệ số hoàn thành kế hoạch (toàn công ty, theo tháng) và hệ số thưởng tự cộng
CREATE TABLE IF NOT EXISTS plan_factors (
  year int NOT NULL, month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  factor numeric(7,4) NOT NULL CHECK (factor >= 0 AND factor <= 10),
  note text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, month)
);
ALTER TABLE coefficient_types ADD COLUMN IF NOT EXISTS is_total boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='v617_seed') THEN
    IF NOT EXISTS (SELECT 1 FROM coefficient_types WHERE is_total) THEN UPDATE coefficient_types SET is_total=true WHERE code='thuong'; END IF;
    INSERT INTO settings(key,value,note) VALUES('v617_seed','1','Hệ số "thuong" là tổng tự cộng các hệ số thưởng khác');
  END IF;
END $$;
-- v6.17: phạm vi quyền theo phòng/bộ phận (chấm công) và các quyền cài đặt riêng
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid='role_assignments'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%scope_type%';
  IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE role_assignments DROP CONSTRAINT ' || quote_ident(c); END IF;
END $$;
ALTER TABLE role_assignments ADD CONSTRAINT role_assignments_scope_type_chk CHECK (scope_type IN ('all','group','sheet','department'));

-- v6.18: kiểu tính ăn ca theo từng bộ phận: auto = theo ký hiệu công; actual = chỉ theo bảng chấm ăn ca riêng; auto_wait = theo ký hiệu công + bảng chấm ăn chờ ca
ALTER TABLE departments ADD COLUMN IF NOT EXISTS meal_mode text NOT NULL DEFAULT 'auto';
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='departments'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%meal_mode%' LOOP
    EXECUTE 'ALTER TABLE departments DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;
ALTER TABLE departments ADD CONSTRAINT departments_meal_mode_chk CHECK (meal_mode IN ('auto','actual','auto_wait'));
ALTER TABLE meal_types ADD COLUMN IF NOT EXISTS is_wait boolean NOT NULL DEFAULT false;
INSERT INTO meal_types(code, name, sort_order, is_wait) VALUES ('CHO_CA', 'Ăn chờ ca', 20, true) ON CONFLICT (code) DO NOTHING;
-- v6.19: ảnh chụp trạng thái nhân sự trước mỗi lần lưu / áp dụng hàng loạt / tự nhận loại → cho phép "Hoàn tác"
CREATE TABLE IF NOT EXISTS employee_snapshots (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  actor_name text,
  rows jsonb NOT NULL,
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- v6.20: công không trả lương (pay_scope 'none') nhưng vẫn có thể tính ăn ca; bảng chấm ăn ca riêng / chờ ca chấm bằng ký hiệu công
-- Số suất ăn khi ký hiệu được chấm ở bảng chấm ăn ca riêng (Kiểu 2) / ăn chờ ca (Kiểu 3); 0 = ký hiệu không tính suất ăn
ALTER TABLE attendance_codes ADD COLUMN IF NOT EXISTS meal_qty numeric(5,2) NOT NULL DEFAULT 1;
ALTER TABLE meal_actual ADD COLUMN IF NOT EXISTS code text REFERENCES attendance_codes(code) ON UPDATE CASCADE ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='v620_seed') THEN
    -- Mặc định: ký hiệu đang có tiền ăn ca (Kiểu 1) = 1 suất; chưa cài tiền ăn nào thì ký hiệu có công = 1 suất
    IF EXISTS (SELECT 1 FROM code_meal_prices WHERE group_id IS NULL AND amount > 0) THEN
      UPDATE attendance_codes a SET meal_qty = CASE WHEN COALESCE((SELECT p.amount FROM code_meal_prices p WHERE p.code=a.code AND p.group_id IS NULL ORDER BY p.effective_from DESC, p.id DESC LIMIT 1), 0) > 0 THEN 1 ELSE 0 END;
    ELSE
      UPDATE attendance_codes SET meal_qty = CASE WHEN work_value > 0 AND NOT off_day_zero THEN 1 ELSE 0 END;
    END IF;
    INSERT INTO settings(key,value,note) VALUES('v620_seed','1','Suất ăn của ký hiệu công (bảng chấm ăn ca riêng/chờ ca) lấy theo ký hiệu đang có tiền ăn ca');
  END IF;
END $$;
-- v6.21: thêm loại nhân sự "Hành chính" (admin) bên cạnh Quản lý / Công nhân — có lương cơ sở, đơn giá, quy tắc công chuẩn riêng
DO $$ DECLARE t text; c text; BEGIN
  FOREACH t IN ARRAY ARRAY['employees','unit_prices','schedule_rules'] LOOP
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid=t::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%employee_type%' LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, c);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (employee_type IN (''manager'',''admin'',''worker''))', t, t || '_employee_type_chk');
  END LOOP;
END $$;
-- v6.22: chức danh ở nhà máy viết gọn "Giám đốc NM" / "P. Giám đốc NM" (một lần; chỉ đổi nếu vẫn là tên mặc định cũ)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='v622_titles') THEN
    UPDATE settings SET value='Giám đốc NM' WHERE key='plant_title_head' AND value='Giám đốc nhà máy';
    UPDATE settings SET value='P. Giám đốc NM' WHERE key='plant_title_deputy' AND value='P. Giám đốc nhà máy';
    INSERT INTO settings(key,value,note) VALUES('v622_titles','1','Đổi chức danh nhà máy sang Giám đốc NM / P. Giám đốc NM');
  END IF;
END $$;
