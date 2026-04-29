# K12 AI 课堂平台需求文档（基于 SiliconFlow）

## 1. 项目目标
- 面向中小学课堂，建设一个类似通用 AI 门户的网站，底层接入 `SiliconFlow`，统一提供多模型能力。
- 核心场景为“教师带班使用”：教师注册后可创建班级，并一次性发放 50 个学生可用账号（可扩容）。
- 学生端登录不依赖手机号验证码，改为“教师预置验证码 / 登录码”机制。

## 2. 用户角色与权限
- 教师账号（主账号）
  - 注册、实名认证（可选）
  - 创建班级、生成学生席位
  - 批量导入学生、重置学生登录码、冻结/解冻账号
  - 配置可用 AI 功能、模型白名单、内容安全等级
  - 查看班级用量、日志、作业记录（可选）
- 学生账号（子账号）
  - 使用教师授权的 AI 功能（文本/图片等）
  - 无法自行修改班级策略
  - 可通过登录码/验证码进入，不绑定手机号
- 学校管理员（可选）
  - 管理多个教师和班级
  - 统一计费、统一审计

## 3. 核心业务机制（账号与验证码）

### 3.1 关键概念
- `Class`：班级实体，归属某位教师。
- `Seat`：班级席位（默认 50 个）。
- `StudentAccount`：学生子账号，绑定到 `Seat`。
- `ClassJoinCode`（课程唯一码）：用于“加入某个班级”的短期通行码。
- `StudentLoginCode`（学生登录码）：用于学生账号登录的静态或轮换码。
- `TeacherVerificationCode`（教师预置验证码）：教师侧配置的二次校验码（非短信）。

### 3.2 推荐注册/登录流程
1. 教师注册并创建班级。
2. 系统为班级创建 50 个席位（可选自动生成 50 个学生账号，或按需激活）。
3. 教师选择发放方式：
   - 模式 A：发放 `ClassJoinCode`，学生先“加入班级”，再领取席位。
   - 模式 B：直接发放“学生编号 + StudentLoginCode”。
4. 学生登录页支持两种入口：
   - 入口 1：`班级编号 + 学生编号 + 登录码`
   - 入口 2：`ClassJoinCode + TeacherVerificationCode`（首次加入）
5. 首次登录后可要求学生修改为个人密码（可选，建议开启）。

### 3.3 安全策略（无手机号前提）
- 登录码默认高强度随机（8~12 位，字母数字混合）。
- `ClassJoinCode` 设置有效期（如 24 小时）+ 使用次数上限（如 50 次）。
- 教师可一键轮换验证码；轮换后旧码立即失效。
- 限制错误次数（如 5 次锁定 15 分钟）防止暴力尝试。
- 异常登录告警（异地、短时间多次失败）。
- 教师端提供“批量重置学生码”与“单个禁用”。

## 4. 功能范围（MVP -> V1）

### 4.1 教师端 MVP
- 教师注册/登录
- 创建班级、默认 50 席位
- 批量生成学生账号与登录码（导出打印）
- 配置班级验证码与课程唯一码
- 学生管理（重置、冻结、删除）
- 基础用量看板（调用次数、Token、图片生成次数）

### 4.2 学生端 MVP
- 通过登录码/验证码登录
- AI 对话（文本模型）
- 图片生成（文生图）
- 历史记录查看（班级内隔离）

### 4.3 AI 能力接口（基于 SiliconFlow）
- 文本能力：
  - 通用问答、写作辅助、改写、翻译、代码解释
- 图像能力：
  - 文生图、基础参数控制（尺寸、风格、数量）
- 可扩展能力（V1+）：
  - 语音识别/语音合成
  - 多模态问答（图文）
  - 视频生成（按模型可用性）

## 5. 系统架构建议
- 前端：
  - Web（教师端 + 学生端）
- 后端：
  - 认证中心（教师、学生、班级码、验证码）
  - 班级与席位服务（Class/Seat）
  - AI 网关服务（统一转发到 SiliconFlow）
  - 用量计费与限流服务
  - 审计与内容安全服务
- 数据层：
  - MySQL/PostgreSQL（账号、班级、日志）
  - Redis（验证码、限流、会话）

