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
// THREE WAYS A MODULE GRAPH REFUSES TO LINK, AND ALL THREE ARE CHECKED HERE. They are one
// failure to a reader — the app does not start — so they are one tool:
//
//   missing-export    a name is imported (or re-exported) that the target does not export
//   missing-module    a relative specifier names a file this repository does not hold
//   duplicate-export  one module publishes the same name twice
//
// The first is the original rule. The second was silently PASSING: an unreadable target made
// `exposes()` answer `unknown`, and unknown is not a failure — so a re-export pointing at a
// deleted or misspelt file was accepted by the very tool written to catch unloadable
// barrels. The third is the other SyntaxError a long barrel earns, and `core/mod.js` is
// ninety lines of `export … from`, which is exactly where two lines come to claim one name.
//
// IT READS CODE, NOT TEXT. Comments, strings, template literals and regex literals are
// blanked before anything is matched. Without that the tool reported ITSELF: the regexes
// documented in the comments above contain `from './x.js'`, and a scanner that cannot tell
// an example from a statement makes its own documentation a failure.
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

/** What must sit just before a string for it to be a module specifier rather than data. */
const SPECIFIER_POSITION = /\b(?:from|import)\s*\(?\s*$/;

/**
 * The source with everything that is not code blanked out.
 *
 * A REGEX SCANNER CANNOT TELL AN EXAMPLE FROM A STATEMENT, and this file is the proof: the
 * patterns below are documented in comments that contain `from './x.js'`, so a scan of the
 * raw text finds imports this module does not have and targets that do not exist. Blanking
 * first is what lets every rule after this one be a plain regex.
 *
 * NEWLINES SURVIVE, so a line number taken from the result still points at the real line.
 *
 * A SLASH IS A REGEX OR A DIVISION DEPENDING ON WHAT CAME BEFORE IT, which is the one piece
 * of real lexing here. The preceding non-space character decides: after a value (`)`, `]`,
 * an identifier, a digit) a slash divides; after an operator, a comma, a brace or the start
 * of the file, it opens a literal. Getting this wrong on `/['"]/` would swallow the rest of
 * the file as a string, so it is worth the eight lines.
 *
 * @param {string} source - The file, as written
 * @returns {string} The same length, with comments and literals replaced by spaces
 */
export function stripNonCode(source) {
    const out = [...source];
    const blank = (from, to) => {
        for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
    };

    let i = 0;
    let previous = '';

    while (i < source.length) {
        const character = source[i];
        const next = source[i + 1];

        if (character === '/' && next === '/') {
            const end = source.indexOf('\n', i);
            blank(i, end === -1 ? source.length : end);
            i = end === -1 ? source.length : end;
            continue;
        }

        if (character === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            const stop = end === -1 ? source.length : end + 2;
            blank(i, stop);
            i = stop;
            continue;
        }

        if (character === '\'' || character === '"' || character === '`') {
            let j = i + 1;
            while (j < source.length) {
                if (source[j] === '\\') { j += 2; continue; }
                if (source[j] === character) break;
                j++;
            }
            // A SPECIFIER IS A STRING, so blanking every string blanks the one thing the
            // rules below have to read. What is kept is the string in SPECIFIER POSITION —
            // the one a `from` or an `import(` introduces — and every other string is
            // blanked, so `const s = "from './x.js'"` stops being an import.
            if (!SPECIFIER_POSITION.test(source.slice(0, i))) blank(i + 1, j);
            i = j + 1;
            previous = character;
            continue;
        }

        // A REGEX LITERAL, decided by what precedes it — see the note above.
        if (character === '/' && !/[\w$)\]]/.test(previous)) {
            let j = i + 1;
            let inClass = false;
            while (j < source.length && source[j] !== '\n') {
                if (source[j] === '\\') { j += 2; continue; }
                if (source[j] === '[') inClass = true;
                else if (source[j] === ']') inClass = false;
                else if (source[j] === '/' && !inClass) break;
                j++;
            }
            blank(i + 1, j);
            i = j + 1;
            previous = '/';
            continue;
        }

        if (!/\s/.test(character)) previous = character;
        i++;
    }

    return out.join('');
}

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

