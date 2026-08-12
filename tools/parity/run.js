#!/usr/bin/env node
//
// Behavioural parity harness — single entry point.
//
//   node tools/parity/run.js              run the scenarios against Legacy
//   node tools/parity/run.js --update     record the result as the reference
//   node tools/parity/run.js --target=v2  (once the v2 Core exists)
//   node tools/parity/run.js --json       raw output, for CI
//
// legacy/ is never modified: the harness imports it through an ESM resolution hook.

import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolve } from './env/resolver.mjs';

registerHooks({ resolve });

const here = dirname(fileURLToPath(import.meta.url));
const baselineDir = resolvePath(here, 'baseline');

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const targetName = option('target', 'legacy');
const shouldUpdate = flag('update');
const asJson = flag('json');

const { runAll } = await import('./core/runner.js');
const { compare } = await import('./core/compare.js');
const { report } = await import('./core/report.js');
const { scenarios } = await import('./scenarios/index.js');

let adapter;
try {
    adapter = await import(`./adapters/${targetName}.js`);
} catch (error) {
    console.error(`\n  Unknown target: "${targetName}"\n  ${error.message}\n`);
    process.exit(2);
}

let results, applicable;
try {
    ({ results, applicable } = await runAll(scenarios, adapter));
} catch (error) {
    console.error(`\n  Target "${targetName}" is unusable:\n\n  ${error.message}\n`);
    process.exit(2);
}

const baselinePath = resolvePath(baselineDir, 'legacy.json');

if (shouldUpdate) {
    if (targetName !== 'legacy') {
        console.error('\n  --update is only valid for the legacy target.\n');
        process.exit(2);
    }
    mkdirSync(baselineDir, { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(results, null, 2) + '\n', 'utf8');
    console.log(`\n  Reference recorded: ${Object.keys(results).length} scenario(s)`);
    console.log(`  ${baselinePath}\n`);
    process.exit(0);
}

const reference = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, 'utf8'))
    : null;

if (asJson) {
    console.log(JSON.stringify({ target: targetName, results }, null, 2));
    process.exit(0);
}

const verdicts = compare(results, reference, applicable);
const code = report(verdicts, {
    target: targetName,
    reference: reference ? 'baseline/legacy.json' : 'none (first run)'
});

process.exit(code);
