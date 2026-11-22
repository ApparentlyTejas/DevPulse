import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0C0E",
        surface: "#16181C",
        ink: "#E7E9EC",
        hairline: "#2A2D31",
        "accent-blue": "#2E42B8",
        "accent-orange": "#D9732B",
        critical: "#C73E34",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
