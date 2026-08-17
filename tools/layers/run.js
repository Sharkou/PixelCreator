#!/usr/bin/env node
//
// Layer-dependency check — single entry point.
//
//   node tools/layers/run.js
//
// Scans every profile in rules.js and fails (exit 1) on a forbidden import that is not
// an explicitly documented known violation. Known violations are printed on every run
// so they stay visible: the list is a way to track an understood problem, not a way to
// silence it.
//
// legacy/ is never modified: this is a read-only static scan.

import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profiles } from './rules.js';
import { scanImports, profileRoot } from './scan.js';
import { classifyDangling, evaluateProfile } from './check.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '..', '..');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const green = s => c('32', s);
const yellow = s => c('33', s);
const red = s => c('31', s);
const dim = s => c('2', s);
const bold = s => c('1', s);

let hadFailure = false;

console.log('');
console.log(bold('  Layer dependency check'));
console.log('');

for (const profile of profiles) {
    const root = profileRoot(repoRoot, profile.root);

    if (!existsSync(root)) {
        console.log(dim(`  profile "${profile.name}" — ${profile.root}/ does not exist yet, skipped`));
        console.log('');
        continue;
    }

    const edges = scanImports(root);
    const { tracked, unexpected, stale, scanned } = evaluateProfile(profile, edges);
    const dangling = classifyDangling(profile, edges, target => existsSync(resolvePath(root, target)));

    console.log(dim(`  profile "${profile.name}" (${profile.root}/) — ${scanned} static import(s) scanned`));
    console.log('');

    if (dangling.tracked.length) {
        console.log(yellow('  ~ Tracked missing import (documented, does not fail the check)'));
        for (const { file, specifier, known } of dangling.tracked) {
            console.log(`    ${file} -> ${specifier}`);
            console.log(dim(`      ${known.reason}`));
            console.log(dim(`      ref: ${known.ref}`));
        }
        console.log('');
    }

    if (dangling.unexpected.length) {
        hadFailure = true;
        console.log(red('  ✗ Import of a file that does not exist'));
        for (const { file, specifier } of dangling.unexpected) {
            console.log(`    ${file} -> ${specifier}`);
        }
        console.log(dim('    The module cannot be loaded. Fix the specifier, or remove the import.'));
        console.log('');
    }

    if (tracked.length) {
        console.log(yellow('  ~ Tracked violation (documented, does not fail the check)'));
        for (const violation of tracked) {
            console.log(`    ${violation.file} -> ${violation.specifier}  [${violation.from} -> ${violation.to}]`);
            console.log(dim(`      ${violation.known.reason}`));
            console.log(dim(`      ref: ${violation.known.ref}`));
        }
        console.log('');
    }

    if (unexpected.length) {
        hadFailure = true;
        console.log(red('  ✗ UNEXPECTED violation'));
        for (const violation of unexpected) {
            console.log(`    ${violation.file} -> ${violation.specifier}  [${violation.from} -> ${violation.to}]`);
        }
        console.log(dim('    Not declared in rules.js. Either fix the import, or add it to'));
        console.log(dim('    `knownViolations` in tools/layers/rules.js with a documented reason.'));
        console.log('');
    }

    if (stale.length) {
        console.log(green('  i Resolved: a declared known violation was not found in the source'));
        for (const violation of stale) {
            console.log(`    ${violation.file} -> ${violation.specifier}  [${violation.from} -> ${violation.to}]`);
        }
        console.log(dim('    It can likely be removed from `knownViolations` in tools/layers/rules.js.'));
        console.log('');
    }

    if (!tracked.length && !unexpected.length && !stale.length
        && !dangling.tracked.length && !dangling.unexpected.length) {
        console.log(green('  ✓ No forbidden cross-layer import'));
        console.log('');
    }
}

console.log(hadFailure
    ? red('  FAILED — unexpected layer violation(s) found')
    : green('  PASSED'));
console.log('');

process.exit(hadFailure ? 1 : 0);