## 6. 并发与扩容设计（重点：50 人同时可用）
- 班级粒度默认并发目标：`50` 人同时在线调用。
- 配额设计建议：
  - 每班每分钟请求上限（RPM）
  - 每班每天 Token 上限
  - 每班每天图片生成额度
- 峰值治理：
  - 请求队列 + 超时降级（优先保证文本对话）
  - 图片任务异步化（排队状态可见）
  - 按班级进行公平调度，避免个别学生占满资源
- 扩容策略：
  - 50 -> 100/150 席位按包升级
  - 采用“席位包 + 用量包”组合计费

## 7. 数据模型（简化）
- `teachers(id, email, password_hash, school_name, status, created_at)`
- `classes(id, teacher_id, name, grade, seat_limit, join_code, join_code_expire_at, created_at)`
- `students(id, class_id, seat_no, display_name, login_code_hash, must_reset_password, status)`
- `class_verification_codes(id, class_id, code_hash, version, expire_at, status)`
- `ai_usage_logs(id, class_id, student_id, model, endpoint_type, tokens_in, tokens_out, image_count, created_at)`
- `safety_events(id, class_id, student_id, risk_type, payload_ref, action, created_at)`

## 8. 关键接口清单（示例）
- 账号与班级
  - `POST /api/teacher/register`
  - `POST /api/teacher/login`
  - `POST /api/classes`
  - `POST /api/classes/{id}/seats/generate`
  - `POST /api/classes/{id}/codes/rotate`
- 学生接入
  - `POST /api/student/join-by-class-code`
  - `POST /api/student/login-by-code`
  - `POST /api/student/reset-password`
- AI 网关
  - `POST /api/ai/chat/completions`
  - `POST /api/ai/images/generations`
  - `GET /api/ai/models`

## 9. 风险与合规（中小学场景）
- 未成年人内容安全与敏感话题拦截（多级过滤）。
- 教师可配置“严格模式”（禁用高风险模型/功能）。
- 对话与生成内容保留周期可配置，默认最小化存储。
- 明确课堂用途的用户协议与隐私政策。

## 10. 竞品与参考设计

### 10.1 教育产品侧（课堂账号机制）
- `SchoolAI / Edcafe` 类产品：常见做法是“教师创建体验 + 学生邀请码/链接加入”，减少学生注册成本。
- `Google Classroom` 生态：班级码加入机制成熟，适合借鉴“班级码 + 角色权限”。
- `Code.org`：教师组织课堂和学生批量接入流程清晰，适合借鉴教学管理流程。

### 10.2 AI 平台侧（多模型接口机制）
- `SiliconFlow`：统一 API 聚合多种模型，适合做你平台的核心推理层。
- 可参考同类聚合层产品（如 `OpenRouter`、`Vercel AI Gateway`）：
  - 统一模型目录
  - 统一鉴权
  - 模型路由与失败重试
  - 用量统计与成本透明化

### 10.3 可直接借鉴的产品设计原则
- 学生“低门槛接入”：无手机号、短路径登录。
- 教师“高控制权”：席位、验证码、功能开关、审计统一管理。
- 系统“可扩展”：班级席位、配额、模型能力均可按包扩展。

## 11. 建议的分期路线图
- `Phase 1 (2~4 周)`: 账号体系 + 班级 50 席位 + 文本/图片 AI + 基础日志
- `Phase 2 (3~5 周)`: 班级配额、异步队列、内容安全策略、教师看板增强
- `Phase 3 (4~8 周)`: 多学校管理、计费体系、更多多模态能力

## 12. 你可以下一步直接确认的决策
- 学生首次登录后是否必须改密码？
- 班级码有效期默认值（24h / 7d / 永久）？
- 50 席位是固定免费，还是按套餐售卖？
- 图片生成功能是否默认对学生开放？
- 是否需要“学校管理员”角色在 V1 就上线？

## 13. 竞品最佳实践（可直接落地）

### 13.1 学生接入与班级码（参考 Google Classroom / SchoolAI）
- 提供三种并行接入方式，降低课堂故障率：
  - `班级码加入`（主路径）
  - `教师邀请链接`（备用路径）
  - `教师批量导入后发放登录码`（机房/统一上机场景）
