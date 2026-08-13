// What a window says when it has nothing to show.
//
// It exists as one function because two windows already need it and they must not drift:
// an empty state that names what is missing is honest, and it is the only thing standing
// between this Editor and a mock asset grid that the next phase would have to unpick.
//
// NO "COMING SOON". The wording says what the thing waits for — a project that can be
// opened, an animation system — not that it is on its way. The rules live in the shared
// base sheet (ui/styles.js) so every shadow root already has them.

import { el } from './element.js';
import { icon, IconSize } from './icons.js';

/**
 * Build the centred empty state.
 *
 * @param {string} glyph - Icon name
 * @param {string} title - What is not there
 * @param {string} detail - What it waits for
 * @returns {HTMLElement} The empty state
 */
export function emptyState(glyph, title, detail) {
    return el('div', { class: 'empty-state' },
        el('span', { class: 'glyph' }, icon(glyph, IconSize.MD)),
        el('strong', { textContent: title }),
        el('span', { textContent: detail })
    );
}
