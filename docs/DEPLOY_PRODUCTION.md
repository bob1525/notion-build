# 生产部署

第三轮阶段 2。把 Folio 放到公网上：网站用 Vercel，数据库用托管的 PostgreSQL（Neon 或 Supabase），图片用 Cloudflare R2。本地开发不用改，还是 SQLite 文件。

这份说明按点击顺序写。不需要先懂 Prisma。每一步做完再做下一步。

## 本地和线上为什么是两套数据库

Prisma 在生成客户端时就选定数据库种类。生成出来的那一份不能同时连 SQLite 和 PostgreSQL。

仓库里的 `prisma/schema.prisma` 继续写 `provider = "sqlite"`。这是本地和原来那两条 CI 的默认。`npm run setup` 仍会创建 `prisma/dev.db`。

当 `DATABASE_URL` 以 `postgresql://` 或 `postgres://` 开头，或者 `DATABASE_PROVIDER=postgresql` 时，`scripts/db-prepare.ts` 用同一份模型另写 `prisma/schema.postgres.prisma`（这个文件不提交），再按 PostgreSQL 生成客户端并建表。已经写在环境里的变量优先于 `.env` 文件，所以 CI 和 Vercel 上的地址不会被示例文件里的 `file:./dev.db` 盖掉。

这样选的原因：

- 不把仓库改成只支持 PostgreSQL。否则每台电脑和原来的 CI 都要先装数据库服务，现有的本地流程会断。
- 不手写两份模型。表结构只有 `schema.prisma` 一份，避免以后加字段只改了一边。
- 代价是上线前要按 PostgreSQL 重新生成客户端并建表。命令是 `npm run db:deploy`。Vercel 的构建已经包含这一步（`vercel.json`）。

仓库里的 `prisma/migrations` 是 SQLite 的。锁文件写着 `sqlite`，SQL 里有 `DATETIME`。不要对 PostgreSQL 执行 `prisma migrate deploy`，会失败。线上用 `db push`：按当前模型把表补齐。它不读取那份 SQLite 迁移。

`scripts/apply-visibility-migration.ts` 只跑两条普通的 `UPDATE`，把旧的可见性别名收成 `public` 和 `read`。SQLite 和 PostgreSQL 都能执行。`db:deploy` 会带上它。

播种时，SQLite 仍用原来的 `PRAGMA foreign_keys` 和同样的 `DELETE` 顺序。PostgreSQL 不能关外键，所以按子表到父表删除，并多删 `UserPreference`。两种路径的语句由测试锁住。

## 你需要准备的东西

