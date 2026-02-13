#!/usr/bin/env node
/**
 * Tests for discover-components.js
 * Run: node scripts/test/discover-components.test.js
 */

const path = require('path');
const assert = require('assert');

const {
  loadConfig,
  discoverAllComponents,
  getCategoryNames,
  groupIntoPlugins,
  discoverPlugins,
  validateSkill
} = require('../src/discover-components.js');

const FIXTURES_DIR = path.resolve(__dirname, '../../test-fixtures/valid');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// Load config from fixtures directory (CWD-relative)
function loadFixtureConfig() {
  const originalCwd = process.cwd();
  try {
    process.chdir(FIXTURES_DIR);
    return loadConfig();
  } finally {
    process.chdir(originalCwd);
  }
}

// --- getCategoryNames ---

console.log('\ngetCategoryNames');

test('extracts category names from globs', () => {
  const config = { discovery: { pluginCategories: ['code/**', 'analysis/**'] } };
  const names = getCategoryNames(config);
  assert.deepStrictEqual(names, ['code', 'analysis']);
});

test('returns defaults when pluginCategories is empty', () => {
  const config = { discovery: { pluginCategories: [] } };
  const names = getCategoryNames(config);
  assert.deepStrictEqual(names, ['code', 'analysis', 'communication', 'documents']);
});

test('returns defaults when pluginCategories is not set', () => {
  const config = { discovery: {} };
  const names = getCategoryNames(config);
  assert.deepStrictEqual(names, ['code', 'analysis', 'communication', 'documents']);
});

// --- groupIntoPlugins ---

console.log('\ngroupIntoPlugins');

test('groups a standalone skill into the correct plugin', () => {
  const rootDir = '/fake/root';
  const config = { discovery: { pluginCategories: ['code/**', 'analysis/**'] } };
  const components = {
    skills: ['/fake/root/code/standalone-skill'],
    commands: [],
    agents: [],
    hooksFiles: [],
    mcpFiles: []
  };

  const { plugins, orphanedPaths } = groupIntoPlugins(components, rootDir, config);

  assert.strictEqual(plugins.length, 1);
  assert.strictEqual(plugins[0].name, 'standalone-skill');
  assert.strictEqual(plugins[0].category, 'code');
  assert.strictEqual(plugins[0].source, './code/standalone-skill');
  assert.deepStrictEqual(plugins[0].components.skills, ['/fake/root/code/standalone-skill']);
  assert.strictEqual(orphanedPaths.length, 0);
});

test('groups a plugin with subdirectories correctly', () => {
  const rootDir = '/fake/root';
  const config = { discovery: { pluginCategories: ['analysis/**'] } };
  const components = {
    skills: ['/fake/root/analysis/my-plugin/skills/some-skill'],
    commands: ['/fake/root/analysis/my-plugin/commands/do-thing.md'],
    agents: ['/fake/root/analysis/my-plugin/agents/helper.md'],
    hooksFiles: [],
    mcpFiles: []
  };

  const { plugins, orphanedPaths } = groupIntoPlugins(components, rootDir, config);

  assert.strictEqual(plugins.length, 1);
  assert.strictEqual(plugins[0].name, 'my-plugin');
  assert.strictEqual(plugins[0].category, 'analysis');
  assert.deepStrictEqual(plugins[0].components.skills, ['/fake/root/analysis/my-plugin/skills/some-skill']);
  assert.deepStrictEqual(plugins[0].components.commands, ['/fake/root/analysis/my-plugin/commands/do-thing.md']);
  assert.deepStrictEqual(plugins[0].components.agents, ['/fake/root/analysis/my-plugin/agents/helper.md']);
  assert.strictEqual(orphanedPaths.length, 0);
});

