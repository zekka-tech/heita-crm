import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: "#1D3C34",
          gold: "#D99825",
          sand: "#F5EBD8",
          clay: "#AF5F33",
          mist: "#F9F6F1"
        }
      }
    }
  }
};

export default config;

