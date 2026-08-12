#!/usr/bin/env node
//
// Layer-dependency check — single entry point.
//
//   node tools/layers/run.js
//
// Scans every profile in rules.js, classifies each static import by source/target
// layer, and fails (exit 1) if a forbidden edge is found that is not an explicitly
// documented known violation. Known violations are still printed on every run so they
// stay visible — this is not a way to silence them, only to avoid re-flagging an
// already-tracked, already-explained issue as a fresh regression.
//
// legacy/ is never modified: this is a read-only static scan.

import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profiles } from './rules.js';
import { scanImports } from './scan.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '..', '..');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const green = s => c('32', s);
const yellow = s => c('33', s);
const red = s => c('31', s);
const dim = s => c('2', s);
const bold = s => c('1', s);

function layerOf(layers, specifier) {
    return layers.find(l => l.test(specifier))?.name ?? null;
}

function isForbidden(forbidden, from, to) {
    return forbidden.some(edge => edge.from === from && edge.to === to);
}

function findKnownViolation(knownViolations, file, specifier) {
    return knownViolations.find(v => v.file === file && v.specifier === specifier) ?? null;
}

let hadFailure = false;

console.log('');
console.log(bold('  Layer dependency check'));
console.log('');

for (const profile of profiles) {
    const rootDir = resolvePath(repoRoot, profile.root);
    const edges = scanImports(rootDir);

    const newViolations = [];
    const trackedViolations = [];
    const matchedKnownViolations = new Set();

    for (const { file, specifier } of edges) {
        const fromLayer = layerOf(profile.layers, '/' + file);
        const toLayer = layerOf(profile.layers, specifier);

        if (!fromLayer || !toLayer || fromLayer === toLayer) continue;
        if (!isForbidden(profile.forbidden, fromLayer, toLayer)) continue;

        const known = findKnownViolation(profile.knownViolations, file, specifier);
        if (known) {
            matchedKnownViolations.add(known);
            trackedViolations.push({ file, specifier, fromLayer, toLayer, known });
        } else {
            newViolations.push({ file, specifier, fromLayer, toLayer });
        }
    }

    const staleKnownViolations = profile.knownViolations.filter(v => !matchedKnownViolations.has(v));

    console.log(dim(`  profile "${profile.name}" (${profile.root}/) — ${edges.length} static import(s) scanned`));
    console.log('');

    if (trackedViolations.length) {
        console.log(yellow('  ~ Tracked violation (documented, does not fail the check)'));
        for (const v of trackedViolations) {
            console.log(`    ${v.file} -> ${v.specifier}  [${v.fromLayer} -> ${v.toLayer}]`);
            console.log(dim(`      ${v.known.reason}`));
            console.log(dim(`      ref: ${v.known.ref}`));
        }
        console.log('');
    }

    if (newViolations.length) {
        hadFailure = true;
        console.log(red('  ✗ UNEXPECTED violation'));
        for (const v of newViolations) {
            console.log(`    ${v.file} -> ${v.specifier}  [${v.fromLayer} -> ${v.toLayer}]`);
        }
        console.log(dim('    Not declared in rules.js. Either fix the import, or add it to'));
        console.log(dim('    `knownViolations` in tools/layers/rules.js with a documented reason.'));
        console.log('');
    }

    if (staleKnownViolations.length) {
        console.log(green('  i Resolved: a declared known violation was not found in the source'));
        for (const v of staleKnownViolations) {
            console.log(`    ${v.file} -> ${v.specifier}  [${v.from} -> ${v.to}]`);
        }
        console.log(dim('    It can likely be removed from `knownViolations` in tools/layers/rules.js.'));
        console.log('');
    }

    if (!trackedViolations.length && !newViolations.length && !staleKnownViolations.length) {
        console.log(green('  ✓ No forbidden cross-layer import'));
        console.log('');
    }
}

console.log(hadFailure
    ? red('  FAILED — unexpected layer violation(s) found')
    : green('  PASSED'));
console.log('');

process.exit(hadFailure ? 1 : 0);
