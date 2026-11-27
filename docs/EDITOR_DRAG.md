# 同级块拖拽

阶段 1.2 和 1.3 的实现说明。拖拽只改变同一页里的兄弟顺序，不改变块类型，也不做跨页面移动。

## 怎么拖

每个块左侧的握把是 `data-testid="block-drag"`。`pointerdown` 发生在这个按钮上，不发生在文本框上。移动超过 4px 才算拖拽；小于这个距离就松手，仍然打开原来的块菜单（上移、下移、删除、转换类型）。

拖拽过程中在 `window` 上听 `pointermove` / `pointerup`，不依赖浏览器把后续事件继续派发给按钮。`elementFromPoint` 找到指针下的 `[data-block-id]`，和行高中线比较：上半是 `before`，下半是 `after`。目标行画出 `data-testid="drop-indicator"` 的 2px 横线。松手调用 `reorderBlocks(blocks, sourceId, targetId, placement)`，再走原来的 500ms 自动保存。刷新后顺序来自 `Block.position`。

拖到自己身上会被忽略。源块从数组里摘出后再按目标的新下标插入，所以「拖到首位」「拖到末位」「插到中间」用的是同一条路径。

## 和文本选择分开

- 握把和文本框是两个元素。在文本框里拖动只会选出文字。
- 握把的 `pointerdown` 调用 `preventDefault`，避免按下时开始选中正文。
- 拖拽期间给 `document.body` 设 `user-select: none`，松手后清掉。
- 握把在桌面宽度上用绝对定位放在块的左侧，平时透明，悬停或当前块才显示。透明不改变命中区域，Playwright 仍能拿到 `boundingBox`。

块菜单里的上移 / 下移还在，给没有指针的操作留一条路。

## 光标和空块

`splitBlock` / `backspaceAtStart` 现在按这个约定工作：

| 操作 | 结果 |
| --- | --- |
| 空块按 Enter | 在下方新建一个同类型块。空代码块也再建一个代码块，空分割线再建一条分割线。 |
| 空块按 Backspace | 删掉该块，光标落到上一块末尾。页面里只剩一块时，把它变成空段落，不把页面删掉。 |
| 块首按 Backspace，上一块是普通文本块 | 两块合并。`concatInline` 把后一块的 `marks` 平移到拼接处。 |
| 块首按 Backspace，这是第一块且不是段落 | 先变回段落，和原来的标题退格约定一致。 |
| 上一块是代码或分割线 | 不合并。 |
| 非空代码块按 Enter | 仍然是换行。Cmd/Ctrl+Enter 在后面插入段落。 |
| 非空普通块按 Enter | 从光标切开。列表和待办延续原类型，标题和段落开一个新段落。选中的文字会被这次切开去掉。 |

切开和合并都会拆开或接上 `marks`，所以加粗不会在边界上粘错。

## 测试

拖拽 6 个端到端：拖到首位、末位、中间、连续两次、拖拽中出现插入线且松手后消失、中段块先拖到最上再拖到最下。前四项和最后一项都会刷新，确认顺序还在。

空块 5 个端到端：空段落 Enter、空标题 Enter、空块 Backspace 后继续输入落在上一块末尾、块首 Backspace 合并后输入落在拼接处、空代码块 Enter。

单元测试里，空待办 Enter 的旧断言已改成「再插入一个待办」，没有删掉这条用例。另外补了 `reorderBlocks` 和合并时保留 marks。汇总见 [PHASE1_TESTS.md](./PHASE1_TESTS.md)。
