import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['apps', 'packages', 'preview-worker', 'refine-worker', 'tests', 'upscale-worker'];
const findings = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(target);
      continue;
    }

    if (!target.endsWith('.js')) {
      continue;
    }

    const source = await readFile(target, 'utf8');
    if (source.includes('TODO')) {
      findings.push(`${target} still contains TODO markers`);
    }
    if (source.includes('console.log(')) {
      findings.push(`${target} contains console.log debug output`);
    }
  }
}

for (const root of roots) {
  try {
    const rootStat = await stat(root);
    if (rootStat.isDirectory()) {
      await scan(root);
    }
  } catch {
    // ignore missing roots in scaffold static analysis.
  }
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log('static-analysis: ok');
}
