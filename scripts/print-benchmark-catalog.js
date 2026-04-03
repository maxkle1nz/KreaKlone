import { createBenchmarkCatalog } from '../packages/benchmark/src/scenarios.js';

process.stdout.write(`${JSON.stringify(createBenchmarkCatalog(), null, 2)}\n`);
