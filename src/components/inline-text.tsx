import { cn } from "@/lib/cn"
import { renderInline } from "@/lib/rich-text"
import type { InlineMark } from "@/lib/types"

export function InlineText({ text, marks, className }: { text: string; marks: InlineMark[]; className?: string }) {
  const segments = renderInline(text, marks)
  if (!segments.length) return null
  return (
    <span className={className}>
      {segments.map((segment, index) => {
        const className = cn(
          segment.marks.includes("bold") && "inline-bold",
          segment.marks.includes("italic") && "inline-italic",
          segment.marks.includes("strike") && "line-through",
          segment.marks.includes("code") && "inline-code",
          segment.href && "inline-link",
        )
        if (segment.href) {
          return (
            <a
              key={`${index}-${segment.marks.join("-")}-${segment.href}`}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="inline-link"
              data-inline-marks={segment.marks.join(" ")}
              className={className}
            >
              {segment.text}
            </a>
          )
        }
        return (
          <span
            key={`${index}-${segment.marks.join("-")}`}
            data-testid="inline-mark"
            data-inline-marks={segment.marks.join(" ")}
            className={className}
          >
            {segment.text}
          </span>
        )
      })}
    </span>
  )
}
