import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--folio-ink) / <alpha-value>)",
        muted: "rgb(var(--folio-muted) / <alpha-value>)",
        faint: "rgb(var(--folio-faint) / <alpha-value>)",
        sidebar: "rgb(var(--folio-sidebar) / <alpha-value>)",
        accent: "rgb(var(--folio-accent) / <alpha-value>)",
        cream: "rgb(var(--folio-cream) / <alpha-value>)",
        danger: "rgb(var(--folio-danger) / <alpha-value>)",
        surface: "rgb(var(--folio-surface) / <alpha-value>)",
      },
      boxShadow: {
        pop: "rgb(15 15 15 / 5%) 0 0 0 1px, rgb(15 15 15 / 10%) 0 3px 6px, rgb(15 15 15 / 16%) 0 9px 24px",
        card: "rgb(15 15 15 / 4%) 0 0 0 1px, rgb(15 15 15 / 4%) 0 2px 4px",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "WenQuanYi Micro Hei",
          "PingFang SC",
          "Noto Sans SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "WenQuanYi Micro Hei Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
}

export default config
