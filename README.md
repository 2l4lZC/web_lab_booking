# 高校智能实验室预约管理系统

三角色（学生 / 指导教师 / 管理员）实验室预约平台，解决 Excel 登记带来的
「不知道开放时间、时段冲突、高级设备被随意使用、审批不及时、统计困难」问题。

一套代码同时适配 **手机端** 和 **PC 端**。

---

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | Vue 3 + Vite + Pinia + Vue Router | 路由懒加载 |
| UI | Element Plus（PC）+ Vant（移动） | 按屏宽挂载不同布局 |
| 后端 | Node.js + Express | ESM 模块 |
| 数据库 | MySQL 8 | mysql2 连接池 + 手写 SQL |
| 鉴权 | JWT | 三角色 RBAC |

**为什么数据访问层用手写 SQL 而不是 ORM**：本系统的核心是「时段区间重叠 +
人数累加」查询，本质是区间运算，ORM 在这里反而成为障碍，且难以调优。

---

## 目录结构

```
lab-booking/
├── sql/
│   └── schema.sql              # 建库建表 + 实验室/设备初始数据
├── server/
│   ├── .env                    # 本地配置（已在 .gitignore 中）
│   ├── .env.example            # 配置模板
│   └── src/
│       ├── app.js              # 入口：先探数据库再监听端口
│       ├── config.js           # 配置集中加载
│       ├── db.js               # 连接池 + 事务辅助
│       ├── middleware/
│       │   ├── auth.js         # JWT 校验
│       │   ├── rbac.js         # 角色控制
│       │   └── errorHandler.js # 统一错误出口
│       ├── routes/             # 只做参数校验，不写业务逻辑
│       ├── services/           # 业务逻辑（冲突检测将放在这里）
│       └── scripts/
│           └── seed-users.js   # 初始用户（密码需 bcrypt，故不入 SQL）
└── web/
    └── src/
        ├── api/                # axios 封装 + 接口定义
        ├── composables/
        │   ├── useBreakpoint.js  # 全站唯一断点判据（768px）
        │   └── useNotify.js      # 双端统一的轻提示
        ├── config/menu.js      # 导航菜单单一数据源
        ├── layouts/
        │   ├── PcLayout.vue      # 侧边栏 + 顶栏
        │   └── MobileLayout.vue  # 顶部栏 + 底部 TabBar
        ├── router/
        ├── stores/
        └── views/
            ├── student/        # 移动优先
            ├── teacher/        # 双端并重
            └── admin/          # PC 优先
```

---

## 环境要求

- Node.js 18+（开发环境验证于 v24.13.1）
- MySQL 8.0+

---

## 启动步骤

### 1. 建库导数据

```bash
mysql -u root -p < sql/schema.sql
```

> ⚠️ 该脚本开头会 `DROP DATABASE lab_booking`，用于从零重建。
> 库里已有真实数据时**不要重复执行**。

### 2. 写入初始用户

```bash
cd server
cp .env.example .env    # 按实际情况修改数据库连接
npm install
npm run seed
```

### 3. 启动后端

```bash
cd server
npm run dev             # 开发模式，改动自动重启
```

可选的辅助脚本：

```bash
npm run seed:demo       # 生成过去 30 天的演示预约数据（统计页需要，否则全是 0）
npm run test:smoke      # 管理端接口冒烟测试，25 项校验
```

启动成功会看到：

```
[DB]   已连接 127.0.0.1:3306/lab_booking
[HTTP] 服务已启动  http://localhost:3000
```

### 4. 启动前端

```bash
cd web
npm install
npm run dev
```

- PC 访问：`http://localhost:5173`
- 手机访问：`http://<本机局域网IP>:5173`（需与电脑同一 WiFi）

`vite.config.js` 中已设置 `server.host = true`，否则 Vite 只监听 localhost，手机访问不到。

---

## 演示账号

密码统一为 `123456`。

| 角色 | 账号 | 姓名 | 说明 |
|---|---|---|---|
| 管理员 | `admin` | 系统管理员 | 可管理实验室、设备、统计 |
| 指导教师 | `T1001` | 王建国 | 指导张三、李四 |
| 指导教师 | `T1002` | 李慧敏 | 指导王五、赵六 |
| 学生（本科） | `S2021001` | 张三 | 导师 T1001 |
| 学生（本科） | `S2021002` | 李四 | 导师 T1001 |
| 学生（研究生） | `S2022001` | 王五 | 导师 T1002 |
| 学生（研究生） | `S2022002` | 赵六 | 导师 T1002 |

