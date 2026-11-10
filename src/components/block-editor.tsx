"use client"

import {
  ArrowDown,
  ArrowUp,
  Code,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Plus,
  Trash2,
  Type,
} from "lucide-react"
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { blockTextClass, listMarker } from "@/components/block-style"
import { CODE_LANGUAGES, filterCommands, SLASH_COMMANDS, type SlashCommand } from "@/lib/constants"
import { createBlock } from "@/lib/blocks"
import { cn } from "@/lib/cn"
import {
  backspaceAtStart,
  insertBlockAfter,
  moveBlock,
  removeBlock,
  setBlockType,
  splitBlock,
  updateBlock,
} from "@/lib/editor-state"
import { matchBlockShortcut } from "@/lib/shortcuts"
import type { BlockDTO, BlockType } from "@/lib/types"

const ICONS: Record<BlockType, typeof Type> = {
  paragraph: Type,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulleted: List,
  numbered: ListOrdered,
  todo: ListTodo,
  code: Code,
  divider: Minus,
}

type MenuState = {
  kind: "slash" | "actions"
  blockId: string
  query: string
  index: number
}

function autosize(element: HTMLTextAreaElement) {
  element.style.height = "0px"
  element.style.height = `${element.scrollHeight}px`
}

function placeholderFor(block: BlockDTO, active: boolean) {
  if (block.content) return ""
  if (block.type === "paragraph") return active ? "输入文字，或键入 / 插入块" : ""
  if (block.type === "heading1") return "标题 1"
  if (block.type === "heading2") return "标题 2"
  if (block.type === "heading3") return "标题 3"
  if (block.type === "bulleted" || block.type === "numbered") return "列表项"
  if (block.type === "todo") return "待办"
  if (block.type === "code") return "写点代码"
  return ""
}

export type BlockEditorHandle = {
  focusFirst: () => void
}

