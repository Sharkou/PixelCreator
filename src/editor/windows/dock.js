// <px-dock> — the bottom window: Project, and Timeline.
//
// A SHELL, AND IT SAYS SO. Resources, asset loading and the animation system are later
// steps (docs/migration/MIGRATION_STATUS.md), so there is nothing real to list here yet.
// What this gives is the arrangement: the horizontal band at the bottom, the tab strip,
// and the search field the Project window will keep — decided now because it shapes the
// layout, and cheap to fill in later.
//
// No fake rows and no "coming soon" banner. An empty state that names what is missing is
// honest; a mock asset grid would be a lie the next phase has to unpick.

import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon } from '../ui/icons.js';
import '../ui/window.js';
import '../ui/tabs.js';

const PANES = [
    { id: 'project', label: 'Project', icon: 'folder' },
    { id: 'timeline', label: 'Timeline', icon: 'timeline' }
];

export class Dock extends Element {

    static styles = sheet(`
        :host { display: block; }
        px-window { height: 100%; }

        .search {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            color: var(--px-text-dim);
        }

        .search input { background: var(--px-bg-0); }

        .empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            height: 100%;
            min-height: 120px;
            padding: 20px;
            text-align: center;
            color: var(--px-text-dim);
        }

        .empty .glyph { opacity: 0.35; }
        .empty strong { font-weight: 600; color: var(--px-text); }
        .empty span { max-width: 320px; line-height: 1.5; }
    `);

    #tabs = null;
    #body = null;

    connectedCallback() {
        if (this.shadowRoot.childElementCount > 0) return;

        this.#tabs = el('px-tabs', { slot: 'title' });
        this.#tabs.bind(PANES, { onChange: () => this.#render() });

        this.#body = el('div', { style: 'height: 100%' });

        this.shadowRoot.append(
            el('px-window', { plain: '' }, this.#tabs, this.#body)
        );

        this.#render();
    }

    #render() {
        fill(this.#body, this.#tabs.active === 'project' ? this.#project() : this.#timeline());
    }

    #project() {
        return [
            el('div', { class: 'search' },
                icon('search', 13),
                el('input', { type: 'search', placeholder: 'Search assets', spellcheck: false, disabled: true })
            ),
            emptyState('folder', 'No assets yet',
                'Images, sounds and graphs appear here once a project can be opened.')
        ];
    }

    #timeline() {
        return emptyState('timeline', 'No animation',
            'Keyframes and tracks arrive with the animation system.');
    }
}

function emptyState(glyph, title, detail) {
    return el('div', { class: 'empty' },
        el('span', { class: 'glyph' }, icon(glyph, 26)),
        el('strong', { textContent: title }),
        el('span', { textContent: detail })
    );
}

customElements.define('px-dock', Dock);
