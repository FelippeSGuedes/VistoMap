import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/pages/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          deep: "#073B4C",
          emerald: "#06D6A0",
          amber: "#FFD166",
          ice: "#F8F9FA",
          steel: "#E5E7EB",
          slate: "#667280",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8F9FA",
          dark: "#0B1416",
          "dark-elev": "#11201F",
          "dark-card": "#0F1B1D",
        },
        ink: {
          DEFAULT: "#073B4C",
          muted: "#667280",
          inverse: "#F8F9FA",
        },
        status: {
          pending: "#FFD166",
          field: "#3B82F6",
          done: "#06D6A0",
          rejected: "#EF4444",
          approved: "#073B4C",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(7,59,76,0.06), 0 4px 16px rgba(7,59,76,0.06)",
        elev: "0 4px 12px rgba(7,59,76,0.08), 0 16px 40px rgba(7,59,76,0.12)",
        glow: "0 0 0 4px rgba(6,214,160,0.18), 0 8px 24px rgba(6,214,160,0.25)",
        sheet: "0 -8px 32px rgba(7,59,76,0.18)",
      },
      backgroundImage: {
        "grad-emerald":
          "linear-gradient(135deg, #06D6A0 0%, #0FBF8E 60%, #07A37C 100%)",
        "grad-deep":
          "linear-gradient(135deg, #073B4C 0%, #0A4F65 100%)",
        "grad-hero":
          "radial-gradient(60% 80% at 0% 0%, rgba(6,214,160,0.18) 0%, rgba(6,214,160,0) 60%), radial-gradient(60% 80% at 100% 100%, rgba(255,209,102,0.15) 0%, rgba(255,209,102,0) 60%), linear-gradient(180deg, #073B4C 0%, #062B36 100%)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "24px",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "80%, 100%": { transform: "scale(2.2)", opacity: "0" },
        },
        floatY: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        pulseRing: "pulseRing 2s cubic-bezier(0.215,0.61,0.355,1) infinite",
        floatY: "floatY 3.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
