/**
 * @file discover-components.js
 * @description Claude Code plugin component discovery, validation, and marketplace generation
 *
 * Discovers and validates all plugin components:
 * - Skills (SKILL.md files in nested directories)
 * - Commands (.md files in commands/ directory)
 * - Agents (.md files in agents/ directory)
 * - Hooks (hooks/hooks.json)
 * - MCP Servers (.mcp.json)
 *
 * Generates marketplace.json manifest for Anthropic Skills Marketplace integration.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { minimatch } = require('minimatch');
const TOML = require('@iarna/toml');

/**
 * Deep merge utility for combining defaults with user config.
 * @param {Object} target - The target object (defaults)
 * @param {Object} source - The source object (user config)
 * @returns {Object} Merged object
 */
function mergeDeep(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

/**
 * Checks if a value is a plain object.
 * @param {*} item - Value to check
 * @returns {boolean} True if item is a plain object
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Validates that a regex pattern is valid.
 * @param {string} pattern - The regex pattern to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
function validateRegexPattern(pattern) {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Checks if a path is safely within the root directory (no path traversal).
 * @param {string} rootDir - The root directory (absolute path)
 * @param {string} targetPath - The path to validate (absolute path)
 * @returns {boolean} True if targetPath is within rootDir
 */
function isPathWithinRoot(rootDir, targetPath) {
  const realRoot = fs.realpathSync(rootDir);
  try {
    const realTarget = fs.realpathSync(targetPath);
    return realTarget.startsWith(realRoot + path.sep) || realTarget === realRoot;
  } catch {
    // Path doesn't exist yet, check the normalized path
    const normalizedTarget = path.resolve(targetPath);
    return normalizedTarget.startsWith(realRoot + path.sep) || normalizedTarget === realRoot;
  }
}

/**
 * Loads generator configuration with sensible defaults.
 * Supports TOML (preferred) and JSON formats.
 * @returns {Object} Merged configuration object
 */
function loadConfig() {
  const defaults = {
    discovery: {
      excludeDirs: ['.git', 'node_modules', '.github', '.claude', 'templates', 'test-components'],
      excludePatterns: ['**/template/**', '**/*template*/**'],
      pluginCategories: [],
      maxDepth: 10,
      skillFilename: 'SKILL.md',
      commandsDir: 'commands',
      agentsDir: 'agents',
      hooksFile: 'hooks/hooks.json',
      mcpFile: '.mcp.json'
    },
    validation: {
      nameMaxLength: 64,
      descriptionMaxLength: 1024,
      reservedWords: ['anthropic', 'claude'],
      namePattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
      validHookEvents: [
        'PreToolUse',
        'PostToolUse',
        'Stop',
        'SubagentStop',
        'SessionStart',
        'SessionEnd',
        'UserPromptSubmit',
        'PreCompact',
        'Notification'
      ]
    },
    marketplace: {
      name: 'bc-agentic-marketplace',
      owner: {
        name: 'Bitcomplete',
        email: 'everyone@bitcomplete.io'
      },
      description: 'Shared Claude Code plugin components for Bitcomplete team',
      pluginName: 'bc-agentic-marketplace',
      pluginDescription: 'Bitcomplete Agentic Marketplace - skills, commands, agents, and automation'
    }
  };

  // Try TOML first (preferred format)
  const tomlPath = '.claude-plugin/generator.config.toml';
  if (fs.existsSync(tomlPath)) {
    try {
      const content = fs.readFileSync(tomlPath, 'utf8');
      const config = TOML.parse(content);
      return validateAndMergeConfig(defaults, config);
    } catch (error) {
      console.error(`Error parsing ${tomlPath}: ${error.message}`);
      process.exit(1);
    }
  }

  // Fallback to JSON
  const jsonPath = '.claude-plugin/generator.config.json';
  if (fs.existsSync(jsonPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return validateAndMergeConfig(defaults, config);
    } catch (error) {
      console.error(`Error parsing ${jsonPath}: ${error.message}`);
      process.exit(1);
    }
  }

  // No config file found - use defaults
  console.error('No generator.config.toml or .json found, using defaults');
  return defaults;
}

/**
 * Validates config values and merges with defaults.
 * @param {Object} defaults - Default configuration
 * @param {Object} config - User configuration
 * @returns {Object} Validated and merged configuration
 */
function validateAndMergeConfig(defaults, config) {
  const merged = mergeDeep(defaults, config);

  // Validate namePattern is a valid regex
  if (merged.validation?.namePattern) {
    const result = validateRegexPattern(merged.validation.namePattern);
    if (!result.valid) {
      console.error(`Invalid namePattern regex "${merged.validation.namePattern}": ${result.error}`);
      process.exit(1);
    }
  }

  return merged;
}

/**
 * Classifies a markdown file as skill, command, or agent based on metadata and context.
 * Implements multi-stage heuristics with fallback chain.
 * @param {string} filePath - Path to the markdown file
 * @param {string} rootDir - Root directory for context
 * @param {Object} config - Configuration object
 * @returns {{ type: string|null, path: string, error?: string }} Classification result
 */
function classifyComponent(filePath, rootDir, config) {
  const { skillFilename } = config.discovery;
  const fileName = path.basename(filePath);
  const relPath = path.relative(rootDir, filePath);

  // Read frontmatter to check for explicit type or type-specific fields
  let frontmatter = null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    frontmatter = parsed.data;
  } catch (err) {
    // If we can't read frontmatter, try filename/location heuristics
  }

  // 1. EXPLICIT TYPE (highest priority)
  if (frontmatter && frontmatter.type) {
    const type = frontmatter.type.toLowerCase();
    if (['skill', 'command', 'agent'].includes(type)) {
      // For skills with explicit type, return directory if it matches skill pattern
      if (type === 'skill') {
        return { type, path: path.dirname(filePath) };
      }
      return { type, path: filePath };
    }
  }

  // 2. FILENAME PATTERN
  if (fileName === skillFilename) {
    return { type: 'skill', path: path.dirname(filePath) };
  }

  // 3. LOCATION HINTS
  const pathParts = relPath.split(path.sep);

  if (pathParts[0] === 'commands' || pathParts.includes('commands')) {
    return { type: 'command', path: filePath };
  }

  if (pathParts[0] === 'agents' || pathParts.includes('agents')) {
    return { type: 'agent', path: filePath };
  }

  if (pathParts[0] === 'skills' || pathParts.includes('skills')) {
    return { type: 'skill', path: path.dirname(filePath) };
  }

  // 4. REQUIRE FRONTMATTER for remaining heuristics
  // Files without frontmatter that didn't match by name or location
  // are not components (e.g., reference docs, planning notes)
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return { type: null, path: filePath, skipped: true };
  }

  // 5. FIELD HEURISTICS
  if (frontmatter) {
    const hasExamples = Array.isArray(frontmatter.examples);
    const hasVersion = typeof frontmatter.version === 'string';

    // Commands often have examples array but no version
    if (hasExamples && !hasVersion) {
      return { type: 'command', path: filePath };
    }

    // Agents often have version field + description
    if (hasVersion && frontmatter.description) {
      return { type: 'agent', path: filePath };
    }
  }

  // 6. DIRECTORY STRUCTURE
  const dirName = path.dirname(filePath);
  const baseName = path.basename(filePath, '.md');

  // Skill pattern: directory name matches file base name (e.g., my-skill/my-skill.md)
  if (path.basename(dirName) === baseName) {
    return { type: 'skill', path: dirName };
  }

  // 7. UNCLASSIFIED → ERROR
  const error = `Unable to classify component at '${relPath}'\n\n` +
    `To fix, add one of the following to your frontmatter:\n` +
    `  type: skill    # For instructional content with supporting files\n` +
    `  type: command  # For slash commands users invoke\n` +
    `  type: agent    # For autonomous subagents\n\n` +
    `Or place the file in a recognized directory:\n` +
    `  commands/  agents/  skills/`;

  return { type: null, path: filePath, error };
}

