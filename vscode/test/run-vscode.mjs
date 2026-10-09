// Startet eine isolierte VS-Code-Instanz mit der Erweiterung und führt test/vscode/suite.cjs darin aus.
import { runTests } from '@vscode/test-electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const workspace = mkdtempSync(join(tmpdir(), 'algo-test-'));
writeFileSync(join(workspace, 'ggt.algo'), 'DEKLARIERE a, b\nLIES a EIN\nLIES b EIN\nSOLANGE a ≠ b:\n  WENN a > b:\n    SETZE a AUF a - b\n  SONST:\n    SETZE b AUF b - a\n  ENDE WENN\nENDE SOLANGE\nGIB a AUS\n');
writeFileSync(join(workspace, 'fehler.algo'), 'DEKLARIERE a\nWENN a >= 1\n  GIB a AUS\nENDE WENN\n');

await runTests({
  extensionDevelopmentPath: resolve('.'),
  extensionTestsPath: resolve('test/vscode/suite.cjs'),
  launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
});
