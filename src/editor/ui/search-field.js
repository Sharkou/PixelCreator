// The search that lives behind a magnifier.
//
// TWO WINDOWS, ONE BEHAVIOUR. The Hierarchy filters objects and the Inspector filters
// components; a creator who has learned one has learned the other, which only holds if
// there is one implementation. This builds the pair of elements a window needs — the
// magnifier that goes in the header's actions, and the field that goes in its second row
// — and owns the rule that binds them.
//
// CLOSING CLEARS. A filter still applied behind a folded control is a panel that lies
// about what it holds. Escape, the cross and the magnifier all mean the same thing.
//
// It is not an element: there is nothing to encapsulate, no shadow root to own, and a
// custom element here would put the field behind a second boundary its window then has to
// reach through. The rules live in the shared base sheet (ui/styles.js).

import { el } from './element.js';
import { icon } from './icons.js';

/**
 * Build a foldable search.
 *
 * @param {object} options - Options
 * @param {string} options.placeholder - Placeholder text
 * @param {string} options.label - What is searched, for the control's accessible name
 * @param {Function} options.onQuery - Called with the current query on every keystroke,
 *   and with '' when the field closes
 * @returns {{bar: HTMLElement, toggle: HTMLElement, show: Function, isOpen: Function}}
 *   The field, the magnifier, and the one way to open or close them together
 */
export function searchField({ placeholder, label, onQuery }) {
    let query = '';

    const input = el('input', {
        type: 'search',
        placeholder,
        spellcheck: false,
        autocomplete: 'off',
        // Reactive to the keystroke, like every other field in the Editor.
        oninput: event => {
            query = event.target.value;
            onQuery(query);
        },
        onkeydown: event => {
            if (event.key === 'Escape') show(false);
            event.stopPropagation();
        }
    });

    const bar = el('div', { class: 'searchbar', slot: 'header' },
        el('div', { class: 'inner' },
            el('div', { class: 'field' },
                icon('search'),
                input,
                el('button', {
                    class: 'ghost',
                    type: 'button',
                    title: 'Clear and close',
                    'aria-label': `Clear and close ${label} search`,
                    onclick: () => show(false)
                }, icon('close'))
            )
        )
    );

    const toggle = el('button', {
        class: 'ghost',
        type: 'button',
        title: `Search ${label}`,
        'aria-label': `Search ${label}`,
        'aria-expanded': 'false',
        onclick: () => show(!isOpen())
    }, icon('search'));

    function isOpen() {
        return bar.classList.contains('open');
    }

    /**
     * Open or close the field.
     * @param {boolean} open - Whether the field is shown
     */
    function show(open) {
        bar.classList.toggle('open', open);
        toggle.classList.toggle('on', open);
        toggle.setAttribute('aria-expanded', globalThis.String(open));

        if (open) {
            input.focus();
            input.select();
            return;
        }

        if (query === '' && input.value === '') return;
        input.value = '';
        query = '';
        onQuery('');
    }

    return { bar, toggle, show, isOpen };
}
