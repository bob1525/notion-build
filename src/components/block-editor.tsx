"use client"

import {
  ArrowDown,
  ArrowUp,
  Bold,
  Code,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  ChevronRight,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Plus,
  Quote,
  Strikethrough,
  Trash2,
  Type,
} from "lucide-react"
import { memo, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { blockTextClass, listMarker } from "@/components/block-style"
import { CodeText } from "@/components/code-text"
import { DividerRule } from "@/components/divider-rule"
import { ImageBlock } from "@/components/image-block"
import { InlineText } from "@/components/inline-text"
import { CODE_LANGUAGES, filterCommands, filterFormatCommands, SLASH_COMMANDS, type SlashCommand } from "@/lib/constants"
import { createBlock } from "@/lib/blocks"
import { cn } from "@/lib/cn"
import {
  backspaceAtStart,
  insertBlockAfter,
  insertChild,
  moveBlock,
  nestUnderPrevious,
  removeBlock,
  reorderBlocks,
  setBlockType,
  splitBlock,
  unnestBlock,
  updateBlock,
} from "@/lib/editor-state"
import { applyTextChange, clearInlineLink, consumeInlineMarkup, linkCovering, mapCaret, marksAtCaret, marksCovering, sanitizeLinkHref, setInlineLink, toggleInlineMark } from "@/lib/rich-text"
import { matchBlockShortcut } from "@/lib/shortcuts"
import type { BlockDTO, BlockType, InlineMarkType } from "@/lib/types"

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
  quote: Quote,
  toggle: ChevronRight,
  image: ImageIcon,
}

type MenuState = {
  kind: "slash" | "actions"
  blockId: string
  query: string
  index: number
}

type LinkEditorState = {
  blockId: string
  start: number
  end: number
  value: string
  error: string
  savedHref: string
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
  if (block.type === "quote") return "引用"
  if (block.type === "toggle") return "折叠标题"
  return ""
}

const EMPTY_BLOCKS: BlockDTO[] = []