1. 一个 GitHub 账号，能打开这个仓库。
2. 一个 [Vercel](https://vercel.com) 账号，用 GitHub 登录。
3. 一个数据库：下面用 [Neon](https://neon.tech)。没有 Neon 时用 [Supabase](https://supabase.com)，二选一。
4. 一个 [Cloudflare](https://dash.cloudflare.com) 账号，用来放图片。Vercel 没有持久磁盘，上传的图不能留在网站自己的硬盘上。
5. 如果要在自己电脑上写入演示数据：安装 [Node.js 20](https://nodejs.org)（选 LTS），并安装 Git。只部署、不播种的话，可以先不装，网站上能自己注册。

演示账号要播种之后才有：`nash@folio.dev` 和 `mia@folio.dev`，密码都是 `folio-demo`。

## 环境变量清单

在 Vercel 的项目里填写，不要写进 GitHub，也不要提交 `.env`。

| 变量 | 必填 | 填什么 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | 托管 Postgres 的**连接池**地址，给网站运行时用。Neon 里叫 pooled。地址以 `postgresql://` 开头，末尾保留 `sslmode=require` |
| `DIRECT_URL` | 建议填 | **直连**地址，给建表用。不要用带 `-pooler` 的那条。Vercel 构建时的 `db push` 会走它 |
| `DATABASE_PROVIDER` | 可不填 | 留空即可，程序看 `DATABASE_URL` 判断。要强制时填 `postgresql` |
| `AUTH_SECRET` | 是 | 自己生成的一长串随机字符，至少 32 位。不要用仓库示例里的 `folio-dev-secret-change-me-32chars` |
| `IMAGE_STORAGE` | 是 | 填 `s3`。留空或 `local` 时图片写在服务器磁盘上，Vercel 一刷新就没了 |
| `S3_BUCKET` | 用 R2 时必填 | 桶的名字，例如 `folio-images`。只是一个名字，不要带斜杠 |
| `S3_ENDPOINT` | 用 R2 时必填 | `https://<账号ID>.r2.cloudflarestorage.com`。不要把桶名加在后面 |
| `S3_ACCESS_KEY_ID` | 用 R2 时必填 | R2 接口令牌的 Access Key ID |
| `S3_SECRET_ACCESS_KEY` | 用 R2 时必填 | 同一个令牌的 Secret。页面只显示一次，关掉就找不到了 |
| `S3_PUBLIC_BASE_URL` | 用 R2 时必填 | 浏览器能直接打开图片的前缀，例如 `https://pub-xxxx.r2.dev`。不要加账号和密码 |
| `S3_REGION` | 可不填 | 不填时按 `auto`，这就是 R2 要用的值 |

生成 `AUTH_SECRET`：装好 Node 之后，在终端运行下面这一行，把打印出来的整行复制走。

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

还没装 Node 的话，用密码管理器生成一串 32 位以上的随机字符也可以。

## 第一步：创建 PostgreSQL

### Neon

1. 打开 [neon.tech](https://neon.tech)，用邮箱或 GitHub 注册。
2. 创建一个项目。名字可以用 `folio`。地区选离你近的，例如新加坡或美国。
3. 进入项目后点 **Connect**（或 Connection details）。
4. 复制两条地址，先贴到一个只有你能看见的记事本里：
   - **Pooled connection** → 这是 `DATABASE_URL`
   - **Direct connection** → 这是 `DIRECT_URL`
5. 两条都要带 `sslmode=require`。Neon 给的字符串通常已经带了。整段复制，不要手打密码。密码里如果有 `@`、`#`，官方字符串已经转好了，改一个字符就会连不上。
6. Neon 默认允许外部连接。不要额外设成「只允许某些 IP」，否则 Vercel 建表会失败。

### 改用 Supabase 时

1. 打开 [supabase.com](https://supabase.com)，新建项目。数据库密码自己设一个，并保存下来。等项目状态变成可用。
2. 点 **Connect**。如果有 Prisma 的现成片段，用它的 `DATABASE_URL` 和 `DIRECT_URL`。
3. 没有现成片段时：项目 **Settings → Database**。
   - 网站运行用 **Transaction pooler**（端口通常是 6543）那条 URI，末尾加上 `?pgbouncer=true&sslmode=require`，作为 `DATABASE_URL`。
   - 建表用 **Direct connection**（端口通常是 5432，主机名常常是 `db.<项目>.supabase.co`），作为 `DIRECT_URL`，末尾加上 `?sslmode=require`。
4. 把密码填进 URI 时，特殊字符要先编码。更省事的做法是用页面上已经拼好的字符串。
5. 如果开了「只允许特定 IP」，Vercel 的地址不固定，建表会超时。演示阶段关掉这个限制，或按 Supabase 的说明允许所有地址。

## 第二步：创建图片桶（Cloudflare R2）

1. 打开 [Cloudflare 控制台](https://dash.cloudflare.com)，注册或登录。
2. 左侧选 **R2 Object Storage**。第一次使用要开通，演示用量一般在免费额度里。
3. **Create bucket**。桶名填 `folio-images`（或别的小写名字）。地区默认即可。
4. 点进这个桶，打开 **Settings**。找到公开访问（**Public access** / **R2.dev subdomain**），把它打开。复制显示出来的 `https://pub-xxxx.r2.dev`。这就是 `S3_PUBLIC_BASE_URL`，末尾不要加斜杠。这个地址给浏览器看图片，不需要登录。
5. 回到 R2 的总览，打开 **Manage R2 API tokens**（或 Account API tokens），**Create API token**。
   - 权限选 **Object Read & Write**。
   - 范围指定刚才的桶。
   - 创建后立刻复制 **Access Key ID** 和 **Secret Access Key**。Secret 只出现一次。
6. 同一页能看到账号 ID。接口地址是 `https://<账号ID>.r2.cloudflarestorage.com`。这是 `S3_ENDPOINT`，后面不要再加桶名。
7. `S3_BUCKET` 填桶名，和上一步创建的名字一致。

上传走服务器签名，阅读走公开地址。所以要有两套地址：接口地址给 Folio 的服务器，公开地址给浏览器里的 `<img>`。技术细节在 [docs/IMAGE_STORAGE.md](docs/IMAGE_STORAGE.md)。

## 第三步：部署到 Vercel

1. 打开 [vercel.com](https://vercel.com)，用 GitHub 登录。
2. **Add New… → Project**，在仓库列表里选这个 Folio 仓库，**Import**。
3. Framework 应自动是 **Next.js**。Root Directory 留空（项目就在仓库根目录）。Node.js 选 **20.x**。
4. 先不要点 Deploy。展开 **Environment Variables**。
5. 把上一节表格里的变量逐个加上。每一行只勾选 **Production**。Preview 先不要勾，避免每个预览网址都去改同一套数据。
6. 确认 `IMAGE_STORAGE` 是 `s3`，`AUTH_SECRET` 是你自己生成的，不是示例那串。
7. 点 **Deploy**。第一次大约几分钟。
8. 构建命令不用改。仓库里的 `vercel.json` 会先运行 `npm run db:deploy`（按 PostgreSQL 建表），再运行 `npm run build`。你自己电脑上的 `npm run build` 只生成客户端，不会去连线上数据库。

构建成功后，Vercel 给一个 `https://……vercel.app` 地址。先别急着登录，如果还没播种，页面可以打开，但没有 Nash 和 Mia。

Vercel 上不会把 `.env.example` 抄进项目。漏填 `AUTH_SECRET` 时，网站会提示缺少密钥，而不是用仓库里那串公开的开发密钥。

## 第四步：写入演示数据（可选）

想用现成的 Nash、Mia 和工作区时才做。自己点注册也能用，可以跳过。

播种会**清空这个数据库里已有的账号、页面和块**，再写入演示内容。网站上已经有人写了笔记之后，不要再运行。

在自己的电脑上：

```bash
git clone https://github.com/bob1525/notion-build.git
cd notion-build
npm install
```

把地址换成你的，整段粘贴。这一次不要写入项目里的 `.env`，避免把本地 SQLite 换成线上库。

```bash
DATABASE_URL="这里贴直连或连接池地址" \
DIRECT_URL="这里贴直连地址" \
DATABASE_PROVIDER="postgresql" \
npm run db:seed
```

`db:deploy` 如果在 Vercel 上已经成功，这里只播种，不必再手动建表。若 Vercel 还没部署过，先运行一次：

```bash
DATABASE_URL="这里贴连接池地址" \
DIRECT_URL="这里贴直连地址" \
DATABASE_PROVIDER="postgresql" \
npm run db:deploy
```

终端最后出现 `Seeded Folio` 和用户、页面、块的数量，就是写进去了。

本地以后仍想用 SQLite：不要把上面的地址写进 `.env`。`.env` 里保持 `DATABASE_URL="file:./dev.db"`，然后 `npm run setup`。

## 第五步：检查网站

1. 打开 Vercel 给的 `https://` 地址。必须是 https。登录 cookie 在生产环境只通过 https 发送。
2. 播种过：用 `nash@folio.dev` / `folio-demo` 登录，能看到产品工作台和嵌套页面。
3. 没播种：点注册，自己建一个工作区。
4. 打开一篇页面，上传一张小的 png。刷新之后图片还在，并且图片地址是 `S3_PUBLIC_BASE_URL` 开头，而不是 `/uploads/`。这说明图片没有写进会消失的磁盘。
5. 再打开一个无痕窗口，注册第二个账号（或用 Mia）。私有页不应出现在对方的搜索里。这和本地的权限相同。

## 以后改了表怎么办

模型只改 `prisma/schema.prisma`。提交并推送后，Vercel 会再次构建，并执行 `db push` 把线上的表补齐。

如果这次改动会删列或清空数据，Prisma 会让构建失败，而不是悄悄删。那时候先备份数据库（Neon / Supabase 的控制台里有备份或分支），再决定要不要接受数据损失。不要在生产库上运行 `npm run db:reset`。那个命令会删掉整个库再重建。

## 在自己电脑上连 PostgreSQL

日常开发不必这么做。要试的话，本机装好 PostgreSQL 16，建一个空库，然后：

```bash
DATABASE_URL="postgresql://folio:folio@127.0.0.1:5432/folio?sslmode=disable" \
DATABASE_PROVIDER="postgresql" \
npm run db:reset
```

`sslmode=disable` 只给本机没有证书的数据库。Neon 和 Supabase 保持 `sslmode=require`。

改回 SQLite：新开一个终端，确认没有留下 `DATABASE_URL`，`.env` 仍是 `file:./dev.db`，再 `npm run setup`。

## CI

原来的两个 job 不动：`lint, typecheck, unit` 和 `playwright` 仍用 SQLite，这是 116 个单元测试和 59 个端到端的基线。

新增 job `playwright on postgres`。GitHub 上起一个 `postgres:16` 容器，库名、用户和密码都是 `folio`。地址是 `postgresql://folio:folio@127.0.0.1:5432/folio?sslmode=disable`。这个 job 再跑一遍 `npm test` 和 `npm run test:e2e`。系统用 Ubuntu 24.04，因为 Playwright 1.57 在更新的 Ubuntu 上装不上 Chromium。

## 常见问题

**构建日志里是 SQLite 的 `file:./dev.db`，或运行时提示打不开文件数据库。**  
Vercel 的 Production 环境没有 `DATABASE_URL`，或地址不是 `postgresql://` 开头。补上变量后，在 Deployments 里对最新一次选择 Redeploy。只改变量不会自动重新构建。

**`db push` 报错，提到 pooler、prepared statement 或 6543。**  
建表用了连接池地址。把不带 `-pooler`、端口是 5432 的直连填进 `DIRECT_URL`，再重新部署。

**连接超时或证书错误。**  
托管库的地址要带 `sslmode=require`。本机自己装的 Postgres 才用 `sslmode=disable`。另外检查数据库没有把 Vercel 的 IP 挡在外面。

**登录页一直转，或提示 `AUTH_SECRET is missing`。**  
Production 里没有 `AUTH_SECRET`，或短于 16 位。填一串新的随机字符，重新部署。不要用仓库里的示例密钥。

**能登录，但上传图片失败，或刷新后图片裂开。**  
`IMAGE_STORAGE` 必须是 `s3`。五个 `S3_` 变量要齐全。`S3_ENDPOINT` 不要带桶名，`S3_PUBLIC_BASE_URL` 不要带路径末尾的斜杠。桶的公开访问要打开。把公开地址贴到浏览器，后面加上一张已经上传的文件名，应能直接看到图。

**页面提示找不到表，或 `The table does not exist`。**  
构建没有跑成 `db:deploy`，或当时数据库地址是错的。看该次部署的构建日志里有没有 `数据库：postgresql`。修正变量后重新部署。

**演示账号登录失败。**  
还没有播种，或播种连的是另一个库。没有演示数据时，用注册即可。

**本地 `npm test` 突然去连线上数据库。**  
终端里还留着 `DATABASE_URL`。关掉终端再开，或执行 `unset DATABASE_URL`。单元测试本身不连接数据库。

**`未知的数据库`。**  
`DATABASE_PROVIDER` 只能是 `sqlite`、`postgresql` 或 `postgres`。

## 怎么验证

本地在改动前，分支上已经是单元测试 116、端到端 59。这一阶段没有改那些断言。

新增 `src/lib/database-provider.test.ts`，锁住这些行为：不填时用 SQLite；两种 Postgres 地址都能认出来；`DATABASE_PROVIDER` 可以覆盖地址；`.env` 不能覆盖已经设置的变量；示例文件仍是 `file:./dev.db`；PostgreSQL 的 schema 只改 datasource，并在有 `DIRECT_URL` 时加上 `directUrl`；SQLite 的清空语句保持原样；PostgreSQL 的清空语句不含 `PRAGMA`，并且先删子表。

本地结果：

| 命令 | 结果 |
| --- | --- |
| `npm test` | 127 通过（116 + 11），退出码 0 |
| `npm run lint` | 无警告，退出码 0 |
| `npm run typecheck` | 退出码 0 |
| `npm run test:e2e` | SQLite，59 通过，约 7.2 分钟 |
| 同一套端到端，`DATABASE_URL` 指向本机 PostgreSQL 16 | 59 通过，约 7.0 分钟。日志是 `数据库：postgresql`，播种仍是 2 个用户、3 个工作区、16 个页面、99 个块 |
| `npm run build` | 生产构建成功，退出码 0 |

原有断言没有删除或放宽。GitHub Actions 的链接在分支头通过之后补上。

## 还没做

- 没有自动备份和告警。Neon、Supabase 自己的备份要在它们的控制台里打开。
- 自定义域名可以在 Vercel 的 Domains 里加。本文停在 `vercel.app`。
- 没有把 SQLite 里已经写好的 `prisma/dev.db` 导入线上。线上是空库，或只有播种的演示数据。
- 页面历史、在线状态还不在这一阶段。
