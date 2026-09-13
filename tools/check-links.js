// A relative link in a Markdown file must point at a file that exists.
//
// Documentation rots in one specific way: a document is moved or renamed, and every link to it
// keeps rendering as a link. GitHub shows no error — the reader gets a 404 page, and whoever
// wrote the link never finds out. `docs/` now holds two entry paths, seventy-two ADRs and a
// historical reference tree, all cross-linking each other, so the number of ways to get this
// wrong is no longer small enough to check by reading.
//
// It resolves paths the way GitHub does when browsing a repository: relative to the file the
// link is written in. That is also how a branch-based GitHub Pages deployment serves them
// (docs/developer/documentation-website.md), so one check covers both renderings.
//
// WHAT IT DELIBERATELY DOES NOT DO: fetch anything. An http(s) link is not checked — a network
// call in a verification tool makes the build depend on somebody else's uptime, and a link that
// 404s on a third-party site is not a defect in this repository. Anchors (`#section`) are not
// checked either: GitHub's heading-to-anchor rules are its own, and reimplementing them here
// would produce false failures nobody could act on.
//
// `legacy/` is skipped. It is a read-only archive (docs/PROJECT.md §7), so a broken link in it
// is a fact about the past rather than something to fix.
//
// Usage: node tools/check-links.js [file-or-directory ...]
//   default: every .md file in the repository, legacy/ excluded

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// fileURLToPath, not pathname: a repository checked out under a directory with a space in its
// name gives a URL with %20 in it, and readdir does not decode that.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Directories that hold no documentation this check is responsible for. */
const SKIP = new Set(['.git', 'legacy', 'node_modules', 'dist']);

/** Schemes that name somewhere else entirely, and are nothing to do with the file tree. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Every .md file under a directory.
 * @param {string} directory - Where to look
 * @returns {string[]} Absolute paths
 */
function walk(directory) {
    const found = [];
    for (const entry of readdirSync(directory)) {
        if (SKIP.has(entry)) continue;

        const path = join(directory, entry);
        if (statSync(path).isDirectory()) found.push(...walk(path));
        else if (entry.endsWith('.md')) found.push(path);
    }
    return found;
}

/**
 * The relative link targets a Markdown file carries.
 *
 * INLINE LINKS AND REFERENCE DEFINITIONS BOTH, because both render as links and both rot the
 * same way. What is filtered out is everything that does not name a path in this tree: a URL, a
 * `mailto:`, a bare anchor, and a fenced code block — a link written inside an example is
 * illustration, not navigation, and requiring the example's paths to exist would make it
 * impossible to document a path somebody else's repository has.
 *
 * @param {string} source - File contents
 * @returns {object[]} `{ line, href, target }` for each relative link
 */
export function relativeLinks(source) {
    const links = [];
    const lines = source.split('\n');
    let fenced = false;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        // ``` or ~~~ opens and closes a fence. An indented code block is not distinguished:
        // a four-space-indented line holding a link is a list continuation far more often
        // than it is code, and treating it as code would silently skip real links.
        if (/^\s*(?:```|~~~)/.test(line)) {
            fenced = !fenced;
            continue;
        }
        if (fenced) continue;

        // Inline: [text](target) or [text](<target with spaces>)  ·
        // Reference definition: [label]: target
        //
        // The angle-bracketed form is a separate alternative rather than a post-hoc unwrap,
        // because it is the one form whose target may contain a space — which is precisely
        // what a `[^)\s]+` match cannot see.
        const pattern = /\[[^\]]*\]\(\s*(?:<([^>]*)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)|^\s*\[[^\]]+\]:\s*(?:<([^>]*)>|(\S+))/g;
        let match;

        while ((match = pattern.exec(line)) !== null) {
            const href = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
            if (!href || href.startsWith('#') || EXTERNAL.test(href)) continue;

            // A root-relative link is a site path, not a repository path: it cannot be
            // resolved against a file, and it does not work when browsing on GitHub either.
            // Reporting it is the point rather than resolving it.
            const target = decodeURIComponent(href.split('#')[0]);
            if (!target) continue;

            links.push({ line: index + 1, href, target });
        }
    }

    return links;
}

const given = process.argv.slice(2);
const targets = given.length > 0
    ? given.flatMap(entry => {
        const path = isAbsolute(entry) ? entry : resolve(ROOT, entry);
        return statSync(path).isDirectory() ? walk(path) : [path];
    })
    : walk(ROOT);

let broken = 0;
let checked = 0;

for (const file of targets.sort()) {
    for (const link of relativeLinks(readFileSync(file, 'utf8'))) {
        checked++;

        const absolute = link.target.startsWith('/')
            ? null
            : resolve(dirname(file), link.target);

        if (absolute !== null && existsSync(absolute)) continue;

        broken++;
        const where = `${relative(ROOT, file).replaceAll('\\', '/')}:${link.line}`;
        console.error(absolute === null
            ? `${where}  root-relative link does not resolve when browsing the repository: ${link.href}`
            : `${where}  broken link: ${link.href}  ->  ${relative(ROOT, absolute).replaceAll('\\', '/')}`);
    }
}

if (broken > 0) {
    console.error(`\n  ${broken} broken link(s) in ${targets.length} file(s).`);
    process.exit(1);
}

console.log(`  ✓ every relative link resolves (${checked} link(s) in ${targets.length} file(s))`);
