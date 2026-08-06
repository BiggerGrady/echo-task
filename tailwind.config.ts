import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#14212b",
          soft: "#243442",
        },
        paper: {
          DEFAULT: "#f3efe6",
          deep: "#e7e0d2",
        },
        celadon: {
          DEFAULT: "#2f6f5e",
          bright: "#3f8f78",
        },
        clay: "#c46b3a",
        mist: "#d7e4df",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        soft: "0 18px 40px rgba(20, 33, 43, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
