import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".next/**", "coverage/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["e2e/*.cjs"],
    languageOptions: { globals: { require: "readonly", module: "readonly", process: "readonly", __dirname: "readonly", URL: "readonly", fetch: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
