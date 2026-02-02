# Getting Started with Agentic Marketplace

This guide walks you through setting up and using the Agentic Marketplace automation for your Claude Code plugins.

## What You'll Build

By the end of this guide, you'll have:
- A marketplace repository with automated discovery and validation
- Plugin components organized in a standardized structure
- A `marketplace.json` file that updates automatically when you add or modify plugins
- CI/CD workflows that maintain your marketplace

## Prerequisites

- GitHub repository for your marketplace
- Git and GitHub CLI (`gh`) installed
- Basic familiarity with GitHub Actions

## Step 1: Create Marketplace Repository Structure

Create the following directory structure in your repository:

```bash
# Create the base structure
mkdir -p .claude-plugin
mkdir -p .github/workflows

# Create category directories (customize these for your needs)
mkdir -p code
mkdir -p analysis
mkdir -p communication
```

Your repository should look like:

```
your-marketplace/
├── .claude-plugin/
├── .github/
│   └── workflows/
├── code/              # Category for code-related plugins
├── analysis/          # Category for analysis plugins
└── communication/     # Category for communication plugins
```

## Step 2: Configure the Marketplace

Create `.claude-plugin/generator.config.toml`:

```toml
# Naming pattern for components (kebab-case)
naming_pattern = "^[a-z0-9]+(-[a-z0-9]+)*$"

# Reserved words that cannot appear in component names
reserved_words = ["anthropic", "claude"]

# Plugin discovery paths - adjust to match your categories
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

## Step 3: Add the Workflow

Create `.github/workflows/agentic-marketplace.yml`:

```yaml
name: Update Agentic Marketplace

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    uses: bitcomplete/bc-github-actions/.github/workflows/agentic-marketplace.yml@v1
    with:
      config-path: .claude-plugin/generator.config.toml
    secrets:
      token: ${{ secrets.GITHUB_TOKEN }}
```

Commit and push:

```bash
git add .
git commit -m "feat: add agentic marketplace automation"
git push
```

## Step 4: Create Your First Plugin

Create a plugin with the two-level directory structure: `category/plugin-name/`

```bash
# Create plugin directory
mkdir -p code/my-first-plugin/commands

# Create a command
cat > code/my-first-plugin/commands/hello.md << 'EOF'
---
name: hello
description: Say hello to the world
---

Print "Hello, World!" to the console.
EOF
```

Your structure should now look like:

```
your-marketplace/
├── .claude-plugin/
│   └── generator.config.toml
├── .github/
│   └── workflows/
│       └── agentic-marketplace.yml
└── code/
    └── my-first-plugin/
        └── commands/
            └── hello.md
```

## Step 5: Push and Watch the Magic

```bash
git add .
git commit -m "feat: add my-first-plugin"
git push
```

The workflow will:
1. **Discover** your plugin and its components
2. **Validate** naming and metadata
3. **Generate** `.claude-plugin/marketplace.json` and `code/my-first-plugin/.claude-plugin/plugin.json`
4. **Create a PR** with the generated files
5. **Auto-merge** after CI passes (if enabled)

Check your Actions tab to see it run!

## Step 6: Understanding the Generated Files

After the workflow completes, you'll see:

### `.claude-plugin/marketplace.json`

```json
{
  "name": "your-marketplace",
  "owner": "your-org",
  "plugins": [
    {
      "name": "my-first-plugin",
      "description": "...",
      "components": {
        "commands": [
          {
            "name": "hello",
            "description": "Say hello to the world",
            "source": "code/my-first-plugin/commands/hello.md"
          }
        ]
      }
    }
  ]
}
```

### `code/my-first-plugin/.claude-plugin/plugin.json`

```json
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "description": "...",
  "commands": ["hello"]
}
```

## Step 7: Using Your Marketplace in Claude Code

### Option A: Install from GitHub

Users can install plugins from your marketplace:

```bash
# Install the entire marketplace
claude plugin install github:your-org/your-marketplace

# Install a specific plugin
claude plugin install github:your-org/your-marketplace/code/my-first-plugin
```

### Option B: Local Development

Clone and link for local development:

```bash
# Clone your marketplace
git clone https://github.com/your-org/your-marketplace.git

