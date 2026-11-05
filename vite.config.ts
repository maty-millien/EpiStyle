import { defineConfig } from "vite-plus";

const config = defineConfig({
  fmt: {
    ignorePatterns: ["bun.lock"],
    printWidth: 90,
    sortImports: {},
  },
  lint: {
    categories: {
      correctness: "error",
      perf: "error",
      suspicious: "error",
    },
    options: {
      reportUnusedDisableDirectives: "error",
      typeAware: true,
      typeCheck: true,
    },
    plugins: ["typescript", "unicorn", "oxc", "import", "node"],
    rules: {
      "import/no-cycle": "error",
      "import/no-duplicates": "error",
      "import/no-unassigned-import": "error",
    },
  },
  pack: {
    entry: "src/extension.ts",
    format: "cjs",
    outDir: "out",
    platform: "node",
    sourcemap: true,
    deps: { neverBundle: ["vscode"], onlyBundle: ["ignore", "smol-toml"] },
  },
});

export default config;
