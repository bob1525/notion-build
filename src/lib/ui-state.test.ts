import { describe, expect, it } from "vitest"
import { readSidebar, writeSidebar } from "@/lib/ui-state"

describe("sidebar preference", () => {
  it("stores one workspace without dropping another user's branches", () => {
    const raw = writeSidebar("{}", "ws_product", { page_welcome: false, page_roadmap: true })
    expect(readSidebar(raw, "ws_product")).toEqual({ page_welcome: false, page_roadmap: true })
    const next = writeSidebar(raw, "ws_research", { page_survey: false })
    expect(readSidebar(next, "ws_product")).toEqual({ page_welcome: false, page_roadmap: true })
    expect(readSidebar(next, "ws_research")).toEqual({ page_survey: false })
  })

  it("drops unsafe keys and a corrupted blob", () => {
    expect(readSidebar("{", "ws_product")).toEqual({})
    const raw = writeSidebar(null, "ws_product", { "../secret": false, page_welcome: false, "": true })
    expect(readSidebar(raw, "ws_product")).toEqual({ page_welcome: false })
  })
})