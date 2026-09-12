-- ============================================================
--  高校智能实验室预约管理系统 —— 数据库建表脚本
--  适用：MySQL 8.0+
--  执行：mysql -u root -p < sql/schema.sql
--
--  ⚠️ 本脚本开头会 DROP DATABASE，用于从零重建。
--     库里已有真实数据时不要重复执行！
-- ============================================================

DROP DATABASE IF EXISTS lab_booking;
CREATE DATABASE lab_booking DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lab_booking;


-- ------------------------------------------------------------
-- 1. users 用户表
--    学生 / 指导教师 / 管理员 共用一张表，靠 role 区分
-- ------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL                COMMENT '学号 / 工号，登录账号',
  password_hash VARCHAR(100) NOT NULL                COMMENT 'bcrypt 哈希，绝不存明文',
  real_name     VARCHAR(50)  NOT NULL                COMMENT '真实姓名',
  role          ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
  grade         ENUM('undergrad','master','phd') DEFAULT 'undergrad'
                                                     COMMENT '学历层次，设备权限的判据',
  phone         VARCHAR(20)  DEFAULT NULL,
  college       VARCHAR(100) DEFAULT NULL            COMMENT '所属学院',
  advisor_id    INT UNSIGNED DEFAULT NULL            COMMENT '指导老师ID，教师审批时按它找',
  status        TINYINT      NOT NULL DEFAULT 1      COMMENT '1=正常 0=禁用',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_username (username),
  KEY idx_advisor (advisor_id),
  CONSTRAINT fk_user_advisor FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='用户表：学生/教师/管理员';


