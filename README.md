# Bitcomplete GitHub Actions

Reusable GitHub Actions workflows for Claude Code development. We use these workflows ourselves, and now you can too.

## Available Workflows

### Marketplace Automation

Plugin marketplaces shouldn't require babysitting. These workflows handle the boring stuff:

- **Auto-discovery** - Push a plugin, it gets registered. No manual JSON editing.
- **Validation** - Every PR gets checked for proper structure and naming.
- **Sync** - marketplace.json stays current automatically.

| The old way | With marketplace actions |
|-------------|--------------------------|
| Edit JSON by hand | Auto-discovery on push |
| Inconsistent naming | Standards enforced |
| Stale marketplace files | Always in sync |
| "It worked on my machine" | Validated before merge |

### More Coming Soon

We're actively developing additional workflows for Claude Code development:
- Shell script quality and validation
- Plugin structure validation
- Documentation generation
- Release automation
- Testing frameworks

Check back regularly for new additions, or watch this repository for updates.

## Quick Start

### Using Marketplace Automation

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
