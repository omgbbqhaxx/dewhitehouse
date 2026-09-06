import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0A2240",
        federal: "#1A4480",
        flag: "#B22234",
        gold: "#C9A227",
        parchment: "#F3F5F8",
      },
    },
  },
  plugins: [],
};
export default config;
