import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function nextPackageVersion(currentPackage: string, upstream: string): string {
  if (compareVersions(upstream, currentPackage) > 0) return upstream;
  const [major, minor, patch] = currentPackage.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

export function extractClaudeCodeVersion(source: string): string {
  const match = /export const CLAUDE_CODE_VERSION = ["'](\d+\.\d+\.\d+)["']/.exec(source);
  if (!match) throw new Error("CLAUDE_CODE_VERSION not found");
  return match[1];
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function edit(file: string, transform: (text: string) => string): void {
  writeFileSync(file, transform(readFileSync(file, "utf8")));
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) throw new Error("Usage: node scripts/sync-upstream.ts <upstreamVersion>");
  const newUp = arg.replace(/^v/, "");

  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const oldPkg: string = pkg.version;
  const oldUp: string = pkg.upstream.version;
  if (compareVersions(newUp, oldUp) <= 0) {
    throw new Error(`Upstream ${newUp} is not newer than ${oldUp}`);
  }

  const url = `https://raw.githubusercontent.com/ex-machina-co/opencode-anthropic-auth/v${newUp}/src/constants.ts`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetching ${url} failed: ${response.status}`);
  const newCC = extractClaudeCodeVersion(await response.text());
  const oldCC = extractClaudeCodeVersion(readFileSync("src/constants.ts", "utf8"));
  const newPkg = nextPackageVersion(oldPkg, newUp);

  pkg.version = newPkg;
  pkg.upstream.version = newUp;
  writeJson("package.json", pkg);

  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  lock.version = newPkg;
  lock.packages[""].version = newPkg;
  writeJson("package-lock.json", lock);

  edit("src/constants.ts", (text) =>
    text.replace(
      `export const CLAUDE_CODE_VERSION = "${oldCC}";`,
      `export const CLAUDE_CODE_VERSION = "${newCC}";`,
    ),
  );

  edit("README.md", (text) =>
    text
      .replaceAll(`pi-claude-plan@${oldPkg}`, `pi-claude-plan@${newPkg}`)
      .replaceAll(`pi-claude-plan@v${oldPkg}`, `pi-claude-plan@v${newPkg}`)
      .replaceAll(`releases/tag/v${oldUp}`, `releases/tag/v${newUp}`)
      .replaceAll(`\`@ex-machina/opencode-anthropic-auth\` v${oldUp}`, `\`@ex-machina/opencode-anthropic-auth\` v${newUp}`)
      .replaceAll(`\`${oldCC}\``, `\`${newCC}\``),
  );

  edit("NOTICE.md", (text) => text.replaceAll(`v${oldUp}`, `v${newUp}`));

  const ccLine =
    oldCC === newCC
      ? `- Reported Claude Code version unchanged at \`${oldCC}\`.`
      : `- Reported Claude Code version: \`${oldCC}\` → \`${newCC}\`.`;
  const entry =
    `## ${newPkg}\n\n` +
    `- Aligned with upstream [\`@ex-machina/opencode-anthropic-auth\` v${newUp}](https://github.com/ex-machina-co/opencode-anthropic-auth/releases/tag/v${newUp}).\n` +
    `${ccLine}\n\n`;
  edit("CHANGELOG.md", (text) => {
    const header = "# Changelog\n\n";
    if (!text.startsWith(header)) throw new Error("CHANGELOG.md does not start with '# Changelog'");
    return header + entry + text.slice(header.length);
  });

  console.log(
    JSON.stringify({
      oldPackageVersion: oldPkg,
      newPackageVersion: newPkg,
      oldUpstreamVersion: oldUp,
      newUpstreamVersion: newUp,
      oldClaudeCodeVersion: oldCC,
      newClaudeCodeVersion: newCC,
    }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
