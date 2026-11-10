import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#37352f",
        muted: "#787774",
        faint: "#9b9a97",
        sidebar: "#f7f6f3",
        accent: "#2383e2",
        cream: "#fbfbfa",
        danger: "#c4554d",
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
