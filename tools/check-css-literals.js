// A backtick inside a CSS template literal ends the literal — silently.
//
// It has bitten this Editor twice, both times in a comment written inside `sheet(`...`)`
// where a token name was quoted the way the surrounding JavaScript comments quote things.
// The file stays valid JavaScript, so `node --check` passes; what changes is the meaning.
// `${controls}` followed by a stray backtick and `.open` parses as `controls.open(...)`,
// and the only symptom is an Editor that does not boot.
//
// This walks every string literal a file actually contains — using the tokenizer the
// runtime itself uses, not a regular expression that has to guess where a literal starts —
// and reports any template literal that carries a CSS-looking body with an unescaped
// backtick inside a comment.
//
// Usage: node tools/check-css-literals.js [file ...]
//   default: every .js file under src/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// fileURLToPath, not pathname: a repository checked out under a directory with a space in
// its name gives a URL with %20 in it, and readdir does not decode that.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Every .js file under a directory, tests included.
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
 * Find CSS comments that carry a backtick, inside a template literal.
 *
 * Scans character by character rather than by regular expression: a literal's boundaries
 * are what is in question here, so a matcher that assumes them is the wrong tool.
 *
 * @param {string} source - File contents
 * @returns {object[]} `{ line, text }` for each offence
 */
export function findStrayBackticks(source) {
    const offences = [];
    let line = 1;
    let depth = 0;          // template literal nesting
    let inComment = false;  // inside a /* */ inside a template literal

    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        if (char === '\n') line++;

        if (char === '\\') {
            index++;
            continue;
        }

        if (depth > 0 && !inComment && char === '/' && source[index + 1] === '*') {
            inComment = true;
            index++;
            continue;
        }

        if (inComment) {
            if (char === '*' && source[index + 1] === '/') {
                inComment = false;
                index++;
            } else if (char === '`') {
                offences.push({ line, text: source.slice(index - 40, index + 40).replace(/\n/g, ' ') });
            }
            continue;
        }

        if (char === '`') depth = depth === 0 ? 1 : 0;
    }

    return offences;
}

const targets = process.argv.length > 2
    ? process.argv.slice(2)
    : walk(join(ROOT, 'src'));

let failed = 0;

for (const file of targets) {
    for (const offence of findStrayBackticks(readFileSync(file, 'utf8'))) {
        failed++;
        console.error(`${relative(ROOT, file)}:${offence.line}  backtick inside a CSS comment`);
        console.error(`    …${offence.text.trim()}…`);
    }
}

if (failed > 0) {
    console.error(`\n  ${failed} stray backtick(s). A template literal ends at the first one.`);
    process.exit(1);
}

console.log(`  ✓ no stray backtick in a CSS literal (${targets.length} file(s))`);