- 班级码设计规范：
  - 长度 6~8 位，字母数字组合，避免特殊字符（降低输入错误）
  - 支持一键重置班级码（“锁门”能力）
  - 班级码仅首次加入使用；加入后不再重复输入
- 课堂防串班：
  - 教师端显示“待确认加入名单”，确认后才激活学生席位
  - 开启“班级码失效时间 + 最大加入人数”双阈值

### 13.2 教师控制台（参考 SchoolAI Mission Control）
- 增加“课堂实时面板”：
  - 当前在线人数、请求峰值、失败率
  - 学生活跃度分布（静默、正常、异常频繁）
  - 风险事件实时提醒（暴力/自伤/欺凌/违规内容）
- 教师干预动作：
  - 一键暂停某学生 AI 权限（冷却 10~30 分钟）
  - 一键切换“考试模式”（禁图像、禁开放问答，仅保留指定任务）
  - 一键切换“严格模式”（仅白名单模型可用）

### 13.3 学生安全与内容治理（参考 MagicSchool Safety Loop）
- 建立三段式安全回路：
  1. 输入前：提示词预过滤（敏感词、越权请求、人格陪伴风险）
  2. 输出后：结果审查（不当建议、偏见、年龄不适配）
  3. 运营侧：周期评测（每周回放样本 + 规则迭代）
- 年龄分层策略：
  - 小学默认更严格（短回答、禁复杂社会敏感主题）
  - 初中可开放更多推理与创作能力，但保留审查
- 数据与隐私策略：
  - 默认不将学生内容用于模型训练（合同与隐私条款明确）
  - 教师可配置“会话保留天数”（如 7/30/90 天）

### 13.4 AI 网关可靠性（参考 OpenRouter Fallback 思路）
- 模型回退链（强烈建议）：
  - 主模型失败时自动回退到备选模型（按优先级列表）
  - 响应中记录最终命中模型，保证审计可追踪
- 按任务类型路由：
  - 课堂问答 -> 低延迟模型
  - 作文批改 -> 高质量推理模型
  - 图片生成 -> 异步任务模型池
- 失败与超时策略：
  - 设置统一超时（如 12s）
  - 超时后自动降级为“简版回答”或“排队提示”

### 13.5 成本与配额治理（教育产品高频痛点）
- 三层限流：
  - 每学生：每分钟请求数
  - 每班级：每分钟 Token 与图片次数
  - 每教师/学校：每日预算上限
- 可视化成本看板：
  - 每班今日成本、近 7 天趋势、异常突增告警
  - Top 消耗学生与 Top 消耗功能
- 成本优化动作：
  - 相同问题短期缓存（课堂重复问答）
  - 长上下文自动裁剪
  - 图片任务默认单图，教师可按任务解锁多图

## 14. 建议新增的“产品级默认配置”
- `默认席位`：50
- `班级码有效期`：24 小时
- `班级码最大激活次数`：50
- `登录失败锁定`：5 次失败锁定 15 分钟
- `单学生限流`：10 请求/分钟
- `班级限流`：120 请求/分钟
- `图片额度`：每班每日 100 张（可调）
- `回退模型链`：至少 1 主 + 2 备
- `内容安全`：默认开启（不可关闭，仅可调等级）
- `日志保留`：30 天（可按学校套餐调整）

