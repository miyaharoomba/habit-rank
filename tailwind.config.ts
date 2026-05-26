import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /**
         * ✅ shadcn/ui 互換トークン（そのまま残す）
         * globals.css の --background などで色が決まる
         */
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        /**
         * ✅ アプリ用の “読みやすい別名”
         * これで className が「bg-bg」「bg-panel」みたいに書ける
         */
        bg: "hsl(var(--background))",
        text: "hsl(var(--foreground))",
        panel: "hsl(var(--card))",
        panel2: "hsl(var(--popover))",
        mutedText: "hsl(var(--muted-foreground))",

        /**
         * ✅ 青の強調色（ボタン/リンク用）
         * primary は shadcn のまま使えるけど、hover用の2段目を作る
         */
        primary2: "hsl(var(--primary-2))",

        /**
         * グラフ色（残したいならそのまま）
         */
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },

      /**
       * ✅ ダーククールに見せる影（カード/ボタン）
       */
      boxShadow: {
        glow: "0 0 0 1px hsl(var(--border)), 0 18px 40px rgba(0,0,0,.55)",
        glowBlue:
          "0 0 0 1px rgba(59,130,246,.35), 0 18px 50px rgba(0,0,0,.6)",
      },

      /**
       * ✅ 角丸（既存踏襲）
       */
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config