研究生 / 本科生之分会影响设备使用权限（如 GPU 服务器仅限研究生）。

---

## 三个实验室的规则差异

| 实验室 | 类型 | 开放时间 | 容量 | 可提前 | 审批级别 |
|---|---|---|---|---|---|
| 计算机实验室A | 普通 | 8:00-22:00 | 20 人 | 3 天 | 无需审批 |
| 人工智能实验室 | 高级 | 9:00-21:00 | 15 人 | 3 天 | 教师审核 |
| 机器人实验室 | 设备型 | 10:00-18:00 | 10 人 | 5 天 | 教师 + 管理员 |

这些规则全部存在 `labs` 表的字段里，改规则不需要改代码。

---

## 核心设计说明

### 冲突检测的原子性

预约提交时用**实验室行作为互斥锁**，把同一实验室的并发请求串行化：

```sql
START TRANSACTION;
SELECT id, capacity FROM labs WHERE id = ? FOR UPDATE;   -- ① 加锁排队
SELECT IFNULL(SUM(people_count), 0) FROM reservations     -- ② 区间重叠累加
 WHERE lab_id = ? AND reserve_date = ?
   AND status IN ('pending','approved')
   AND start_time < ? AND end_time > ?;
-- ③ 应用层判断 已用 + 本次 <= capacity，再 INSERT
COMMIT;
```

两个关键点：

1. **重叠判据是开区间 `start < newEnd AND end > newStart`**，
   不是 `BETWEEN`。写成 `<=` / `>=` 会导致
   「10:00-12:00」和「12:00-14:00」被误判为冲突。
2. **锁的是实验室行，不是预约记录**。只锁查出来的预约行时，
   查询结果为空（第一个预约）等于没锁，并发下会同时插入。

### 违规降权

违规记录只记事实，**权限由记录数实时推导**，不写死在用户表：

| 近 90 天违规次数 | 可提前预约天数 |
|---|---|
| 0 ~ 2 次 | 按实验室配置正常 |
| 3 ~ 4 次 | 降为 1 天 |
| ≥ 5 次 | 冻结预约 7 天 |

这样违规记录被撤销（申诉成功）后，权限能自动恢复。

---

## 开发进度

- [x] **P1** 项目骨架 / 建表脚本 / 后端框架 / JWT 登录 / 双端布局
- [x] **P2** 实验室查询 / 可约时段 / 预约接口 / 冲突检测 + 并发压测 / 学生端页面
- [x] **P3** 两级审批 / 签到码与二维码 / 未签到定时扫描 / 审批页与签到页
- [x] **P4** 管理端实验室、设备与用户管理
- [x] **P5** 统计图表 + 部署配置（Nginx / pm2 / HTTPS 文档见 `deploy/DEPLOY.md`）

### 已验证的关键结论

**P2 冲突检测**

- **10 项规则测试全部符合预期**，含「12:00 首尾相接不算冲突」这个边界
- **20 并发抢 10 人实验室：成功 10 个、失败 10 个，数据库占用 10 人，未超卖**
- 取消预约后容量正确释放

**P3 审批与签到**

- 两级审批串联正确：教师通过后预约才流转到管理员，任一级驳回即终止
- 管理员看不到教师尚未审核的预约（`admin_status` 初始为 `NULL` 而非 `pending`）
- 签到校验完整：重复签到、他人签到码、越权查看、时间窗口、格式校验均正确拦截
- 中文经 UTF-8 读写正常（已用 Node fetch 验证，与浏览器行为一致）

---

## 部署（P5，待实施）

1. Nginx 托管前端 `dist`，`/api` 反代到 `127.0.0.1:3000`
2. 前端使用 history 路由，Nginx 需配 `try_files $uri $uri/ /index.html`
3. pm2 守护 Node 进程
4. certbot 签发 Let's Encrypt 证书

**扫码签到必须走 HTTPS**：浏览器只在 HTTPS 或 localhost 下才允许
调用摄像头（`getUserMedia`）。用 `http://192.168.x.x` 访问时扫码功能会被浏览器拒绝。
