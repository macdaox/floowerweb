# Cloudflare 部署说明

本项目通过 Cloudflare Workers Builds 的网页端 GitHub 集成部署，并使用 D1（`DB`）和 R2（`MEDIA`）。Astro 的服务端代码作为 Worker 运行，静态文件由 Workers Assets 提供。生产环境和预览环境必须使用独立的数据库和存储桶。

每次发布前请运行 `npm run test:smoke`。该命令会生成生产构建、准备本地 D1 种子数据、使用本地 D1/R2 绑定启动 `wrangler pages dev ./dist`，并检查构建结果中的关键公开页面和后台登录页面。

## 1. 准备代码仓库

请使用 Node.js 22 或更高版本，以及 npm 10 或更高版本。

```bash
npm clean-install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run admin:create
npm run dev
```

`.dev.vars` 已被 Git 忽略。请使用安全的密码管理器或 `openssl rand -base64 48` 生成 `SESSION_SECRET`，不要与后台管理员密码重复。运行创建管理员的命令前，通过环境变量设置 `EVERSTEM_ADMIN_EMAIL` 和 `EVERSTEM_ADMIN_PASSWORD`，命令执行完成后立即清除这两个环境变量。

## 2. 创建 Cloudflare 资源

先登录 Wrangler，然后分别创建预览环境和生产环境的资源：

```bash
npx wrangler login
npx wrangler d1 create everstem-preview
npx wrangler d1 create everstem-production
npx wrangler r2 bucket create everstem-media-preview
npx wrangler r2 bucket create everstem-media-production
```

将返回的两个 D1 UUID 填入 `wrangler.toml` 中对应的 `database_id` 占位符。不要提交账户令牌或密钥。存储桶名称已在该文件中声明；只有在实际创建了不同名称的存储桶时才需要修改。

请分别对每个远程数据库执行迁移并导入种子数据：

```bash
npm run db:migrate:remote
npm run db:seed:remote
npm run db:migrate:remote -- --env preview
npm run db:seed:remote -- --env preview
```

在每个环境中创建第一个管理员。该命令会在本地对密码进行哈希处理，不会输出密码。修改 `EVERSTEM_ADMIN_EMAIL` 或 `EVERSTEM_ADMIN_PASSWORD` 后重新执行命令，会同步更新初始管理员，而不会创建第二个初始管理员：

```bash
npm run admin:create -- --remote
npm run admin:create -- --remote --env preview
```

输入生产环境管理员密码前，务必先确认 Wrangler 当前指向的目标数据库。

## 3. 在 Cloudflare 网页端连接 GitHub

在 Cloudflare 控制台的 Workers & Pages 中创建应用并导入 GitHub 仓库，生产环境配置如下：

- 生产分支：`main`
- 构建命令：`npm run build`
- 部署命令：`npx wrangler deploy`
- Node 版本：`22`

不需要在网页端填写“构建输出目录”；`wrangler.toml` 已声明 Worker 入口和静态资源目录。顶层配置直接绑定 `everstem-production` 和 `everstem-media-production`，所以 Cloudflare 网页端的默认部署命令可以直接使用。预览资源位于 `preview` 环境，需要时使用 `--env preview`。

在 Cloudflare 应用的变量和密钥中设置以下值：

- 密钥 `SESSION_SECRET`：每个环境使用不同的随机值，至少包含 32 字节随机数据。
- 变量 `PUBLIC_SITE_URL`：当前 `workers.dev` 生产地址已写入 `wrangler.toml`；绑定自定义域名后，应同步改为该域名的规范 HTTPS 站点根地址，不得包含路径。
- 变量 `MEDIA_MAX_BYTES`：如果不打算修改上传限制，设为 `10485760`。
- 可选变量 `PUBLIC_IMAGE_RESIZING_ORIGIN`：仅在某个 HTTPS 源站已启用 Cloudflare Image Resizing，并且该源站的 `/media/*` 能够访问本应用时设置。

规范链接、Open Graph URL、JSON-LD、`robots.txt` 和站点地图优先使用 `PUBLIC_SITE_URL`，绝不信任请求中的 Host 请求头。运行时变量缺失时，系统会回退到代码中固定的正式 `workers.dev` 地址；配置无效时仍会拒绝运行相关功能。

## 4. 域名与图片

在 Worker 中添加生产环境自定义域名，按照 Cloudflare 的指引更新 DNS，然后将 `PUBLIC_SITE_URL` 设为完全一致的 `https://` 站点根地址并重新部署。上传的对象应在 R2 中保持私有，并由应用通过 `/media/*` 路径对外提供；不要将存储桶设置为公开。在后台管理界面中，已被内容引用的图片不能删除。

Image Resizing 是可选功能。如果不启用，R2 中的动态图片会安全地使用原始 URL。项目内置的设计图片已在 `public/assets/responsive/` 目录中提供了对应的响应式版本。

## 5. 发布验证

合并或部署前运行：

```bash
npm clean-install
npm run db:migrate:local
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
```

部署完成后，检查 `/`、`/collections`、`/about`、`/contact`、`/wholesale`、`/admin/login` 和 `/health`。提交一条测试询盘，确认它能在中文后台中显示，并且系统不会自动发送邮件。同时确认公开站点地图中不包含草稿、后台 URL、内部备注、哈希值、会话摘要或任何密钥。

## 6. 备份、回滚与密钥轮换

每次数据库迁移或重大内容发布前，导出每个 D1 数据库：

```bash
npx wrangler d1 export DB --remote --output backup-production.sql
npx wrangler d1 export DB --remote --env preview --output backup-preview.sql
```

将导出文件保存在 Git 仓库之外的加密存储中。请根据你的数据保留策略，在 Cloudflare 中配置 R2 对象版本控制或定时复制。

如需回滚应用，请在 Workers Deployments 中回滚到上一个已验证的正常版本。不要通过删除数据表或迁移文件来反向撤销 D1 迁移。应当使用已验证的导出备份恢复到一个新的 D1 数据库，更新绑定并完成测试后，再切换流量。

在受影响的 Worker 环境中轮换 `SESSION_SECRET` 并重新部署，所有现有的后台会话都会失效。如需更换管理员密码，请使用另一个管理员账号登录后更新该账户。在 Cloudflare 控制台中轮换 API 令牌，同时更新 CI 密钥；不要将它们写入 `.dev.vars`、源码、日志或 GitHub Actions 输出。