## 15. 参考来源（本轮调研）
- Google Classroom 帮助中心（班级码加入机制）：
  - [Join a class with a class code](https://support.google.com/edu/classroom/answer/6020297?hl=en)
- SchoolAI 官网（Space code、教师实时监控、学生安全定位）：
  - [SchoolAI](https://schoolai.com/)
- MagicSchool（Student AI Safety Loop）：
  - [Student AI Safety Loop](https://www.magicschool.ai/blog-posts/student-ai-safety-loop)
- OpenRouter 文档（模型回退与路由）：
  - [Model Fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)
  - [Provider Selection](https://openrouter.ai/docs/guides/routing/provider-selection)

## 16. Exact DB Schema（SQL，PostgreSQL 版本）

```sql
-- =========================================================
-- K12 AI Classroom Platform - PostgreSQL Schema (V1)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------
-- 0) enums
-- -----------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('active', 'locked', 'disabled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_status') THEN
    CREATE TYPE class_status AS ENUM ('active', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seat_status') THEN
    CREATE TYPE seat_status AS ENUM ('empty', 'assigned', 'disabled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'code_status') THEN
    CREATE TYPE code_status AS ENUM ('active', 'expired', 'revoked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'endpoint_type') THEN
    CREATE TYPE endpoint_type AS ENUM ('chat', 'image', 'audio', 'video');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'safety_action') THEN
    CREATE TYPE safety_action AS ENUM ('allow', 'block', 'review');
  END IF;
END$$;

-- -----------------------------
-- 1) schools / teachers
-- -----------------------------
CREATE TABLE IF NOT EXISTS schools (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(120) NOT NULL,
  district_name     VARCHAR(120),
  contact_email     VARCHAR(120),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teachers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                   UUID REFERENCES schools(id) ON DELETE SET NULL,
  email                       VARCHAR(120) NOT NULL UNIQUE,
  password_hash               TEXT NOT NULL,
  full_name                   VARCHAR(80) NOT NULL,
  status                      user_status NOT NULL DEFAULT 'active',
  timezone                    VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  failed_login_attempts       INT NOT NULL DEFAULT 0,
  locked_until                TIMESTAMPTZ,
  last_login_at               TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------
-- 2) classes / seats / students
-- -----------------------------
CREATE TABLE IF NOT EXISTS classes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id                  UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  school_id                   UUID REFERENCES schools(id) ON DELETE SET NULL,
  class_name                  VARCHAR(100) NOT NULL,
  grade_level                 VARCHAR(20), -- e.g. primary_5 / junior_2
  status                      class_status NOT NULL DEFAULT 'active',
  seat_limit                  INT NOT NULL DEFAULT 50 CHECK (seat_limit > 0 AND seat_limit <= 500),
  strict_mode                 BOOLEAN NOT NULL DEFAULT FALSE,
  exam_mode                   BOOLEAN NOT NULL DEFAULT FALSE,
  daily_token_quota           BIGINT NOT NULL DEFAULT 2000000,
  daily_image_quota           INT NOT NULL DEFAULT 100,
  rpm_quota                   INT NOT NULL DEFAULT 120,
  join_code                   VARCHAR(16) NOT NULL,
  join_code_status            code_status NOT NULL DEFAULT 'active',
  join_code_expires_at        TIMESTAMPTZ NOT NULL,
  join_code_max_uses          INT NOT NULL DEFAULT 50,
  join_code_used_count        INT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (join_code)
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);

CREATE TABLE IF NOT EXISTS class_seats (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  seat_no                     INT NOT NULL CHECK (seat_no > 0),
  status                      seat_status NOT NULL DEFAULT 'empty',
  assigned_student_id         UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, seat_no)
);

CREATE INDEX IF NOT EXISTS idx_class_seats_class_id ON class_seats(class_id);

CREATE TABLE IF NOT EXISTS students (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  seat_id                     UUID UNIQUE REFERENCES class_seats(id) ON DELETE SET NULL,
  student_no                  VARCHAR(32) NOT NULL,     -- e.g. S001
  display_name                VARCHAR(80) NOT NULL,
  login_code_hash             TEXT NOT NULL,
  must_reset_password         BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash               TEXT,                     -- optional after first reset
  status                      user_status NOT NULL DEFAULT 'active',
  failed_login_attempts       INT NOT NULL DEFAULT 0,
  locked_until                TIMESTAMPTZ,
  last_login_at               TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, student_no)
);

CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);

-- -----------------------------
-- 3) class verification codes
-- -----------------------------
CREATE TABLE IF NOT EXISTS class_verification_codes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  code_hash                   TEXT NOT NULL,
  version                     INT NOT NULL DEFAULT 1,
  status                      code_status NOT NULL DEFAULT 'active',
  expires_at                  TIMESTAMPTZ,
  created_by_teacher_id       UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at                  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_class ON class_verification_codes(class_id, status);

-- -----------------------------
-- 4) sessions / auth audit
-- -----------------------------
CREATE TABLE IF NOT EXISTS auth_sessions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type                  VARCHAR(16) NOT NULL CHECK (actor_type IN ('teacher', 'student')),
  actor_id                    UUID NOT NULL,
  class_id                    UUID,
  refresh_token_hash          TEXT NOT NULL,
  ip                          INET,
  user_agent                  TEXT,
  expires_at                  TIMESTAMPTZ NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at                  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_actor ON auth_sessions(actor_type, actor_id);

CREATE TABLE IF NOT EXISTS auth_events (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type                  VARCHAR(16) NOT NULL CHECK (actor_type IN ('teacher', 'student', 'anonymous')),
  actor_id                    UUID,
  class_id                    UUID,
  event_type                  VARCHAR(40) NOT NULL, -- login_success/login_failed/join_failed/locked
  ip                          INET,
  user_agent                  TEXT,
  detail                      JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_events_class_time ON auth_events(class_id, created_at DESC);

-- -----------------------------
-- 5) ai routing / usage / costs
-- -----------------------------
CREATE TABLE IF NOT EXISTS ai_model_policies (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  endpoint                    endpoint_type NOT NULL,
  primary_model               VARCHAR(120) NOT NULL,
  fallback_models             JSONB NOT NULL DEFAULT '[]'::jsonb, -- ordered array
  max_timeout_ms              INT NOT NULL DEFAULT 12000,
  enabled                     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, endpoint)
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id                  VARCHAR(64) NOT NULL UNIQUE,
  class_id                    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id                  UUID REFERENCES students(id) ON DELETE SET NULL,
  teacher_id                  UUID REFERENCES teachers(id) ON DELETE SET NULL,
  endpoint                    endpoint_type NOT NULL,
  selected_model              VARCHAR(120) NOT NULL,
  fallback_used               BOOLEAN NOT NULL DEFAULT FALSE,
  provider                    VARCHAR(80),
  prompt_tokens               INT NOT NULL DEFAULT 0,
  completion_tokens           INT NOT NULL DEFAULT 0,
  image_count                 INT NOT NULL DEFAULT 0,
  latency_ms                  INT,
  status_code                 INT,
  cost_cny                    NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_class_time ON ai_usage_logs(class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_student_time ON ai_usage_logs(student_id, created_at DESC);

-- -----------------------------
-- 6) safety
-- -----------------------------
CREATE TABLE IF NOT EXISTS safety_events (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id                  UUID REFERENCES students(id) ON DELETE SET NULL,
  endpoint                    endpoint_type NOT NULL,
  risk_type                   VARCHAR(50) NOT NULL, -- bullying/self_harm/violence/sexual/etc.
  risk_score                  NUMERIC(5,2) NOT NULL,
  action                      safety_action NOT NULL,
  request_ref                 VARCHAR(64),
  evidence                    JSONB,
  reviewed_by_teacher_id      UUID REFERENCES teachers(id) ON DELETE SET NULL,
  reviewed_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_class_time ON safety_events(class_id, created_at DESC);

-- -----------------------------
-- 7) quota snapshots
-- -----------------------------
CREATE TABLE IF NOT EXISTS class_daily_quota_usage (
  class_id                    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  usage_date                  DATE NOT NULL,
  token_used                  BIGINT NOT NULL DEFAULT 0,
  image_used                  INT NOT NULL DEFAULT 0,
  request_used                INT NOT NULL DEFAULT 0,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_id, usage_date)
);

-- -----------------------------
-- 8) trigger: auto update updated_at
-- -----------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_teachers_updated_at') THEN
    CREATE TRIGGER trg_teachers_updated_at BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_schools_updated_at') THEN
    CREATE TRIGGER trg_schools_updated_at BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_classes_updated_at') THEN
    CREATE TRIGGER trg_classes_updated_at BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_class_seats_updated_at') THEN
    CREATE TRIGGER trg_class_seats_updated_at BEFORE UPDATE ON class_seats FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_students_updated_at') THEN
    CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_model_policies_updated_at') THEN
    CREATE TRIGGER trg_model_policies_updated_at BEFORE UPDATE ON ai_model_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
```

## 17. API Request/Response Contracts（V1）

### 17.1 通用约定
- Base URL: `/api/v1`
- Auth:
  - 教师：`Authorization: Bearer <teacher_access_token>`
  - 学生：`Authorization: Bearer <student_access_token>`
- 通用响应结构：
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_20260428_xxx",
  "data": {}
}
```
- 通用错误结构：
```json
{
  "code": "AUTH_INVALID_CODE",
  "message": "Login code is invalid",
  "requestId": "req_20260428_xxx",
  "details": {}
}
```

### 17.2 教师认证与班级管理

#### 1) 教师注册
- `POST /api/v1/teacher/register`
Request:
```json
{
  "email": "teacher@school.edu",
  "password": "StrongPwd!123",
  "fullName": "Li Hua",
  "schoolName": "No.1 Middle School"
}
```
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "teacherId": "b53c5d6b-8d8b-4eee-91e0-2bcd6f9e5fd2"
  }
}
```

#### 2) 教师登录
- `POST /api/v1/teacher/login`
Request:
```json
{
  "email": "teacher@school.edu",
  "password": "StrongPwd!123"
}
```
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rft_xxx",
    "expiresIn": 7200,
    "teacher": {
      "id": "b53c5d6b-8d8b-4eee-91e0-2bcd6f9e5fd2",
      "fullName": "Li Hua"
    }
  }
}
```

#### 3) 创建班级（默认 50 席位）
- `POST /api/v1/classes`
Request:
```json
{
  "className": "Grade7-Class3",
  "gradeLevel": "junior_1",
  "seatLimit": 50
}
```
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "classId": "a2f9378f-b663-4c87-a53e-718ad43a2b53",
    "joinCode": "AB7K3Q",
    "joinCodeExpiresAt": "2026-04-29T14:00:00Z"
  }
}
```

#### 4) 批量生成学生账号
- `POST /api/v1/classes/{classId}/students/batch-generate`
Request:
```json
{
  "count": 50,
  "namingRule": "S{index}",
  "defaultPasswordResetRequired": true
}
```
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "generatedCount": 50,
    "students": [
      {
        "studentId": "f3e6...",
        "studentNo": "S001",
        "displayName": "Student S001",
        "initialLoginCode": "K9M2P8XQ"
      }
    ]
  }
}
```

#### 5) 轮换班级码 / 教师验证码
- `POST /api/v1/classes/{classId}/codes/rotate`
Request:
```json
{
  "rotateJoinCode": true,
  "rotateTeacherVerificationCode": true,
  "joinCodeExpiresInHours": 24
}
```
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "joinCode": "Q8L2W1",
    "joinCodeExpiresAt": "2026-04-29T14:00:00Z",
    "teacherVerificationCodeVersion": 3
  }
}
```

