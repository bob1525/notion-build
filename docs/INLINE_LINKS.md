# 行内链接

链接是一种行内 mark，和加粗、斜体、删除线、行内代码放在同一份 `marks` 里。正文仍然是纯文本。地址只存在 `href` 上，并且只保留 `http:` 和 `https:`。

## 数据结构

```ts
type InlineMark = {
  type: "bold" | "italic" | "code" | "strike" | "link"
  start: number
  end: number
  href?: string
}
```

只有 `type: "link"` 会留下 `href`。`normalizeMarks` 用 `sanitizeLinkHref` 检查地址：去掉首尾空白，拒绝控制字符、空白、`javascript:`（含大小写和一层 URL 编码）、`data:` 以及其他协议，也拒绝带用户名或密码的地址。没有协议的 `example.com` 会补成 `https://example.com/`。非法地址整段丢掉，不会变成可点的链接。

保存仍然走原来的 `PATCH`。`inlineMarkSchema` 允许多一个最长 2000 字符的 `href`。服务端读回时再走一遍 `normalizeMarks`，所以写进 SQLite 的 JSON 里也不会留下 `javascript:`。版本号和冲突对话框没有单独分支，链接就是正文 mark 的一部分。

## 交互

- 选中文字后，浮动条有链接按钮（`format-link`）。弹出小框填写地址，应用（`link-apply`）或移除（`link-remove`）。
- 有选区，或者光标在一段链接里时，Cmd/Ctrl+K 打开同一个小框。页面加载前就在 `document` 上监听捕获阶段，赶在 React 把选区收掉之前取消按键，再用一个属性通知编辑器打开小框。搜索要等按键结束，发现没被取消，才打开。没有选区、光标也不在链接里时，Cmd/Ctrl+K 仍是搜索。
- 编辑态的文字层在文本框下面，并且 `pointer-events: none`。点文字是移动光标。要打开地址，用小框里的「打开」（`link-open`），新标签页，`rel="noopener noreferrer"`。
- 分享页和 Markdown 预览用真正的 `<a target="_blank">`，可以直接点。
- 打出 `[文字](https://…)` 会收成 link mark。Markdown 导出写成同样的语法。链接里面的加粗仍然用 `**`。代码块不解析链接。

## 验证

本地命令：

| 命令 | 结果 |
| --- | --- |
| `npm test` | 84 / 84，退出码 0 |
| `npm run lint` | 无警告，退出码 0 |
| `npm run typecheck` | 退出码 0 |
| `npx playwright test e2e/inline-links.spec.ts` | 2 / 2 |
| `npm run test:e2e` | 50 / 50，6.0 分钟，退出码 0。阶段开始前的 77 个单元测试和 48 个端到端测试都还在 |

新增单元测试 7 个。`src/lib/rich-text.test.ts` 6 个，`src/lib/markdown.test.ts` 1 个：

| 测试 | 结果 |
| --- | --- |
| 解析 `[文档](https://example.com/docs)` 并序列化回去 | 通过。正文是「看 文档 吧」，mark 从 2 到 4 |
| 链接里的加粗渲染成一段，再往返一次 mark 不变 | 通过 |
| 拒绝 `javascript:`、`JaVaScRiPt:`、`data:` 和带账号密码的 https。解析时把危险写法留成纯文本，`setInlineLink` 返回 null，`normalizeMarks` 丢掉这种 mark | 通过 |
| 给「你好」加 `example.com`，改成 `https://folio.dev/docs`，再移除 | 通过。裸域名补成 `https://example.com/` |
| 在链接前插入文字，地址跟着区间走；打出 markdown 链接后光标映射到纯文本末尾 | 通过 |
| 从中间拆开再拼回去，地址还在 | 通过 |
| `blocksToMarkdown` / `markdownToBlocks` 往返一段链接；`javascript:` 段落没有 mark | 通过 |

新增端到端 2 个，都在 `e2e/inline-links.spec.ts`：

| 测试 | 结果 |
| --- | --- |
| 浮动条添加链接，刷新后还在；Ctrl+K 修改地址且不打开搜索；「打开」新开欢迎页；移除后刷新，文字还在、链接没有了 | 通过 |
| `javascript:alert(1)` 出现「只接受 http 或 https 链接」，正文不变；合法地址写入 Markdown 源码和预览；公开后在分享页点链接，新标签打开欢迎页 | 通过 |

## 发现的问题

编辑层盖在链接上面，所以编辑时不能直接点字打开。这是为了让点文字仍然移动光标。打开动作放在小框的「打开」里。分享页和预览没有文本框，锚点可以点。端到端两边都点过。

Cmd/Ctrl+K 原先是全局搜索。编辑器在捕获阶段先看文本框：当前有选区，或者浮动条还记着刚才的选区，或者光标在链接里，就把按键 `preventDefault` 并打开链接框。搜索的冒泡监听看到已取消的按键就不再打开。空光标且不在链接里时，仍打开搜索。

GitHub Actions 上 [42853363714](https://github.com/bob1525/notion-build/actions/runs/42853363714) 和 [42854852535](https://github.com/bob1525/notion-build/actions/runs/42854852535) 都停在 `search-input` 数量为 1。无头 Chromium 里 Playwright 的 `press("Control+k")` 会先聚焦文本框，选区被收成空光标，搜索的窗口监听又先于编辑器拿到按键。端到端在同一次调用里设好选区，再向文本框派发 Ctrl+K。这次按键到达 `document` 时选区还在；React 的 `select` 处理会紧接着把选区收成空光标。所以链接快捷键写在 hydration 之前的捕获监听里，并用 `stopImmediatePropagation` 拦住后面的监听。搜索改到按键结束后再看 `defaultPrevented`。

第一次端到端把链接指到 `/login` 和 `/register`。点击确实打开了新标签，但已登录的会话会立刻被送到 `/w/ws_product`，断言就失败了。这不是链接被改写。测试改成打开公开的欢迎页，新标签停在 `/share/page_welcome`。

链接文字里如果再出现 `](`，Markdown 往返会在第一处 `](` 截断。普通标题和句子不会碰到。这次没有为这种嵌套做转义。
