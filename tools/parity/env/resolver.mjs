// ESM resolution hook: maps Legacy's absolute specifiers to the legacy/ directory.
//
// Legacy is served from legacy/ as the web root, so its modules import each other with
// '/src/core/object.js' and '/editor/system/dnd.js'. Node would read those as filesystem
// absolute paths. This hook rewrites them without touching a single Legacy file.

import { pathToFileURL } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const legacyRoot = resolvePath(here, '..', '..', '..', 'legacy');

const WEB_ROOTS = ['/src/', '/editor/', '/plugins/', '/build/'];

export function resolve(specifier, context, nextResolve) {
    if (WEB_ROOTS.some(root => specifier.startsWith(root))) {
        const target = resolvePath(legacyRoot, specifier.slice(1));
        return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}

export { legacyRoot };
