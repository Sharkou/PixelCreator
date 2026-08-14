// <px-timeline> — the animation band, across the scene.
//
// CONDITIONAL, AND THAT IS THE LAYOUT DECISION. L4 gives the Timeline a band that spans
// the left column and the scene and stops at the Inspector's seam, so the Inspector keeps
// one uninterrupted column; when nothing is animated the band is not there at all
// (design/README.md, D8). It therefore starts hidden and is brought in from the titlebar,
// which is why `layout.js` gives it a default of its own.
//
// A SHELL, AND IT SAYS SO. Keyframes, tracks and a playhead need the animation system
// (docs/migration/MIGRATION_STATUS.md). Drawing a fake ruler with fake keys would be the
// kind of thing this project spends its time undoing.

import { Element, el } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { emptyState } from '../ui/empty-state.js';
import '../ui/window.js';

export class Timeline extends Element {

    /* NO BORDER OF ITS OWN. The seam above the Timeline is the `<px-splitter>` the shell
       puts between them, which is a real 1 px line of --px-border and is shown and hidden
       with this window (editor.js). Drawing a border-top here as well produced two
       parallel lines under the Project the moment the Timeline was opened — the same
       seam, claimed twice. Every other edge in this layout is owned by its splitter; this
       one is now too. */
    static styles = sheet(`
        :host { display: block; }
        px-window { height: 100%; }
    `);

    connectedCallback() {
        if (this.shadowRoot.childElementCount > 0) return;

        this.shadowRoot.append(el('px-window', { label: 'Timeline', icon: 'timeline', plain: '' },
            emptyState('timeline', 'No animation',
                'Keyframes and tracks arrive with the animation system.')
        ));
    }
}

customElements.define('px-timeline', Timeline);
