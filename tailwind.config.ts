import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Poppins", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "Poppins", "system-ui", "sans-serif"],
        mono: ["SF Mono", "Fira Code", "ui-monospace", "monospace"]
      },
      colors: {
        primary: {
          DEFAULT: "#1e90ff",
          action: "#0b63c5",
          dark: "#1470cc",
          foreground: "#ffffff"
        },
        navy: {
          DEFAULT: "#0f1f3d",
          soft: "#1c2f55",
          foreground: "#f6f9ff"
        },
        accent: {
          DEFAULT: "#2ecc71",
          foreground: "#052e16"
        },
        teal: "#22b8cf",
        warning: "#f59e0b",
        danger: "#dc2626",
        success: "#16a34a",
        surface: {
          DEFAULT: "#ffffff",
          elevated: "#f9fbff",
          canvas: "#f4f7fc"
        },
        ink: {
          DEFAULT: "#0b1a30",
          muted: "#475569",
          subtle: "#94a3b8"
        },
        line: {
          DEFAULT: "#e2e8f0",
          strong: "#cbd5e1"
        },
        tier: {
          bronze: "#c2410c",
          silver: "#64748b",
          gold: "#d97706",
          platinum: "#6366f1"
        }
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "28px"
      },
      boxShadow: {
        sm: "0 1px 2px rgba(15, 31, 61, 0.05)",
        md: "0 6px 18px rgba(15, 31, 61, 0.08)",
        lg: "0 16px 40px rgba(15, 31, 61, 0.12)",
        xl: "0 30px 60px rgba(15, 31, 61, 0.18)",
        glow: "0 18px 36px rgba(30, 144, 255, 0.28)"
      }
    }
  }
};

export default config;
