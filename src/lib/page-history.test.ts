import { describe, expect, it } from "vitest"
import {
  PAGE_HISTORY_COALESCE_MS,
  PAGE_HISTORY_MAX_CHARS,
  PAGE_HISTORY_MAX_SNAPSHOTS,
  canReadPageHistory,
  canRestorePageHistory,
  idsToPrune,
  parseSnapshotBlocks,
  planSnapshot,
  type SnapshotLatest,
} from "./page-history"

const start = new Date("2026-11-27T00:00:00.000Z")

function latest(editorId: string, title: string): SnapshotLatest {
  return { editorId, updatedAt: start, title, icon: "📄", cover: "", blocks: "[]" }
}

function body(title: string, blocks = "[]") {
  return { title, icon: "📄", cover: "", blocks }
}

describe("page history snapshots", () => {
  it("folds continued edits by the same person inside five minutes", () => {
    expect(PAGE_HISTORY_COALESCE_MS).toBe(5 * 60 * 1000)
    expect(
      planSnapshot({
        latest: latest("nash", "甲"),
        editorId: "nash",
        now: new Date(start.getTime() + PAGE_HISTORY_COALESCE_MS - 1),
        body: body("乙"),
      }),
    ).toBe("fold")
  })

  it("opens a new snapshot once five minutes have passed or the clock moves backwards", () => {
    expect(
      planSnapshot({
        latest: latest("nash", "甲"),
        editorId: "nash",
        now: new Date(start.getTime() + PAGE_HISTORY_COALESCE_MS),
        body: body("乙"),
      }),
    ).toBe("create")
    expect(
      planSnapshot({
        latest: latest("nash", "甲"),
        editorId: "nash",
        now: new Date(start.getTime() - 1),
        body: body("乙"),
      }),
    ).toBe("create")
  })

  it("opens a new snapshot when another person edits inside the window", () => {
    expect(
      planSnapshot({
        latest: latest("nash", "甲"),
        editorId: "mia",
        now: new Date(start.getTime() + 1000),
        body: body("乙"),
      }),
    ).toBe("create")
  })

  it("skips an identical body and still creates the first snapshot", () => {
    expect(
      planSnapshot({
        latest: latest("nash", "甲"),
        editorId: "nash",
        now: new Date(start.getTime() + 1000),
        body: body("甲"),
      }),
    ).toBe("skip")
    expect(
      planSnapshot({
        latest: latest("nash", "甲"),
        editorId: "mia",
        now: new Date(start.getTime() + 1000),
        body: body("甲"),
      }),
    ).toBe("skip")
    expect(planSnapshot({ latest: null, editorId: "nash", now: start, body: body("甲") })).toBe("create")
  })

  it("starts a fresh snapshot when restoring, even inside the window", () => {
    expect(
      planSnapshot({
        latest: latest("nash", "甲"),
        editorId: "nash",
        now: new Date(start.getTime() + 1000),
        body: body("甲"),
        forceNew: true,
      }),
    ).toBe("create")
    expect(
      planSnapshot({
        latest: latest("nash", "甲"),
        editorId: "nash",
        now: new Date(start.getTime() + 1000),
        body: body("乙"),
        forceNew: true,
      }),
    ).toBe("create")
  })

  it("skips a snapshot whose block json exceeds the size cap", () => {
    expect(PAGE_HISTORY_MAX_CHARS).toBe(400_000)
    const oversized = body("大", "x".repeat(PAGE_HISTORY_MAX_CHARS + 1))
    expect(planSnapshot({ latest: null, editorId: "nash", now: start, body: oversized, forceNew: true })).toBe("skip")
    const capped = body("大", "x".repeat(PAGE_HISTORY_MAX_CHARS))
    expect(planSnapshot({ latest: null, editorId: "nash", now: start, body: capped })).toBe("create")
  })

  it("drops the oldest snapshots past the cap", () => {
    expect(PAGE_HISTORY_MAX_SNAPSHOTS).toBe(50)
    expect(
      idsToPrune(
        [
          { id: "old", updatedAt: 1 },
          { id: "mid", updatedAt: 2 },
          { id: "new", updatedAt: 3 },
        ],
        2,
      ),
    ).toEqual(["old"])
    expect(
      idsToPrune(
        [
          { id: "a", updatedAt: 5 },
          { id: "m", updatedAt: 5 },
          { id: "z", updatedAt: 5 },
        ],
        2,
      ),
    ).toEqual(["a"])
    expect(idsToPrune([{ id: "only", updatedAt: 1 }], 50)).toEqual([])
  })

  it("lets a read-only member look and keeps restore aligned with edit access", () => {
    const author = "user_nash"
    const member = "user_mia"
    const readPage = { authorId: author, visibility: "read" as const }
    expect(canReadPageHistory(member, readPage)).toBe(true)
    expect(canRestorePageHistory(member, readPage, "member")).toBe(false)
    expect(canRestorePageHistory(member, readPage, "owner")).toBe(true)
    expect(canRestorePageHistory(author, readPage, "member")).toBe(true)

    const publicPage = { authorId: author, visibility: "public" as const }
    expect(canReadPageHistory(member, publicPage)).toBe(true)
    expect(canRestorePageHistory(member, publicPage, "member")).toBe(true)

    const privatePage = { authorId: author, visibility: "private" as const }
    expect(canReadPageHistory(member, privatePage)).toBe(false)
    expect(canRestorePageHistory(member, privatePage, "owner")).toBe(false)
    expect(canReadPageHistory(author, privatePage)).toBe(true)
    expect(canRestorePageHistory(author, privatePage, "member")).toBe(true)
  })

  it("reads a stored block list and rejects corrupt payloads", () => {
    const raw = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        content: "旧正文",
        checked: false,
        language: "",
        position: 0,
        marks: [],
        parentId: "",
        collapsed: false,
        src: "",
        width: "",
      },
    ])
    expect(parseSnapshotBlocks(raw).map((block) => block.content)).toEqual(["旧正文"])
    expect(parseSnapshotBlocks("not-json")).toEqual([])
    expect(parseSnapshotBlocks('{"title":"x"}')).toEqual([])
  })
})
