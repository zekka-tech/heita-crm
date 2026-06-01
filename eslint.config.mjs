import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

const config = [
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "next-env.d.ts",
      "public/sw.js",
      "public/workbox-*.js",
      // Vendored Tesseract.js worker/core assets copied from node_modules.
      "public/tesseract/**"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/app/layout.tsx"],
    rules: {
      "@next/next/no-page-custom-font": "off"
    }
  },
  {
    rules: {
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  }
];

export default config;
