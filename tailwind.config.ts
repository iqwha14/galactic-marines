import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marine: {
          50:  "#f6eef1",
          100: "#ead7de",
          200: "#d5afbd",
          300: "#c0879c",
          400: "#8f4b62",
          500: "#441826", // AKZENT
          600: "#3b1521",
          700: "#31111c",
          800: "#270e16",
          900: "#1d0a10",
        },
        hud: {
          bg: "#070A0F",
          panel: "#0B1020",
          line: "#1B2440",
          text: "#D6E2FF",
          muted: "#92A3C7",
          good: "#31c48d",
        },
      },
      boxShadow: {
        hud: "0 0 0 1px rgba(27,36,64,.9), 0 0 24px rgba(68,24,38,.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
