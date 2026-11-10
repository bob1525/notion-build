import { highlightCode } from "@/lib/highlight"

export function CodeText({ code, language }: { code: string; language: string }) {
  const tokens = highlightCode(code, language)
  if (!tokens.length) return null
  return (
    <>
      {tokens.map((token, index) => (
        <span key={`${index}-${token.kind}`} data-token={token.kind} className={token.kind === "plain" ? undefined : `token-${token.kind}`}>
          {token.text}
        </span>
      ))}
    </>
  )
}