function sameBlocks(left: BlockDTO[], right: BlockDTO[]) {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const RowGate = memo(function RowGate({
  render,
}: {
  block: BlockDTO
  marker: string | null
  active: boolean
  drop: "before" | "after" | null
  childBlocks: BlockDTO[]
  render: () => ReactNode
}) {
  return render()
}, (prev, next) => prev.block === next.block && prev.active === next.active && prev.drop === next.drop && prev.marker === next.marker && sameBlocks(prev.childBlocks, next.childBlocks))

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
  const pendingCaret = useRef<{ id: string; caret: number; anchor?: number } | null>(null)
  const composing = useRef(false)
  const blocksRef = useRef(blocks)
  const selectionRef = useRef<{ blockId: string; start: number; end: number } | null>(null)
  const openLinkEditorRef = useRef<(block: BlockDTO, start: number, end: number) => void>(() => {})
  const dragSource = useRef<string | null>(null)
  const pendingFormat = useRef<{ blockId: string; marks: InlineMarkType[]; caret: number } | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [activeId, setActiveId] = useState<string | null>(blocks[0]?.id ?? null)
  const [focusTick, setFocusTick] = useState(0)
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)
  const [selection, setSelection] = useState<{ blockId: string; start: number; end: number } | null>(null)
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null)
  const [linkBox, setLinkBox] = useState<{ left: number; top: number } | null>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: "before" | "after" } | null>(null)
  const [toolbar, setToolbar] = useState<{ left: number; top: number } | null>(null)
  const dropRef = useRef(dropTarget)
  blocksRef.current = blocks
  selectionRef.current = selection
  dropRef.current = dropTarget

  const focusBlock = (id: string, caret: number, anchor = caret) => {
    pendingCaret.current = { id, caret, anchor }
    setFocusTick((value) => value + 1)
  }

  useLayoutEffect(() => {
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement && active.dataset.testid === "block-input") {
      autosize(active)
      return
    }
    inputRefs.current.forEach((element) => autosize(element))
  }, [blocks])

  useLayoutEffect(() => {
    if (!selection || selection.start === selection.end) {
      setToolbar(null)
      return
    }
    const row = rowRefs.current.get(selection.blockId)
    if (!row) return
    const rect = row.getBoundingClientRect()
    setToolbar({ left: Math.max(8, rect.left), top: Math.max(8, rect.top - 42) })
  }, [selection, blocks])

  useLayoutEffect(() => {
    const pending = pendingCaret.current
    if (!pending) return
    pendingCaret.current = null
    const input = inputRefs.current.get(pending.id)
    if (input) {
      input.focus()
      const caret = Math.max(0, Math.min(pending.caret, input.value.length))
      const anchor = Math.max(0, Math.min(pending.anchor ?? caret, input.value.length))
      input.setSelectionRange(anchor, caret)
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

  const formatItems = menu?.kind === "slash" ? filterFormatCommands(menu.query) : []
  const commands = menu?.kind === "slash" ? filterCommands(menu.query) : SLASH_COMMANDS
  const menuCount = formatItems.length + commands.length
  const activeIndex = menu ? Math.min(menu.index, Math.max(menuCount - 1, 0)) : 0

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

  useLayoutEffect(() => {
    if (!linkEditor) {
      setLinkBox(null)
      return
    }
    const row = rowRefs.current.get(linkEditor.blockId)
    if (!row) return
    const rect = row.getBoundingClientRect()
    setLinkBox({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)), top: Math.max(8, rect.top - 92) })
  }, [linkEditor, blocks])

  useEffect(() => {
    const openRequestedLink = () => {
      const request = document.documentElement.dataset.linkRequest
      if (!request) return
      delete document.documentElement.dataset.linkRequest
      const [blockId, startText, endText] = request.split("|")
      const block = blocksRef.current.find((item) => item.id === blockId)
      if (!block) return
      openLinkEditorRef.current(block, Number(startText), Number(endText))
    }
    const observer = new MutationObserver(openRequestedLink)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-link-request"] })
    openRequestedLink()
    return () => observer.disconnect()
  }, [])

  const linkFocusKey = linkEditor ? `${linkEditor.blockId}:${linkEditor.start}:${linkEditor.end}` : ""
  useEffect(() => {
    if (!linkFocusKey) return
    linkInputRef.current?.focus()
    linkInputRef.current?.select()
  }, [linkFocusKey])

  useEffect(() => {
    if (!linkEditor) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (document.getElementById("link-popover")?.contains(target)) return
      if (target instanceof Element && target.closest("[data-testid='format-link']")) return
      setLinkEditor(null)
    }
    document.addEventListener("mousedown", onPointer)
    return () => document.removeEventListener("mousedown", onPointer)
  }, [linkEditor])

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

  function rememberSelection(blockId: string, input: HTMLTextAreaElement) {
    const next = { blockId, start: input.selectionStart, end: input.selectionEnd }
    setSelection(next)
    if (pendingFormat.current?.blockId === blockId && next.start !== pendingFormat.current.caret) {
      pendingFormat.current = null
    }
  }

  function openLinkEditor(block: BlockDTO, start: number, end: number) {
    const from = Math.min(start, end)
    const to = Math.max(start, end)
    const existing = linkCovering(block.marks, from, to)
    setLinkEditor({
      blockId: block.id,
      start: from,
      end: to,
      value: existing?.href ?? "",
      error: "",
      savedHref: existing?.href ?? "",
    })
  }
  openLinkEditorRef.current = openLinkEditor

  function commitLink(event: FormEvent) {
    event.preventDefault()
    if (!linkEditor) return
    const block = blocksRef.current.find((item) => item.id === linkEditor.blockId)
    if (!block) {
      setLinkEditor(null)
      return
    }
    if (!linkEditor.value.trim()) {
      setLinkEditor({ ...linkEditor, error: "先填上链接地址" })
      return
    }
    const next = setInlineLink(block.content, block.marks, linkEditor.start, linkEditor.end, linkEditor.value)
    if (!next) {
      setLinkEditor({ ...linkEditor, error: "只接受 http 或 https 链接" })
      return
    }
    onChange(updateBlock(blocksRef.current, block.id, { marks: next }))
    const { blockId, start, end } = linkEditor
    setLinkEditor(null)
    focusBlock(blockId, end, start)
  }

  function removeLink() {
    if (!linkEditor) return
    const block = blocksRef.current.find((item) => item.id === linkEditor.blockId)
    if (!block) {
      setLinkEditor(null)
      return
    }
    onChange(updateBlock(blocksRef.current, block.id, { marks: clearInlineLink(block.content, block.marks, linkEditor.start, linkEditor.end) }))
    const { blockId, start, end } = linkEditor
    setLinkEditor(null)
    focusBlock(blockId, end, start)
  }

  function applyMark(block: BlockDTO, type: InlineMarkType, start: number, end: number) {
    if (start === end) {
      const current = pendingFormat.current?.blockId === block.id ? pendingFormat.current.marks : marksAtCaret(block.marks, start)
      const marks = current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
      pendingFormat.current = { blockId: block.id, marks, caret: start }
      setSelection({ blockId: block.id, start, end })
      return
    }
    onChange(updateBlock(blocksRef.current, block.id, { marks: toggleInlineMark(block.content, block.marks, start, end, type) }))
    focusBlock(block.id, end, start)
  }

  function applyFormatCommand(type: InlineMarkType) {
    if (!menu) return
    const block = blocksRef.current.find((item) => item.id === menu.blockId)
    if (!block) return
    const content = block.content.startsWith("/") ? "" : block.content
    onChange(updateBlock(blocksRef.current, block.id, { content, marks: content ? block.marks : [] }))
    pendingFormat.current = { blockId: block.id, marks: [type], caret: content.length }
    focusBlock(block.id, content.length)
    setMenu(null)
  }

  function updateDrop(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY)
    const row = element?.closest<HTMLElement>("[data-block-id]")
    const id = row?.dataset.blockId
    const source = blocksRef.current.find((item) => item.id === dragSource.current)
    const targetBlock = blocksRef.current.find((item) => item.id === id)
    if (!row || !id || id === dragSource.current || !source || !targetBlock || source.parentId !== targetBlock.parentId) {
      dropRef.current = null
      setDropTarget(null)
      return
    }
    const rect = row.getBoundingClientRect()
    const next = { id, placement: (clientY < rect.top + rect.height / 2 ? "before" : "after") as "before" | "after" }
    dropRef.current = next
    setDropTarget(next)
  }

  function choose(type: BlockType) {
    if (!menu) return
    const block = blocks.find((item) => item.id === menu.blockId)
    if (!block) return
    const content = menu.kind === "slash" || type === "divider" ? "" : block.content
    onChange(setBlockType(blocksRef.current, block.id, type, { content, checked: type === "todo" ? block.checked : false }))
    focusBlock(block.id, content.length)
    setMenu(null)
  }

  function insertBelow(blockId: string) {
    const current = blocksRef.current.find((item) => item.id === blockId)
    const created = createBlock({ parentId: current?.parentId ?? "" })
    onChange(insertBlockAfter(blocksRef.current, blockId, created))
    focusBlock(created.id, 0)
    setMenu({ kind: "slash", blockId: created.id, query: "", index: 0 })
  }

  const roots = blocks.filter((block) => !block.parentId)
  const menuView = useRef({ menu, activeIndex, formatItems, commands })
  menuView.current = { menu, activeIndex, formatItems, commands }

  function renderList(items: BlockDTO[]) {
    return items.map((block, index) => {
        const marker = listMarker(block.type, index, items)
        const active = activeId === block.id
        const drop = dropTarget?.id === block.id ? dropTarget.placement : null
        const childBlocks = block.type === "quote" || block.type === "toggle" ? blocks.filter((item) => item.parentId === block.id) : EMPTY_BLOCKS
        return (
          <RowGate key={block.id} block={block} marker={marker} active={active} drop={drop} childBlocks={childBlocks} render={() => (
          <div
            ref={(node) => {
              if (node) rowRefs.current.set(block.id, node)
              else rowRefs.current.delete(block.id)
            }}
            data-testid="block"
            data-block-id={block.id}
            data-block-type={block.type}
            className="group relative py-[2px]"
            onFocus={() => setActiveId(block.id)}
          >
            {dropTarget?.id === block.id && dropTarget.placement === "before" ? <div data-testid="drop-indicator" className="absolute inset-x-0 top-0 z-10 h-0.5 bg-sky-600" /> : null}
            {dropTarget?.id === block.id && dropTarget.placement === "after" ? <div data-testid="drop-indicator" className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-sky-600" /> : null}
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
                className="grid h-6 w-6 place-items-center rounded text-faint hover:bg-black/[0.06] hover:text-ink"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertBelow(block.id)}
              >
                {active ? <Plus size={15} /> : null}
              </button>
              <button
                type="button"
                aria-label="拖拽排序"
                data-testid="block-drag"
                className="cursor-grab touch-none rounded p-1 text-faint hover:bg-black/[0.06] hover:text-ink active:cursor-grabbing"
                onPointerDown={(event) => {
                  event.preventDefault()
                  const sourceId = block.id
                  dragSource.current = sourceId
                  const startX = event.clientX
                  const startY = event.clientY
                  const pointerId = event.pointerId
                  let moved = false
                  document.body.style.userSelect = "none"
                  const move = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointerId) return
                    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
                    moved = true
                    updateDrop(ev.clientX, ev.clientY)
                  }
                  const up = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointerId) return
                    window.removeEventListener("pointermove", move)
                    window.removeEventListener("pointerup", up)
                    dragSource.current = null
                    document.body.style.userSelect = ""
                    if (!moved) {
                      dropRef.current = null
                      setDropTarget(null)
                      setMenu({ kind: "actions", blockId: sourceId, query: "", index: 0 })
                      return
                    }
                    const target = dropRef.current
                    dropRef.current = null
                    setDropTarget(null)
                    if (target) onChange(reorderBlocks(blocksRef.current, sourceId, target.id, target.placement))
                  }
                  window.addEventListener("pointermove", move)
                  window.addEventListener("pointerup", up)
                }}
              >
                {active ? <GripVertical size={15} /> : null}
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
                    const result = removeBlock(blocksRef.current, block.id)
                    onChange(result.blocks)
                    focusBlock(result.focusId, result.caret)
                  }
                  if (event.key === "Enter") {
                    event.preventDefault()
                    const result = splitBlock(blocksRef.current, block.id, 0, 0)
                    onChange(result.blocks)
                    focusBlock(result.focusId, result.caret)
                  }
                }}
              >
                <DividerRule />
              </div>
            ) : block.type === "image" ? (
              <ImageBlock block={block} onPatch={(patch) => onChange(updateBlock(blocksRef.current, block.id, patch))} />
            ) : (
              <div className={cn("flex items-start gap-2", block.type === "quote" && "folio-quote")}>
                {block.type === "toggle" ? (
                  <button
                    type="button"
                    data-testid="toggle-collapse"
                    aria-expanded={!block.collapsed}
                    aria-label={block.collapsed ? "展开" : "收起"}
                    className="mt-1 rounded p-0.5 text-muted hover:bg-black/[0.06]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onChange(updateBlock(blocksRef.current, block.id, { collapsed: !block.collapsed }))}
                  >
                    <ChevronRight size={16} className={cn("transition", !block.collapsed && "rotate-90")} />
                  </button>
                ) : null}
                {block.type === "todo" ? (
                  <input
                    type="checkbox"
                    data-testid="todo-toggle"
                    checked={block.checked}
                    onChange={(event) => onChange(updateBlock(blocksRef.current, block.id, { checked: event.target.checked }))}
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
                        onChange={(event) => onChange(updateBlock(blocksRef.current, block.id, { language: event.target.value }))}
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
                  <div className="grid">
                  {block.type === "code" ? (
                    <pre aria-hidden className={cn(blockTextClass("code"), "pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap break-words px-3 pb-2.5 text-ink")}>
                      <code>{block.content ? <CodeText code={block.content} language={block.language} /> : <span className="opacity-0">.</span>}</code>
                    </pre>
                  ) : (
                    <div aria-hidden className={cn(blockTextClass(block.type), "pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap break-words text-ink", block.checked && "text-muted line-through")}>
                      {block.content ? <InlineText text={block.content} marks={block.marks} /> : <span className="opacity-0">.</span>}
                    </div>
                  )}
                  <textarea
                    ref={(node) => {
                      if (node) inputRefs.current.set(block.id, node)
                      else inputRefs.current.delete(block.id)
                    }}
                    data-testid="block-input"
                    data-block-id={block.id}
                    data-block-type={block.type}
                    data-link-ranges={block.marks.filter((mark) => mark.type === "link" && mark.href).map((mark) => `${mark.start}:${mark.end}`).join(",")}
                    value={block.content}
                    rows={1}
                    spellCheck={block.type !== "code"}
                    placeholder={placeholderFor(block, active)}
                    aria-label={placeholderFor(block, true) || "块内容"}
                    onFocus={() => setActiveId(block.id)}
                    onSelect={(event) => rememberSelection(block.id, event.currentTarget)}
                    onKeyUp={(event) => rememberSelection(block.id, event.currentTarget)}
                    onMouseUp={(event) => rememberSelection(block.id, event.currentTarget)}
                    onCompositionStart={() => {
                      composing.current = true
                    }}
                    onCompositionEnd={() => {
                      composing.current = false
                    }}
                    onChange={(event) => {
                      const input = event.target
                      const value = input.value
                      autosize(input)
                      if (block.type === "code") {
                        onChange(updateBlock(blocksRef.current, block.id, { content: value }))
                      } else {
                        const typing = pendingFormat.current?.blockId === block.id ? pendingFormat.current.marks : []
                        const changed = applyTextChange(block.content, block.marks, value, typing)
                        const consumed = consumeInlineMarkup(changed.text, changed.marks)
                        onChange(updateBlock(blocksRef.current, block.id, { content: consumed.text, marks: consumed.marks }))
                        if (consumed.text !== changed.text) {
                          const caret = mapCaret(consumed.map, input.selectionStart)
                          focusBlock(block.id, caret)
                          if (pendingFormat.current?.blockId === block.id) pendingFormat.current = { ...pendingFormat.current, caret }
                        } else if (pendingFormat.current?.blockId === block.id) {
                          pendingFormat.current = { ...pendingFormat.current, caret: input.selectionStart }
                        }
                      }
                      const openMenu = menuView.current.menu
                      if (block.type !== "code" && value.startsWith("/") && !value.includes("\n")) {
                        setMenu({ kind: "slash", blockId: block.id, query: value.slice(1), index: 0 })
                      } else if (openMenu?.kind === "slash" && openMenu.blockId === block.id) {
                        setMenu(null)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing || composing.current) return
                      const input = event.currentTarget
                      const menu = menuView.current.menu
                      const activeIndex = menuView.current.activeIndex
                      const formatItems = menuView.current.formatItems
                      const commands = menuView.current.commands
                      if (event.defaultPrevented) return
                      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k" && block.type !== "code") {
                        const domStart = input.selectionStart ?? 0
                        const domEnd = input.selectionEnd ?? 0
                        const remembered = selectionRef.current
                        const useRemembered = domStart === domEnd && remembered?.blockId === block.id && remembered.start !== remembered.end
                        const start = useRemembered ? remembered.start : domStart
                        const end = useRemembered ? remembered.end : domEnd
                        const inside = linkCovering(block.marks, start, end)
                        if (start !== end || inside) {
                          event.preventDefault()
                          event.stopPropagation()
                          const from = inside && start === end ? inside.start : Math.min(start, end)
                          const to = inside && start === end ? inside.end : Math.max(start, end)
                          openLinkEditor(block, from, to)
                          return
                        }
                      }
                      if ((event.metaKey || event.ctrlKey) && !event.altKey && block.type !== "code") {
                        const key = event.key.toLowerCase()
                        const mark: InlineMarkType | null = key === "b" ? "bold" : key === "i" ? "italic" : key === "e" ? "code" : event.shiftKey && key === "x" ? "strike" : null
                        if (mark) {
                          event.preventDefault()
                          applyMark(block, mark, input.selectionStart, input.selectionEnd)
                          return
                        }
                      }
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
                        if (event.key === "Enter" || event.key === "Tab") {
                          event.preventDefault()
                          if (activeIndex < formatItems.length) applyFormatCommand(formatItems[activeIndex].id)
                          else if (commands[activeIndex - formatItems.length]) choose(commands[activeIndex - formatItems.length].type)
                          return
                        }
                      }

                      if (event.key === " " && block.type === "paragraph" && !menu) {
                        const before = input.value.slice(0, input.selectionStart)
                        const after = input.value.slice(input.selectionEnd)
                        const matched = matchBlockShortcut(before)
                        if (matched) {
                          event.preventDefault()
                          onChange(setBlockType(blocksRef.current, block.id, matched.type, { content: after, checked: matched.checked }))
                          focusBlock(block.id, after.length)
                          return
                        }
                      }

                      if (block.type === "paragraph" && input.selectionStart === input.value.length && input.selectionStart === input.selectionEnd) {
                        if (event.key === "-" && input.value === "--") {
                          event.preventDefault()
                          onChange(setBlockType(blocksRef.current, block.id, "divider"))
                          focusBlock(block.id, 0)
                          return
                        }
                        if (event.key === "`" && input.value === "``") {
                          event.preventDefault()
                          onChange(setBlockType(blocksRef.current, block.id, "code", { content: "" }))
                          focusBlock(block.id, 0)
                          return
                        }
                      }

                      if (event.key === "Enter" && !event.shiftKey && block.type !== "code") {
                        event.preventDefault()
                        const result = splitBlock(blocksRef.current, block.id, input.selectionStart, input.selectionEnd)
                        onChange(result.blocks)
                        focusBlock(result.focusId, result.caret)
                        return
                      }
                      if (block.type === "code" && event.key === "Enter" && input.value === "") {
                        event.preventDefault()
                        const result = splitBlock(blocksRef.current, block.id, 0, 0)
                        onChange(result.blocks)
                        focusBlock(result.focusId, result.caret)
                        return
                      }
                      if (block.type === "code" && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        const result = splitBlock(blocksRef.current, block.id, input.value.length, input.value.length)
                        onChange(result.blocks)
                        focusBlock(result.focusId, result.caret)
                        return
                      }
                      if (event.key === "Tab" && block.type !== "code" && !menu && input.selectionStart === 0 && input.selectionEnd === 0) {
                        const next = event.shiftKey ? unnestBlock(blocksRef.current, block.id) : nestUnderPrevious(blocksRef.current, block.id)
                        if (next !== blocksRef.current) {
                          event.preventDefault()
                          onChange(next)
                          focusBlock(block.id, 0)
                          return
                        }
                      }
                      if (block.type === "code" && event.key === "Tab") {
                        event.preventDefault()
                        const start = input.selectionStart
                        const value = `${input.value.slice(0, start)}  ${input.value.slice(input.selectionEnd)}`
                        onChange(updateBlock(blocksRef.current, block.id, { content: value }))
                        focusBlock(block.id, start + 2)
                        return
                      }
                      if (event.key === "Backspace" && input.selectionStart === 0 && input.selectionEnd === 0) {
                        const result = backspaceAtStart(blocksRef.current, block.id)
                        if (result) {
                          event.preventDefault()
                          onChange(result.blocks)
                          focusBlock(result.focusId, result.caret)
                        }
                        return
                      }
                      if (event.key === "ArrowUp" && input.selectionStart === 0 && input.selectionEnd === 0 && index > 0) {
                        const previous = items[index - 1]
                        event.preventDefault()
                        focusBlock(previous.id, previous.type === "divider" || previous.type === "image" ? 0 : previous.content.length)
                        return
                      }
                      if (event.key === "ArrowDown" && input.selectionStart === input.value.length && input.selectionEnd === input.value.length && index < items.length - 1) {
                        const next = items[index + 1]
                        event.preventDefault()
                        focusBlock(next.id, 0)
                      }
                    }}
                    className={cn(
                      blockTextClass(block.type),
                      block.type === "code" ? "whitespace-pre-wrap px-3 pb-2.5 rich-input col-start-1 row-start-1 text-transparent caret-ink" : "rich-input col-start-1 row-start-1 text-transparent caret-ink",
                      block.checked && "text-muted line-through",
                    )}
                  />
                  </div>
                </div>
              </div>
            )}
            {block.type === "quote" || block.type === "toggle" ? (
              <div className="mt-1 ml-6">
                <button
                  type="button"
                  data-testid="add-nested"
                  className="rounded px-1 py-0.5 text-xs text-muted hover:bg-black/[0.05]"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const created = createBlock({ parentId: block.id })
                    onChange(insertChild(blocksRef.current, block.id, created))
                    focusBlock(created.id, 0)
                  }}
                >
                  添加嵌套内容
                </button>
                {!block.collapsed ? (
                  <div data-testid={block.type === "quote" ? "quote-children" : "toggle-body"} className="border-l border-black/10 pl-3">
                    {renderList(childBlocks)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          )} />
        )
    })
  }

  return (
    <div data-testid="block-editor" className="relative">
      {renderList(roots)}
      {menu && coords
        ? createPortal(
            <div
              id="block-command-menu"
              data-testid="slash-menu"
              className="fixed z-50 max-h-[340px] w-[280px] overflow-auto rounded-lg bg-white py-1 shadow-pop"
              style={{ left: coords.left, top: coords.top }}
            >
              <div className="px-3 py-1.5 text-[11px] font-medium text-faint">{menu.kind === "slash" ? "格式与块" : "转换成"}</div>
              {menuCount === 0 ? <div className="px-3 py-2 text-sm text-muted">没有匹配的块</div> : null}
              {menu.kind === "slash"
                ? formatItems.map((command, commandIndex) => (
                    <button
                      key={command.id}
                      type="button"
                      data-testid={`slash-format-${command.id}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setMenu({ ...menu, index: commandIndex })}
                      onClick={() => applyFormatCommand(command.id)}
                      className={cn("flex w-full items-center gap-2 px-2 py-1.5 text-left", commandIndex === activeIndex && "bg-black/[0.05]")}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-black/[0.06] bg-cream text-ink">
                        {command.id === "bold" ? <Bold size={15} /> : command.id === "italic" ? <Italic size={15} /> : command.id === "strike" ? <Strikethrough size={15} /> : <Code size={15} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm">{command.label}</span>
                        <span className="block text-xs text-muted">{command.hint}</span>
                      </span>
                    </button>
                  ))
                : null}
              {commands.map((command, commandIndex) => (
                <CommandRow
                  key={command.type}
                  command={command}
                  active={commandIndex + formatItems.length === activeIndex}
                  onHover={() => setMenu({ ...menu, index: commandIndex + formatItems.length })}
                  onSelect={() => choose(command.type)}
                />
              ))}
              {menu.kind === "actions" ? (
                <div className="mt-1 border-t border-black/[0.06] p-1">
                  <MenuAction label="上移" icon={ArrowUp} onClick={() => { onChange(moveBlock(blocksRef.current, menu.blockId, -1)); setMenu(null) }} />
                  <MenuAction label="下移" icon={ArrowDown} onClick={() => { onChange(moveBlock(blocksRef.current, menu.blockId, 1)); setMenu(null) }} />
                  <MenuAction
                    label="删除"
                    icon={Trash2}
                    danger
                    onClick={() => {
                      const result = removeBlock(blocksRef.current, menu.blockId)
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
      {selection && selection.start !== selection.end && toolbar
        ? createPortal(
            <div data-testid="format-toolbar" className="fixed z-40 flex gap-0.5 rounded-lg bg-white p-1 shadow-pop" style={{ left: toolbar.left, top: toolbar.top }}>
              {(["bold", "italic", "code", "strike"] as InlineMarkType[]).map((type) => {
                const block = blocks.find((item) => item.id === selection.blockId)
                const active = block ? marksCovering(block.marks, selection.start, selection.end).includes(type) : false
                const Icon = type === "bold" ? Bold : type === "italic" ? Italic : type === "strike" ? Strikethrough : Code
                return (
                  <button
                    key={type}
                    type="button"
                    data-testid={`format-${type}`}
                    aria-pressed={active}
                    className={cn("rounded px-2 py-1 text-sm hover:bg-black/[0.06]", active && "bg-black/[0.08]")}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      if (block && block.type !== "code") applyMark(block, type, selection.start, selection.end)
                    }}
                  >
                    <Icon size={14} />
                  </button>
                )
              })}
              {(() => {
                const block = blocks.find((item) => item.id === selection.blockId)
                const linked = Boolean(block && linkCovering(block.marks, selection.start, selection.end))
                return (
                  <button
                    type="button"
                    data-testid="format-link"
                    aria-pressed={linked}
                    className={cn("rounded px-2 py-1 text-sm hover:bg-black/[0.06]", linked && "bg-black/[0.08]")}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      if (block && block.type !== "code") openLinkEditor(block, selection.start, selection.end)
                    }}
                  >
                    <Link2 size={14} />
                  </button>
                )
              })()}
            </div>,
            document.body,
          )
        : null}
      {linkEditor
        ? createPortal(
            <form
              id="link-popover"
              data-testid="link-popover"
              onSubmit={commitLink}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault()
                  event.stopPropagation()
                  setLinkEditor(null)
                }
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                  event.preventDefault()
                  event.stopPropagation()
                }
              }}
              className="fixed z-50 w-[280px] rounded-lg bg-white p-2 shadow-pop"
              style={{ left: linkBox?.left ?? 16, top: linkBox?.top ?? 16 }}
            >
              <label className="block text-xs text-muted" htmlFor="link-url-input">链接地址</label>
              <input
                id="link-url-input"
                ref={linkInputRef}
                data-testid="link-url"
                value={linkEditor.value}
                onChange={(event) => setLinkEditor({ ...linkEditor, value: event.target.value, error: "" })}
                placeholder="https://"
                className="mt-1 w-full rounded-md border border-black/10 px-2 py-1 text-sm outline-none focus:border-black/30"
              />
              {linkEditor.error ? <p data-testid="link-error" className="mt-1 text-xs leading-5 text-danger">{linkEditor.error}</p> : null}
              <div className="mt-2 flex items-center gap-1">
                <button type="submit" data-testid="link-apply" className="rounded-md bg-ink px-2 py-1 text-xs text-white">应用</button>
                {linkEditor.savedHref ? (
                  <button type="button" data-testid="link-remove" onClick={removeLink} className="rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]">移除</button>
                ) : null}
                {sanitizeLinkHref(linkEditor.savedHref) ? (
                  <a data-testid="link-open" href={sanitizeLinkHref(linkEditor.savedHref) ?? undefined} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs underline">打开</a>
                ) : null}
              </div>
            </form>,
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
