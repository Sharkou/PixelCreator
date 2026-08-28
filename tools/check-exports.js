// Does every named import actually name something the target module exports?
//
// THE FAILURE THIS CATCHES IS A BOOT FAILURE, AND IT IS INVISIBLE TO `node --test`. A test
// file imports what it needs and passes; the Editor imports a symbol nobody exports and the
// browser refuses the whole module graph:
//
//   SyntaxError: The requested module '../../core/mod.js'
//                does not provide an export named 'KEY_REFERENCE'
//
// Nothing in the suite fails, because no test imported that symbol from that module. The
// app simply does not start — and the error names a file that is correct, which is what
// makes it expensive to read.
//
// STATIC, LIKE `tools/layers`, AND FOR THE SAME REASON: half of `src/editor/` defines custom
// elements and cannot be imported without a DOM, so the check has to read the source rather
// than load it. It resolves a chain of re-exports (`export { x } from './y.js'`), because
// `core/mod.js` is one long chain and that is exactly where the mistake gets made.
//
// WHAT IT DELIBERATELY DOES NOT DO. `export *` is followed but not enumerated — a star
// re-exports whatever the target has, so a name that resolves through one is reported as
// unknown rather than missing, and unknown is not a failure. Dynamic `import()` is not
// resolved, for the reason `scan.js` gives: its target is not statically known.
//
// Usage: node tools/check-exports.js [dir ...]
//   default: src/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, dirname, resolve as resolvePath } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** `import { a, b as c } from './x.js'` — the braces, and where they came from. */
const NAMED_IMPORT_RE = /\bimport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
/** `export { a, b as c } from './x.js'` — a re-export, which is an import too. */
const NAMED_REEXPORT_RE = /\bexport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
/** `export * from './x.js'` — followed, never enumerated. */
const STAR_REEXPORT_RE = /\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/g;

/** `export const x`, `export function x`, `export class x`, `export let/var x`. */
const DECLARED_RE = /\bexport\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g;
/** `export { a, b as c }` with no `from`. */
const LOCAL_EXPORT_RE = /\bexport\s*\{([^}]*)\}\s*(?!from)(?:;|\n)/g;

/**
 * Every .js file under a directory.
 * @param {string} directory - Where to look
 * @returns {string[]} Absolute paths
 */
function walk(directory) {
    const found = [];
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) found.push(...walk(path));
        else if (entry.endsWith('.js')) found.push(path);
    }
    return found;
}

/**
 * The names inside a `{ … }` clause, as they are seen from the OUTSIDE.
 *
 * `a as b` imports `a` and binds `b`, so what the target must export is `a`; re-exported,
 * `a as b` publishes `b`. Which side matters is the caller's business, so both are returned.
 *
 * @param {string} clause - The text between the braces
 * @returns {Array<{source: string, exposed: string}>} The pairs
 */
function names(clause) {
    return clause
        .split(',')
        .map(part => part.replace(/\/\/.*$/gm, '').trim())
        .filter(Boolean)
        .map(part => {
            const [source, exposed] = part.split(/\s+as\s+/).map(word => word.trim());
            return { source, exposed: exposed ?? source };
        })
        .filter(pair => pair.source && pair.source !== 'type');
}

/**
 * Resolve a specifier to a file this repository holds, or null.
 * @param {string} specifier - As written
 * @param {string} fromFile - The importing file, absolute
 * @returns {string|null} An absolute path
 */
function resolve(specifier, fromFile) {
    if (!specifier.startsWith('.')) return null;
    return resolvePath(dirname(fromFile), specifier);
}

/** What a file exports, and what it re-exports from where. */
function readModule(path) {
    let source;
    try {
        source = readFileSync(path, 'utf8');
    } catch {
        return null;
    }

    const own = new Set();
    for (const [, name] of source.matchAll(DECLARED_RE)) own.add(name);
    if (/\bexport\s+default\b/.test(source)) own.add('default');
    for (const [, clause] of source.matchAll(LOCAL_EXPORT_RE)) {
        for (const pair of names(clause)) own.add(pair.exposed);
    }

    const forwarded = [];
    for (const [, clause, specifier] of source.matchAll(NAMED_REEXPORT_RE)) {
        const target = resolve(specifier, path);
        for (const pair of names(clause)) forwarded.push({ ...pair, target });
    }

    const stars = [];
    for (const [, specifier] of source.matchAll(STAR_REEXPORT_RE)) stars.push(resolve(specifier, path));

    return { own, forwarded, stars };
}

/**
 * Whether a module exposes a name, following re-export chains.
 *
 * Answers `unknown` rather than `false` where a `export *` could be providing it: a star is
 * followed but not enumerated, and reporting a name it might supply would be a false alarm.
 *
 * @param {string} path - The module, absolute
 * @param {string} name - The name asked for
 * @param {Map} cache - Parsed modules
 * @param {Set} [seen] - Cycle guard
 * @returns {'yes'|'no'|'unknown'} The verdict
 */
function exposes(path, name, cache, seen = new Set()) {
    if (seen.has(path)) return 'no';
    seen.add(path);

    if (!cache.has(path)) cache.set(path, readModule(path));
    const module = cache.get(path);
    if (!module) return 'unknown';

    if (module.own.has(name)) return 'yes';

    for (const entry of module.forwarded) {
        if (entry.exposed !== name) continue;
        if (!entry.target) return 'unknown';
        return exposes(entry.target, entry.source, cache, seen);
    }

    if (module.stars.length > 0) return 'unknown';
    return 'no';
}

/**
 * Check every named import under the given directories.
 * @param {string[]} directories - Absolute paths
 * @returns {Array<{file: string, name: string, from: string}>} What is missing
 */
export function checkExports(directories) {
    const cache = new Map();
    const missing = [];

    for (const directory of directories) {
        for (const file of walk(directory)) {
            const source = readFileSync(file, 'utf8');
            const clauses = [
                ...source.matchAll(NAMED_IMPORT_RE),
                ...source.matchAll(NAMED_REEXPORT_RE)
            ];

            for (const [, clause, specifier] of clauses) {
                const target = resolve(specifier, file);
                if (!target) continue;

                for (const pair of names(clause)) {
                    if (exposes(target, pair.source, cache) !== 'no') continue;
                    missing.push({
                        file: relative(ROOT, file),
                        name: pair.source,
                        from: relative(ROOT, target)
                    });
                }
            }
        }
    }

    return missing;
}

// `fileURLToPath`, not a string compare: a checkout under a directory with a space in its
// name gives an `import.meta.url` with %20 in it, which never equals `process.argv[1]`.
// `check-css-literals.js` records the same trap, one line up from here.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
    const directories = process.argv.length > 2
        ? process.argv.slice(2).map(path => resolvePath(process.cwd(), path))
        : [join(ROOT, 'src')];

    const missing = checkExports(directories);
    for (const entry of missing) {
        console.error(`${entry.file}  imports "${entry.name}" from ${entry.from}, which does not export it`);
    }

    console.error(missing.length === 0
        ? 'every named import resolves to an export'
        : `\n  ${missing.length} import(s) name something that is not exported.`);
    process.exit(missing.length === 0 ? 0 : 1);
}
