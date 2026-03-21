# Agentic Marketplace Automation

Automates Claude Code plugin marketplace management through auto-discovery, validation, and synchronization.

## Overview

The agentic-marketplace action provides composable actions that work together to manage your Claude Code plugin marketplace:

1. **discover** - Finds plugins, commands, agents, skills, hooks, and MCP servers
2. **validate** - Validates component structure, naming, and metadata
3. **generate** - Creates marketplace.json and plugin.json files
4. **publish** - Signs generated files with Sigstore attestation and opens a PR with auto-merge

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

permissions:
  contents: write
  pull-requests: write
  id-token: write          # Required for Sigstore attestation signing

jobs:
  update:
    uses: bitcomplete/bc-github-actions/.github/workflows/agentic-marketplace.yml@v1
    with:
      config-path: .claude-plugin/generator.config.toml
    secrets:
      token: ${{ secrets.GITHUB_TOKEN }}
      pat: ${{ secrets.PAT }}
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
- `.claude-plugin/marketplace.json.bundle` - Sigstore attestation bundle (when signing is enabled)
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
│   ├── marketplace.json.bundle   # Sigstore attestation (generated)
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

### Signing and Attestation

The publish action automatically signs generated marketplace files using [Sigstore](https://sigstore.dev) keyless attestation via the [agent-sign](https://github.com/always-further/agent-sign) action. This creates a cryptographic proof that the file was built in your CI pipeline from your repository — not modified after the fact.

**What gets signed:**

- `.claude-plugin/marketplace.json` is signed, producing a `.claude-plugin/marketplace.json.bundle` sidecar file
- The `.bundle` file is included in the auto-generated PR alongside the marketplace manifest

**How signing works:**

1. GitHub Actions mints a short-lived OIDC token identifying the workflow, repository, and branch
2. Sigstore's Fulcio CA issues an ephemeral certificate binding that identity to a signing key
3. The marketplace file is signed with that key, producing a [DSSE envelope](https://github.com/secure-systems-lab/dsse) with an [in-toto](https://in-toto.io/) statement
4. The signature is logged in Sigstore's [Rekor](https://docs.sigstore.dev/logging/overview/) transparency log
5. The resulting `.bundle` file contains the signature, certificate, and log inclusion proof — everything needed for offline verification

No private keys to manage. Identity comes from the CI environment itself.

**How users verify signatures:**

Install the [nono CLI](https://github.com/always-further/nono), then verify against a trust policy:

```bash
nono trust verify --policy trust-policy.json --all
```

A trust policy defines who is allowed to sign which files. Example `trust-policy.json`:

```json
{
  "version": 1,
  "includes": [".claude-plugin/marketplace.json"],
  "publishers": [
    {
      "name": "marketplace CI",
      "issuer": "https://token.actions.githubusercontent.com",
      "repository": "your-org/your-marketplace",
      "workflow": ".github/workflows/agentic-marketplace.yml",
      "ref_pattern": "refs/heads/main"
    }
  ],
  "enforcement": "deny"
}
```

Verification checks four things:

1. **Certificate chain** — the signing certificate was issued by Sigstore's CA
2. **Transparency log** — the signature was recorded in Rekor within the certificate's validity window
3. **Signature validity** — the ECDSA signature over the file content is authentic
4. **Publisher identity** — the OIDC claims in the certificate (repository, workflow, branch) match the trust policy

If any check fails, verification fails. With `"enforcement": "deny"`, files matching the `includes` patterns are rejected unless they have a valid signature from a trusted publisher.

**What this protects against:**

- **Tampered marketplace files** — if someone modifies marketplace.json after it was generated in CI, the signature won't match
- **Unauthorized publishing** — only the configured workflow in the configured repository can produce valid signatures
- **Replay attacks** — signatures are timestamped via the transparency log; stale signatures can be rejected
- **Key compromise** — there are no long-lived keys to steal; signing keys are ephemeral and exist only during the CI run

**Runtime enforcement with nono:**

For stronger guarantees, run agents through `nono run` which verifies signatures at the kernel level before the agent can read instruction files:

```bash
nono run --profile claude-code -- claude
```

This prevents time-of-check/time-of-use (TOCTOU) attacks where files are swapped between verification and read.

**Disabling signing:**

Signing is on by default. To disable it:

```yaml
jobs:
  update:
    uses: bitcomplete/bc-github-actions/.github/workflows/agentic-marketplace.yml@v1
    with:
      sign-files: false
```

When disabled, no `.bundle` files are created and the `id-token: write` permission is unused.

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

## FAQ

### Do I need nono to use this workflow?

No. Signing is included by default, but the `.bundle` sidecar files are inert — they sit alongside your marketplace.json and are ignored by everything except nono verification tooling. Claude Code, plugin consumers, and your existing tooling won't read or care about `.bundle` files. You get supply chain security for free if you ever decide to verify later, and zero impact if you don't.

### Will the `.bundle` files break anything?

No. A `.bundle` file is a standalone JSON file containing the Sigstore attestation. It doesn't modify marketplace.json or any other file. Tools that don't know about it will ignore it. It's no different from having a `.gitignore` or `LICENSE` file in the directory — present but harmless.

### Should I add `.bundle` files to `.gitignore`?

No. The `.bundle` files need to be committed alongside the files they attest to. Verification works by comparing the `.bundle` against the file it signs, so both must be present in the repository. If you `.gitignore` them, you lose the ability to verify later.

### Do I need the `id-token: write` permission if I'm not using nono?

The workflow requests this permission to obtain the OIDC token used for keyless signing. It's harmless — the token is scoped to Sigstore's Fulcio CA and can only be used to request a signing certificate. If you disable signing with `sign-files: false`, the permission is unused but still safe to include.

### Can I start verifying signatures later?

Yes. Every `.bundle` file committed to your repository is independently verifiable at any point in the future. The Rekor transparency log entry is permanent. You can adopt nono verification whenever you're ready — the signatures will already be there.

### When should I disable signing?

Most users should leave signing enabled. Reasons to disable:

- Your CI environment doesn't support OIDC tokens (self-hosted runners without OIDC configured)
- You have strict policies against external network calls during CI (Sigstore requires reaching Fulcio and Rekor)
- You're running in an air-gapped environment
