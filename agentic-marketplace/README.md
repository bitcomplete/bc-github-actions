# Agentic Marketplace Automation

Automates Claude Code plugin marketplace management through auto-discovery, validation, and synchronization.

## Overview

The agentic-marketplace action provides three composable actions that work together to manage your Claude Code plugin marketplace:

1. **discover** - Finds plugins, commands, agents, skills, hooks, and MCP servers
2. **validate** - Validates component structure, naming, and metadata
3. **generate** - Creates marketplace.json and plugin.json files, opens PR with auto-merge

## Quick Start

### Using the Reusable Workflow (Recommended)

Add `.github/workflows/agentic-marketplace.yml` to your marketplace repository:

```yaml
name: Update Agentic Marketplace

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  update:
    uses: bitcomplete/bc-github-actions/.github/workflows/agentic-marketplace.yml@v1
    with:
      config-path: .claude-plugin/generator.config.toml
    secrets:
      token: ${{ secrets.GITHUB_TOKEN }}
```

### Using Individual Actions

For custom workflows, use the actions individually:

```yaml
name: Custom Agentic Marketplace Workflow

on:
  push:
    branches: [main]

jobs:
  agentic-marketplace:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Discover components
        id: discover
        uses: bitcomplete/bc-github-actions/agentic-marketplace/discover@v1
        with:
          config-path: .claude-plugin/generator.config.toml

      - name: Validate components
        uses: bitcomplete/bc-github-actions/agentic-marketplace/validate@v1
        with:
          config-path: .claude-plugin/generator.config.toml
          fail-on-error: true

      - name: Generate marketplace files
        uses: bitcomplete/bc-github-actions/agentic-marketplace/generate@v1
        with:
          config-path: .claude-plugin/generator.config.toml
          github-token: ${{ secrets.GITHUB_TOKEN }}
          auto-merge: true
```

## Actions Reference

### discover

Scans your repository for Claude Code components based on your configuration file.

**Inputs:**
- `config-path` (optional) - Path to generator.config.toml (default: `.claude-plugin/generator.config.toml`)

**Outputs:**
- `plugins` - JSON array of discovered plugins
- `components` - JSON object of all discovered components (commands, skills, agents, etc.)

**Example:**
```yaml
- uses: bitcomplete/bc-github-actions/agentic-marketplace/discover@v1
  id: discover
  with:
    config-path: .claude-plugin/generator.config.toml

- name: Show discovered plugins
  run: echo '${{ steps.discover.outputs.plugins }}'
```

### validate

Validates discovered components against marketplace standards defined in your configuration.

**Inputs:**
- `config-path` (optional) - Path to generator.config.toml (default: `.claude-plugin/generator.config.toml`)
- `fail-on-error` (optional) - Exit with error if validation fails (default: `true`)

**Outputs:**
- `valid` - Boolean indicating if all components are valid
- `errors` - JSON array of validation errors (if any)

**Validation checks:**
- Component naming follows configured pattern (kebab-case, snake_case, camelCase)
- Required metadata fields are present
- No reserved words in component names
- Plugin structure matches expected hierarchy

**Example:**
```yaml
- uses: bitcomplete/bc-github-actions/agentic-marketplace/validate@v1
  id: validate
  with:
    config-path: .claude-plugin/generator.config.toml
    fail-on-error: true

- name: Check validation result
  if: steps.validate.outputs.valid == 'false'
  run: |
    echo "Validation errors found:"
    echo '${{ steps.validate.outputs.errors }}'
```

### generate

Generates marketplace.json and plugin.json files, then creates a pull request with the changes.

**Inputs:**
- `config-path` (optional) - Path to generator.config.toml (default: `.claude-plugin/generator.config.toml`)
- `github-token` (required) - GitHub token for creating PRs
- `auto-merge` (optional) - Enable auto-merge for the PR (default: `true`)
- `dry-run` (optional) - Preview changes without committing (default: `false`)

**Outputs:**
- `pr-number` - Pull request number if created
- `pr-url` - Pull request URL if created

**Generated files:**
- `.claude-plugin/marketplace.json` - Marketplace manifest with all plugins and components
- `category/plugin-name/.claude-plugin/plugin.json` - Individual plugin metadata

**Example:**
```yaml
- uses: bitcomplete/bc-github-actions/agentic-marketplace/generate@v1
  id: generate
  with:
    config-path: .claude-plugin/generator.config.toml
    github-token: ${{ secrets.GITHUB_TOKEN }}
    auto-merge: true

- name: Show PR details
  if: steps.generate.outputs.pr-number != ''
  run: |
    echo "PR created: ${{ steps.generate.outputs.pr-url }}"
    echo "PR number: ${{ steps.generate.outputs.pr-number }}"
```

