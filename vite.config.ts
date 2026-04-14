import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  run: {
    enablePrePostScripts: false, // Disables automatic pre/post hooks
  },
  pack: {
    entry: "src/index.ts",
    outExtensions: () => ({
      js: ".js",
      dts: ".d.ts",
    }),
    exports: true,
    format: ["esm"],
    minify: true,
    sourcemap: false,
    dts: {
      sourcemap: false,
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: ["**/docs/**", "**/scripts/**"],
  },
  fmt: {
    ignorePatterns: ["docs/docs/nodes"],
  },
  resolve: {
    alias: {
      "(\\.\\./.*)\\.js$": "$1.ts",
      "(\\./.*)\\.js$": "$1.ts",
    },
  },
});
