// Can the app actually be loaded — every module the entry points reach, in order?
//
// THE GAP THIS CLOSES, AND IT COST TWO BOOTS TO FIND. `check-exports` proves that every
// named import resolves to an export, reading the files on disk. It cannot see the one thing
// that broke twice in a row: a module the browser could not FETCH. When `./builtins.js` does
// not arrive, the module it feeds provides nothing, and the browser reports the failure three
// modules downstream, at the consumer:
//
//   SyntaxError: The requested module '../runtime/mod.js'
//                does not provide an export named 'BUILT_IN'
//
// Remove that name and the next one on the same line fails, with the same message and a
// different symbol — which is the signature, and which is why patching the names one at a
// time never ends. The file is what is missing; the names are collateral.
//
// SO THIS WALKS THE GRAPH THE WAY A BROWSER DOES: from the entry HTML, through every static
// relative import, and it reports the FIRST module that cannot be loaded — by path, once.
//
// TWO MODES, AND THE SECOND IS THE ONE THAT MATTERS. On disk it catches a file that is
// missing from the checkout or was never added to a commit. Over HTTP (`--url`) it catches a
// file the SERVER will not hand over — a stale deployment, a wrong root, a cached 404 — which
// is the shape a browser actually meets and the one no disk check can see.
//
// Usage: node tools/check-boot.js [--url http://localhost:8080]

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, relative, resolve as resolvePath } from 'node:path';
import { stripNonCode } from './check-exports.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The pages a browser is pointed at. Everything else is reached from them. */
export const ENTRIES = ['src/editor/index.html', 'src/preview/index.html'];

/** `<script type="module">` — either a src, or a body full of imports. */
const SCRIPT_RE = /<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
const SRC_RE = /<script\b[^>]*type=["']module["'][^>]*\bsrc=["']([^"']+)["']/gi;
/** Every static specifier a module can name: `import … from`, `export … from`, bare import. */
const SPECIFIER_RE = /\b(?:import|export)\b[^;'"]*?from\s*['"]([^'"\n]+)['"]|\bimport\s*['"]([^'"\n]+)['"]/g;

/**
 * Every relative specifier a source names.
 * @param {string} source - The module or inline script
 * @returns {string[]} Specifiers, as written
 */
function specifiersIn(source) {
    const code = stripNonCode(source);
    const found = [];
    for (const match of code.matchAll(SPECIFIER_RE)) {
        const specifier = match[1] ?? match[2];
        // Bare specifiers are the platform's business, not this repository's.
        if (specifier?.startsWith('.') || specifier?.startsWith('/')) found.push(specifier);
    }
    return found;
}

/** Where an entry HTML sends the browser next. */
function entryPoints(html, from) {
    const specifiers = [];
    for (const match of html.matchAll(SRC_RE)) specifiers.push(match[1]);
    for (const match of html.matchAll(SCRIPT_RE)) specifiers.push(...specifiersIn(match[1]));
    return specifiers.map(specifier => ({ specifier, from }));
}

/**
 * Walk every module the entries reach, reporting the ones that will not load.
 *
 * @param {object} [options] - Options
 * @param {string} [options.url] - Serve base; the disk is read when absent
 * @param {string[]} [options.entries] - Entry pages
 * @returns {Promise<Array<{module: string, from: string, reason: string}>>} What is unreachable
 */
export async function checkBoot({ url = null, entries = ENTRIES } = {}) {
    const read = url
        ? async path => {
            const response = await fetch(new URL(path, url.endsWith('/') ? url : `${url}/`));
            return response.ok ? response.text() : null;
        }
        : async path => {
            // `resolve`, not `join`: an entry given as an absolute path — a test fixture
            // outside the repository — must not be glued onto the root.
            const full = resolvePath(ROOT, path);
            return existsSync(full) ? readFileSync(full, 'utf8') : null;
        };

    const broken = [];
    const seen = new Set();
    const queue = [];

    for (const entry of entries) {
        const html = await read(entry);
        if (html === null) {
            broken.push({ module: entry, from: '(entry)', reason: 'the page itself is not there' });
            continue;
        }
        queue.push(...entryPoints(html, entry));
    }

    while (queue.length > 0) {
        const { specifier, from } = queue.shift();
        // Resolved against the IMPORTER, exactly as a browser resolves a relative URL.
        const base = isAbsolute(from) ? dirname(from) : resolvePath(ROOT, dirname(from));
        const absolute = specifier.startsWith('/')
            ? resolvePath(ROOT, specifier.slice(1))
            : resolvePath(base, specifier);
        // Reported relative to the repository when it belongs to it, and absolute when it
        // does not — so a real finding reads as a path a creator recognises.
        const inside = !relative(ROOT, absolute).startsWith('..');
        const path = inside ? relative(ROOT, absolute) : absolute;

        if (seen.has(path)) continue;
        seen.add(path);

        const source = await read(path);
        if (source === null) {
            // REPORTED ONCE, AT THE FILE. Whoever imports it will fail on whichever name
            // they happen to ask for first, and that name is not the problem.
            broken.push({ module: path, from, reason: url ? 'the server did not serve it' : 'no such file' });
            continue;
        }

        for (const next of specifiersIn(source)) queue.push({ specifier: next, from: path });
    }

    return { broken, walked: seen.size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
    const at = process.argv.indexOf('--url');
    const url = at === -1 ? null : process.argv[at + 1];

    const { broken, walked } = await checkBoot({ url });
    for (const entry of broken) {
        console.error(`${entry.module}  ${entry.reason} — imported by ${entry.from}`);
    }

    console.error(broken.length === 0
        ? `every module the entry points reach loads (${walked} walked${url ? `, over ${url}` : ''})`
        : `\n  ${broken.length} module(s) the app cannot load.`);
    process.exit(broken.length === 0 ? 0 : 1);
}
