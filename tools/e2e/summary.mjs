// Short summary of a Playwright JSON report: failures with their first lines, then the warnings grouped by text.
//   npx playwright test --reporter=json > out/run.json; node summary.mjs out/run.json [--warnings]
import { readFileSync } from 'node:fs';

const [file = 'out/run.json', flag] = process.argv.slice(2);
const report = JSON.parse(readFileSync(file, 'utf8'));
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const rows = [];
const walk = (suite) => {
  suite.suites?.forEach(walk);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const last = t.results.at(-1);
      rows.push({
        title: spec.title,
        project: t.projectName,
        status: t.status, // expected | unexpected | flaky | skipped
        errors: (last?.errors ?? []).map((e) => plain(e.message ?? '')),
        warnings: [...(t.annotations ?? []), ...(last?.annotations ?? [])].filter((a) => a.type === 'warning'),
      });
    }
  }
};
report.suites.forEach(walk);

const count = (s) => rows.filter((r) => r.status === s).length;
console.log(
  `${rows.length} tests: ${count('expected')} passed, ${count('unexpected')} failed, ${count('flaky')} flaky, ${count('skipped')} skipped`,
);
for (const r of rows.filter((r) => r.status === 'unexpected')) {
  console.log(`\nFAIL [${r.project}] ${r.title}`);
  for (const e of r.errors) {
    const lines = e.split('\n').filter((l) => l.trim() && !/^\s+at /.test(l));
    console.log('  ' + lines.slice(0, 14).join('\n  '));
  }
}
if (flag === '--warnings') {
  const byText = new Map();
  for (const r of rows) {
    for (const w of r.warnings) {
      for (const line of w.description.split('\n').slice(1)) {
        const key = `${w.description.split('\n')[0]} ${line}`;
        byText.set(key, [...(byText.get(key) ?? []), `${r.project} ${r.title}`]);
      }
    }
  }
  console.log(`\n${byText.size} distinct warnings`);
  for (const [text, where] of [...byText].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`- ${text}  ×${where.length} (e.g. ${where[0]})`);
  }
}
