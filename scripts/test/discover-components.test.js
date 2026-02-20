#!/usr/bin/env node
/**
 * Tests for discover-components.js
 * Run: node scripts/test/discover-components.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const {
  loadConfig,
  classifyComponent,
  discoverMarkdownComponents,
  discoverAllComponents,
  getCategoryNames,
  groupIntoPlugins,
  discoverPlugins,
  validateSkill,
  mergeHooks
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

// --- mergeHooks ---

console.log('\nmergeHooks');

test('handles nested hooks.json format with description + hooks wrapper', () => {
  const hooksFiles = [{
    path: '/fake/hooks/hooks.json',
    content: {
      description: 'Design engineering hooks',
      hooks: {
        UserPromptSubmit: [{ type: 'command', command: 'echo hello' }]
      }
    }
  }];
  const result = mergeHooks(hooksFiles);
  assert.deepStrictEqual(result, {
    UserPromptSubmit: [{ type: 'command', command: 'echo hello' }]
  });
});

test('handles flat hooks.json format (backward compatibility)', () => {
  const hooksFiles = [{
    path: '/fake/hooks/hooks.json',
    content: {
      PreToolUse: [{ type: 'command', command: 'echo pre' }]
    }
  }];
  const result = mergeHooks(hooksFiles);
  assert.deepStrictEqual(result, {
    PreToolUse: [{ type: 'command', command: 'echo pre' }]
  });
});

test('merges mixed nested and flat formats from multiple files', () => {
  const hooksFiles = [
    {
      path: '/fake/a/hooks.json',
      content: {
        description: 'Plugin A hooks',
        hooks: {
          UserPromptSubmit: [{ type: 'command', command: 'echo a' }]
        }
      }
    },
    {
      path: '/fake/b/hooks.json',
      content: {
        UserPromptSubmit: [{ type: 'command', command: 'echo b' }],
        PreToolUse: [{ type: 'command', command: 'echo pre' }]
      }
    }
  ];
  const result = mergeHooks(hooksFiles);
  assert.strictEqual(result.UserPromptSubmit.length, 2);
  assert.strictEqual(result.PreToolUse.length, 1);
});

test('skips non-array values gracefully', () => {
  const hooksFiles = [{
    path: '/fake/hooks/hooks.json',
    content: {
      description: 'Some description',
      version: '1.0',
      hooks: {
        UserPromptSubmit: [{ type: 'command', command: 'echo hello' }]
      }
    }
  }];
  const result = mergeHooks(hooksFiles);
  // Should only contain UserPromptSubmit, not description/version
  assert.deepStrictEqual(Object.keys(result), ['UserPromptSubmit']);
});

test('returns null when no arrays found', () => {
  const hooksFiles = [{
    path: '/fake/hooks/hooks.json',
    content: { description: 'Just metadata', version: '1.0' }
  }];
  const result = mergeHooks(hooksFiles);
  assert.strictEqual(result, null);
});

// --- classifyComponent ---

console.log('\nclassifyComponent');

// Helper to create temp files for classifyComponent tests
function withTempDir(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));
  try {
    fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const defaultConfig = {
  discovery: {
    skillFilename: 'SKILL.md',
    commandsDir: 'commands',
    agentsDir: 'agents'
  }
};

test('.md file with no frontmatter is skipped (not an error)', () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, 'notes.md');
    fs.writeFileSync(filePath, '# Just some notes\n\nNo frontmatter here.\n');
    const result = classifyComponent(filePath, tmpDir, defaultConfig);
    assert.strictEqual(result.type, null);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.error, undefined);
  });
});

test('.md file with frontmatter but no type uses heuristics', () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, 'something.md');
    fs.writeFileSync(filePath, '---\nexamples:\n  - test\n---\nContent\n');
    const result = classifyComponent(filePath, tmpDir, defaultConfig);
    // Should use field heuristics: has examples array without version → command
    assert.strictEqual(result.type, 'command');
  });
});

test('SKILL.md with no frontmatter is classified as skill (filename match)', () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, 'SKILL.md');
    fs.writeFileSync(filePath, '# My Skill\n\nNo frontmatter.\n');
    const result = classifyComponent(filePath, tmpDir, defaultConfig);
    assert.strictEqual(result.type, 'skill');
  });
});

test('.md in commands/ dir with no frontmatter is classified as command (location match)', () => {
  withTempDir((tmpDir) => {
    const cmdDir = path.join(tmpDir, 'commands');
    fs.mkdirSync(cmdDir);
    const filePath = path.join(cmdDir, 'do-thing.md');
    fs.writeFileSync(filePath, '# Do the thing\n\nNo frontmatter.\n');
    const result = classifyComponent(filePath, tmpDir, defaultConfig);
    assert.strictEqual(result.type, 'command');
  });
});

test('.md in agents/ dir with no frontmatter is classified as agent (location match)', () => {
  withTempDir((tmpDir) => {
    const agentDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentDir);
    const filePath = path.join(agentDir, 'helper.md');
    fs.writeFileSync(filePath, '# Helper agent\n\nNo frontmatter.\n');
    const result = classifyComponent(filePath, tmpDir, defaultConfig);
    assert.strictEqual(result.type, 'agent');
  });
});

test('.md with explicit type in frontmatter takes priority', () => {
  withTempDir((tmpDir) => {
    const filePath = path.join(tmpDir, 'random.md');
    fs.writeFileSync(filePath, '---\ntype: agent\nname: test\n---\nContent\n');
    const result = classifyComponent(filePath, tmpDir, defaultConfig);
    assert.strictEqual(result.type, 'agent');
  });
});

// --- skipped array ---

console.log('\nskipped array');

// Full config needed for discovery functions (defaultConfig lacks excludeDirs etc.)
const discoveryConfig = {
  discovery: {
    skillFilename: 'SKILL.md',
    commandsDir: 'commands',
    agentsDir: 'agents',
    excludeDirs: ['.git', 'node_modules'],
    excludePatterns: [],
    maxDepth: 10
  }
};

test('discoverMarkdownComponents returns skipped array for frontmatterless files', () => {
  withTempDir((tmpDir) => {
    // Create a .md file with no frontmatter (not in commands/agents/skills, not SKILL.md)
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# Just notes\n\nNo frontmatter.\n');
    // Create a valid skill for contrast
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '---\nname: test-skill\ndescription: A test\n---\nContent\n');

    const result = discoverMarkdownComponents(tmpDir, discoveryConfig);
    assert(Array.isArray(result.skipped), 'skipped should be an array');
    assert.strictEqual(result.skipped.length, 1, 'should have 1 skipped file');
    assert(result.skipped[0].endsWith('notes.md'), 'skipped file should be notes.md');
    assert.strictEqual(result.skills.length, 1, 'should still find the skill');
  });
});

test('discoverAllComponents propagates skipped array', () => {
  withTempDir((tmpDir) => {
    // Create a .md file with no frontmatter
    fs.writeFileSync(path.join(tmpDir, 'planning.md'), '# Planning doc\n\nNo frontmatter.\n');

    const result = discoverAllComponents(tmpDir, discoveryConfig);
    assert(Array.isArray(result.skipped), 'skipped should be an array');
    assert.strictEqual(result.skipped.length, 1, 'should have 1 skipped file');
    assert(result.skipped[0].endsWith('planning.md'), 'skipped file should be planning.md');
  });
});

test('discoverMarkdownComponents returns empty skipped array when all files have frontmatter', () => {
  withTempDir((tmpDir) => {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '---\nname: test-skill\ndescription: A test\n---\nContent\n');

    const result = discoverMarkdownComponents(tmpDir, discoveryConfig);
    assert(Array.isArray(result.skipped), 'skipped should be an array');
    assert.strictEqual(result.skipped.length, 0, 'should have no skipped files');
  });
});

// --- Summary ---

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
