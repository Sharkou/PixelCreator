// <px-menu> — a transient list of choices next to the control that opened it.
//
// Mounted on `document.body` rather than inside the panel that opened it, because a
// panel scrolls and clips and a menu must do neither. It closes on the first thing that
// means "not that": a pointer outside, Escape, a scroll, a resize.
//
// THE DROPDOWN IS THE REFERENCE, NOT AN OPINION. It is the one piece of this Editor whose
// hierarchy already read correctly, which is why the Inspector's section titles copy its
// group heading (windows/inspector.js). The geometry below is measured from
// `design/prototype.css` §menus: 244 wide, a 4 px list, a heading that trails off into a
// rule, and a row that takes an accent tint and a 2 px accent rail when it is the one you
// are about to choose — the same mark a selected Hierarchy row wears, because it means the
// same thing.
//
// TWO DEVIATIONS FROM THE PROTOTYPE, BOTH DELIBERATE. The row is --px-hit tall rather than
// the prototype's 30, so it grows with the density tokens under a coarse pointer and stays
// on the four-pixel grid; and the inset white hairline is dropped, because the menu already
// carries a real border and the Editor allows itself one shadow here, not two effects.
//
// FILTERING AND ARROWS ARE PART OF THE CONTROL, not decoration: `design/README.md`
// describes the Add Component dropdown as "catégorisé, filtrable, navigable aux flèches".
// The footer states those keys, and it is only ever drawn on a menu where they do
// something — a three-entry Create Object list is opened without a search and without a
// footer that would explain more than the menu contains.

import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { icon } from './icons.js';
import { rank } from './relevance.js';

export class Menu extends Element {

