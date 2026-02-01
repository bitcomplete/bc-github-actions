# Bitcomplete GitHub Actions

The automation behind Claude Code plugin marketplaces. We use these workflows ourselves, and now you can too.

## What This Does

Plugin marketplaces shouldn't require babysitting. These workflows handle the boring stuff:

- **Auto-discovery** - Push a plugin, it gets registered. No manual JSON editing.
- **Validation** - Every PR gets checked for proper structure and naming.
- **Sync** - marketplace.json stays current automatically.

## Why We Built This

| The old way | With these actions |
|-------------|-------------------|
| Edit JSON by hand | Auto-discovery on push |
| Inconsistent naming | Standards enforced |
| Stale marketplace files | Always in sync |
| "It worked on my machine" | Validated before merge |

We got tired of the manual work. You shouldn't have to deal with it either.

## Quick Start

Add this to your marketplace's workflow:

```yaml
jobs:
  update:
    uses: bitcomplete/bc-github-actions/.github/workflows/marketplace.yml@v1
    with:
      config-path: .claude-plugin/generator.config.toml
    secrets:
      token: ${{ secrets.GITHUB_TOKEN }}
```

Or use individual actions:

```yaml
- uses: bitcomplete/bc-github-actions/marketplace/discover@v1
- uses: bitcomplete/bc-github-actions/marketplace/validate@v1
- uses: bitcomplete/bc-github-actions/marketplace/generate@v1
```

See [docs/USAGE.md](docs/USAGE.md) for configuration options.

## Already Using a Bitcomplete Marketplace?

You're set. These workflows run automatically when you merge changes.
No action needed on your part—just keep shipping plugins.

## Documentation

- [Usage Guide](docs/USAGE.md) - Configuration and usage examples
- [Customization](docs/CUSTOMIZATION.md) - Advanced configuration options

## Versioning

We use semantic versioning with floating major tags:

- `@v1` - Floating major version (recommended for production)
- `@v1.0.0` - Pinned version for maximum stability
- `@main` - Latest development version

## License

MIT License - see [LICENSE](LICENSE) for details.
