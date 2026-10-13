# PosterPosta

「把旅行明信片寄给未来」的交互原型 + 可运行的 SQLite 后端 MVP。

仓库里是两条演进线：

| 目录 | 内容 | 形态 |
| --- | --- | --- |
| `PosterPosta/` | 前端原型：写信、贴邮票、市集、寄送与签收全流程 | 纯静态，浏览器直接打开 |
| `PosterPosta-MVP/` | 在其之上加真实后端：账号体系（验证码 / 密码登录、多邮箱绑定、设备管理）、SQLite 持久化、资产归属与投递队列 | Node.js，零外部依赖 |
| `docs/` | 线上验收记录 | 文本 |

## 快速开始

### 前端原型

```bash
open PosterPosta/index.html        # 或任意静态服务器指向该目录
```

数据全部走内存，不落盘，适合看交互和视觉。

### 后端 MVP

要求 Node.js >= 22.13.0（用到内置 `node:sqlite`；该模块自 v22.13.0 / v23.4.0 起不再需要 `--experimental-sqlite`）。已在 Node 22.22.2 与 24.11.0 上验证测试全通过。

```bash
cd PosterPosta-MVP
cp .env.example .env               # 按需填写；不填也能以开发模式跑起来
npm start                          # 默认 http://127.0.0.1:4180，仅本机可访问
npm test                           # node --test，硬性零外部依赖
```

`npm run dev` 是带 `--watch` 的开发模式。数据库按环境隔离在 `data/development.sqlite` 或 `data/production.sqlite`，可用 `DB_PATH` 指到绝对路径。

## 部署

### 硬性前提：要有持久化磁盘

后端把状态存在单个 SQLite 文件里，所以托管平台必须**同时**提供「常驻 Node 进程」和「持久磁盘」。无服务器平台（Vercel、Netlify、Cloudflare Workers）不满足第二条：实例之间没有共享磁盘，请求会落到不同实例，账号和信件会在冷启动后消失，登录 cookie 也会随机失效。要在那类平台跑，必须把 `node:sqlite` 换成托管 Postgres。

### Railway（push 即部署）

仓库里已带 `PosterPosta-MVP/railway.json`（启动命令 `node server.cjs`，健康检查 `/healthz`）。在 Railway 建 Project 时：

1. **Root Directory** 填 `PosterPosta-MVP`（不填会把整个仓库当根，找不到 `package.json`）
2. **Volume** 挂到 `/data` —— 数据库落在这里，重新部署不丢
3. **Variables** 至少配这几项：

| 变量 | 值 | 作用 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 允许反向代理转发进来（默认只绑回环） |
| `APP_ENV` | `development` | 演示模式。切 `production` 还强制要求 HTTPS origin、`RESEND_API_KEY`、`MAIL_FROM`、`TENCENT_LOCATION_KEY` |
| `DB_PATH` | `/data/posta.sqlite` | 指向卷。父目录会自动创建 |
| `PUBLIC_ORIGIN` | `https://<你的域名>` | 浏览器 Origin 白名单，必须与实际访问域名完全一致 |
| `ALLOWED_HOSTS` | `<你的域名>` | Host 白名单，支持 `*.example.com` 通配 |
| `NIXPACKS_NODE_VERSION` | `22` | 保险项，避免构建器选出不支持 `node:sqlite` 的 Node |

配好后 `git push` 到 main 即自动重新部署。之后要改公开域名，只需同步改 `PUBLIC_ORIGIN` 与 `ALLOWED_HOSTS`。

**排查用**：忘了配 `PUBLIC_ORIGIN` 会被 `CSRF_ORIGIN` 拒绝；`ALLOWED_HOSTS` 没覆盖实际 Host 会被 `HOST_FORBIDDEN` 拒绝。两者都是 403，看 `code` 字段即可区分。`/healthz` 刻意放在这两道校验之前（托管平台探针常带内部主机名），只返回 `{"ok":true}`，不泄露配置。

### 云端沙箱（需要「参数随源码走」的环境）

有些托管环境的反向代理不转发公开域名，而是把内部主机名当 Host 转发，并且拿不到启动命令里的环境变量。这类环境可以把参数写进 `deploy.env.json`（或 `deploy.config.json`、`public/deploy.config.json`，三者等价）：**这些文件名一律不入库**，模板在 `PosterPosta-MVP/deploy.env.example.json`。原因是里面写的是具体主机名——换部署目标就失效，提交到公开仓库还会泄露内网域名。

```
读参数优先级：真实环境变量  >  deploy.env.json
按 deploy.config.json → public/deploy.config.json → deploy.env.json 顺序查找，命中一个就不再往后看
```