/**
 * Recursively discovers all markdown components (skills, commands, agents) anywhere in the repository.
 * Classifies them based on metadata and structure rather than location.
 * @param {string} rootDir - Root directory to start discovery
 * @param {Object} config - Configuration object
 * @returns {{ skills: string[], commands: string[], agents: string[], errors: Array<{path: string, error: string}> }} Discovered components by type
 */
function discoverMarkdownComponents(rootDir, config) {
  const { excludeDirs, excludePatterns, maxDepth } = config.discovery;
  const skills = [];
  const commands = [];
  const agents = [];
  const errors = [];
  const skipped = [];
  const absoluteRoot = path.resolve(rootDir);

  function shouldExcludePath(relPath) {
    const pathParts = relPath.split(path.sep);
    if (pathParts.some(part => excludeDirs.includes(part))) {
      return true;
    }
    return excludePatterns.some(pattern =>
      minimatch(relPath, pattern, { matchBase: true, nocase: true })
    );
  }

  function walk(dir, depth) {
    if (depth > maxDepth) {
      return;
    }

    if (!isPathWithinRoot(absoluteRoot, dir)) {
      console.warn(`Skipping path outside root: ${dir}`);
      return;
    }

    const relPath = path.relative(absoluteRoot, dir);
    if (relPath && shouldExcludePath(relPath)) {
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`Cannot read directory ${dir}: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relEntryPath = path.relative(absoluteRoot, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip README and other documentation files
        const lowerName = entry.name.toLowerCase();
        const excludeNames = ['readme.md', 'contributing.md', 'license.md', 'component-resources.md', 'claude.md'];
        if (excludeNames.includes(lowerName)) {
          continue;
        }

        if (!shouldExcludePath(relEntryPath)) {
          const classified = classifyComponent(fullPath, absoluteRoot, config);

          if (classified.type === 'skill') {
            // Skills return directory path, check for duplicates
            if (!skills.includes(classified.path)) {
              skills.push(classified.path);
            }
          } else if (classified.type === 'command') {
            commands.push(classified.path);
          } else if (classified.type === 'agent') {
            agents.push(classified.path);
          } else if (classified.skipped) {
            skipped.push(fullPath);
          } else {
            // Unclassified component with frontmatter - add to errors
            errors.push({ path: fullPath, error: classified.error });
          }
        }
      }
    }
  }

  walk(absoluteRoot, 0);
  return { skills, commands, agents, errors, skipped };
}

/**
 * Discovers hooks.json files anywhere in the repository.
 * @param {string} rootDir - Root directory to start discovery
 * @param {Object} config - Configuration object
 * @returns {Array<{path: string, content: Object}>} Array of hooks files with their content
 */
function discoverHooksFiles(rootDir, config) {
  const { excludeDirs, excludePatterns, maxDepth } = config.discovery;
  const hooksFiles = [];
  const absoluteRoot = path.resolve(rootDir);

  function shouldExcludePath(relPath) {
    const pathParts = relPath.split(path.sep);
    if (pathParts.some(part => excludeDirs.includes(part))) {
      return true;
    }
    return excludePatterns.some(pattern =>
      minimatch(relPath, pattern, { matchBase: true, nocase: true })
    );
  }

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (!isPathWithinRoot(absoluteRoot, dir)) return;

    const relPath = path.relative(absoluteRoot, dir);
    if (relPath && shouldExcludePath(relPath)) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relEntryPath = path.relative(absoluteRoot, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name === 'hooks.json') {
        if (!shouldExcludePath(relEntryPath)) {
          try {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            hooksFiles.push({ path: fullPath, content });
          } catch (err) {
            console.warn(`Invalid hooks.json at ${fullPath}: ${err.message}`);
          }
        }
      }
    }
  }

  walk(absoluteRoot, 0);
  return hooksFiles;
}

/**
 * Discovers .mcp.json files anywhere in the repository.
 * @param {string} rootDir - Root directory to start discovery
 * @param {Object} config - Configuration object
 * @returns {Array<{path: string, content: Object}>} Array of MCP files with their content
 */
function discoverMcpFiles(rootDir, config) {
  const { excludeDirs, excludePatterns, maxDepth } = config.discovery;
  const mcpFiles = [];
  const absoluteRoot = path.resolve(rootDir);

  function shouldExcludePath(relPath) {
    const pathParts = relPath.split(path.sep);
    if (pathParts.some(part => excludeDirs.includes(part))) {
      return true;
    }
    return excludePatterns.some(pattern =>
      minimatch(relPath, pattern, { matchBase: true, nocase: true })
    );
  }

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (!isPathWithinRoot(absoluteRoot, dir)) return;

    const relPath = path.relative(absoluteRoot, dir);
    if (relPath && shouldExcludePath(relPath)) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relEntryPath = path.relative(absoluteRoot, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name === '.mcp.json') {
        if (!shouldExcludePath(relEntryPath)) {
          try {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            mcpFiles.push({ path: fullPath, content });
          } catch (err) {
            console.warn(`Invalid .mcp.json at ${fullPath}: ${err.message}`);
          }
        }
      }
    }
  }

  walk(absoluteRoot, 0);
  return mcpFiles;
}

/**
 * Merges multiple hooks.json files into a single hooks configuration.
 * @param {Array<{path: string, content: Object}>} hooksFiles - Array of hooks files
 * @returns {Object|null} Merged hooks configuration or null if no hooks
 */
function mergeHooks(hooksFiles) {
  if (hooksFiles.length === 0) return null;

  const merged = {};

  for (const { content } of hooksFiles) {
    // Support nested format: { description: "...", hooks: { EventName: [...] } }
    const hooksMap = (content.hooks && typeof content.hooks === 'object' && !Array.isArray(content.hooks))
      ? content.hooks
      : content;

    for (const [event, hooks] of Object.entries(hooksMap)) {
      if (!Array.isArray(hooks)) {
        continue;
      }
      if (!merged[event]) {
        merged[event] = [];
      }
      merged[event].push(...hooks);
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Merges multiple .mcp.json files into a single MCP servers configuration.
 * Errors on name collisions.
 * @param {Array<{path: string, content: Object}>} mcpFiles - Array of MCP files
 * @returns {{servers: Object|null, errors: string[]}} Merged MCP servers or errors
 */
function mergeMcpServers(mcpFiles) {
  if (mcpFiles.length === 0) return { servers: null, errors: [] };

  const merged = {};
  const errors = [];
  const serverSources = new Map(); // Track which file each server came from

  for (const { path: filePath, content } of mcpFiles) {
    for (const [serverName, serverConfig] of Object.entries(content)) {
      if (merged[serverName]) {
        const existingSource = serverSources.get(serverName);
        errors.push(
          `MCP server name collision: "${serverName}" defined in both:\n` +
          `  - ${existingSource}\n` +
          `  - ${filePath}`
        );
      } else {
        merged[serverName] = serverConfig;
        serverSources.set(serverName, filePath);
      }
    }
  }

  return {
    servers: Object.keys(merged).length > 0 ? merged : null,
    errors
  };
}

/**
 * Recursively discovers all skills in the repository.
 * Wrapper around flexible discovery for backwards compatibility.
 * @param {string} rootDir - Root directory to start discovery
 * @param {Object} config - Configuration object
 * @returns {string[]} Array of skill directory paths
 */
function discoverSkills(rootDir, config) {
  const result = discoverMarkdownComponents(rootDir, config);
  return result.skills;
}

/**
 * Generic validation for markdown components with frontmatter (skills, commands, agents).
 * @param {string} componentPath - Path to the component file or directory
 * @param {Object} config - Configuration object
 * @param {Object} options - Component-specific options
 * @param {string} options.type - Component type for error messages ('skill', 'command', 'agent')
 * @param {string} [options.filename] - Filename to look for in directory (for skills)
 * @returns {{ valid: boolean, errors: string[], name?: string, description?: string }} Validation result
 */
function validateComponent(componentPath, config, options) {
  const { nameMaxLength, descriptionMaxLength, reservedWords, namePattern } = config.validation;
  const { type, filename } = options;
  const errors = [];

  // Determine the actual file path (skills use directory + filename, others are direct files)
  const filePath = filename ? path.join(componentPath, filename) : componentPath;

  if (!fs.existsSync(filePath)) {
    const notFoundMsg = filename
      ? `${filename} not found at ${componentPath}`
      : `${type.charAt(0).toUpperCase() + type.slice(1)} file not found at ${componentPath}`;
    errors.push(notFoundMsg);
    return { valid: false, errors };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    errors.push(`Cannot read ${filePath}: ${err.message}`);
    return { valid: false, errors };
  }

  let parsed;
  try {
    parsed = matter(content);
  } catch (err) {
    errors.push(`Invalid frontmatter in ${filePath}: ${err.message}`);
    return { valid: false, errors };
  }

  const { name, description } = parsed.data;

  // Validate required fields
  if (!name) {
    errors.push(`Missing required field 'name' in ${filePath}`);
  }
  if (!description) {
    errors.push(`Missing required field 'description' in ${filePath}`);
  }

  // Validate name format
  if (name) {
    if (typeof name !== 'string') {
      errors.push(`Field 'name' must be a string in ${filePath}`);
    } else {
      if (name.length > nameMaxLength) {
        errors.push(`Name exceeds max length of ${nameMaxLength} chars: "${name}"`);
      }

      const nameRegex = new RegExp(namePattern);
      if (!nameRegex.test(name)) {
        errors.push(`Name "${name}" does not match pattern ${namePattern}`);
      }

      const lowerName = name.toLowerCase();
      for (const reserved of reservedWords) {
        if (lowerName.includes(reserved.toLowerCase())) {
          errors.push(`Name "${name}" contains reserved word: ${reserved}`);
        }
      }
    }
  }

  // Validate description
  if (description) {
    if (typeof description !== 'string') {
      errors.push(`Field 'description' must be a string in ${filePath}`);
    } else if (description.length > descriptionMaxLength) {
      errors.push(`Description exceeds max length of ${descriptionMaxLength} chars`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    name,
    description
  };
}

/**
 * Parses and validates a skill file.
 * @param {string} skillPath - Path to the skill directory
 * @param {Object} config - Configuration object
 * @returns {{ valid: boolean, errors: string[], name?: string, description?: string }} Validation result
 */
function validateSkill(skillPath, config) {
  return validateComponent(skillPath, config, {
    type: 'skill',
    filename: config.discovery.skillFilename
  });
}

/**
 * Checks for duplicate skill names across all discovered skills.
 * @param {Array<{ path: string, name: string }>} validatedSkills - Array of validated skill results
 * @returns {string[]} Array of error messages for duplicates
 */
function findDuplicateNames(validatedSkills) {
  const nameMap = new Map();
  const errors = [];

  for (const skill of validatedSkills) {
    if (!skill.name) continue;

    const lowerName = skill.name.toLowerCase();
    if (nameMap.has(lowerName)) {
      const existing = nameMap.get(lowerName);
      errors.push(`Duplicate skill name "${skill.name}" found in:\n  - ${existing.path}\n  - ${skill.path}`);
    } else {
      nameMap.set(lowerName, skill);
    }
  }

  return errors;
}

/**
 * Discovers all commands in the repository recursively.
 * Looks for .md files in the commands/ directory tree (excluding certain patterns).
 * @param {string} rootDir - Root directory to start discovery
 * @param {Object} config - Configuration object
 * @returns {string[]} Array of command file paths
 */
function discoverCommands(rootDir, config) {
  const { commandsDir, excludeDirs, excludePatterns, maxDepth } = config.discovery;
  const commandsPath = path.join(rootDir, commandsDir);
  const commands = [];
  const absoluteRoot = path.resolve(rootDir);

  if (!fs.existsSync(commandsPath)) {
    return commands;
  }

  function shouldExcludePath(relPath) {
    const pathParts = relPath.split(path.sep);
    if (pathParts.some(part => excludeDirs.includes(part))) {
      return true;
    }
    return excludePatterns.some(pattern =>
      minimatch(relPath, pattern, { matchBase: true, nocase: true })
    );
  }

  function walkCommands(dir, depth) {
    if (depth > maxDepth) {
      return;
    }

    if (!isPathWithinRoot(absoluteRoot, dir)) {
      console.warn(`Skipping path outside root: ${dir}`);
      return;
    }

    const relPath = path.relative(absoluteRoot, dir);
    if (relPath && shouldExcludePath(relPath)) {
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`Cannot read directory ${dir}: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relEntryPath = path.relative(absoluteRoot, fullPath);

      if (entry.isDirectory()) {
        walkCommands(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Exclude README.md and other documentation files
        if (entry.name.toLowerCase() !== 'readme.md' && !shouldExcludePath(relEntryPath)) {
          commands.push(fullPath);
        }
      }
    }
  }

  walkCommands(commandsPath, 0);
  return commands;
}

/**
 * Discovers all agents in the repository recursively.
 * Looks for .md files in the agents/ directory tree (excluding certain patterns).
 * @param {string} rootDir - Root directory to start discovery
 * @param {Object} config - Configuration object
 * @returns {string[]} Array of agent file paths
 */
function discoverAgents(rootDir, config) {
  const { agentsDir, excludeDirs, excludePatterns, maxDepth } = config.discovery;
  const agentsPath = path.join(rootDir, agentsDir);
  const agents = [];
  const absoluteRoot = path.resolve(rootDir);

  if (!fs.existsSync(agentsPath)) {
    return agents;
  }

  function shouldExcludePath(relPath) {
    const pathParts = relPath.split(path.sep);
    if (pathParts.some(part => excludeDirs.includes(part))) {
      return true;
    }
    return excludePatterns.some(pattern =>
      minimatch(relPath, pattern, { matchBase: true, nocase: true })
    );
  }

  function walkAgents(dir, depth) {
    if (depth > maxDepth) {
      return;
    }

    if (!isPathWithinRoot(absoluteRoot, dir)) {
      console.warn(`Skipping path outside root: ${dir}`);
      return;
    }

    const relPath = path.relative(absoluteRoot, dir);
    if (relPath && shouldExcludePath(relPath)) {
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`Cannot read directory ${dir}: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relEntryPath = path.relative(absoluteRoot, fullPath);

      if (entry.isDirectory()) {
        walkAgents(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Exclude README.md and other documentation files
        if (entry.name.toLowerCase() !== 'readme.md' && !shouldExcludePath(relEntryPath)) {
          agents.push(fullPath);
        }
      }
    }
  }

  walkAgents(agentsPath, 0);
  return agents;
}

/**
 * Validates a command file.
 * @param {string} commandPath - Path to the command file
 * @param {Object} config - Configuration object
 * @returns {{ valid: boolean, errors: string[], name?: string, description?: string }} Validation result
 */
function validateCommand(commandPath, config) {
  return validateComponent(commandPath, config, { type: 'command' });
}

/**
 * Validates an agent file.
 * @param {string} agentPath - Path to the agent file
 * @param {Object} config - Configuration object
 * @returns {{ valid: boolean, errors: string[], name?: string, description?: string }} Validation result
 */
function validateAgent(agentPath, config) {
  return validateComponent(agentPath, config, { type: 'agent' });
}

/**
 * Validates hooks.json file.
 * @param {string} rootDir - Root directory
 * @param {Object} config - Configuration object
 * @returns {{ valid: boolean, errors: string[], hooks?: Object }} Validation result
 */
function validateHooks(rootDir, config) {
  const { hooksFile } = config.discovery;
  const { validHookEvents } = config.validation;
  const hooksPath = path.join(rootDir, hooksFile);
  const errors = [];

  if (!fs.existsSync(hooksPath)) {
    // Hooks are optional, so this is not an error
    return { valid: true, errors: [], hooks: null };
  }

  let content;
  try {
    content = fs.readFileSync(hooksPath, 'utf8');
  } catch (err) {
    errors.push(`Cannot read ${hooksPath}: ${err.message}`);
    return { valid: false, errors };
  }

  let hooks;
  try {
    hooks = JSON.parse(content);
  } catch (err) {
    errors.push(`Invalid JSON in ${hooksPath}: ${err.message}`);
    return { valid: false, errors };
  }

  if (!Array.isArray(hooks)) {
    errors.push(`Hooks must be an array in ${hooksPath}`);
    return { valid: false, errors, hooks };
  }

  // Warn about empty hooks array
  if (hooks.length === 0) {
    console.warn(`Warning: Empty hooks array in ${hooksPath}`);
  }

  // Validate each hook
  hooks.forEach((hook, index) => {
    if (!hook.event) {
      errors.push(`Hook at index ${index} missing required 'event' field`);
    } else if (!validHookEvents.includes(hook.event)) {
      errors.push(`Hook at index ${index} has invalid event "${hook.event}". Valid events: ${validHookEvents.join(', ')}`);
    }

    // Must have at least one of: script, command, prompt
    if (!hook.script && !hook.command && !hook.prompt) {
      errors.push(`Hook at index ${index} must have at least one of: script, command, or prompt`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    hooks
  };
}

/**
 * Validates .mcp.json file.
 * @param {string} rootDir - Root directory
 * @param {Object} config - Configuration object
 * @returns {{ valid: boolean, errors: string[], mcpServers?: Object }} Validation result
 */
function validateMcpServers(rootDir, config) {
  const { mcpFile } = config.discovery;
  const mcpPath = path.join(rootDir, mcpFile);
  const errors = [];

  if (!fs.existsSync(mcpPath)) {
    // MCP servers are optional, so this is not an error
    return { valid: true, errors: [], mcpServers: null };
  }

  let content;
  try {
    content = fs.readFileSync(mcpPath, 'utf8');
  } catch (err) {
    errors.push(`Cannot read ${mcpPath}: ${err.message}`);
    return { valid: false, errors };
  }

  let mcpServers;
  try {
    mcpServers = JSON.parse(content);
  } catch (err) {
    errors.push(`Invalid JSON in ${mcpPath}: ${err.message}`);
    return { valid: false, errors };
  }

  if (typeof mcpServers !== 'object' || mcpServers === null) {
    errors.push(`MCP servers must be an object in ${mcpPath}`);
    return { valid: false, errors, mcpServers };
  }

  // Validate each server
  Object.entries(mcpServers).forEach(([serverName, server]) => {
    // Check for empty server name
    if (!serverName || serverName.trim() === '') {
      errors.push('MCP server has empty name');
      return;
    }

    // Check for valid command value (must be non-empty string if present)
    const hasValidCommand = server.command !== undefined &&
      typeof server.command === 'string' &&
      server.command.trim() !== '';

    // Check for valid URL value (must be non-empty string if present)
    const hasValidUrl = server.url !== undefined &&
      typeof server.url === 'string' &&
      server.url.trim() !== '';

    // Must have at least one valid field
    if (!hasValidCommand && !hasValidUrl) {
      if (server.command !== undefined && !hasValidCommand) {
        errors.push(`MCP server "${serverName}" has empty or invalid 'command' field`);
      } else if (server.url !== undefined && !hasValidUrl) {
        errors.push(`MCP server "${serverName}" has empty or invalid 'url' field`);
      } else {
        errors.push(`MCP server "${serverName}" must have either 'command' or 'url' field`);
      }
      return;
    }

    // Validate URL format if present
    if (hasValidUrl) {
      try {
        new URL(server.url);
      } catch {
        errors.push(`MCP server "${serverName}" has invalid URL: "${server.url}"`);
      }
    }

    // Validate args is an array if present
    if (server.args !== undefined && !Array.isArray(server.args)) {
      errors.push(`MCP server "${serverName}" 'args' must be an array`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    mcpServers
  };
}

/**
 * Discovers all plugin components in the repository (unified orchestrator).
 * @param {string} rootDir - Root directory to start discovery
 * @param {Object} config - Configuration object
 * @returns {Object} Object containing all discovered components
 */
function discoverAllComponents(rootDir, config) {
  // 1. Discover markdown components (flexible location)
  const mdComponents = discoverMarkdownComponents(rootDir, config);

  // 2. Discover JSON components (also flexible location)
  const hooksFiles = discoverHooksFiles(rootDir, config);
  const mcpFiles = discoverMcpFiles(rootDir, config);

  // 3. Merge JSON components
  const hooks = mergeHooks(hooksFiles);
  const mcpResult = mergeMcpServers(mcpFiles);

  // Collect all errors
  const allErrors = [
    ...mdComponents.errors,
    ...mcpResult.errors
  ];

  return {
    skills: mdComponents.skills,
    commands: mdComponents.commands,
    agents: mdComponents.agents,
    hooks,
    mcpServers: mcpResult.servers,
    hooksFiles,
    mcpFiles,
    errors: allErrors,
    skipped: mdComponents.skipped
  };
}

/**
 * Checks if a hooks/MCP file is associated with a markdown component.
 * Association rules:
 * - File in same directory as component
 * - File in parent directory of component
 * @param {string} jsonFilePath - Path to hooks.json or .mcp.json
 * @param {string} componentPath - Path to component file or directory
 * @returns {boolean} True if associated
 */
function isAssociated(jsonFilePath, componentPath) {
  const jsonDir = path.dirname(jsonFilePath);
  const componentDir = path.dirname(componentPath);

  // Same directory
  if (jsonDir === componentDir) return true;

  // JSON file in parent directory of component
  if (componentDir.startsWith(jsonDir + path.sep)) return true;

  return false;
}

/**
 * Finds hooks/MCP content for a component based on directory proximity.
 * @param {string} componentPath - Path to component
 * @param {Array<{path: string, content: Object}>} jsonFiles - Array of JSON files
 * @returns {Object|null} Merged content or null
 */
function findAssociatedJson(componentPath, jsonFiles) {
  const associated = jsonFiles.filter(file => isAssociated(file.path, componentPath));

  if (associated.length === 0) return null;

  // For hooks, merge all associated files
  // For MCP, merge all associated files (errors on collision handled earlier)
  const merged = {};
  for (const { content } of associated) {
    Object.assign(merged, content);
  }

  return merged;
}

/**
 * Extracts valid category directory names from pluginCategories config globs.
 * e.g. ["code/**", "analysis/**"] → ["code", "analysis"]
 * Falls back to hardcoded defaults when not set.
 * @param {Object} config - Configuration object
 * @returns {string[]} Array of category directory names
 */
function getCategoryNames(config) {
  const defaultCategories = ['code', 'analysis', 'communication', 'documents'];
  const globs = config.discovery.pluginCategories;

  if (!globs || globs.length === 0) {
    return defaultCategories;
  }

  return globs.map(glob => glob.split('/')[0]).filter(Boolean);
}

/**
 * Groups discovered components into plugins by deriving plugin identity from paths.
 * Pure data transformation — no filesystem access.
 *
 * For each component path, extracts category/plugin-name from its path relative to rootDir.
 * Components whose paths don't match category/plugin-name/... are returned as orphans.
 *
 * @param {Object} components - Output of discoverAllComponents()
 * @param {string} rootDir - Root directory (for computing relative paths)
 * @param {Object} config - Configuration object
 * @returns {{ plugins: Array<Object>, orphanedPaths: string[] }}
 */
function groupIntoPlugins(components, rootDir, config) {
  const absoluteRoot = path.resolve(rootDir);
  const validCategories = getCategoryNames(config);
  const pluginMap = new Map(); // key: "category/plugin-name"
  const orphanedPaths = [];

  // All component paths to process: skills (dirs), commands (files), agents (files)
  const allPaths = [
    ...components.skills.map(p => ({ absPath: p, type: 'skill' })),
    ...components.commands.map(p => ({ absPath: p, type: 'command' })),
    ...components.agents.map(p => ({ absPath: p, type: 'agent' }))
  ];

  for (const { absPath, type } of allPaths) {
    const relPath = path.relative(absoluteRoot, absPath);
    const parts = relPath.split(path.sep);

    // Need at least category/plugin-name
    if (parts.length < 2) {
      orphanedPaths.push(relPath);
      continue;
    }

    const category = parts[0];
    const pluginName = parts[1];

    if (!validCategories.includes(category)) {
      orphanedPaths.push(relPath);
      continue;
    }

    const key = `${category}/${pluginName}`;
    if (!pluginMap.has(key)) {
      pluginMap.set(key, {
        name: pluginName,
        category,
        path: path.join(absoluteRoot, category, pluginName),
        source: `./${category}/${pluginName}`,
        components: {
          skills: [],
          commands: [],
          agents: [],
          hooks: null,
          mcpServers: null,
          hooksFiles: [],
          mcpFiles: [],
          errors: []
        }
      });
    }

    const plugin = pluginMap.get(key);
    if (type === 'skill') {
      plugin.components.skills.push(absPath);
    } else if (type === 'command') {
      plugin.components.commands.push(absPath);
    } else if (type === 'agent') {
      plugin.components.agents.push(absPath);
    }
  }

  // Associate hooks and MCP files with plugins by directory proximity
  for (const plugin of pluginMap.values()) {
    const associatedHooks = (components.hooksFiles || []).filter(
      file => file.path.startsWith(plugin.path + path.sep)
    );
    if (associatedHooks.length > 0) {
      plugin.components.hooks = mergeHooks(associatedHooks);
      plugin.components.hooksFiles = associatedHooks;
    }

    const associatedMcp = (components.mcpFiles || []).filter(
      file => file.path.startsWith(plugin.path + path.sep)
    );
    if (associatedMcp.length > 0) {
      const mcpResult = mergeMcpServers(associatedMcp);
      plugin.components.mcpServers = mcpResult.servers;
      plugin.components.mcpFiles = associatedMcp;
    }
  }

  return {
    plugins: Array.from(pluginMap.values()),
    orphanedPaths
  };
}

/**
 * Discovers plugins in two-level hierarchy: category/plugin-name/
 * Uses discoverAllComponents() for a single traversal, then groups by path.
 * @param {string} rootDir - Root directory to start discovery
 * @param {Object} config - Configuration object
 * @returns {Array<{name: string, category: string, path: string, source: string, components: Object}>} Array of plugin metadata
 */
function discoverPlugins(rootDir, config) {
  const components = discoverAllComponents(rootDir, config);
  const { plugins } = groupIntoPlugins(components, rootDir, config);
  return plugins;
}

/**
 * Generates individual plugin.json for a plugin directory.
 * @param {Object} plugin - Plugin metadata
 * @param {Object} config - Configuration object
 * @returns {Object} Plugin manifest object
 */
function generatePluginJson(plugin, config) {
  const { components } = plugin;
  const { owner } = config.marketplace;

  // Get metadata from the first valid component
  let pluginName = plugin.name;
  let pluginDescription = `${plugin.name} plugin`;

  // Try to extract description from components
  if (components.agents && components.agents.length > 0) {
    const validation = validateAgent(components.agents[0], config);
    if (validation.valid && validation.description) {
      pluginDescription = validation.description;
    }
  } else if (components.commands && components.commands.length > 0) {
    const validation = validateCommand(components.commands[0], config);
    if (validation.valid && validation.description) {
      pluginDescription = validation.description;
    }
  } else if (components.skills && components.skills.length > 0) {
    const validation = validateSkill(components.skills[0], config);
    if (validation.valid && validation.description) {
      pluginDescription = validation.description;
    }
  }

  return {
    name: pluginName,
    description: pluginDescription,
    author: owner
  };
}

/**
 * Generates marketplace.json from discovered plugins.
 * Uses two-level hierarchy (category/plugin-name) with unique source paths per plugin.
 * @param {Array<Object>} plugins - Array of plugin metadata
 * @param {Object} config - Configuration object
 * @returns {Object} Marketplace manifest object
 */
function generateMarketplace(plugins, config) {
  const { name, owner, description } = config.marketplace;
  const marketplacePlugins = [];

  for (const plugin of plugins) {
    const { components } = plugin;

    // Get metadata from the first valid component
    let pluginName = plugin.name;
    let pluginDescription = `${plugin.name} plugin`;

    // Try to extract description from components
    if (components.agents && components.agents.length > 0) {
      const validation = validateAgent(components.agents[0], config);
      if (validation.valid && validation.description) {
        pluginDescription = validation.description;
      }
    } else if (components.commands && components.commands.length > 0) {
      const validation = validateCommand(components.commands[0], config);
      if (validation.valid && validation.description) {
        pluginDescription = validation.description;
      }
    } else if (components.skills && components.skills.length > 0) {
      const validation = validateSkill(components.skills[0], config);
      if (validation.valid && validation.description) {
        pluginDescription = validation.description;
      }
    }

    marketplacePlugins.push({
      name: pluginName,
      description: pluginDescription,
      source: plugin.source,
      author: owner,
      category: plugin.category === 'code' || plugin.category === 'analysis' ? 'development' : 'productivity'
    });
  }

  // Stable ordering: preserve existing order, append new plugins at the end.
  // This keeps diffs clean — only additions/removals, never reordering.
  const marketplacePath = path.join('.claude-plugin', 'marketplace.json');
  let existingOrder = [];
  try {
    const existing = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
    existingOrder = (existing.plugins || []).map(p => p.source);
  } catch {
    // No existing file or invalid JSON — all plugins are new
  }

  const existingSet = new Set(existingOrder);
  const pluginsBySource = new Map(marketplacePlugins.map(p => [p.source, p]));

  // Existing plugins in their original order (skip any that were removed)
  const ordered = [];
  for (const source of existingOrder) {
    if (pluginsBySource.has(source)) {
      ordered.push(pluginsBySource.get(source));
      pluginsBySource.delete(source);
    }
  }

  // New plugins appended at the end, sorted alphabetically among themselves
  const newPlugins = Array.from(pluginsBySource.values());
  newPlugins.sort((a, b) => a.source.localeCompare(b.source));
  ordered.push(...newPlugins);

  return {
    "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
    name,
    description,
    owner,
    plugins: ordered
  };
}

/**
 * Writes plugin.json files for all discovered plugins.
 * @param {Array<Object>} plugins - Array of plugin metadata
 * @param {Object} config - Configuration object
 */
function writePluginJsonFiles(plugins, config) {
  for (const plugin of plugins) {
    const pluginJsonPath = path.join(plugin.path, '.claude-plugin', 'plugin.json');
    const pluginJsonDir = path.dirname(pluginJsonPath);

    // Create .claude-plugin directory if it doesn't exist
    if (!fs.existsSync(pluginJsonDir)) {
      fs.mkdirSync(pluginJsonDir, { recursive: true });
    }

    const pluginJson = generatePluginJson(plugin, config);
    fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n');
    console.log(`Generated ${pluginJsonPath}`);
  }
}

module.exports = {
  loadConfig,
  classifyComponent,
  discoverMarkdownComponents,
  discoverHooksFiles,
  discoverMcpFiles,
  mergeHooks,
  mergeMcpServers,
  discoverSkills,
  discoverCommands,
  discoverAgents,
  validateComponent,
  validateSkill,
  validateCommand,
  validateAgent,
  findDuplicateNames,
  discoverAllComponents,
  getCategoryNames,
  groupIntoPlugins,
  discoverPlugins,
  generatePluginJson,
  generateMarketplace,
  writePluginJsonFiles
};

// CLI usage
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'discover') {
    const config = loadConfig();
    const skills = discoverSkills('.', config);
    console.log(JSON.stringify(skills, null, 2));
  } else if (command === 'discover-all') {
    const config = loadConfig();
    const components = discoverAllComponents('.', config);
    console.log(JSON.stringify(components, null, 2));
  } else if (command === 'validate') {
    const config = loadConfig();
    const components = discoverAllComponents('.', config);
    let hasErrors = false;

    // Check for classification errors first
    if (components.errors.length > 0) {
      hasErrors = true;
      console.error('\n[FAIL] Component classification errors:\n');
      components.errors.forEach(({ path, error }) => {
        console.error(`[FAIL] ${path}`);
        console.error(`  ${error.split('\n').join('\n  ')}\n`);
      });
    }

    // Validate skills
    console.log(`Found ${components.skills.length} skill(s) to validate\n`);
    const validatedSkills = [];
    for (const skillPath of components.skills) {
      const result = validateSkill(skillPath, config);
      validatedSkills.push({ path: skillPath, ...result });

      if (!result.valid) {
        hasErrors = true;
        console.error(`[FAIL] ${skillPath}:`);
        result.errors.forEach(err => console.error(`   ${err}`));
      } else {
        console.log(`[OK] ${skillPath} (${result.name})`);
      }
    }

    // Check for duplicate skill names
    const duplicateErrors = findDuplicateNames(validatedSkills);
    if (duplicateErrors.length > 0) {
      hasErrors = true;
      console.error('\n[FAIL] Duplicate skill names detected:');
      duplicateErrors.forEach(err => console.error(`   ${err}`));
    }

    // Validate commands
    console.log(`\nFound ${components.commands.length} command(s) to validate\n`);
    const validatedCommands = [];
    for (const commandPath of components.commands) {
      const result = validateCommand(commandPath, config);
      validatedCommands.push({ path: commandPath, ...result });

      if (!result.valid) {
        hasErrors = true;
        console.error(`[FAIL] ${commandPath}:`);
        result.errors.forEach(err => console.error(`   ${err}`));
      } else {
        console.log(`[OK] ${commandPath} (${result.name})`);
      }
    }

    // Check for duplicate command names
    const duplicateCommandErrors = findDuplicateNames(validatedCommands);
    if (duplicateCommandErrors.length > 0) {
      hasErrors = true;
      console.error('\n[FAIL] Duplicate command names detected:');
      duplicateCommandErrors.forEach(err => console.error(`   ${err}`));
    }

    // Validate agents
    console.log(`\nFound ${components.agents.length} agent(s) to validate\n`);
    const validatedAgents = [];
    for (const agentPath of components.agents) {
      const result = validateAgent(agentPath, config);
      validatedAgents.push({ path: agentPath, ...result });

      if (!result.valid) {
        hasErrors = true;
        console.error(`[FAIL] ${agentPath}:`);
        result.errors.forEach(err => console.error(`   ${err}`));
      } else {
        console.log(`[OK] ${agentPath} (${result.name})`);
      }
    }

    // Check for duplicate agent names
    const duplicateAgentErrors = findDuplicateNames(validatedAgents);
    if (duplicateAgentErrors.length > 0) {
      hasErrors = true;
      console.error('\n[FAIL] Duplicate agent names detected:');
      duplicateAgentErrors.forEach(err => console.error(`   ${err}`));
    }

    // Report hooks and MCP servers
    if (components.hooksFiles.length > 0) {
      console.log(`\n[OK] Found ${components.hooksFiles.length} hooks.json file(s)`);
      components.hooksFiles.forEach(({ path }) => {
        console.log(`  - ${path}`);
      });
    } else {
      console.log('\n[SKIP] No hooks.json files found');
    }

    if (components.mcpFiles.length > 0) {
      console.log(`\n[OK] Found ${components.mcpFiles.length} .mcp.json file(s)`);
      components.mcpFiles.forEach(({ path }) => {
        console.log(`  - ${path}`);
      });
    } else {
      console.log('\n[SKIP] No .mcp.json files found');
    }

    if (hasErrors) {
      console.error('\n[FAIL] Validation failed');
      process.exit(1);
    } else {
      console.log('\n[OK] All components valid');
      process.exit(0);
    }
  } else if (command === 'generate') {
    const config = loadConfig();
    const components = discoverAllComponents('.', config);
    const { plugins, orphanedPaths } = groupIntoPlugins(components, '.', config);

    if (orphanedPaths.length > 0) {
      console.warn('\n[WARN] Components not mapped to any plugin (not in a recognized category/plugin-name path):');
      orphanedPaths.forEach(p => console.warn(`  - ${p}`));
      console.warn('');
    }

    // Write individual plugin.json files
    writePluginJsonFiles(plugins, config);

    // Generate and write marketplace.json
    const marketplace = generateMarketplace(plugins, config);
    const marketplacePath = path.join('.claude-plugin', 'marketplace.json');
    const marketplaceDir = path.dirname(marketplacePath);

    if (!fs.existsSync(marketplaceDir)) {
      fs.mkdirSync(marketplaceDir, { recursive: true });
    }

    fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');
    console.log(`Generated ${marketplacePath}`);

    // Also output to stdout for CI verification
    console.log('\nGenerated marketplace.json:');
    console.log(JSON.stringify(marketplace, null, 2));
  } else {
    console.log('Usage: discover-components.js [discover|discover-all|validate|generate]');
    process.exit(1);
  }
}