## Configuration

The marketplace actions are configured via a TOML file at `.claude-plugin/generator.config.toml`:

```toml
# Naming pattern for components
naming_pattern = "^[a-z0-9]+(-[a-z0-9]+)*$"  # kebab-case

# Reserved words that cannot appear in component names
reserved_words = ["anthropic", "claude"]

# Plugin discovery paths (glob patterns)
plugin_categories = ["code/**", "analysis/**", "communication/**"]

# Component types to discover
[discovery]
plugins = true
commands = true
skills = true
agents = true
hooks = true
mcp_servers = true

# Validation rules
[validation]
require_description = true
require_version = true
min_description_length = 10
max_description_length = 200
```

## Repository Structure

The marketplace action expects this structure:

```
your-marketplace/
├── .claude-plugin/
│   ├── marketplace.json          # Generated automatically
│   └── generator.config.toml     # Your configuration
├── .github/
│   └── workflows/
│       └── agentic-marketplace.yml        # Workflow file
├── code/                          # Category directory
│   └── my-plugin/                 # Plugin directory
│       ├── .claude-plugin/
│       │   └── plugin.json        # Generated automatically
│       ├── commands/
│       │   └── my-command.md
│       ├── skills/
│       │   └── my-skill.md
│       └── agents/
│           └── my-agent.md
└── analysis/                      # Another category
    └── another-plugin/
        └── ...
```

## Workflow Details

### Discovery Process

The discover action scans your repository based on the plugin_categories patterns in your config:

1. Finds all directories matching the two-level pattern: `category/plugin-name/`
2. Scans each plugin directory for:
   - Commands in `commands/**/*.md`
   - Skills in `skills/**/*.md`
   - Agents in `agents/**/*.md`
   - Hooks in `hooks/hooks.json`
   - MCP servers in `.mcp.json`
3. Extracts metadata from YAML frontmatter in markdown files
4. Outputs discovered components as JSON

### Validation Process

The validate action checks each component against your configuration rules:

- **Naming**: Matches configured pattern (kebab-case, snake_case, camelCase)
- **Reserved words**: No component names contain reserved words
- **Metadata**: Required fields are present (name, description, version)
- **Structure**: Plugin directories follow expected hierarchy
- **Constraints**: Description length within min/max bounds

Validation errors are reported with file paths and specific issues.

### Generation Process

The generate action creates or updates marketplace files:

1. Generates `.claude-plugin/marketplace.json` with all plugins and their components
2. Generates individual `plugin.json` files for each plugin
3. Creates a pull request with changes
4. If `auto-merge: true`, enables auto-merge on the PR
5. PR auto-merges when CI checks pass

## Troubleshooting

### No components discovered

Check that:
- Your `generator.config.toml` `plugin_categories` patterns match your directory structure
- Plugin directories follow the two-level pattern: `category/plugin-name/`
- Component files have proper YAML frontmatter

### Validation failures

Common issues:
- Component names don't match the configured `naming_pattern`
- Component names contain `reserved_words`
- Missing required metadata fields (name, description, version)
- Description too short or too long

### PR not created

Possible causes:
- No changes detected (marketplace.json already up to date)
- GitHub token lacks `contents: write` and `pull-requests: write` permissions
- Branch protection rules blocking automated PRs

### Auto-merge not working

Check that:
- Repository settings allow auto-merge
- Branch protection rules don't require additional approvals
- All required status checks pass
- GitHub token has sufficient permissions

## Advanced Usage

### Dry Run

Preview changes without creating a PR:

```yaml
- uses: bitcomplete/bc-github-actions/agentic-marketplace/generate@v1
  with:
    config-path: .claude-plugin/generator.config.toml
    github-token: ${{ secrets.GITHUB_TOKEN }}
    dry-run: true
```

### Manual Merge

Disable auto-merge to review changes before merging:

```yaml
- uses: bitcomplete/bc-github-actions/agentic-marketplace/generate@v1
  with:
    config-path: .claude-plugin/generator.config.toml
    github-token: ${{ secrets.GITHUB_TOKEN }}
    auto-merge: false
```

### Custom Validation

Use validation output to implement custom logic:

```yaml
- uses: bitcomplete/bc-github-actions/agentic-marketplace/validate@v1
  id: validate
  with:
    fail-on-error: false

- name: Custom validation handling
  if: steps.validate.outputs.valid == 'false'
  run: |
    # Send notification, post comment, etc.
    echo "Validation failed with errors:"
    echo '${{ steps.validate.outputs.errors }}'
```

## Examples

See the [main README](../README.md) for complete workflow examples and diagrams.