因此同一份代码可以同时服务两类平台：不支持环境变量的沙箱走文件，Railway 等平台在控制台设置。这类环境通常要分开配两条：`ALLOWED_HOSTS` 放反向代理实际转发的主机名（过 Host 校验），`PUBLIC_ORIGIN` 放公开访问域名（过浏览器 Origin 校验）——只配一个会分别收到 `HOST_FORBIDDEN` 和 `CSRF_ORIGIN`。

### GitHub Pages（纯静态前端）

`PosterPosta/` 是自包含的静态站，可以直接用 Pages 托管，`push` 即更新，不需要任何构建或工作流：

1. 仓库需为 **公开**（GitHub Free 账号的 Pages 只支持公开仓库；私有仓库要 Pro 及以上）
2. Settings → Pages → Source 选 **Deploy from a branch**，Branch 选 `main`、目录选 `/PosterPosta`，保存
3. 一两分钟后访问 `https://<用户名>.github.io/<仓库名>/`

目录里的 `.nojekyll` 用来跳过 Jekyll 处理。注意 Pages 只托管文件、没有服务端，所以这一版没有真实账号体系：登录是本地模拟，数据存在各人浏览器里，换设备就没了。要共享的账号与信件状态，必须部署 `PosterPosta-MVP/`。

## 账号体系

| 能力 | 规则 |
| --- | --- |
| 邮箱验证码登录 | 新邮箱验证后自动注册（缺昵称时提示补填，不消耗验证码）；已绑定的任一邮箱都能登录同一账号 |
| 密码登录（可选） | 在「账号与安全」里设置；8–128 位且同时含字母和数字，scrypt 加盐存储；15 分钟内错 5 次锁 15 分钟，期间验证码登录仍可用 |
| 绑定邮箱 | 每个账号最多 5 个；新邮箱须收验证码确认；一个邮箱只能属于一个账号；可切换主邮箱，主邮箱不能解绑 |
| 签收 | 寄给账号下任一已绑定邮箱的信都能签收；签收页邮箱不匹配时可直接去绑定 |
| 二次验证 | 绑定 / 解绑 / 换主邮箱 / 改或移除密码 / 下线设备前，需用主邮箱验证码或密码确认本人，通过后 15 分钟内免重复 |
| 登录设备 | 列出有效会话（浏览器 · 系统、最近活动），可单独下线或下线其他全部；改密码会自动下线其他设备 |

旧版数据库启动时自动迁移：补齐新列，并把已有用户的邮箱写入绑定表。

## 当前边界

- **已实现**：邮箱随机 OTP（有效期 / 尝试上限 / 按邮箱限流）、可选密码登录与失败锁定、多邮箱绑定、敏感操作二次验证、登录设备管理、会话哈希与 HttpOnly Cookie、SQLite 多账户隔离、服务端城市资格与资产所有权校验、免费名额跨城市唯一与原子消耗、市集并发交易单胜者、固定工作日 ETA 与持久投递队列、收件链接绑定邮箱与一次性签收、双向共享聊天、图片格式与魔数校验、原创待审核。
- **未实现**：真实商户支付与退款、生产级自定义域名与 HTTPS、数据库备份与监控告警。

`.env.example` 里的 `RESEND_API_KEY`、`TENCENT_LOCATION_KEY` 均为空模板：邮件与 IP 定位适配器已按官方接口写好，但**未配置、未实网验证**；开发模式永不发送真实邮件。支付未接入时，生产环境会强制拒绝付费发货。

## 测试与验收

- `PosterPosta/engine.test.cjs` — 前端状态机与业务规则，53 项全通过，结果见 `verification.json`
- `PosterPosta-MVP/server.test.cjs` — 后端接口、权限隔离与账号体系，52 项全通过
- `PosterPosta-MVP/verify-live.mjs` — 对已部署沙箱跑双人全流程（寄送 → 拒绝越权读取 → 匿名脱敏 → 投递 → 签收转移 → 重复签收 409 → 共享对话），记录见 `docs/线上验收结果.txt`

## 素材与许可

- 字体：DM Sans、Libre Caslon Display，均为 SIL Open Font License，许可全文随 `assets/` 一起入库。
- 摄影图片：来自 Unsplash，**仅用于原型示意**，不是可直接商用的授权素材库。逐张来源见 `assets/sources.json`。商业上线前必须复核作者、许可、人物与建筑物相关权利，或替换为自有素材。

## 注意

`PosterPosta/build.py` 会把前端打成一个自包含的离线 HTML（`PosterPosta.html`）和源码 zip。这两个产物属于本机构建输出，已在 `.gitignore` 中排除：

```bash
cd PosterPosta && python3 build.py
```
