import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: ["apps/website/public/assets/**", "packages/*/tests/fixtures/**"] },
  resolve: { conditions: ["development"] },
  test: { include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"] },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
