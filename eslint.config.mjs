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
      "public/workbox-*.js"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/app/layout.tsx"],
    rules: {
      "@next/next/no-page-custom-font": "off"
    }
  }
];

export default config;
