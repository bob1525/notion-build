# 阶段 1 测试汇总

命令：`npm test`，`npm run test:e2e`。后者会 `prisma db push`、重新播种，再用 Playwright（Chromium，1 worker）打开 `http://127.0.0.1:3000`。

阶段 1 首次交付时的全量结果是单元 40、端到端 20。斜体光标修正之后又加了 1 个单元测试和 1 个端到端测试，这两条都通过。当时的 40 和 20 没有删除。这张表只统计阶段 1 和这次斜体修正。后面阶段的全量数字写在 [NEW_BLOCKS.md](./NEW_BLOCKS.md)。

| 套件 | 通过 | 失败 |
| --- | --- | --- |
| 单元测试 Vitest（含斜体修正） | 41 | 0 |
| 端到端 Playwright（含斜体修正） | 21 | 0 |

阶段开始前是单元 29、端到端 8，这 37 个都还在，并且通过。没有删除或放宽原有断言。空待办按 Enter 的单元用例改成了新约定：空块 Enter 在下方新建同类型块，用例名称改为 “creates another block of the same type when Enter is pressed in an empty block”。

## 新增数量

| 位置 | 新增 | 覆盖 |
| --- | --- | --- |
| `src/lib/rich-text.test.ts` | 9 | 解析四种格式、嵌套渲染、代码不透明、中间加粗后取消、部分取消、第二种格式叠加上去、插入删除时区间移动、打出 `**` 后光标映射、序列化往返 |
| `src/lib/editor-state.test.ts` | 2 | `reorderBlocks` 的前/后/中间/拖到自己；合并时加粗和斜体的下标 |
| `e2e/editor-phase1.spec.ts` | 12 | 见下表 |
| `src/lib/inline-style.test.ts` | 1 | 斜体使用不改变占位宽度的 skew，而不是 `font-style: italic` |
| `e2e/editor-phase1.spec.ts` 斜体对齐 | 1 | 「乙丙」的斜体 `offsetWidth` 与正体测量相差不超过 1px |
| 合计 | 25 | 阶段 1 要求的下限是 8 个格式单元测试、6 个拖拽端到端、5 个光标端到端；斜体对齐是对「无光标丢失」的补充 |

## 端到端明细

| 测试 | 子步骤 |
| --- | --- |
| drags a block to the first position and keeps the order after reload | 1.2 拖到首位，刷新后仍是丙、甲、乙 |
| drags a block to the last position and keeps the order after reload | 1.2 拖到末位 |
| drags a block into the middle of its siblings | 1.2 拖到中间 |
| handles two drags in a row without losing the final order | 1.2 连续两次拖拽 |
| shows an insertion line while dragging and hides it after release | 1.2 插入线出现且松手后消失 |
| drags the middle block above the first and below the last in succession | 1.2 再一次连续拖拽并刷新 |
| creates a sibling of the same type when Enter is pressed in an empty paragraph | 1.3 空段落 Enter |
| creates another heading when Enter is pressed in an empty heading | 1.3 空标题 Enter，两块都是 heading1 |
| removes an empty block with Backspace and puts the caret at the end of the previous block | 1.3 空块 Backspace，继续输入接在上一块末尾 |
| merges a block into the previous one when Backspace is pressed at the start | 1.3 块首 Backspace 合并，输入落在拼接处 |
| creates another code block when Enter is pressed in an empty code block | 1.3 空代码块 Enter |
| saves bold, italic, strike, and inline code, then reloads them | 1.1 快捷键、`/` 菜单、浮动条、打出行内代码，刷新后仍在；再按 Ctrl+B 取消加粗并刷新 |
| keeps the caret aligned with italic text | 斜体修正。覆盖层占位宽度与文本框正体一致 |

相关说明：[EDITOR_RICH_TEXT.md](./EDITOR_RICH_TEXT.md)、[EDITOR_DRAG.md](./EDITOR_DRAG.md)。
