/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "../frontend/index.html",
    "../frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#4B5320",
          foreground: "#FFFFFF",
        },
        primary: {
          DEFAULT: "#4B5320",
          foreground: "#FFFFFF",
        },
        tan: "#D9D8C7",
        background: "#FDFBF2",
        foreground: "#333333",
        muted: "#D9D8C7",
        "muted-foreground": "#5c5c5c",
        border: "#c4b8a8",
        status: {
          success: "#4CAF50",
          warning: "#FBC02D",
          danger: "#D32F2F",
        },
        military: {
          card: "var(--military-card-bg)",
          header: "var(--military-header-bg)",
        },
      },
      fontFamily: {
        body: ["Inter", "system-ui", "sans-serif"],
        heading: ["Barlow Condensed", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.5rem",
      },
    },
  },
  plugins: [],
};
