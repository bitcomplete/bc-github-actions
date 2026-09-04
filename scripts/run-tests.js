#!/usr/bin/env node
/**
 * Run every test file in scripts/test/.
 *
 * This exists because `npm test` used to name a single file explicitly:
 *
 *   "test": "node scripts/test/discover-components.test.js"
 *
 * scripts/test/opencode-release.test.js was therefore never executed by
 * `npm test` or by any workflow, despite containing six passing tests — and
 * it covers opencode-release.js, which is bundled into
 * scripts/dist/opencode-release.cjs and run by the agentic-marketplace
 * publish action. A whole file of coverage was silently inert.
 *
 * Discovering the files instead of listing them means adding a test file is
 * enough to get it run. Both harnesses in use here (the hand-rolled printer
 * in discover-components.test.js and node:test in opencode-release.test.js)
 * exit non-zero on failure, so exit status is the only contract needed.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, 'test');
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

if (files.length === 0) {
  console.error(`No *.test.js files found in ${testDir} — the runner found nothing to run.`);
  process.exit(1);
}

console.log(`Running ${files.length} test file(s): ${files.join(', ')}\n`);

const failed = [];
for (const file of files) {
  console.log(`──── ${file} ────`);
  const r = spawnSync(process.execPath, [path.join(testDir, file)], { stdio: 'inherit' });
  if (r.status !== 0) {
    failed.push(`${file} (exit ${r.status}${r.signal ? `, signal ${r.signal}` : ''})`);
  }
  console.log('');
}

if (failed.length > 0) {
  console.error(`FAILED test files:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
console.log(`All ${files.length} test file(s) passed.`);
