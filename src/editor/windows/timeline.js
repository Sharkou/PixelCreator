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

    static styles = sheet(`
        :host { display: block; }
        px-window { height: 100%; border-top: 1px solid var(--px-border); }
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
