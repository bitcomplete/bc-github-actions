# Heal Stuck Marketplace PRs

**This action exists to work around GitHub Actions reliability issues.** It is not a general automation layer, does not replace the normal `agentic-marketplace` publish flow, and should not be reached for when the normal workflow could already handle the situation.

## What it does

Scans the repo it runs in for open PRs on the `auto-update-marketplace` branch (the one [`agentic-marketplace/publish`](../publish/action.yml) creates) that have gotten stuck due to GH-side flake, and applies a narrowly targeted recovery:

| Classification | Symptom | Remediation |
|---|---|---|
| **No workflow runs** | PR has no runs attached to its head SHA and is older than the threshold | Push an empty commit to the PR branch to retrigger `pull_request` workflows; re-issue auto-merge |
| **Queued jobs** | Any job older than the threshold with `started_at = null` | Cancel the stuck run, re-run it, re-issue auto-merge |
| **Stalled auto-merge** | All checks green but `autoMergeRequest` is unset | Re-issue `gh pr merge --auto --squash` |
| **Healthy** | Everything in the expected envelope | Log, skip |

## When it runs

Intended to be invoked on a cron schedule (every 30 min is a sensible default) via the [`marketplace-consistency.yml`](../../.github/workflows/marketplace-consistency.yml) reusable workflow. Runs are lightweight and no-op on healthy repos.

## Stuck threshold

Defaults to **90 seconds**. Derived by sampling `started_at − created_at` (runner-wait time) across a spread of recent healthy `Update Agentic Marketplace` runs on a reference repo — the max observed was 9s. 10× the ceiling gives a threshold that is comfortably outside the healthy operating envelope.

Override via `stuck-threshold-seconds` if your repo's workflows have different queue-time characteristics.

## Inputs

| Name | Required | Default | Description |
|---|---|---|---|
| `github-token` | yes | — | `GITHUB_TOKEN` is sufficient. Needs `contents:write`, `pull-requests:write`, `actions:write`. |
| `branch` | no | `auto-update-marketplace` | Branch that `publish/action.yml` uses for auto-generated PRs. |
| `label` | no | `automated` | Label that `publish/action.yml` puts on auto-generated PRs. |
| `stuck-threshold-seconds` | no | `90` | Age above which a PR/job is considered stuck. |

## Usage

Direct:

```yaml
- uses: bitcomplete/bc-github-actions/agentic-marketplace/heal-stuck-prs@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Via the reusable workflow (recommended):

```yaml
name: Marketplace Consistency Cron
on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  actions: write

jobs:
  heal:
    uses: bitcomplete/bc-github-actions/.github/workflows/marketplace-consistency.yml@v1
    secrets:
      token: ${{ secrets.GITHUB_TOKEN }}
```

## Why this exists

When GitHub Actions infrastructure is healthy, `agentic-marketplace/publish` opens the auto-update PR, the PR's `pull_request` workflow picks up, checks go green, auto-merge fires — all in under a minute. When infrastructure is flaky, one of two things happens:

1. The `pull_request` workflow never triggers, so the PR has zero checks and auto-merge can't evaluate. Previously this left the PR blocked until someone noticed and closed it manually (see historical PRs #39, #40).
2. A job enters `queued` state and never gets a runner. The PR sits indefinitely waiting for checks that will never complete.

This action catches both cases after the fact, without replacing any of the normal flow.