### 17.3 学生接入

#### 6) 学生通过班级码加入
- `POST /api/v1/student/join-by-class-code`
Request:
```json
{
  "joinCode": "AB7K3Q",
  "teacherVerificationCode": "TCH-6021",
  "displayName": "Wang Ming"
}
```
Response:
```json
{
  "code": "OK",
  "message": "joined",
  "requestId": "req_xxx",
  "data": {
    "classId": "a2f9378f-b663-4c87-a53e-718ad43a2b53",
    "studentId": "5d20...",
    "studentNo": "S018",
    "initialLoginCode": "D3P8KQ2V"
  }
}
```

#### 7) 学生登录（登录码）
- `POST /api/v1/student/login-by-code`
Request:
```json
{
  "classId": "a2f9378f-b663-4c87-a53e-718ad43a2b53",
  "studentNo": "S018",
  "loginCode": "D3P8KQ2V"
}
```
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rft_xxx",
    "expiresIn": 7200,
    "mustResetPassword": true,
    "student": {
      "id": "5d20...",
      "displayName": "Wang Ming",
      "classId": "a2f9378f-b663-4c87-a53e-718ad43a2b53"
    }
  }
}
```

#### 8) 学生首次改密（可选）
- `POST /api/v1/student/reset-password`
Request:
```json
{
  "oldLoginCode": "D3P8KQ2V",
  "newPassword": "MyClass@2026"
}
```
Response:
```json
{
  "code": "OK",
  "message": "password updated",
  "requestId": "req_xxx",
  "data": {
    "mustResetPassword": false
  }
}
```

### 17.4 AI 能力接口（网关）

#### 9) 获取班级可用模型列表
- `GET /api/v1/ai/models?endpoint=chat`
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "endpoint": "chat",
    "models": [
      {
        "id": "deepseek-v3",
        "displayName": "DeepSeek V3",
        "isPrimary": true
      },
      {
        "id": "qwen-plus",
        "displayName": "Qwen Plus",
        "isFallback": true
      }
    ]
  }
}
```

