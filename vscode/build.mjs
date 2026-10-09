import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
mkdirSync('dist', { recursive: true });
const copy = () => {
  copyFileSync('../style.css', 'dist/style.css');      // Styles der Werkbank-Webseite
  copyFileSync('webview/webview.css', 'dist/webview.css');
};
const common = { bundle: true, target: 'es2022', logLevel: 'warning' };
const builds = [
  { ...common, entryPoints: ['src/extension.js'], outfile: 'dist/extension.js', platform: 'node', format: 'cjs', external: ['vscode'] },
  { ...common, entryPoints: ['webview/main.js'], outfile: 'dist/webview.js', platform: 'browser', format: 'iife' },
  // für die Tests ohne VS Code
  { ...common, entryPoints: ['src/core.js'], outfile: 'dist/core.cjs', platform: 'node', format: 'cjs' },
];
copy();
if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
  console.log('beobachte Änderungen …');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log('gebaut: dist/');
}
