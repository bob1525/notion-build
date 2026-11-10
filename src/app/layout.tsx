import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import Script from "next/script"
import { ToastProvider } from "@/components/ui"
import "./globals.css"

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" })

export const metadata: Metadata = {
  title: { default: "Folio", template: "%s · Folio" },
  description: "一个安静、清晰的块式知识库。",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <Script id="folio-link-key" strategy="beforeInteractive">{`
          document.addEventListener("keydown", function (event) {
            if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
            if (!event.key || event.key.toLowerCase() !== "k") return
            var input = event.target && event.target.dataset && event.target.dataset.testid === "block-input" ? event.target : document.activeElement
            if (!input || !input.dataset || input.dataset.testid !== "block-input" || input.dataset.blockType === "code") return
            var start = input.selectionStart
            var end = input.selectionEnd
            if (start === end) {
              var ranges = (input.dataset.linkRanges || "").split(",")
              var found = ""
              for (var i = 0; i < ranges.length; i += 1) {
                if (!ranges[i]) continue
                var pair = ranges[i].split(":")
                var from = Number(pair[0])
                var to = Number(pair[1])
                if (start > from && start <= to) {
                  found = from + ":" + to
                  break
                }
              }
              if (!found) return
              var expanded = found.split(":")
              start = Number(expanded[0])
              end = Number(expanded[1])
            }
            event.preventDefault()
            event.stopImmediatePropagation()
            document.documentElement.setAttribute("data-link-request", input.dataset.blockId + "|" + Math.min(start, end) + "|" + Math.max(start, end))
          }, true)
        `}</Script>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