# Link for local use
cd your-marketplace
claude plugin link code/my-first-plugin
```

## Adding More Components

### Commands

Commands are slash commands users can invoke:

```bash
mkdir -p code/my-plugin/commands
cat > code/my-plugin/commands/example.md << 'EOF'
---
name: example
description: Example command
---

Command implementation here.
EOF
```

### Skills

Skills provide instructional content:

```bash
mkdir -p code/my-plugin/skills
cat > code/my-plugin/skills/example-skill.md << 'EOF'
---
name: example-skill
description: Example skill
---

Skill content here.
EOF
```

### Agents

Agents are autonomous subagents:

```bash
mkdir -p code/my-plugin/agents
cat > code/my-plugin/agents/example-agent.md << 'EOF'
---
name: example-agent
description: Example agent
color: blue
---

Agent system prompt here.
EOF
```

### Hooks

Hooks respond to events:

```bash
mkdir -p code/my-plugin/hooks
cat > code/my-plugin/hooks/hooks.json << 'EOF'
{
  "hooks": [
    {
      "event": "PreToolUse",
      "filter": {"toolName": "Bash"},
      "action": {
        "type": "prompt",
        "prompt": "Before running bash commands, check for destructive operations."
      }
    }
  ]
}
EOF
```

## Validation and Testing

### Local Validation

Before pushing, validate your components:

```bash
# Clone the bc-github-actions repo
git clone https://github.com/bitcomplete/bc-github-actions.git

# Run validation
cd your-marketplace
../bc-github-actions/scripts/dist/discover-components.cjs validate
```

### Common Validation Errors

**Error: Component name doesn't match pattern**
```
Fix: Use kebab-case: my-component (not myComponent or my_component)
```

**Error: Description too short**
```
Fix: Add a meaningful description (min 10 characters)
```

**Error: Missing required fields**
```
Fix: Ensure frontmatter has name and description
```

## Customization

### Change Naming Convention

Edit `.claude-plugin/generator.config.toml`:

```toml
# For snake_case
naming_pattern = "^[a-z0-9]+(_[a-z0-9]+)*$"

# For camelCase
naming_pattern = "^[a-z][a-zA-Z0-9]*$"
```

### Disable Auto-Merge

Edit `.github/workflows/agentic-marketplace.yml`:

```yaml
jobs:
  update:
    uses: bitcomplete/bc-github-actions/.github/workflows/agentic-marketplace.yml@v1
    with:
      config-path: .claude-plugin/generator.config.toml
      auto-merge: false  # Add this line
    secrets:
      token: ${{ secrets.GITHUB_TOKEN }}
```

### Add Custom Validation

Create a separate workflow for custom validation:

```yaml
name: Custom Validation

on:
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: bitcomplete/bc-github-actions/agentic-marketplace/validate@v1
        id: validate
        with:
          fail-on-error: false

      - name: Custom checks
        if: steps.validate.outputs.valid == 'false'
        run: |
          echo "Custom validation logic here"
```

## Troubleshooting

### Workflow Not Running

Check:
- Workflow file is in `.github/workflows/`
- File has `.yml` extension
- Syntax is valid YAML

### No Components Discovered

Check:
- Plugin structure is `category/plugin-name/`
- Component files have YAML frontmatter
- `plugin_categories` in config matches your directories

### Validation Failing

Check:
- Component names use kebab-case (or your configured pattern)
- All components have name and description
- Description length is within bounds (10-200 characters)

### PR Not Auto-Merging

Check:
- Repository settings allow auto-merge
- No required reviews or status checks blocking
- Branch protection rules don't prevent auto-merge

## Next Steps

- Read the [full documentation](agentic-marketplace/README.md)
- Check [example workflows](https://github.com/bitcomplete/bc-llm-skills)
- Explore [advanced usage patterns](agentic-marketplace/README.md#advanced-usage)

## Getting Help

- Open an issue: https://github.com/bitcomplete/bc-github-actions/issues
- Check examples: https://github.com/bitcomplete/bc-llm-skills
