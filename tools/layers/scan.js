// Minimal static import scanner.
//
// A regex over `import ... from '...'` and `export ... from '...'` is enough to build
// the dependency graph: neither tree has a bundler, and both use plain ES modules.
//
// Two specifier styles have to be understood:
//   - legacy/ is served from its own root, so its modules import '/src/core/object.js';
//   - src/ uses ordinary relative paths, './events.js' or '../core/mod.js'.
// Both are resolved to a path relative to the profile root, which is what layer rules
// are expressed against.
//
// Dynamic `import(someExpression)` is intentionally not resolved: its target is not
// statically known, so it cannot be classified as a violation or not.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve as resolvePath, posix } from 'node:path';

const STATIC_IMPORT_RE = /\b(?:import|export)\b[^;'"]*\bfrom\s+['"]([^'"]+)['"]/g;

/**
 * Recursively list every .js and .mjs file under a directory.
 * @param {string} dir - Absolute directory path
 * @returns {string[]} Absolute file paths
 */
function listJsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stats = statSync(full);
        if (stats.isDirectory()) out.push(...listJsFiles(full));
        else if (entry.endsWith('.js') || entry.endsWith('.mjs')) out.push(full);
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
 * Resolve a specifier to a path relative to the profile root.
 * @param {string} specifier - The specifier as written
 * @param {string} fromFile - Root-relative path of the importing file
 * @returns {string|null} The root-relative target path, or null for a bare specifier
 */
export function resolveSpecifier(specifier, fromFile) {
    if (specifier.startsWith('/')) return specifier.slice(1);

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
        // A relative path climbing above the root leaves the profile's scope.
        return resolved.startsWith('..') ? null : resolved;
    }

    // Bare specifiers are packages or node builtins, outside any layer.
    return null;
}

/**
 * Build the list of import edges under a root.
 * @param {string} rootDir - Absolute path to the profile's root directory
 * @returns {Array<{file: string, specifier: string, target: string|null}>} The edges
 */
export function scanImports(rootDir) {
    const edges = [];

    for (const absolutePath of listJsFiles(rootDir)) {
        const file = toPosix(relative(rootDir, absolutePath));
        const source = readFileSync(absolutePath, 'utf8');

        for (const specifier of extractSpecifiers(source)) {
            edges.push({ file, specifier, target: resolveSpecifier(specifier, file) });
        }
    }

    return edges;
}

/**
 * Resolve a profile root against the repository.
 * @param {string} repoRoot - Absolute repository path
 * @param {string} root - Profile root, relative to the repository
 * @returns {string} The absolute directory path
 */
export function profileRoot(repoRoot, root) {
    return resolvePath(repoRoot, root);
}

function toPosix(path) {
    return path.split('\\').join('/');
}

export { dirname };
