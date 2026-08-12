// Minimal static import scanner.
//
// Legacy has no relative imports and no bundler: every static import/export-from uses
// an absolute specifier rooted at the served directory (e.g. '/src/core/object.js').
// A regex over `import ... from '...'` and `export ... from '...'` is therefore enough
// to build the dependency graph — no need for a real ES module parser.
//
// Dynamic `import(someExpression)` calls (e.g. the plugin loader building a path at
// runtime) are intentionally not resolved here: their target is not statically known,
// so they cannot be classified as a layer violation or not.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const STATIC_IMPORT_RE = /\b(?:import|export)\b[^;'"]*\bfrom\s+['"]([^'"]+)['"]/g;

/**
 * Recursively list every .js file under a directory.
 * @param {string} dir - Absolute directory path
 * @returns {string[]} Absolute file paths
 */
function listJsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stats = statSync(full);
        if (stats.isDirectory()) out.push(...listJsFiles(full));
        else if (entry.endsWith('.js')) out.push(full);
    }
    return out;
}

/**
 * Extract every static import specifier from a file's source.
 * @param {string} source - File contents
 * @returns {string[]} Raw specifiers, as written in the source
 */
function extractSpecifiers(source) {
    const specifiers = [];
    for (const match of source.matchAll(STATIC_IMPORT_RE)) specifiers.push(match[1]);
    return specifiers;
}

/**
 * Build the list of {file, specifier} edges for every static import under a root.
 * @param {string} rootDir - Absolute path to the profile's root directory
 * @returns {Array<{file: string, specifier: string}>} `file` is root-relative, POSIX-style
 */
export function scanImports(rootDir) {
    const edges = [];
    for (const absolutePath of listJsFiles(rootDir)) {
        const file = relative(rootDir, absolutePath).split('\\').join('/');
        const source = readFileSync(absolutePath, 'utf8');
        for (const specifier of extractSpecifiers(source)) {
            edges.push({ file, specifier });
        }
    }
    return edges;
}