#### 10) 文本对话
- `POST /api/v1/ai/chat/completions`
Request:
```json
{
  "classId": "a2f9378f-b663-4c87-a53e-718ad43a2b53",
  "messages": [
    {"role": "system", "content": "You are a K12-safe assistant."},
    {"role": "user", "content": "Explain photosynthesis for Grade 6."}
  ],
  "stream": false
}
```
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "outputText": "Photosynthesis is how plants make food...",
    "model": "deepseek-v3",
    "fallbackUsed": false,
    "usage": {
      "promptTokens": 120,
      "completionTokens": 240
    },
    "safety": {
      "action": "allow",
      "riskScore": 0.02
    }
  }
}
```

#### 11) 图片生成
- `POST /api/v1/ai/images/generations`
Request:
```json
{
  "classId": "a2f9378f-b663-4c87-a53e-718ad43a2b53",
  "prompt": "A science classroom poster about the water cycle, cartoon style",
  "size": "1024x1024",
  "n": 1
}
```
Response:
```json
{
  "code": "OK",
  "message": "queued",
  "requestId": "req_xxx",
  "data": {
    "jobId": "img_job_73b2",
    "status": "processing",
    "estimatedSeconds": 8
  }
}
```

#### 12) 教师课堂监控数据
- `GET /api/v1/classes/{classId}/dashboard/realtime`
Response:
```json
{
  "code": "OK",
  "message": "success",
  "requestId": "req_xxx",
  "data": {
    "onlineStudents": 43,
    "rpmCurrent": 88,
    "errorRate": 0.01,
    "quota": {
      "dailyTokenUsed": 132000,
      "dailyTokenLimit": 2000000,
      "dailyImageUsed": 28,
      "dailyImageLimit": 100
    },
    "alerts": [
      {
        "type": "safety",
        "riskType": "bullying",
        "studentId": "5d20..."
      }
    ]
  }
}
```

### 17.5 建议错误码
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_ACCOUNT_LOCKED`
- `CLASS_JOIN_CODE_EXPIRED`
- `CLASS_JOIN_CODE_REVOKED`
- `CLASS_CAPACITY_REACHED`
- `CLASS_VERIFICATION_CODE_INVALID`
- `QUOTA_EXCEEDED_TOKENS`
- `QUOTA_EXCEEDED_IMAGES`
- `MODEL_UPSTREAM_TIMEOUT`
- `MODEL_UPSTREAM_UNAVAILABLE`
- `SAFETY_BLOCKED`

