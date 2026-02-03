#!/usr/bin/env node


// scripts/src/opencode-release.js
var fs = require("fs");
var path = require("path");
var { execSync } = require("child_process");
function getLatestTag(pluginName = null) {
  try {
    const pattern = pluginName ? `${pluginName}-v*` : "*";
    const tags = execSync(`git tag -l '${pattern}' --sort=-version:refname`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    return tags[0] || null;
  } catch (err) {
    return null;
  }
}
function getChangedFiles(since, pathFilter = "") {
  try {
    const cmd = pathFilter ? `git diff --name-only ${since}...HEAD -- ${pathFilter}` : `git diff --name-only ${since}...HEAD`;
    const output = execSync(cmd, { encoding: "utf8" }).trim();
    return output ? output.split("\n") : [];
  } catch (err) {
    console.error(`Error getting changed files: ${err.message}`);
    return [];
  }
}
function parseConventionalCommits(since, pathFilter = "") {
  try {
    const cmd = pathFilter ? `git log ${since}...HEAD --pretty=format:"%s" -- ${pathFilter}` : `git log ${since}...HEAD --pretty=format:"%s"`;
    const output = execSync(cmd, { encoding: "utf8" }).trim();
    const commits = output ? output.split("\n") : [];
    const categories = {
      features: [],
      fixes: [],
      other: []
    };
    commits.forEach((commit) => {
      if (commit.startsWith("feat:") || commit.startsWith("feat(")) {
        categories.features.push(commit.replace(/^feat(\([^)]+\))?:\s*/, ""));
      } else if (commit.startsWith("fix:") || commit.startsWith("fix(")) {
        categories.fixes.push(commit.replace(/^fix(\([^)]+\))?:\s*/, ""));
      } else if (!commit.startsWith("chore:") && !commit.startsWith("chore(")) {
        categories.other.push(commit.replace(/^[a-z]+(\([^)]+\))?:\s*/, ""));
      }
    });
    return categories;
  } catch (err) {
    console.error(`Error parsing commits: ${err.message}`);
    return { features: [], fixes: [], other: [] };
  }
}
function generateChangelog(pluginName, version, commits) {
  const lines = [
    `# Changelog - ${pluginName} v${version}`,
    ""
  ];
  if (commits.features.length > 0) {
    lines.push("## Features");
    commits.features.forEach((feat) => lines.push(`- ${feat}`));
    lines.push("");
  }
  if (commits.fixes.length > 0) {
    lines.push("## Bug Fixes");
    commits.fixes.forEach((fix) => lines.push(`- ${fix}`));
    lines.push("");
  }
  if (commits.other.length > 0) {
    lines.push("## Other Changes");
    commits.other.forEach((change) => lines.push(`- ${change}`));
    lines.push("");
  }
  return lines.join("\n");
}
function generateInstallGuide(pluginName, version) {
  return `# Installation - ${pluginName} v${version}

## Quick Install

\`\`\`bash
# Download and extract to OpenCode plugins directory
curl -L https://github.com/bitcomplete/bc-llm-skills/releases/download/${pluginName}-v${version}/${pluginName}.zip -o ${pluginName}.zip
unzip ${pluginName}.zip -d ~/.config/opencode/plugins/
rm ${pluginName}.zip
\`\`\`

## Manual Install

1. Download \`${pluginName}.zip\` from this release
2. Extract to \`~/.config/opencode/plugins/${pluginName}/\`
3. Restart OpenCode

## Verify Installation

After restarting OpenCode, the plugin commands should appear in autocomplete.

## Platform Notes

**Linux/macOS**: Default location is \`~/.config/opencode/plugins/\`

**Windows**: Use \`%USERPROFILE%\\.config\\opencode\\plugins\\\`

## Compatibility

This plugin works with both OpenCode and Claude Code. Paths are auto-detected at runtime.
`;
}
function createPluginZip(pluginPath, outputPath, changelog, installGuide) {
  try {
    const tempDir = path.join(process.cwd(), ".tmp-release");
    const pluginName = path.basename(pluginPath);
    const stagingDir = path.join(tempDir, pluginName);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(stagingDir, { recursive: true });
    execSync(`cp -R "${pluginPath}"/* "${stagingDir}/"`, { stdio: "inherit" });
    fs.writeFileSync(path.join(stagingDir, "CHANGELOG.md"), changelog);
    fs.writeFileSync(path.join(stagingDir, "INSTALL.md"), installGuide);
    const zipFile = path.basename(outputPath);
    execSync(`cd "${tempDir}" && zip -r "${zipFile}" "${pluginName}"`, { stdio: "inherit" });
    execSync(`mv "${tempDir}/${zipFile}" "${outputPath}"`, { stdio: "inherit" });
    fs.rmSync(tempDir, { recursive: true });
    console.log(`\u2713 Created ${outputPath}`);
  } catch (err) {
    console.error(`Error creating zip: ${err.message}`);
    throw err;
  }
}
function createGitHubRelease(pluginName, version, zipPath, changelog) {
  try {
    const tag = `${pluginName}-v${version}`;
    const title = `${pluginName} v${version}`;
    const notes = `OpenCode-compatible release of ${pluginName}.

${changelog}

## Installation

Download \`${pluginName}.zip\` and extract to \`~/.config/opencode/plugins/\`

See INSTALL.md in the zip for detailed instructions.
`;
    const notesFile = path.join(process.cwd(), `.tmp-notes-${pluginName}.md`);
    fs.writeFileSync(notesFile, notes);
    execSync(
      `gh release create "${tag}" "${zipPath}" --title "${title}" --notes-file "${notesFile}"`,
      { stdio: "inherit" }
    );
    fs.unlinkSync(notesFile);
    console.log(`\u2713 Created release: ${tag}`);
  } catch (err) {
    console.error(`Error creating GitHub release: ${err.message}`);
    throw err;
  }
}
function detectChangedPlugins(marketplacePath) {
  if (!fs.existsSync(marketplacePath)) {
    console.error(`Marketplace file not found: ${marketplacePath}`);
    return [];
  }
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  const changedPlugins = [];
  for (const plugin of marketplace.plugins) {
    const pluginName = plugin.name;
    const pluginPath = plugin.source.replace(/^\.\//, "");
    const lastTag = getLatestTag(pluginName) || getLatestTag();
    if (!lastTag) {
      console.log(`No previous releases found for ${pluginName}, skipping`);
      continue;
    }
    const changedFiles = getChangedFiles(lastTag, pluginPath);
    if (changedFiles.length > 0) {
      console.log(`\u2713 Changes detected in ${pluginName} (${changedFiles.length} files)`);
      changedPlugins.push({
        name: pluginName,
        path: pluginPath,
        lastTag,
        changedFiles
      });
    }
  }
  return changedPlugins;
}
function main() {
  const command = process.argv[2];
  if (command !== "opencode-release") {
    console.log("Usage: node opencode-release.js opencode-release");
    process.exit(1);
  }
  const marketplacePath = path.join(".claude-plugin", "marketplace.json");
  const releasesDir = path.join(process.cwd(), ".releases");
  const version = process.env.RELEASE_VERSION || (/* @__PURE__ */ new Date()).toISOString().split("T")[0].replace(/-/g, ".");
  console.log("Detecting changed plugins...");
  const changedPlugins = detectChangedPlugins(marketplacePath);
  if (changedPlugins.length === 0) {
    console.log("No plugins with changes detected");
    process.exit(0);
  }
  if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir, { recursive: true });
  }
  let releasesCreated = 0;
  for (const plugin of changedPlugins) {
    console.log(`
Creating release for ${plugin.name}...`);
    const commits = parseConventionalCommits(plugin.lastTag, plugin.path);
    const changelog = generateChangelog(plugin.name, version, commits);
    const installGuide = generateInstallGuide(plugin.name, version);
    const zipPath = path.join(releasesDir, `${plugin.name}.zip`);
    createPluginZip(plugin.path, zipPath, changelog, installGuide);
    createGitHubRelease(plugin.name, version, zipPath, changelog);
    releasesCreated++;
  }
  console.log(`
\u2713 Created ${releasesCreated} OpenCode release(s)`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `count=${releasesCreated}
`);
  }
}
if (require.main === module) {
  main();
}
module.exports = {
  getLatestTag,
  getChangedFiles,
  parseConventionalCommits,
  generateChangelog,
  generateInstallGuide,
  createPluginZip,
  createGitHubRelease,
  detectChangedPlugins
};
