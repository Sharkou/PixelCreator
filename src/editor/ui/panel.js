// <px-panel> — a titled region with a scrolling body.
//
// The only layout primitive the first slice needs. `<px-split>`, `<px-tabs>` and a
// persisted layout are in the target structure (docs/architecture/EDITOR.md) and are
// deliberately absent: a three-column CSS grid does the job today, and a window manager
// built before a second arrangement exists would be a guess.

import { PxElement } from './element.js';
import { sheet } from './styles.js';

export class PxPanel extends PxElement {

    static styles = sheet(`
        :host {
            display: flex;
            flex-direction: column;
            background: var(--px-bg-1);
            min-height: 0;
            overflow: hidden;
        }

        header {
            display: flex;
            align-items: center;
            gap: 6px;
            height: 30px;
            padding: 0 6px 0 10px;
            background: var(--px-bg-2);
            border-bottom: 1px solid var(--px-line);
            flex: 0 0 auto;
            -webkit-user-select: none;
            user-select: none;
        }

        h2 {
            margin: 0;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            color: var(--px-text-dim);
            white-space: nowrap;
        }

        .spacer { flex: 1; }

        .body {
            flex: 1;
            min-height: 0;
            overflow: auto;
        }

        :host([plain]) .body { overflow: hidden; }
    `);

    connectedCallback() {
        if (this.shadowRoot.childElementCount > 0) return;

        const header = document.createElement('header');
        const title = document.createElement('h2');
        title.textContent = this.getAttribute('label') ?? '';

        const spacer = document.createElement('div');
        spacer.className = 'spacer';

        const actions = document.createElement('slot');
        actions.name = 'actions';

        header.append(title, spacer, actions);

        const body = document.createElement('div');
        body.className = 'body';
        body.append(document.createElement('slot'));

        this.shadowRoot.append(header, body);
    }
}

customElements.define('px-panel', PxPanel);