## 18. Teacher/Student Admin UI Wireframe Checklist（按构建顺序）

### Sprint 1：认证与班级基础（必须先做）
- [ ] `教师注册页`：邮箱、密码、学校、姓名
- [ ] `教师登录页`：账号密码 + 锁定提示
- [ ] `教师首页（空态）`：引导“创建第一个班级”
- [ ] `创建班级弹窗`：班级名、年级、席位数（默认 50）
- [ ] `班级详情-基础信息卡`：班级码、过期时间、复制/重置按钮

### Sprint 2：学生账号发放（核心价值）
- [ ] `学生批量生成页`：生成数量、命名规则、导出列表
- [ ] `学生列表页`：搜索、状态筛选、席位占用进度
- [ ] `学生详情抽屉`：重置登录码、冻结/解冻、查看最近登录
- [ ] `班级码与教师验证码管理页`：轮换、失效时间、最大使用次数
- [ ] `待确认加入列表`：审核通过/拒绝（防串班）

### Sprint 3：学生端使用闭环
- [ ] `学生加入页`：班级码 + 教师验证码
- [ ] `学生登录页`：班级编号 + 学号 + 登录码
- [ ] `学生首次改密页`：旧码、新密码、强度提示
- [ ] `学生工作台`：文本对话、图片生成入口、历史记录
- [ ] `学生配额提示组件`：剩余额度、限流提醒