export function BlockEditor({
  blocks,
  onChange,
  editorRef,
}: {
  blocks: BlockDTO[]
  onChange: (blocks: BlockDTO[]) => void
  editorRef: React.Ref<BlockEditorHandle>
}) {
  const inputRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingCaret = useRef<{ id: string; caret: number } | null>(null)
  const composing = useRef(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [activeId, setActiveId] = useState<string | null>(blocks[0]?.id ?? null)
  const [focusTick, setFocusTick] = useState(0)
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)

  const focusBlock = (id: string, caret: number) => {
    pendingCaret.current = { id, caret }
    setFocusTick((value) => value + 1)
  }

  useLayoutEffect(() => {
    inputRefs.current.forEach((element) => autosize(element))
  }, [blocks])

  useLayoutEffect(() => {
    const pending = pendingCaret.current
    if (!pending) return
    pendingCaret.current = null
    const input = inputRefs.current.get(pending.id)
    if (input) {
      input.focus()
      const caret = Math.max(0, Math.min(pending.caret, input.value.length))
      input.setSelectionRange(caret, caret)
      autosize(input)
      return
    }
    document.getElementById(`block-focus-${pending.id}`)?.focus()
  }, [blocks, focusTick])

  useImperativeHandle(editorRef, () => ({
    focusFirst() {
      const first = blocks.find((block) => block.type !== "divider") ?? blocks[0]
      if (first) focusBlock(first.id, first.content.length)
    },
  }), [blocks])

  const commands = menu?.kind === "slash" ? filterCommands(menu.query) : SLASH_COMMANDS
  const activeIndex = menu ? Math.min(menu.index, Math.max(commands.length - 1, 0)) : 0

  useLayoutEffect(() => {
    if (!menu) {
      setCoords(null)
      return
    }
    const row = rowRefs.current.get(menu.blockId)
    if (!row) return
    const rect = row.getBoundingClientRect()
    const height = 340
    const top = rect.bottom + height > window.innerHeight && rect.top > height ? Math.max(8, rect.top - height) : rect.bottom + 6
    setCoords({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)), top })
  }, [menu, blocks])

  useEffect(() => {
    if (!menu) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      const row = rowRefs.current.get(menu.blockId)
      const popup = document.getElementById("block-command-menu")
      if (row?.contains(target) || popup?.contains(target)) return
      setMenu(null)
    }
    document.addEventListener("mousedown", onPointer)
    return () => document.removeEventListener("mousedown", onPointer)
  }, [menu])

  function choose(type: BlockType) {
    if (!menu) return
    const block = blocks.find((item) => item.id === menu.blockId)
    if (!block) return
    const content = menu.kind === "slash" || type === "divider" ? "" : block.content
    onChange(setBlockType(blocks, block.id, type, { content, checked: type === "todo" ? block.checked : false }))
    focusBlock(block.id, content.length)
    setMenu(null)
  }

  function insertBelow(blockId: string) {
    const created = createBlock()
    onChange(insertBlockAfter(blocks, blockId, created))
    focusBlock(created.id, 0)
    setMenu({ kind: "slash", blockId: created.id, query: "", index: 0 })
  }

  return (
    <div data-testid="block-editor" className="relative">
      {blocks.map((block, index) => {
        const marker = listMarker(block.type, index, blocks)
        const active = activeId === block.id
        return (
          <div
            key={block.id}
            ref={(node) => {
              if (node) rowRefs.current.set(block.id, node)
              else rowRefs.current.delete(block.id)
            }}
            data-testid="block"
            data-block-type={block.type}
            className="group relative py-[2px]"
            onFocus={() => setActiveId(block.id)}
          >
            <div
              className={cn(
                "items-center gap-0.5 sm:absolute sm:-left-14 sm:top-1 sm:transition-opacity",
                active ? "mb-1 flex sm:mb-0 sm:opacity-100" : "hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
              )}
            >
              <button
                type="button"
                aria-label="在下方插入块"
                data-testid="insert-block"
                className="rounded p-1 text-faint hover:bg-black/[0.06] hover:text-ink"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertBelow(block.id)}
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                aria-label="块操作"
                data-testid="block-menu"
                className="rounded p-1 text-faint hover:bg-black/[0.06] hover:text-ink"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setMenu({ kind: "actions", blockId: block.id, query: "", index: 0 })}
              >
                <GripVertical size={15} />
              </button>
            </div>

            {block.type === "divider" ? (
              <div
                id={`block-focus-${block.id}`}
                tabIndex={0}
                role="separator"
                data-testid="divider"
                className="rounded px-1 py-2 outline-none focus-visible:bg-black/[0.03]"
                onKeyDown={(event) => {
                  if (event.key === "Backspace" || event.key === "Delete") {
                    event.preventDefault()
                    const result = removeBlock(blocks, block.id)
                    onChange(result.blocks)
                    focusBlock(result.focusId, result.caret)
                  }
                  if (event.key === "Enter") {
                    event.preventDefault()
                    const result = splitBlock(blocks, block.id, 0, 0)
                    onChange(result.blocks)
                    focusBlock(result.focusId, result.caret)
                  }
                }}
              >
                <hr className="border-black/10" />
              </div>
            ) : (
              <div className="flex items-start gap-2">
                {block.type === "todo" ? (
                  <input
                    type="checkbox"
                    data-testid="todo-toggle"
                    checked={block.checked}
                    onChange={(event) => onChange(updateBlock(blocks, block.id, { checked: event.target.checked }))}
                    className="mt-[7px] h-4 w-4 shrink-0 accent-ink"
                    aria-label="完成待办"
                  />
                ) : null}
                {marker ? <span className="mt-[2px] w-6 shrink-0 text-right text-muted">{marker}</span> : null}
                <div className={cn("min-w-0 flex-1", block.type === "code" && "rounded-md bg-sidebar")}>
                  {block.type === "code" ? (
                    <label className="flex items-center justify-between px-3 pt-1.5 text-[11px] text-faint">
                      语言
                      <select
                        data-testid="code-language"
                        value={block.language}
                        onChange={(event) => onChange(updateBlock(blocks, block.id, { language: event.target.value }))}
                        className="bg-transparent text-xs text-muted outline-none"
                      >
                        {CODE_LANGUAGES.map((language) => (
                          <option key={language || "plain"} value={language}>
                            {language || "纯文本"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <textarea
                    ref={(node) => {
                      if (node) inputRefs.current.set(block.id, node)
                      else inputRefs.current.delete(block.id)
                    }}
                    data-testid="block-input"
                    value={block.content}
                    rows={1}
                    spellCheck={block.type !== "code"}
                    placeholder={placeholderFor(block, active)}
                    aria-label={placeholderFor(block, true) || "块内容"}
                    onFocus={() => setActiveId(block.id)}
                    onCompositionStart={() => {
                      composing.current = true
                    }}
                    onCompositionEnd={() => {
                      composing.current = false
                    }}
                    onChange={(event) => {
                      const value = event.target.value
                      autosize(event.target)
                      onChange(updateBlock(blocks, block.id, { content: value }))
                      if (block.type !== "code" && value.startsWith("/") && !value.includes("\n")) {
                        setMenu({ kind: "slash", blockId: block.id, query: value.slice(1), index: 0 })
                      } else if (menu?.kind === "slash" && menu.blockId === block.id) {
                        setMenu(null)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing || composing.current) return
                      const input = event.currentTarget
                      if (menu?.blockId === block.id && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === "Tab" || event.key === "Escape")) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault()
                          setMenu({ ...menu, index: activeIndex + 1 })
                          return
                        }
                        if (event.key === "ArrowUp") {
                          event.preventDefault()
                          setMenu({ ...menu, index: Math.max(activeIndex - 1, 0) })
                          return
                        }
                        if (event.key === "Escape") {
                          event.preventDefault()
                          setMenu(null)
                          return
                        }
                        if ((event.key === "Enter" || event.key === "Tab") && commands[activeIndex]) {
                          event.preventDefault()
                          choose(commands[activeIndex].type)
                          return
                        }
                      }

                      if (event.key === " " && block.type === "paragraph" && !menu) {
                        const before = input.value.slice(0, input.selectionStart)
                        const after = input.value.slice(input.selectionEnd)
                        const matched = matchBlockShortcut(before)
                        if (matched) {
                          event.preventDefault()
                          onChange(setBlockType(blocks, block.id, matched.type, { content: after, checked: matched.checked }))
                          focusBlock(block.id, after.length)
                          return
                        }
                      }

                      if (block.type === "paragraph" && input.selectionStart === input.value.length && input.selectionStart === input.selectionEnd) {
                        if (event.key === "-" && input.value === "--") {
                          event.preventDefault()
                          onChange(setBlockType(blocks, block.id, "divider"))
                          focusBlock(block.id, 0)
                          return
                        }
                        if (event.key === "`" && input.value === "``") {
                          event.preventDefault()
                          onChange(setBlockType(blocks, block.id, "code", { content: "" }))
                          focusBlock(block.id, 0)
                          return
                        }
                      }

                      if (event.key === "Enter" && !event.shiftKey && block.type !== "code") {
                        event.preventDefault()
                        const result = splitBlock(blocks, block.id, input.selectionStart, input.selectionEnd)
                        onChange(result.blocks)
                        focusBlock(result.focusId, result.caret)
                        return
                      }
                      if (block.type === "code" && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        const result = splitBlock(blocks, block.id, input.value.length, input.value.length)
                        onChange(result.blocks)
                        focusBlock(result.focusId, result.caret)
                        return
                      }
                      if (block.type === "code" && event.key === "Tab") {
                        event.preventDefault()
                        const start = input.selectionStart
                        const value = `${input.value.slice(0, start)}  ${input.value.slice(input.selectionEnd)}`
                        onChange(updateBlock(blocks, block.id, { content: value }))
                        focusBlock(block.id, start + 2)
                        return
                      }
                      if (event.key === "Backspace" && input.selectionStart === 0 && input.selectionEnd === 0) {
                        const result = backspaceAtStart(blocks, block.id)
                        if (result) {
                          event.preventDefault()
                          onChange(result.blocks)
                          focusBlock(result.focusId, result.caret)
                        }
                        return
                      }
                      if (event.key === "ArrowUp" && input.selectionStart === 0 && input.selectionEnd === 0 && index > 0) {
                        const previous = blocks[index - 1]
                        event.preventDefault()
                        focusBlock(previous.id, previous.type === "divider" ? 0 : previous.content.length)
                        return
                      }
                      if (event.key === "ArrowDown" && input.selectionStart === input.value.length && input.selectionEnd === input.value.length && index < blocks.length - 1) {
                        const next = blocks[index + 1]
                        event.preventDefault()
                        focusBlock(next.id, 0)
                      }
                    }}
                    className={cn(
                      blockTextClass(block.type),
                      block.type === "code" && "px-3 pb-2.5",
                      block.checked && "text-muted line-through",
                    )}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
      {menu && coords
        ? createPortal(
            <div
              id="block-command-menu"
              data-testid="slash-menu"
              className="fixed z-50 max-h-[340px] w-[280px] overflow-auto rounded-lg bg-white py-1 shadow-pop"
              style={{ left: coords.left, top: coords.top }}
            >
              <div className="px-3 py-1.5 text-[11px] font-medium text-faint">{menu.kind === "slash" ? "插入块" : "转换成"}</div>
              {commands.length === 0 ? <div className="px-3 py-2 text-sm text-muted">没有匹配的块</div> : null}
              {commands.map((command, commandIndex) => (
                <CommandRow
                  key={command.type}
                  command={command}
                  active={commandIndex === activeIndex}
                  onHover={() => setMenu({ ...menu, index: commandIndex })}
                  onSelect={() => choose(command.type)}
                />
              ))}
              {menu.kind === "actions" ? (
                <div className="mt-1 border-t border-black/[0.06] p-1">
                  <MenuAction label="上移" icon={ArrowUp} onClick={() => { onChange(moveBlock(blocks, menu.blockId, -1)); setMenu(null) }} />
                  <MenuAction label="下移" icon={ArrowDown} onClick={() => { onChange(moveBlock(blocks, menu.blockId, 1)); setMenu(null) }} />
                  <MenuAction
                    label="删除"
                    icon={Trash2}
                    danger
                    onClick={() => {
                      const result = removeBlock(blocks, menu.blockId)
                      onChange(result.blocks)
                      focusBlock(result.focusId, result.caret)
                      setMenu(null)
                    }}
                  />
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function CommandRow({
  command,
  active,
  onHover,
  onSelect,
}: {
  command: SlashCommand
  active: boolean
  onHover: () => void
  onSelect: () => void
}) {
  const Icon = ICONS[command.type]
  return (
    <button
      type="button"
      data-testid={`slash-${command.type}`}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn("flex w-full items-center gap-2 px-2 py-1.5 text-left", active && "bg-black/[0.05]")}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-black/[0.06] bg-cream text-ink">
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm">{command.label}</span>
        <span className="block text-xs text-muted">{command.hint}</span>
      </span>
    </button>
  )
}

function MenuAction({
  label,
  icon: Icon,
  onClick,
  danger,
}: {
  label: string
  icon: typeof Trash2
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/[0.05]", danger && "text-danger")}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}