/** What a file exports, what it re-exports from where, and any name it publishes twice. */
function readModule(path) {
    let source;
    try {
        source = stripNonCode(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }

    // EVERY NAME THIS MODULE PUBLISHES, WITH REPEATS — a Set would answer the first rule and
    // silently swallow the third. `own` is derived from the list rather than built beside it,
    // so the two can never disagree about what this module exports.
    const published = [];
    for (const [, name] of source.matchAll(DECLARED_RE)) published.push(name);
    if (/\bexport\s+default\b/.test(source)) published.push('default');
    for (const [, clause] of source.matchAll(LOCAL_EXPORT_RE)) {
        for (const pair of names(clause)) published.push(pair.exposed);
    }

    const forwarded = [];
    for (const [, clause, specifier] of source.matchAll(NAMED_REEXPORT_RE)) {
        const target = resolve(specifier, path);
        for (const pair of names(clause)) {
            forwarded.push({ ...pair, target });
            published.push(pair.exposed);
        }
    }

    const stars = [];
    for (const [, specifier] of source.matchAll(STAR_REEXPORT_RE)) stars.push(resolve(specifier, path));

    const seen = new Set();
    const duplicates = new Set();
    for (const name of published) {
        if (seen.has(name)) duplicates.add(name);
        seen.add(name);
    }

    return { own: seen, forwarded, stars, duplicates };
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
    const found = [];

    for (const directory of directories) {
        for (const file of walk(directory)) {
            const source = stripNonCode(readFileSync(file, 'utf8'));
            const clauses = [
                ...source.matchAll(NAMED_IMPORT_RE),
                ...source.matchAll(NAMED_REEXPORT_RE)
            ];

            for (const name of readModule(file)?.duplicates ?? []) {
                found.push({ reason: 'duplicate-export', file: relative(ROOT, file), name, from: null });
            }

            for (const [, clause, specifier] of clauses) {
                const target = resolve(specifier, file);
                if (!target) continue;

                // A TARGET NOBODY CAN READ USED TO PASS. `exposes()` answers `unknown` for a
                // file it cannot open, and unknown is not a failure — so a specifier naming a
                // file that was deleted, moved or misspelt was accepted by the tool written
                // to catch exactly that. It is reported once, not once per name.
                if (!cache.has(target)) cache.set(target, readModule(target));
                if (!cache.get(target)) {
                    found.push({
                        reason: 'missing-module',
                        file: relative(ROOT, file),
                        name: specifier,
                        from: relative(ROOT, target)
                    });
                    continue;
                }

                for (const pair of names(clause)) {
                    if (exposes(target, pair.source, cache) !== 'no') continue;
                    found.push({
                        reason: 'missing-export',
                        file: relative(ROOT, file),
                        name: pair.source,
                        from: relative(ROOT, target)
                    });
                }
            }
        }
    }

    return found;
}

// `fileURLToPath`, not a string compare: a checkout under a directory with a space in its
// name gives an `import.meta.url` with %20 in it, which never equals `process.argv[1]`.
// `check-css-literals.js` records the same trap, one line up from here.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
    const directories = process.argv.length > 2
        ? process.argv.slice(2).map(path => resolvePath(process.cwd(), path))
        : [join(ROOT, 'src')];

    const found = checkExports(directories);
    const SAID = {
        'missing-export': entry =>
            `${entry.file}  imports "${entry.name}" from ${entry.from}, which does not export it`,
        'missing-module': entry =>
            `${entry.file}  imports from "${entry.name}", which is not a file this repository holds`,
        'duplicate-export': entry =>
            `${entry.file}  exports "${entry.name}" twice, which no module graph will link`
    };

    for (const entry of found) console.error(SAID[entry.reason](entry));

    console.error(found.length === 0
        ? 'every named import resolves to an export'
        : `\n  ${found.length} import(s) or export(s) will not link.`);
    process.exit(found.length === 0 ? 0 : 1);
}
