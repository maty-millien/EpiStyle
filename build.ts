import { build } from "bun";

const result = await build({
  entrypoints: ["./src/extension.ts"],
  outdir: "./out",
  target: "node",
  format: "cjs",
  external: ["vscode"],
  sourcemap: "external",
  minify: process.env.NODE_ENV === "production",
  naming: { entry: "extension.js" },
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Build successful!");
