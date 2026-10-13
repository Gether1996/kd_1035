// Starts the Chrome DevTools MCP server for Claude Code (.mcp.json → "chrome-devtools"; how to use it: docs/qa.md).
// Run through node, so the same .mcp.json works on Windows and macOS (npx would need `cmd /c` on Windows). The version is
// pinned in package-lock.json next to this file and installed on the first start.
//   KD_QA_HEADLESS=1                  no browser window (background sessions, CI)
//   KD_QA_BROWSER_URL=http://127.0.0.1:9222   use a Chrome you started yourself with --remote-debugging-port=9222
// Always: a fresh temporary profile (no cookies or logins of your own Chrome), no usage statistics, and no URLs sent to
// Google's CrUX API from performance traces. Screenshots the tools save go to tools/qa/out/ (git-ignored).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, 'node_modules', 'chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools-mcp.js');

if (!existsSync(bin)) {
  // stdout is the MCP channel – npm's output goes to stderr
  const windows = process.platform === 'win32';
  execFileSync(windows ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: here,
    stdio: ['ignore', 2, 2],
    shell: windows,
  });
}

const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const flags = ['--no-usage-statistics', '--no-performance-crux', `--workspace=${out}`];
flags.push('--screenshot-format=jpeg', '--screenshot-quality=80', '--screenshot-max-width=1400');
if (process.env.KD_QA_BROWSER_URL) {
  flags.push(`--browser-url=${process.env.KD_QA_BROWSER_URL}`);
} else {
  flags.push('--isolated');
  if (process.env.KD_QA_HEADLESS === '1') flags.push('--headless');
}

process.argv = [process.argv[0], bin, ...flags, ...process.argv.slice(2)];
await import(pathToFileURL(bin).href);
