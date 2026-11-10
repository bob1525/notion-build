import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