    static styles = sheet(`
        /* The popover surface, and one of the only two shadows left in the Editor: depth
           is a step in the surface ramp everywhere else, but a menu genuinely floats over
           unrelated content and has to say so (ui/styles.js). */
        :host {
            position: fixed;
            z-index: var(--px-z-overlay);
            display: flex;
            flex-direction: column;
            width: 244px;
            max-height: 372px;
            overflow: hidden;
            background: var(--px-surface-overlay);
            border: 1px solid var(--px-border);
            border-radius: var(--px-radius-lg);
            box-shadow: 0 14px 38px rgba(0, 0, 0, 0.55);
        }

        .search {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            flex: 0 0 auto;
            padding: var(--px-space-2);
            border-bottom: 1px solid var(--px-border);
            color: var(--px-text-dim);
        }

        /* No well and no border: the menu is already a surface, and a box inside a box
           two pixels smaller is what makes a dropdown look cluttered. */
        .search input {
            flex: 1;
            min-width: 0;
            height: var(--px-control);
            padding: 0;
            background: none;
            border: 0;
            border-radius: 0;
        }

        .search input:hover, .search input:focus { border: 0; box-shadow: none; }

        /* Padding on the vertical only. The horizontal inset is what made every entry a
           rounded pill floating inside the list instead of a line of it; the text keeps
           its own left margin from the button's padding, so nothing moved. */
        .list {
            flex: 1;
            min-height: 0;
            overflow: auto;
            padding: var(--px-space-1) 0;
            overscroll-behavior: contain;
        }

        button {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            width: 100%;
            height: var(--px-hit);
            padding: 0 var(--px-space-2);
            text-align: left;
            white-space: nowrap;
            color: var(--px-text);
        }

        button .glyph { color: var(--px-text-dim); }

        button .name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Hover and keyboard highlight are the same state on purpose: there is one "this
           is the entry you are about to choose", however you arrived at it — which is why
           pointing at an entry marks it selected rather than relying on the hover
           pseudo-class, and why Enter after a hover chooses what is under the pointer.
           The tint, the accent rail and the square full-width geometry all come from the
           shared line primitive, the same one a Hierarchy row wears (ui/styles.js).
           Only the text colour is the menu's own. */
        button.selected { color: var(--px-text-strong); }
        button.selected .glyph { color: var(--px-accent); }

        /* A category row: what it is, how many it holds, and that it goes somewhere. */
        button .count {
            flex: 0 0 auto;
            color: var(--px-text-dim);
            font-size: var(--px-text-2xs);
            font-variant-numeric: tabular-nums;
        }

        button .into { display: flex; flex: 0 0 auto; color: var(--px-text-dim); }
        button.group.selected .into { color: var(--px-accent); }

        /* Where a search result came from. Quiet, because the name is the answer and the
           group is only how to be sure it is the right one. */
        button .meta {
            flex: 0 0 auto;
            max-width: 40%;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--px-text-dim);
            font-size: var(--px-text-2xs);
        }

        button.back .glyph { transform: rotate(180deg); }
        button.back .name { color: var(--px-text-muted); }

        button[disabled] { color: var(--px-text-dim); cursor: default; }
        button[disabled]:hover { background: none; box-shadow: none; color: var(--px-text-dim); }

        .empty {
            padding: var(--px-space-4) var(--px-space-2);
            text-align: center;
            color: var(--px-text-dim);
        }

        /* THE REFERENCE. A Component's title in the Inspector uses this exact type, so
           that "Rendering" in this menu and "Rectangle Renderer" over there read as the
           same kind of thing. Only the colour differs, by role: a group heading is
           quieter than the section it groups. The rule that trails off after the words is
           what separates groups — a full-width divider would be a second line to read. */
        .heading {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            padding: var(--px-space-2) var(--px-space-2) var(--px-space-1);
            /* The rule that trails off stops where the entries' text starts, now that the
               list itself no longer insets anything. */
            font-size: var(--px-text-2xs);
            font-weight: var(--px-weight-bold);
            letter-spacing: var(--px-tracking-caps);
            text-transform: uppercase;
            color: var(--px-text-dim);
        }

        .heading::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--px-border-subtle);
        }

        .foot {
            display: flex;
            align-items: center;
            gap: var(--px-space-3);
            flex: 0 0 auto;
            padding: var(--px-space-1) var(--px-space-2);
            border-top: 1px solid var(--px-border);
            background: var(--px-surface);
            color: var(--px-text-dim);
            font-size: var(--px-text-2xs);
        }

        .foot span { display: flex; align-items: center; gap: var(--px-space-1); }

        kbd {
            font: inherit;
            color: var(--px-text-muted);
            background: var(--px-surface-raised);
            border: 1px solid var(--px-border-subtle);
            border-radius: 2px;
            padding: 0 var(--px-space-1);
        }
    `);

    #onPick = null;
    #items = [];
    #list = null;
    #query = '';
    /** Whether the menu opens on its categories rather than on everything (browse mode). */
    #browse = false;
    /** The category being looked inside, or null for the top level. */
    #category = null;

