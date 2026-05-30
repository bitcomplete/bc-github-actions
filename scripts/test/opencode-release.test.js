// Tests for computeReleaseVersion — the bit that decides what
// `<plugin>-v<version>` tag publish will try to create.
//
// History: a date-only scheme (`sharing-v2026.05.30`) collided when
// two pushes to main landed within 24h. See bc-llm-skills PR #67/#68
// for the original incident.

const assert = require('node:assert/strict');
const test = require('node:test');

const { computeReleaseVersion } = require('../src/opencode-release.js');

const fixedDate = new Date('2026-05-30T13:00:00Z');

test('explicit RELEASE_VERSION wins over everything', () => {
  const v = computeReleaseVersion(
    { RELEASE_VERSION: '1.2.3', GITHUB_RUN_NUMBER: '42' },
    fixedDate,
  );
  assert.equal(v, '1.2.3');
});

test('outside CI returns bare YYYY.MM.DD', () => {
  const v = computeReleaseVersion({}, fixedDate);
  assert.equal(v, '2026.05.30');
});

test('inside CI appends .r<run_number>', () => {
  const v = computeReleaseVersion({ GITHUB_RUN_NUMBER: '42' }, fixedDate);
  assert.equal(v, '2026.05.30.r42');
});

test('first attempt does not add an attempt suffix', () => {
  const v = computeReleaseVersion(
    { GITHUB_RUN_NUMBER: '42', GITHUB_RUN_ATTEMPT: '1' },
    fixedDate,
  );
  assert.equal(v, '2026.05.30.r42');
});

test('re-run appends .<attempt> so reran publish stays unique', () => {
  const v = computeReleaseVersion(
    { GITHUB_RUN_NUMBER: '42', GITHUB_RUN_ATTEMPT: '2' },
    fixedDate,
  );
  assert.equal(v, '2026.05.30.r42.2');
});

test('two different runs on same day produce different tags', () => {
  const a = computeReleaseVersion({ GITHUB_RUN_NUMBER: '42' }, fixedDate);
  const b = computeReleaseVersion({ GITHUB_RUN_NUMBER: '43' }, fixedDate);
  assert.notEqual(a, b);
});
