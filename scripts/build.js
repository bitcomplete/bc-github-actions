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
const outputPath = path.join(__dirname, 'dist/discover-components.cjs');
fs.chmodSync(outputPath, 0o755);

console.log('✓ Bundled discover-components.cjs');
