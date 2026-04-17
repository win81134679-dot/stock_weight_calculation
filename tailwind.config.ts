import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: "#2C5F8A",
        "accent-2": "#4A90C4",
        "bg-warm": "#FAF9F6",
        ink: "#1A1A2E",
        muted: "#6B7399",
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', '"PingFang TC"', '"Microsoft JhengHei"', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '18px',
        xl: '12px',
      },
    },
  },
  plugins: [],
};
export default config;