### Sprint 4：教师实时管理与风控
- [ ] `课堂实时面板`：在线人数、请求速率、错误率、消耗趋势
- [ ] `风险事件流`：按风险等级排序，可标记“已处理”
- [ ] `课堂干预快捷操作`：暂停学生、考试模式、严格模式
- [ ] `模型策略页`：主模型与回退链、不同任务路由配置
- [ ] `配额策略页`：每学生/班级的 RPM、Token、图片额度

### Sprint 5：运营与学校管理（可后置）
- [ ] `学校管理后台`：教师列表、班级总览、套餐席位管理
- [ ] `成本看板`：班级/学校维度成本趋势与异常告警
- [ ] `审计日志页`：登录事件、关键配置变更、导出
- [ ] `合规设置页`：日志保留天数、敏感词策略模板

### 18.1 每个页面的最小验收标准（Definition of Done）
- [ ] 有空态、加载态、错误态
- [ ] 关键操作有二次确认（重置码、冻结、删除）
- [ ] 有操作日志记录（谁在何时做了什么）
- [ ] API 错误码有可读提示文案
- [ ] 在 1366x768 与移动端竖屏下可用（学生端优先适配）

## 19. 已新增的管理能力（实现版）

### 19.1 子账号使用量限额
- 支持按学生单独设置：
  - `dailyRequests`
  - `dailyTokens`
  - `dailyImages`
  - `dailyVideos`
  - `dailyStorybooks`
- 接口：
  - `PUT /api/v1/classes/{classId}/students/{studentId}/limits`
- 执行策略：聊天/图片/视频/绘本全部在请求入口统一校验，超额立即拒绝。

### 19.2 关键词白名单 / 黑名单
- 班级级策略，支持同时配置：
  - 黑名单：命中即拦截
  - 白名单：若配置了白名单，必须命中任一词才允许
- 接口：
  - `PUT /api/v1/classes/{classId}/policies/keywords`
- 返回标准错误码：
  - `KEYWORD_BLACKLIST_BLOCKED`
  - `KEYWORD_WHITELIST_REQUIRED`

### 19.3 子账号封禁
- 支持临时封禁和永久封禁。
- 接口：
  - `POST /api/v1/classes/{classId}/students/{studentId}/ban`
  - `POST /api/v1/classes/{classId}/students/{studentId}/unban`
- 被封禁后调用 AI 接口返回：`STUDENT_BANNED`

## 20. 新增“有趣功能”聚合能力（学生友好）

### 20.1 绘本生成（已接入 API 形态）
- 接口：`POST /api/v1/ai/storybooks/generations`
- 输入：主题、页数、风格（如 comic/cartoon）
- 输出：异步任务（jobId + 预计时长 + 预览信息）

### 20.2 视频生成（已接入 API 形态）
- 接口：`POST /api/v1/ai/videos/generations`
- 模式：`text_to_video` / `image_to_video`
- 输出：异步任务（jobId + provider + 预计时长）

### 20.3 聚合提供商信息接口
- 接口：`GET /api/v1/ai/fun/providers`
- 当前推荐组合：
  - 绘本：`Gemini + Imagen`（结构化故事 + 插图提示词）
  - 视频：`Runway`、`Synthesia`、`Shotstack`

## 21. 本轮调研结论（聚合站与产品借鉴）
- 面向你当前架构（SiliconFlow 聚合底座），建议“主平台 + 趣味能力插件化”路线：
  - 文本/图片走统一网关（你现有主线）
  - 绘本/视频走异步任务队列（避免阻塞课堂）
- 可借鉴的聚合/能力提供方方向：
  - `Runway`：创意短视频质量高，适合课堂展示
  - `Synthesia`：讲解型数字人视频，适合教学脚本
  - `Shotstack`：API 组合能力强，适合批量自动化生成
  - `Gemini + Imagen`：故事文本与插图工作流组合清晰

