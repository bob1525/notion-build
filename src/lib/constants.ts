import type { BlockType, CoverId } from "@/lib/types"

export type SlashCommand = {
  type: BlockType
  label: string
  hint: string
  keywords: string
  group: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { type: "paragraph", label: "文本", hint: "普通段落", keywords: "text paragraph p 文本 段落", group: "基础" },
  { type: "heading1", label: "标题 1", hint: "大标题", keywords: "h1 heading title 标题", group: "基础" },
  { type: "heading2", label: "标题 2", hint: "中标题", keywords: "h2 heading 标题", group: "基础" },
  { type: "heading3", label: "标题 3", hint: "小标题", keywords: "h3 heading 标题", group: "基础" },
  { type: "bulleted", label: "无序列表", hint: "圆点列表", keywords: "bullet list ul 列表 无序", group: "列表" },
  { type: "numbered", label: "有序列表", hint: "数字编号", keywords: "numbered ol 列表 有序", group: "列表" },
  { type: "todo", label: "待办", hint: "可勾选的清单", keywords: "todo task checkbox 待办 清单 任务", group: "列表" },
  { type: "code", label: "代码", hint: "等宽代码块", keywords: "code snippet 代码", group: "高级" },
  { type: "divider", label: "分割线", hint: "把内容隔开", keywords: "divider hr line 分割 分隔", group: "高级" },
]

export function filterCommands(query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) =>
    `${command.label} ${command.hint} ${command.keywords}`.toLowerCase().includes(needle),
  )
}

export const EMOJIS = [
  "📄",
  "📝",
  "📌",
  "📁",
  "📚",
  "✨",
  "💡",
  "🎯",
  "🚀",
  "🌿",
  "🔬",
  "🧪",
  "🗺️",
  "📅",
  "✅",
  "🧠",
  "💬",
  "🎨",
  "🛠️",
  "📦",
  "⭐",
  "🔒",
  "👀",
  "🧩",
  "🧭",
  "🏷️",
  "🧮",
  "🧾",
  "🗒️",
  "🌱",
  "🔥",
  "⌨️",
  "💭",
  "📘",
]

export const COVERS: { id: CoverId; label: string }[] = [
  { id: "", label: "无" },
  { id: "warm", label: "暖沙" },
  { id: "mist", label: "薄雾" },
  { id: "moss", label: "森绿" },
  { id: "ink", label: "墨蓝" },
  { id: "rose", label: "玫瑰" },
]

export const CODE_LANGUAGES = ["", "typescript", "javascript", "python", "sql", "bash", "json", "markdown"]