test('respects pluginCategories filter — unrecognized categories become orphans', () => {
  const rootDir = '/fake/root';
  const config = { discovery: { pluginCategories: ['code/**'] } };
  const components = {
    skills: ['/fake/root/code/good-skill', '/fake/root/random/bad-skill'],
    commands: [],
    agents: [],
    hooksFiles: [],
    mcpFiles: []
  };

  const { plugins, orphanedPaths } = groupIntoPlugins(components, rootDir, config);

  assert.strictEqual(plugins.length, 1);
  assert.strictEqual(plugins[0].name, 'good-skill');
  assert.deepStrictEqual(orphanedPaths, ['random/bad-skill']);
});

test('components at repo root are orphaned', () => {
  const rootDir = '/fake/root';
  const config = { discovery: { pluginCategories: ['code/**'] } };
  const components = {
    skills: ['/fake/root/lonely-skill'],
    commands: [],
    agents: [],
    hooksFiles: [],
    mcpFiles: []
  };

  const { plugins, orphanedPaths } = groupIntoPlugins(components, rootDir, config);

  assert.strictEqual(plugins.length, 0);
  assert.deepStrictEqual(orphanedPaths, ['lonely-skill']);
});

test('multiple plugins across categories', () => {
  const rootDir = '/fake/root';
  const config = { discovery: { pluginCategories: ['code/**', 'analysis/**'] } };
  const components = {
    skills: ['/fake/root/code/skill-a', '/fake/root/analysis/skill-b'],
    commands: ['/fake/root/code/skill-a/commands/cmd.md'],
    agents: [],
    hooksFiles: [],
    mcpFiles: []
  };

  const { plugins } = groupIntoPlugins(components, rootDir, config);

  assert.strictEqual(plugins.length, 2);
  const names = plugins.map(p => p.name).sort();
  assert.deepStrictEqual(names, ['skill-a', 'skill-b']);

  const skillA = plugins.find(p => p.name === 'skill-a');
  assert.strictEqual(skillA.components.skills.length, 1);
  assert.strictEqual(skillA.components.commands.length, 1);
});

// --- discoverPlugins integration with discoverAllComponents (no silent drops) ---

console.log('\ndiscoverPlugins (integration with test fixtures)');

test('discovers standalone skill in test fixtures', () => {
  const config = loadFixtureConfig();
  const plugins = discoverPlugins(FIXTURES_DIR, config);

  const standalonePlugin = plugins.find(p => p.name === 'standalone-skill');
  assert(standalonePlugin, 'standalone-skill plugin should be discovered');
  assert.strictEqual(standalonePlugin.category, 'code');
  assert.strictEqual(standalonePlugin.components.skills.length, 1);
});

test('discovers test-plugin with commands in test fixtures', () => {
  const config = loadFixtureConfig();
  const plugins = discoverPlugins(FIXTURES_DIR, config);

  const testPlugin = plugins.find(p => p.name === 'test-plugin');
  assert(testPlugin, 'test-plugin should be discovered');
  assert.strictEqual(testPlugin.category, 'analysis');
  assert.strictEqual(testPlugin.components.commands.length, 1);
});

test('discoverPlugins returns consistent results with discoverAllComponents — no silent drops', () => {
  const config = loadFixtureConfig();
  const components = discoverAllComponents(FIXTURES_DIR, config);
  const plugins = discoverPlugins(FIXTURES_DIR, config);

  // Count total components found via discoverAllComponents
  const totalDiscovered = components.skills.length + components.commands.length + components.agents.length;

  // Count total components in plugins
  let totalInPlugins = 0;
  for (const plugin of plugins) {
    totalInPlugins += plugin.components.skills.length;
    totalInPlugins += plugin.components.commands.length;
    totalInPlugins += plugin.components.agents.length;
  }

  assert.strictEqual(totalInPlugins, totalDiscovered,
    `All ${totalDiscovered} discovered components should appear in plugins, but only ${totalInPlugins} found`);
});

test('standalone skill validates successfully', () => {
  const config = loadFixtureConfig();
  const skillPath = path.join(FIXTURES_DIR, 'code', 'standalone-skill');
  const result = validateSkill(skillPath, config);

  assert(result.valid, `standalone-skill should be valid, errors: ${result.errors.join(', ')}`);
  assert.strictEqual(result.name, 'standalone-skill');
});

// --- Summary ---

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
