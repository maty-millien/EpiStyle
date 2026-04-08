#!/usr/bin/env bun
import { $ } from "bun";

const VALID_BUMPS = ["patch", "minor", "major"] as const;
type Bump = (typeof VALID_BUMPS)[number];

const bump = process.argv[2] as Bump;
if (!bump || !VALID_BUMPS.includes(bump)) {
  console.error("Usage: bun run release <patch|minor|major>");
  process.exit(1);
}

$.throws(true);

async function abort(message: string): Promise<never> {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const dirty = (await $`git status --porcelain`.text()).trim();
if (dirty) {
  await abort("working tree is dirty — commit or stash changes first");
}

const branch = (await $`git branch --show-current`.text()).trim();
if (branch !== "main") {
  await abort(`not on main branch (current: ${branch})`);
}

await $`git fetch origin main --quiet`;
const local = (await $`git rev-parse HEAD`.text()).trim();
const remote = (await $`git rev-parse origin/main`.text()).trim();
if (local !== remote) {
  await abort("local main is out of sync with origin/main — pull first");
}

console.log("Running typecheck...");
await $`bun run typecheck`;

const pkgPath = "package.json";
const pkg = await Bun.file(pkgPath).json();
const current: string = pkg.version;
const parts = current.split(".").map(Number);
if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
  await abort(`unexpected version format in package.json: ${current}`);
}
const [major, minor, patch] = parts;

let next: string;
if (bump === "major") {
  next = `${major + 1}.0.0`;
} else if (bump === "minor") {
  next = `${major}.${minor + 1}.0`;
} else {
  next = `${major}.${minor}.${patch + 1}`;
}

console.log(`Bumping ${current} → ${next}`);

const raw = await Bun.file(pkgPath).text();
const updated = raw.replace(`"version": "${current}"`, `"version": "${next}"`);
if (updated === raw) {
  await abort("failed to update version in package.json");
}
await Bun.write(pkgPath, updated);

await $`git add package.json`;
await $`git commit -m ${`chore(release): v${next}`}`;
await $`git tag -a ${`v${next}`} -m ${`Release v${next}`}`;
await $`git push origin main ${`v${next}`}`;

console.log(`\nReleased v${next}. CI will publish to the marketplace.`);
console.log(`Watch: gh run watch --workflow=publish.yml`);
