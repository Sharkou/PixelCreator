// <px-project> — the project's resources, under the Hierarchy.
//
// A SHELL, AND IT SAYS SO. Resources and asset loading are later steps
// (docs/migration/MIGRATION_STATUS.md), so there is nothing real to list yet. What this
// gives is the place: the bottom of the left column, which is where L4 puts it — under
// the tree that names the scene, not across the floor where it used to cut the Inspector
// in half (design/README.md, D8).
//
// The search field is present and disabled, which is not the same as pretending: it is
// the control the Project will keep, switched off because there is nothing to search.
// A mock asset grid would be a lie the next phase has to unpick.

import { Element, el } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { emptyState } from '../ui/empty-state.js';
import { icon } from '../ui/icons.js';
import '../ui/window.js';

export class Project extends Element {

    static styles = sheet(`
        :host { display: block; }
        px-window { height: 100%; }

        /* The same field geometry as the Hierarchy's search, because it is the same
           control in the same place — the header, not the body that scrolls. */
        .search {
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            padding: var(--px-space-1) var(--px-space-1) var(--px-space-1) var(--px-space-2);
            border-bottom: 1px solid var(--px-border);
            color: var(--px-text-dim);
        }
    `);

    connectedCallback() {
        if (this.shadowRoot.childElementCount > 0) return;

        this.shadowRoot.append(el('px-window', { label: 'Project', icon: 'folder' },
            el('div', { class: 'search', slot: 'header' },
                icon('search'),
                el('input', {
                    type: 'search',
                    placeholder: 'Search assets',
                    spellcheck: false,
                    disabled: true
                })
            ),
            emptyState('folder', 'No assets yet',
                'Images, sounds and graphs appear here once a project can be opened.')
        ));
    }
}

customElements.define('px-project', Project);
