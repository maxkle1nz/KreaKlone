import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOTS = ['app', 'apps', 'benchmarks', 'packages', 'preview-worker', 'redis', 'refine-worker', 'scripts', 'tests', 'upscale-worker'];
const ALLOWED_EXTENSIONS = new Set(['.js', '.md', '.css', '.html', '.json', '.yml', '.yaml', '.conf']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.git']);
const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
      await walk(location);
      continue;
    }

    if (!ALLOWED_EXTENSIONS.has(extname(location)) && !location.endsWith('Dockerfile')) {
      continue;
    }

    const content = await readFile(location, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (/\s+$/.test(line)) {
        violations.push(`${location}:${index + 1} has trailing whitespace`);
      }
      if (line.includes('\t')) {
        violations.push(`${location}:${index + 1} uses a tab character`);
      }
    });
  }
}

for (const root of ROOTS) {
  try {
    const rootStat = await stat(root);
    if (rootStat.isDirectory()) {
      await walk(root);
    }
  } catch {
    // ignore missing roots in scaffold lint.
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('lint: ok');
}
