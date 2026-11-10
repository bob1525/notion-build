# GitHub Actions CI

阶段 1 给仓库加上可触发的持续集成。推送和拉取请求都会跑检查。单元测试是必须通过的项，端到端也放进了同一个 workflow，单独一个 job。

## 做了什么

新增 `.github/workflows/ci.yml`，并在 `package.json` 增加 `typecheck`：`tsc --noEmit --incremental false`。`--incremental false` 避免本地残留的 `tsconfig.tsbuildinfo` 把已经不存在的 `.next/types` 文件算进这次检查。

`check` 在 `ubuntu-latest`、Node.js 20 上执行。`e2e` 固定在 `ubuntu-24.04`，原因见「发现的问题」。`npm ci` 会跑 `postinstall` 里的 `prisma generate`。

| Job | 步骤 | 作用 |
| --- | --- | --- |
| `check` | `actions/checkout@v4` | 检出触发这次运行的提交 |
| `check` | `actions/setup-node@v4`，`cache: npm` | 安装 Node 20，并按 lockfile 缓存依赖 |
| `check` | `npm ci` | 按 `package-lock.json` 安装，包含开发依赖 |
| `check` | `npm run lint` | `next lint`，有警告或错误则失败 |
| `check` | `npm run typecheck` | 不生成文件的 TypeScript 检查 |
| `check` | `npm test` | Vitest 单元测试。这一项必须通过 |
| `e2e` | 同样的检出、Node、`npm ci`，系统是 Ubuntu 24.04 | 与 lint job 隔离，互不等待 |
| `e2e` | `npx playwright install --with-deps chromium` | 安装 Chromium 和系统库 |
| `e2e` | `npm run test:e2e` | `prisma db push`、播种、再跑 Playwright。服务器由配置里的 `webServer` 启动 `next dev` |
| `e2e` | 失败时 `actions/upload-artifact@v4` | 上传 `test-results`，里面有失败用例的截图、录像和 trace |

没有单独配置密钥。`scripts/ensure-env.cjs` 在没有 `.env` 时复制 `.env.example`，其中是本地 SQLite 路径和开发用 `AUTH_SECRET`。数据库文件留在 runner 上，任务结束即丢弃。

## 触发条件

```yaml
on:
  push:
  pull_request:
```

- `push`：任何分支的推送，包括向 `cursor/folio-knowledge-base-693a` 推送。
- `pull_request`：打开、同步或重新打开拉取请求。PR #1 的同步会再跑一次，`github.ref` 是 `refs/pull/1/merge`。

`permissions.contents` 只读。`concurrency` 按 workflow 和 `github.ref` 分组，新的一次会取消同一 ref 上还在跑的旧一次。一次推送会同时产生 push 和 pull_request 两个 ref，所以 PR 分支上通常有两条运行，它们不会互相取消。

`check` 超时 15 分钟，`e2e` 超时 30 分钟。

## 怎么在 GitHub 上看

1. 打开 [Actions](https://github.com/bob1525/notion-build/actions)，workflow 名称是 CI。
2. 或打开 [PR #1](https://github.com/bob1525/notion-build/pull/1) 的 Checks。
3. 点进一次运行可以看到 `lint, typecheck, unit` 和 `playwright` 两个 job。端到端失败时，Artifacts 里有 `playwright-results`。

用命令行看这个仓库的运行：

```bash
gh api repos/bob1525/notion-build/actions/runs?per_page=5
```

## 验证方法与结果

阶段开始前先在本地跑现有套件，没有改测试：

| 命令 | 结果 |
| --- | --- |
| `npm test` | 14 个文件，77 / 77，约 1.2 秒，退出码 0 |
| `npm run test:e2e` | 48 / 48，5.2 分钟，退出码 0 |
| `npm run lint` | `No ESLint warnings or errors`，退出码 0。输出里有一行 Next.js 16 将移除 `next lint` 的提示，不导致失败 |
| `npm run typecheck` | 退出码 0。另外在移走 `.next` 并删掉 `tsconfig.tsbuildinfo` 之后再跑 `tsc --noEmit --incremental false`，退出码仍是 0，对应 CI 的干净检出 |

GitHub 上的运行结果写在下一节。本地这四条是 CI 步骤的等价命令。

## GitHub Actions 运行

提交 `f173d33`（把端到端改到 Ubuntu 24.04）在 PR #1 上触发了两条运行，都成功：

| 事件 | 运行 | 结果 |
| --- | --- | --- |
| `pull_request` | [42847585112](https://github.com/bob1525/notion-build/actions/runs/42847585112) | 成功。`lint, typecheck, unit` 44 秒；`playwright` 7 分 19 秒 |
| `push` | [42847573313](https://github.com/bob1525/notion-build/actions/runs/42847573313) | 成功 |

PR 运行的日志里：`npm run lint` 打印 `No ESLint warnings or errors`；`npm test` 是 `77 passed (77)`；`npm run test:e2e` 是 `48 passed (6.4m)`。typecheck 步骤是绿的。失败才上传的 Playwright 产物被跳过。

更早一次 `dad0ae1` 的 PR 运行 [42847210181](https://github.com/bob1525/notion-build/actions/runs/42847210181) 里，`check` 已经通过，`playwright` 在安装 Chromium 时失败。那次用的是 `ubuntu-latest`。修复后的运行才算这一阶段的通过证据。

提交这份文档会再触发同一套 workflow。步骤没有变。

## 发现的问题

和正在跑的 `next dev` 同时执行 `tsc --noEmit` 时，`.next/types` 正被写到一半，TypeScript 报 TS6053（include 匹配到的文件不存在），退出码 2。等开发服务器停稳后再跑，退出码 0。CI 的 typecheck 在独立 job 里、并且不启动 Next，不和这次竞态叠在一起。本地要用 `npm run typecheck`，不要在 dev 刚启动的那几秒里手跑 `tsc`。

第一次端到端 job 跑在 `ubuntu-latest` 上。2026-11-10 这个标签已经是 Ubuntu 26.04，Playwright 1.57.0 拒绝安装依赖：`Playwright does not support chromium on ubuntu26.04-x64`。日志来自运行 [42847210181](https://github.com/bob1525/notion-build/actions/runs/42847210181)。`check` job 在同一次运行里已经通过。端到端 job 因此改到 `ubuntu-24.04`。lint 和单元测试仍用 `ubuntu-latest`。

`actions/checkout@v4` 和 `actions/setup-node@v4` 有一条注解：这些 action 面向 Node 20，runner 把它们放在 Node 24 上执行。检查本身没有因此失败。项目的 Node 仍由 `setup-node` 装成 20。

`gh run list` 这次没有列出运行，REST API `repos/bob1525/notion-build/actions/runs` 可以看见。查看结果以 Actions 页面或这个 API 为准。

## 当前限制

- 端到端已经纳入 workflow，并且是必须通过的 job，不是可有可无的一步。单元测试在 `check` job，不依赖浏览器。
- 端到端 job 固定 Ubuntu 24.04。当时的 `ubuntu-latest` 是 26.04，Playwright 1.57 装不上 Chromium 依赖。
- 端到端用 `next dev`，和本地 `npm run test:e2e` 相同，不是 `next build && next start`。一次大约数分钟，还要下载 Chromium。
- 没有缓存 Playwright 浏览器。每次 job 都重新安装，换来的是和 lockfile 里的 Playwright 版本一致。
- `next lint` 在 Next.js 16 会去掉。现在它仍然是 lint 步骤，警告不失败。这次没有改成独立的 ESLint CLI。
- 失败产物只在端到端 job 失败时上传，成功的运行不保留 trace。
