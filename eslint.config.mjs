import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "coverage/**",
      ".wrangler/**",
      ".crosshelix/**",
      ".scopian/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/worker/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
);