-- ------------------------------------------------------------
-- 2. labs 实验室表
--    需求文档说"不同实验室规则不同"—— 所以规则全部做成字段，
--    代码里不写死任何阈值
-- ------------------------------------------------------------
CREATE TABLE labs (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  type           ENUM('normal','advanced','equipment') NOT NULL DEFAULT 'normal'
                              COMMENT '普通 / 高级 / 设备型',
  location       VARCHAR(100) DEFAULT NULL,
  open_time      TIME NOT NULL DEFAULT '08:00:00'    COMMENT '开放起始',
  close_time     TIME NOT NULL DEFAULT '22:00:00'    COMMENT '开放结束',
  capacity       SMALLINT UNSIGNED NOT NULL DEFAULT 20
                              COMMENT '同一时段最大容纳人数（时段重叠时累加比较）',
  advance_days   TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '最多可提前几天预约',
  min_duration   TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '最短预约时长（小时）',
  approval_level TINYINT NOT NULL DEFAULT 0
                              COMMENT '审批级别 0=无需审批 1=教师审 2=教师审+管理员确认',
  min_grade      ENUM('undergrad','master','phd') NOT NULL DEFAULT 'undergrad'
                              COMMENT '预约者最低学历要求',
  description    TEXT,
  status         TINYINT NOT NULL DEFAULT 1          COMMENT '1=开放 0=停用',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='实验室表：所有规则做成字段，不写死在代码里';


-- ------------------------------------------------------------
-- 3. devices 设备表
-- ------------------------------------------------------------
CREATE TABLE devices (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lab_id        INT UNSIGNED NOT NULL,
  name          VARCHAR(100) NOT NULL,
  model         VARCHAR(100) DEFAULT NULL            COMMENT '型号',
  status        ENUM('available','in_use','maintenance','broken')
                             NOT NULL DEFAULT 'available',
  min_grade     ENUM('undergrad','master','phd') NOT NULL DEFAULT 'undergrad'
                             COMMENT '使用所需最低学历，如 GPU 服务器要求研究生',
  need_approval TINYINT(1) NOT NULL DEFAULT 0        COMMENT '1=必须教师审核通过才能使用',
  requirement   VARCHAR(255) DEFAULT NULL            COMMENT '使用要求说明，直接展示给学生',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_lab (lab_id),
  CONSTRAINT fk_device_lab FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='设备表';


-- ------------------------------------------------------------
-- 4. reservations 预约单（核心表）
--
--    审批链拆成 teacher_status / admin_status 两个独立字段，
--    而不是一个 status 塞到底 —— 否则无法表达"老师已通过、
--    待管理员确认"这个中间态，驳回时也说不清是哪一级驳的。
-- ------------------------------------------------------------
CREATE TABLE reservations (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  lab_id          INT UNSIGNED NOT NULL,
  reserve_date    DATE NOT NULL                      COMMENT '使用日期',
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  people_count    TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '本次使用人数',
  purpose         VARCHAR(255) DEFAULT NULL          COMMENT '使用目的',
  device_ids      JSON DEFAULT NULL                  COMMENT '本次要使用的设备ID数组',

  -- 总状态
  status          ENUM('pending','approved','rejected','cancelled','completed','no_show')
                  NOT NULL DEFAULT 'pending'         COMMENT '总状态',

  -- 第一级：指导教师审批
  teacher_status  ENUM('pending','approved','rejected') DEFAULT NULL,
  teacher_id      INT UNSIGNED DEFAULT NULL,
  teacher_comment VARCHAR(255) DEFAULT NULL,
  teacher_at      DATETIME DEFAULT NULL,

  -- 第二级：管理员确认
  admin_status    ENUM('pending','approved','rejected') DEFAULT NULL,
  admin_id        INT UNSIGNED DEFAULT NULL,
  admin_comment   VARCHAR(255) DEFAULT NULL,
  admin_at        DATETIME DEFAULT NULL,

  -- 签到
  checkin_code    CHAR(6)  DEFAULT NULL              COMMENT '6位签到码，全局唯一',
  checkin_at      DATETIME DEFAULT NULL              COMMENT '实际签到时间',

  cancel_reason   VARCHAR(255) DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- ⭐ 冲突查询专用索引：WHERE lab_id=? AND reserve_date=?
  --    AND start_time<? AND end_time>? 全靠它
  KEY idx_conflict (lab_id, reserve_date, start_time, end_time),
  KEY idx_user_date (user_id, reserve_date),
  KEY idx_status (status),
  KEY idx_teacher_pending (teacher_id, teacher_status),
  -- 签到码必须唯一，否则扫码时会定位不到唯一一条预约
  UNIQUE KEY uk_checkin_code (checkin_code),

  CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_res_lab  FOREIGN KEY (lab_id)  REFERENCES labs(id),
  CONSTRAINT chk_time_range CHECK (end_time > start_time)
) ENGINE=InnoDB COMMENT='预约单';


-- ------------------------------------------------------------
-- 5. violations 违规记录
--    只记录事实，不存"降权后能提前几天"——
--    权限由记录数实时推导，这样违规被撤销后权限能自动恢复
-- ------------------------------------------------------------
CREATE TABLE violations (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  reservation_id INT UNSIGNED DEFAULT NULL,
  type           ENUM('no_show','frequent_cancel','other') NOT NULL
                             COMMENT '预约未签到 / 频繁取消 / 其他',
  remark         VARCHAR(255) DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_user_time (user_id, created_at),
  CONSTRAINT fk_vio_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vio_res  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='违规记录';


-- ============================================================
--  初始数据：三个实验室（对应需求文档表格）
-- ============================================================

INSERT INTO labs
  (name, type, location, open_time, close_time, capacity, advance_days, min_duration, approval_level, min_grade, description)
VALUES
  ('计算机实验室A', 'normal', '实验楼 3F-301', '08:00:00', '22:00:00',
   20, 3, 1, 0, 'undergrad',
   '常规上机实验室，开放时间长，无需审批，提交即占用。'),

  ('人工智能实验室', 'advanced', '实验楼 4F-402', '09:00:00', '21:00:00',
   15, 3, 2, 1, 'undergrad',
   '配备 GPU 服务器，需指导教师审核通过后方可使用。'),

  ('机器人实验室', 'equipment', '工程中心 1F-105', '10:00:00', '18:00:00',
   10, 5, 2, 2, 'undergrad',
   '含 3D 打印机与机器人平台，需教师审核 + 管理员确认双重审批。');


-- 设备初始数据
INSERT INTO devices (lab_id, name, model, status, min_grade, need_approval, requirement)
VALUES
  (2, '高性能GPU服务器', 'NVIDIA A100 x2', 'available', 'master', 1,
   '仅限研究生使用，需指导教师审核通过'),
  (2, '深度学习工作站', 'RTX 4090', 'available', 'undergrad', 1,
   '需指导教师审核'),
  (3, '3D打印机', 'Raise3D Pro3', 'available', 'undergrad', 1,
   '需自带耗材，使用前须经管理员培训'),
  (3, '机器人平台', 'TurtleBot4', 'available', 'master', 1,
   '仅限研究生使用，需教师审核');


-- ============================================================
--  完成。用户数据不含在此脚本中（密码需 bcrypt 加密），
--  请执行：cd server && npm run seed
-- ============================================================
