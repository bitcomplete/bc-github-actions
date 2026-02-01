# Claude Code Project Context

## Project Overview

This is the Bitcomplete GitHub Actions repository - reusable workflows and composite actions for automating Claude Code plugin marketplace management. These are the same workflows we use internally for bc-llm-skills, packaged for distribution to teams building their own marketplaces.

## Purpose (Why This Exists)

We care about getting the details right. This repository is the automation backbone for Claude Code plugin marketplaces—the same workflows we use internally, shared with every team we work with.

Software organizations big and small deserve tooling that just works:

- **Ship faster**: New marketplaces go live in minutes, not days
- **Stay consistent**: Automated validation catches problems before they reach your team
- **Zero maintenance**: Updates flow through automatically—you focus on building
- **Battle-tested**: The same automation we trust for our own work

## Repository Structure

```
bc-github-actions/
├── README.md                              # Business-focused overview
├── CLAUDE.md                              # Technical project context
├── LICENSE
├── package.json
├── .github/
│   └── workflows/
│       ├── test.yml                       # Self-tests
│       ├── release.yml                    # Version tagging automation
│       └── marketplace.yml                # REUSABLE WORKFLOW
├── marketplace/
│   ├── discover/
│   │   └── action.yml                     # Composite action
│   ├── validate/
│   │   └── action.yml                     # Composite action
│   └── generate/
│       └── action.yml                     # Composite action
├── scripts/
│   ├── src/
│   │   └── discover-components.js         # Source (from bc-llm-skills)
│   ├── dist/
│   │   └── discover-components.cjs        # Bundled with esbuild
│   └── test/
│       └── discover-components.test.js
├── test-fixtures/
│   ├── valid/                             # Valid marketplace structure
│   └── invalid/                           # Invalid for failure tests
├── templates/                             # Thin templates for client repos
│   ├── .github/
│   │   └── workflows/
│   │       ├── update-marketplace.yml     # Calls reusable workflow
│   │       └── validate-components.yml    # Calls reusable workflow
│   ├── .claude-plugin/
│   │   └── generator.config.toml.template
│   └── README.md.template
└── docs/
    ├── USAGE.md
    └── CUSTOMIZATION.md
```

## Key Architecture Decisions

### 1. Hybrid Approach: Composite Actions + Reusable Workflow

**Reusable workflow** (`.github/workflows/marketplace.yml`) for:
- Full marketplace pipelines (orchestrating steps)
- Operations requiring secrets (GitHub token for PRs)
- Job-level parallelism

**Composite actions** (`marketplace/*/action.yml`) for:
- Single-purpose operations (discover, validate, generate)
- Maximum composability
- Can be used standalone or via workflow

### 2. Script Bundling with esbuild

Bundle the 1400-line Node.js script with dependencies:
- No `npm install` in client workflows (faster)
- Dependencies locked at bundle time
- Single file execution

### 3. Versioning Strategy

```
Tags:
  v1.0.0    # Initial release
  v1.0.1    # Bug fixes
  v1.1.0    # New features
  v1        # Floating major (auto-updated)
```

Usage recommendations:
- Development: `@main`
- Production: `@v1` (floating major)
- High security: `@v1.0.0` or `@sha`

## Security

- Pin all action dependencies to SHA (not tags)
- Minimal permissions per job (contents: read, write only where needed)
- Validate inputs via environment variables
- Never log secrets

## Development Guidelines

### Code Style

Follow Claude Code project conventions from bc-llm-skills:
- No LLM-isms in commit messages, docs, or code
- Direct, factual language
- POSIX-compatible shell scripts (`#!/bin/sh`)
- Cross-platform compatibility (macOS, Linux)

### Testing

Before releasing:
1. Test composite actions individually
2. Test reusable workflow end-to-end
3. Test with bc-llm-skills as reference
4. Verify generated repos pass their own CI

### Release Process

1. Update version in package.json
2. Create git tag: `git tag v1.0.0`
3. Push tag: `git push origin v1.0.0`
4. GitHub Actions creates/updates floating `v1` tag

## Questions?

Check bc-llm-skills for working examples, or ask the team.
