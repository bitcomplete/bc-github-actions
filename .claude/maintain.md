# Maintain facts — bc-github-actions

Read by the `maintain` skill so each sweep skips rediscovery.

- **Repo:** `bitcomplete/bc-github-actions` (public) · maintainer `@terraboops`
- **What it is:** reusable workflows + composite actions consumed by other bitcomplete repos (notably the agentic-marketplace pipeline)
- **Package manager:** npm (`package-lock.json`)

## Commands

| Purpose | Command |
|---|---|
| Build bundles | `node scripts/build.js` |
| Test | `node scripts/test/discover-components.test.js` |

## Merge convention

Squash merge with the `(#N)` suffix. Delete the branch.

## Dependency cautions — read before any bump

- **`scripts/dist/*.cjs` are committed and executed directly** by the composite actions (`generate/action.yml` resolves `${GITHUB_ACTION_PATH}/../../scripts/dist/discover-components.cjs`). A lockfile bump **without** `node scripts/build.js` leaves the old vulnerable code running in every consumer's CI. Always rebuild and commit the bundles in the same PR.
- Build the bundles **from the repo root**. A previous bundle was built from a different cwd, so its esbuild path comments read `../node_modules/…`; rebuilding correctly produces ~280 lines of cosmetic diff churn. Expect it, and say so in the PR body.
- `esbuild` is a build-time bundler here. Its recurring advisories are all about esbuild's **dev server**, which this repo never runs — not reachable, don't panic-bump.
- Held majors (deliberate): `minimatch` 10 · `esbuild` 0.28.

## Blast radius

Consumers pin the reusable workflow by SHA but reference inner composite actions as `@v1`. Moving the `v1` tag takes effect **immediately for every consumer**, and a consumer's SHA pin must be bumped in lockstep. Never move `v1` casually.

## Known operational issue

The marketplace pipeline's `publish` job authenticates with a **`MARKETPLACE_PAT`** repo secret in the *consumer* repo. Expired PATs have silently broken publishing for ~a month at a time (the failure surfaces as `fatal: could not read Username` from `create-pull-request`, which reads as a git bug rather than an auth one). `heal-stuck-prs` papers over the adjacent stuck-PR problem. A GitHub App installation token would retire this whole class — see issue #16.
