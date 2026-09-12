# 部署指南

目标环境：Ubuntu 22.04 / 24.04（Debian 系同理，CentOS 把 `apt` 换成 `dnf`）。
假设域名为 `your-domain.com`，部署目录 `/var/www/lab-booking`。

---

## 一、服务器准备

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# MySQL 8、Nginx、PM2
sudo apt install -y mysql-server nginx
sudo npm install -g pm2

node -v && mysql --version && nginx -v
```

---

## 二、数据库

```bash
sudo mysql_secure_installation     # 设置 root 密码、移除匿名用户
sudo mysql -u root -p
```

```sql
CREATE DATABASE lab_booking DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 专用账号：只给增删改查权限，不给 DROP / ALTER
CREATE USER 'lab_app'@'localhost' IDENTIFIED BY '换成强密码';
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_booking.* TO 'lab_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

导入表结构：

```bash
cd /var/www/lab-booking
sudo mysql -u root -p lab_booking < sql/schema.sql
```

> `schema.sql` 开头有 `DROP DATABASE lab_booking`。**首次部署没问题，
> 但库里有数据后绝对不要再跑**，它会清空一切。只想建表就用
> `mysql -u root -p lab_booking < sql/schema.sql` 并手动跳过前两行。

---

## 三、后端

```bash
cd /var/www/lab-booking/server
npm ci --omit=dev

cp ../deploy/env.production.example .env
nano .env          # 填数据库密码、JWT_SECRET、域名
```

生成 JWT 密钥：

```bash
openssl rand -base64 48
```

> 代码里有硬性检查：`NODE_ENV=production` 且 `JWT_SECRET` 还是开发默认值时，
> 服务会**拒绝启动**。这是故意的，避免带着默认密钥上线。

导入初始账号（**只需执行一次**）：

```bash
npm run seed
```

用 PM2 启动：

```bash
sudo mkdir -p /var/log/lab-booking
sudo chown -R $USER:$USER /var/log/lab-booking

pm2 start ../deploy/ecosystem.config.cjs
pm2 save
pm2 startup        # 按它输出的提示再执行一遍那条 sudo 命令

pm2 logs lab-booking-api --lines 30    # 确认启动成功
curl http://127.0.0.1:3000/api/health  # 应返回 {"code":0,...}
```

---

## 四、前端 + Nginx

```bash
cd /var/www/lab-booking/web
npm ci
npm run build          # 产物在 web/dist

sudo mkdir -p /var/www/lab-booking/dist
sudo cp -r dist/* /var/www/lab-booking/dist/
```

配置 Nginx：

```bash
sudo cp /var/www/lab-booking/deploy/nginx.conf /etc/nginx/sites-available/lab-booking
sudo nano /etc/nginx/sites-available/lab-booking     # 改 server_name
sudo ln -s /etc/nginx/sites-available/lab-booking /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

此时用域名就能访问了。

---

## 五、HTTPS（扫码签到必需）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

certbot 会自动改写 Nginx 配置、申请证书、设置 90 天自动续期。

**为什么必须上 HTTPS**：浏览器的安全策略规定，只有 HTTPS 或 localhost
才允许网页调用摄像头（`getUserMedia`）。用 `http://` 访问时，
扫码签到功能会被浏览器直接拒绝，且不会有明显报错，用户只会看到
「摄像头打不开」。

验证续期：

```bash
sudo certbot renew --dry-run
```

同时把 `.env` 里的 `CORS_ORIGIN` 改成 `https://your-domain.com` 并 `pm2 restart lab-booking-api`。

---

## 六、后续更新

```bash
cd /var/www/lab-booking
git pull                      # 或重新上传代码

# 后端
cd server && npm ci --omit=dev && pm2 restart lab-booking-api

# 前端
cd ../web && npm ci && npm run build
sudo cp -r dist/* /var/www/lab-booking/dist/
```

前端是纯静态文件，更新后用户刷新即可；`index.html` 已在 Nginx 里
配置为不缓存，不会出现「发版了但用户还在用旧版」的问题。

---

## 七、常见问题

**页面能打开但接口全部 502**
后端没起来或端口不对。查 `pm2 logs lab-booking-api`，
再确认 Nginx 里 `proxy_pass` 指向的端口和 `.env` 里的 `PORT` 一致。

**刷新子路由 404**
Nginx 少了 `try_files $uri $uri/ /index.html;`。前端用的是 history 路由，
不配这行，直接访问 `/labs` 或按 F5 就会 404。

**后端启动即退出，日志显示「生产环境必须通过环境变量设置 JWT_SECRET」**
`.env` 里的 `JWT_SECRET` 还是模板里的默认值，换成 `openssl rand -base64 48` 的输出。

**手机扫码提示「摄像头不可用」**
没上 HTTPS。见第五节。

**定时任务重复执行 / 同一条预约被记了多次违规**
PM2 用了 cluster 模式起了多个实例。`ecosystem.config.cjs` 里已固定
`instances: 1` + `exec_mode: 'fork'`，不要改成 cluster。

**统计数据全是 0**
统计口径是「已发生的预约」（`reserve_date <= 今天`）。全新部署的库里
只有未来预约，自然是 0。可以先跑 `npm run seed:demo` 生成一批历史数据
用于演示。
