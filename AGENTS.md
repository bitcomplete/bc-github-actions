# AGENTS.md

Onboarding map for AI coding agents working in this repo. Follow the links — do not duplicate their content here.

## What this repo is

Reusable GitHub Actions for Claude Code plugin marketplace automation: discovery, validation, marketplace.json generation, PR creation + auto-merge, and reliability workarounds.

- Business overview: [README.md](README.md)
- Architecture, design decisions, release process: [CLAUDE.md](CLAUDE.md)
- End-user action docs: [agentic-marketplace/README.md](agentic-marketplace/README.md)

## Start here, in this order

1. [README.md](README.md) — what the repo is, how downstream consumers use it.
2. [CLAUDE.md](CLAUDE.md) — architecture, conventions, release process. Canonical for internal context.
3. [agentic-marketplace/README.md](agentic-marketplace/README.md) — action-level reference: inputs, outputs, configuration.
4. The README of the specific action you're modifying, if any: [discover](agentic-marketplace/discover/action.yml) · [validate](agentic-marketplace/validate/action.yml) · [generate](agentic-marketplace/generate/action.yml) · [publish](agentic-marketplace/publish/action.yml) · [heal-stuck-prs](agentic-marketplace/heal-stuck-prs/README.md).

## Where things live

- Action YAMLs: `agentic-marketplace/<name>/action.yml`
- Reusable workflows: `.github/workflows/*.yml`
- Logic (bundled into actions): `scripts/src/*.js` — rebuild with `npm run build`
- Bundled output consumed at runtime: `scripts/dist/*.cjs` — committed; rebuild on every src change
- Tests: `scripts/test/*.test.js` — run with `npm test`
- Fixtures: `test-fixtures/valid/`, `test-fixtures/invalid/`

## Working loop

1. Edit source in `scripts/src/`.
2. `npm test` — full suite must stay green.
3. `npm run build` — rebuilds `scripts/dist/`. **Always commit src + dist together.**
4. Shellcheck any new inline bash in action YAMLs (`shellcheck -s bash`).

## Releasing

Release process and versioning convention: see [CLAUDE.md § Release Process](CLAUDE.md#release-process) and [CLAUDE.md § Versioning Strategy](CLAUDE.md#3-versioning-strategy).

Internal cross-references inside this repo (reusable workflow → composite action) are SHA-pinned — not `@v1` — so that when a consumer pins the reusable workflow to a SHA, every transitive `uses:` resolves at that same commit. If you modify an action referenced by a reusable workflow, update the SHA in the workflow file in the same commit.

## Conventions

Commit style, writing style, shell compatibility, cross-tool compatibility: see [bc-llm-skills' CLAUDE.md](https://github.com/bitcomplete/bc-agentic-marketplace/blob/main/CLAUDE.md) — same conventions apply here.

## When you need context this file doesn't give you

Don't guess. Read the relevant README, then the code. If a convention isn't captured in one of the linked docs, flag it — add a one-line pointer here rather than duplicating the convention itself.