    /**
     * Fill and place the menu.
     *
     * @param {DOMRect} rect - Screen rectangle of the control that opened it
     * @param {object[]} items - Entries as { id, label, icon, disabled }, or { heading }
     * @param {Function} onPick - Called with the chosen entry's id
     * @param {object} [options] - Options
     * @param {boolean} [options.search] - Show a filter field and the key hints
     * @param {string} [options.label] - What is being chosen, for the placeholder
     * @param {boolean} [options.browse] - Open on the categories rather than on everything
     * @param {string|null} [options.category] - Open already inside this group
     */
    open(rect, items, onPick, { search = false, label = '', browse = false, category = null } = {}) {
        this.#onPick = onPick;
        this.#items = items;
        this.#browse = browse;
        // ALREADY ONE LEVEL IN, WHEN THE CALLER KNOWS WHICH (ADR-0052 §2). A Component let go
        // on a node has said which group it means; opening on the full list would make the
        // creator say it again. It is the state `→` reaches, entered from outside — not a
        // second way to browse, and `←` still leads back out to the categories.
        this.#category = browse && category && this.#groups().some(group => group.category === category)
            ? category
            : null;
        this.#list = el('div', { class: 'list' });

        const parts = [];

        if (search) {
            parts.push(el('div', { class: 'search' },
                icon('search'),
                el('input', {
                    type: 'search',
                    placeholder: label ? `Search ${label}` : 'Search',
                    spellcheck: false,
                    autocomplete: 'off',
                    oninput: event => {
                        this.#query = event.target.value;
                        this.#renderList();
                    }
                })
            ));
        }

        parts.push(this.#list);

        if (search) {
            parts.push(el('div', { class: 'foot' },
                el('span', {}, el('kbd', { textContent: '↑↓' }), 'navigate'),
                // THE KEYS ARE SAID BECAUSE NOBODY GUESSES THEM. Arrow navigation that is
                // not announced is arrow navigation nobody uses.
                el('span', {}, el('kbd', { textContent: '←→' }), 'groups'),
                el('span', {}, el('kbd', { textContent: '↵' }), 'choose'),
                el('span', {}, el('kbd', { textContent: 'esc' }), 'close')
            ));
        }

        fill(this.shadowRoot, parts);
        this.#renderList();

        this.style.left = `${rect.left}px`;
        this.style.top = `${rect.bottom + 4}px`;
        // Placed, then corrected: the height is only known once the entries are in.
        requestAnimationFrame(() => this.#keepOnScreen(rect));

        if (search) this.shadowRoot.querySelector('.search input')?.focus();
    }

    connectedCallback() {
        const close = event => {
            if (!event || !this.contains(event.target)) this.remove();
        };

        // A WHEEL INSIDE THE MENU IS SCROLLING, NOT DISMISSAL. This listener exists for the
        // wheel that scrolls the PAGE BEHIND the menu — the menu is placed against a
        // rectangle it measured once, so it has to go when what it points at moves. A turn
        // of the wheel over its own list is the opposite intent, and closing on it made
        // Add Component unusable at the exact length that makes a list need scrolling.
        // `event.target` retargets to this host for anything inside the shadow root, so
        // `contains` answers the right question.
        const closeOnScroll = event => {
            if (!this.contains(event.target)) this.remove();
        };
        const onKey = event => {
            if (event.key === 'Escape') {
                // ESCAPE UNDOES THE LAST STEP, not the whole gesture. Inside a category,
                // or with a query typed, the creator has moved somewhere and expects to
                // come back — closing outright would make them reopen the menu to try
                // again. With nothing to step back from it closes, as it always did.
                if (this.#query !== '') {
                    this.#query = '';
                    const box = this.shadowRoot.querySelector('.search input');
                    if (box) box.value = '';
                    this.#renderList();
                    return undefined;
                }
                if (this.#category !== null) {
                    this.#leaveCategory();
                    return undefined;
                }
                return this.remove();
            }
            if (event.key === 'ArrowDown') return this.#step(1, event);
            if (event.key === 'ArrowUp') return this.#step(-1, event);
            if (event.key === 'ArrowRight') return this.#inward(event);
            if (event.key === 'ArrowLeft') return this.#outward(event);
            if (event.key === 'Enter') return this.#confirm(event);
        };

        this.track(listen(document, 'pointerdown', close, true));
        this.track(listen(document, 'keydown', onKey, true));
        this.track(listen(globalThis, 'resize', () => this.remove()));
        this.track(listen(globalThis, 'wheel', closeOnScroll, true));
    }

    /**
     * Draw what the menu is currently showing.
     *
     * THREE STATES, AND THE QUERY DECIDES WHICH. A menu that opens onto its full contents
     * is fine at eight entries and useless at twenty: the node catalogue put every node
     * behind one scroll, so finding `Multiply` meant reading past nineteen others. In
     * `browse` mode the menu therefore opens on the CATEGORIES, one row each, and a
     * category is walked into. Typing at any point leaves both states behind and searches
     * everything — because someone who knows the name should never have to know the group.
     *
     *   query, any mode      ranked results across every entry (ui/relevance.js)
     *   browse, no category  one row per category
     *   otherwise            the entries, under their headings
     *
     * A heading whose whole group was filtered away is dropped with it: a category title
     * over nothing says the Editor has a group it does not.
     */
    #renderList() {
        const query = this.#query.trim();

        if (query !== '') return this.#renderResults(query);
        if (this.#browse && this.#category === null) return this.#renderCategories();
        return this.#renderEntries();
    }

    /** The ranked answer to a query, across every entry whatever section it lives in. */
    #renderResults(query) {
        // SCORED, NOT FILTERED. `label.includes(query)` answered nothing for `float` — the
        // node is called Number — and could not tell `Multiply` from a node whose category
        // happens to contain the letters. The scorer reads the name, the type, the category
        // and any declared aliases, and it is pure and tested (ui/relevance.js).
        const found = rank(this.#entries(), query);

        if (found.length === 0) {
            fill(this.#list, el('div', { class: 'empty', textContent: `No match for “${query}”` }));
            return;
        }

        fill(this.#list, found.map(item => this.#entryRow(item, { meta: item.category })));
        this.#highlight(this.#list.querySelector('button:not([disabled])'));
    }

    /** One row per category, which is what `browse` opens on. */
    #renderCategories() {
        const groups = this.#groups();

        if (groups.length === 0) {
            fill(this.#list, el('div', { class: 'empty', textContent: 'Nothing to add' }));
            return;
        }

        fill(this.#list, groups.map(group => el('button', {
            class: 'line group',
            type: 'button',
            // Named, so that coming back OUT of this category can find this exact row
            // again rather than the first one. Matching on the label would work until two
            // groups shared a word.
            'data-category': group.category,
            onpointerenter: event => this.#highlight(event.currentTarget),
            onclick: () => {
                this.#category = group.category;
                this.#renderList();
            }
        },
            el('span', { class: 'glyph' }, icon(group.icon ?? 'chevron')),
            el('span', { class: 'name', textContent: group.category }),
            el('span', { class: 'count', textContent: globalThis.String(group.entries.length) }),
            el('span', { class: 'into' }, icon('chevron'))
        )));

        this.#highlight(this.#list.querySelector('button:not([disabled])'));
    }

    /**
     * Step back out to the list of categories, standing on the one just left.
     *
     * COMING BACK IS NOT ARRIVING. Walking out of `Transform` and finding the cursor on
     * `Compare` — the first row, wherever it happens to be — loses the creator's place
     * every time they look inside a category and change their mind. The category they were
     * in is the one thing they are certainly still thinking about, so it is where they land:
     * `→` `←` returns to exactly where `→` was pressed, which is what makes browsing by
     * keyboard survivable.
     *
     * All three ways out share it — the `All categories` row, Escape and `←` — because they
     * are one intent and a creator would notice immediately if one of them behaved
     * differently.
     */
    #leaveCategory() {
        const left = this.#category;
        this.#category = null;
        this.#renderList();

        // Read rather than selected, because a category is whatever a caller named it and
        // a selector would need escaping the moment one contains a quote.
        const row = [...this.#list.children].find(child => child.dataset?.category === left);
        if (row) this.#highlight(row);
    }

    /** The entries themselves: one category's, or the whole list under its headings. */
    #renderEntries() {
        const rows = [];

        if (this.#browse && this.#category !== null) {
            // The way out of a category. A row rather than a chevron in the header: it is
            // the first thing under the pointer, and it navigates like everything else here.
            rows.push(el('button', {
                class: 'line back',
                type: 'button',
                onpointerenter: event => this.#highlight(event.currentTarget),
                onclick: () => this.#leaveCategory()
            },
                el('span', { class: 'glyph' }, icon('chevron')),
                el('span', { class: 'name', textContent: 'All categories' })
            ));
            rows.push(el('div', { class: 'heading', textContent: this.#category }));
            for (const item of this.#entries()) {
                if ((item.category ?? null) === this.#category) rows.push(this.#entryRow(item));
            }
        } else {
            const kept = [];
            for (const item of this.#items) kept.push(item);

            // Drop a heading immediately followed by another heading or by nothing.
            const visible = kept.filter((item, index) =>
                !item.heading || (kept[index + 1] && !kept[index + 1].heading));

            if (visible.filter(item => !item.heading).length === 0) {
                fill(this.#list, el('div', { class: 'empty', textContent: 'Nothing to add' }));
                return;
            }

            for (const item of visible) {
                rows.push(item.heading
                    ? el('div', { class: 'heading', textContent: item.heading })
                    : this.#entryRow(item));
            }
        }

        fill(this.#list, rows);
        // NOT THE WAY OUT. Walking INTO a category and landing on `All categories` means
        // Enter takes you straight back out — the one keystroke a creator who just pressed
        // `→` cannot have meant. The first real entry is what they came for.
        this.#highlight(this.#list.querySelector('button.line:not(.back):not([disabled])')
            ?? this.#list.querySelector('button:not([disabled])'));
    }

    /**
     * One choosable row.
     * @param {object} item - The entry
     * @param {object} [options] - Options
     * @param {string} [options.meta] - A second, quieter line: which group it came from
     * @returns {HTMLElement} The row
     */
    #entryRow(item, { meta = null } = {}) {
        return el('button', {
            class: 'line',
            type: 'button',
            disabled: Boolean(item.disabled),
            title: item.tooltip ?? '',
            onpointerenter: event => this.#highlight(event.currentTarget),
            onclick: () => this.#pick(item)
        },
            item.icon ? el('span', { class: 'glyph' }, icon(item.icon)) : null,
            el('span', { class: 'name', textContent: item.label }),
            meta ? el('span', { class: 'meta', textContent: meta }) : null
        );
    }

    /** Every choosable entry, headings dropped. */
    #entries() {
        return this.#items.filter(item => !item.heading);
    }

    /**
     * The categories, in the order the caller declared them.
     *
     * A category is a HEADING followed by its entries — the shape every menu in this Editor
     * already passes — so `browse` needs no second data format and no caller changes the way
     * it builds its list.
     *
     * @returns {Array<{category: string, icon: string|null, entries: object[]}>} The groups
     */
    #groups() {
        const groups = [];
        let current = null;

        for (const item of this.#items) {
            if (item.heading) {
                current = { category: item.heading, icon: item.icon ?? null, entries: [] };
                groups.push(current);
                continue;
            }
            if (!current) {
                current = { category: 'Other', icon: null, entries: [] };
                groups.push(current);
            }
            current.entries.push(item);
        }

        return groups.filter(group => group.entries.length > 0);
    }

    #buttons() {
        return [...this.#list.querySelectorAll('button:not([disabled])')];
    }

    #highlight(button) {
        // A disabled entry is never the candidate: Enter would do nothing, and marking it
        // would say otherwise.
        if (button?.disabled) return;
        for (const other of this.#list.querySelectorAll('button')) other.classList.remove('selected');
        button?.classList.add('selected');
    }

    #step(direction, event) {
        const buttons = this.#buttons();
        if (buttons.length === 0) return;
        event.preventDefault();

        const current = buttons.findIndex(button => button.classList.contains('selected'));
        const next = (current + direction + buttons.length) % buttons.length;
        this.#highlight(buttons[next]);
        buttons[next].scrollIntoView({ block: 'nearest' });
    }

    /**
     * Go one step INTO the grouping: `\u2192`.
     *
     * ONE INTENT, TWO SHAPES OF GROUPING. A browsing menu groups by LEVEL — categories you
     * walk into — and a picker groups by HEADING, with everything on one page. "Deeper" is
     * the same wish in both: enter the category under the cursor, or, where there are no
     * categories to enter, jump to the next heading. A creator who never learns which kind
     * of menu they are in still gets the answer they meant.
     *
     * THE CARET COMES FIRST. The search box has focus, and in a box with text in it the
     * arrows belong to the text — intercepting them would make the field unusable to edit.
     * With nothing typed the caret has nowhere to go, so the key is free.
     */
    #inward(event) {
        if (this.#query !== '') return undefined;

        const active = this.#list.querySelector('button.selected');
        if (active?.classList.contains('group')) {
            event.preventDefault();
            active.click();
            return undefined;
        }

        return this.#toHeading(1, event);
    }

    /** Go one step OUT of the grouping: `\u2190`. The mirror of `#inward`. */
    #outward(event) {
        if (this.#query !== '') return undefined;

        if (this.#browse && this.#category !== null) {
            event.preventDefault();
            this.#leaveCategory();
            return undefined;
        }

        return this.#toHeading(-1, event);
    }

    /**
     * Jump to the first row under the next or previous heading.
     *
     * WHAT MAKES A LONG PICKER USABLE WITHOUT A MOUSE. The property picker is one page with
     * a heading per Component; stepping to `Transform` from the bottom of `Particles` is
     * nine presses of `\u2193` or one of `\u2190`.
     *
     * @param {number} direction - 1 forwards, -1 backwards
     * @param {KeyboardEvent} event - The key, so it can be claimed
     * @returns {undefined} Nothing, like every other key handler here
     */
    #toHeading(direction, event) {
        const rows = [...this.#list.children];
        const headings = rows.filter(row => row.classList.contains('heading'));
        if (headings.length === 0) return undefined;

        const active = this.#list.querySelector('button.selected');
        const from = active ? rows.indexOf(active) : -1;
        const ordered = direction > 0 ? headings : [...headings].reverse();

        // The heading the cursor is under is not a destination; the one past it is.
        const target = ordered.find(heading => (direction > 0
            ? rows.indexOf(heading) > from
            : rows.indexOf(heading) < from - 1));
        if (!target) return undefined;

        let row = target.nextElementSibling;
        while (row && !(row.tagName === 'BUTTON' && !row.disabled)) row = row.nextElementSibling;
        if (!row) return undefined;

        event.preventDefault();
        this.#highlight(row);
        row.scrollIntoView({ block: 'nearest' });
        return undefined;
    }

    #confirm(event) {
        const active = this.#list.querySelector('button.selected');
        if (!active) return;
        event.preventDefault();
        active.click();
    }

    #pick(item) {
        if (item.disabled) return;
        this.remove();
        this.#onPick?.(item.id);
    }

    #keepOnScreen(rect) {
        const own = this.getBoundingClientRect();
        if (own.bottom > globalThis.innerHeight - 8) {
            this.style.top = `${Math.max(8, rect.top - own.height - 4)}px`;
        }
        if (own.right > globalThis.innerWidth - 8) {
            this.style.left = `${Math.max(8, globalThis.innerWidth - own.width - 8)}px`;
        }
    }
}

/**
 * Open a menu under a control.
 *
 * @param {HTMLElement} anchor - The control that opened it
 * @param {object[]} items - Entries as { id, label, icon, disabled }, or { heading }
 * @param {Function} onPick - Called with the chosen entry's id
 * @param {object} [options] - Options
 * @param {boolean} [options.search] - Show a filter field and the key hints
 * @param {string} [options.label] - What is being chosen, for the placeholder
 * @returns {Menu} The open menu
 */
export function openMenu(anchor, items, onPick, options = {}) {
    const menu = document.createElement('px-menu');
    document.body.append(menu);
    menu.open(anchor.getBoundingClientRect(), items, onPick, options);
    return menu;
}

/**
 * A zero-sized rectangle at a point, so a menu can open where a pointer is.
 *
 * SHARED BECAUSE THREE SURFACES NEED IT. It lived in `windows/graph.js` while the canvas was
 * the only thing with a context menu; the Project grid and the Hierarchy tree have one now,
 * and a menu that opens at a pointer is not a graph idea (ADR-0041 §7).
 *
 * @param {number} x - Client x
 * @param {number} y - Client y
 * @returns {{getBoundingClientRect: Function}} Something `openMenu` can anchor to
 */
export function pointAnchor(x, y) {
    return {
        getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0 })
    };
}

function listen(target, event, handler, capture = false) {
    target.addEventListener(event, handler, capture);
    return () => target.removeEventListener(event, handler, capture);
}

customElements.define('px-menu', Menu);
