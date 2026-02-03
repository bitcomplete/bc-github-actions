#!/usr/bin/env node
/**
 * Bundle discover-components.js with esbuild
 * Creates a single-file distribution with all dependencies included
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Bundle discover-components.js
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'src/discover-components.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(__dirname, 'dist/discover-components.cjs'),
  banner: {
    js: '#!/usr/bin/env node\n'
  },
  external: [], // Bundle all dependencies
  minify: false, // Keep readable for debugging
  sourcemap: false
});

// Make the output executable
const discoverPath = path.join(__dirname, 'dist/discover-components.cjs');
fs.chmodSync(discoverPath, 0o755);
console.log('✓ Bundled discover-components.cjs');

// Bundle opencode-release.js
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'src/opencode-release.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(__dirname, 'dist/opencode-release.cjs'),
  banner: {
    js: '#!/usr/bin/env node\n'
  },
  external: [], // Bundle all dependencies
  minify: false, // Keep readable for debugging
  sourcemap: false
});

// Make the output executable
const releasePath = path.join(__dirname, 'dist/opencode-release.cjs');
fs.chmodSync(releasePath, 0o755);
console.log('✓ Bundled opencode-release.cjs');
