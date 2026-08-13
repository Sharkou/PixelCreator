// The Editor's visual language, in two sheets.
//
// Tokens live on `:root` in a document-level sheet, because custom properties cross
// shadow boundaries and nothing else does. A shadow root then adopts `base`, which is
// the handful of rules every panel would otherwise repeat.
//
// This is the answer to Legacy's thirty global stylesheets: two shared sheets, plus one
// `static styles` per element, scoped by its shadow root and impossible to leak out of.
//
// The palette continues Legacy's — dark greys, `#339af0` as the single accent — because
// the product has a look and this is a modernisation, not a rebrand.

/**
 * Build a constructable stylesheet.
 * @param {string} css - The rules
 * @returns {CSSStyleSheet} The sheet, ready to adopt
 */
export function sheet(css) {
    const style = new CSSStyleSheet();
    style.replaceSync(css);
    return style;
}

const tokens = sheet(`
    :root {
        --px-bg-0: #17171a;
        --px-bg-1: #1e1e22;
        --px-bg-2: #25252a;
        --px-bg-3: #2e2e35;
        --px-line: #121215;
        --px-line-soft: #303038;

        --px-text: #c9c9d2;
        --px-text-dim: #7e7e8c;
        --px-text-strong: #f0f0f5;

        --px-accent: #339af0;
        --px-accent-soft: rgba(51, 154, 240, 0.16);
        --px-danger: #e5484d;

        --px-radius: 5px;
        --px-row: 24px;
        --px-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, sans-serif;
        --px-mono: 'SF Mono', 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace;
    }

    * { box-sizing: border-box; }

    html, body {
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: var(--px-bg-0);
        color: var(--px-text);
        font-family: var(--px-font);
        font-size: 12px;
        -webkit-font-smoothing: antialiased;
    }

    .shell {
        display: grid;
        grid-template-rows: 38px 1fr;
        height: 100%;
    }

    .titlebar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 12px;
        background: var(--px-bg-2);
        border-bottom: 1px solid var(--px-line);
        -webkit-user-select: none;
        user-select: none;
    }

    .titlebar .mark {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background: var(--px-accent);
        box-shadow: 0 0 0 3px var(--px-accent-soft);
    }

    .titlebar .product {
        font-weight: 600;
        letter-spacing: 0.2px;
        color: var(--px-text-strong);
    }

    .titlebar .scene {
        color: var(--px-text-dim);
    }

    .titlebar .scene::before {
        content: '/';
        margin-right: 8px;
        color: var(--px-line-soft);
    }

    .titlebar .spacer { flex: 1; }

    .titlebar .hint {
        color: var(--px-text-dim);
        font-size: 11px;
    }

    .workspace {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr) 300px;
        gap: 1px;
        background: var(--px-line);
        min-height: 0;
    }

    .workspace > * { min-width: 0; min-height: 0; }
`);

const base = sheet(`
    :host {
        display: block;
        font-family: var(--px-font);
        font-size: 12px;
        color: var(--px-text);
    }

    :host([hidden]) { display: none; }

    button {
        font: inherit;
        color: inherit;
        background: none;
        border: 0;
        padding: 0;
        cursor: pointer;
    }

    input, select {
        font: inherit;
        color: var(--px-text-strong);
        background: var(--px-bg-0);
        border: 1px solid var(--px-line);
        border-radius: 4px;
        padding: 3px 6px;
        min-width: 0;
        width: 100%;
    }

    input:focus, select:focus {
        outline: none;
        border-color: var(--px-accent);
        box-shadow: 0 0 0 2px var(--px-accent-soft);
    }

    input[type='checkbox'] {
        width: 13px;
        height: 13px;
        accent-color: var(--px-accent);
        padding: 0;
    }

    input[type='color'] {
        padding: 1px;
        height: 22px;
        cursor: pointer;
    }

    .icon {
        display: inline-flex;
        flex: 0 0 auto;
        line-height: 0;
        color: currentColor;
    }

    ::-webkit-scrollbar { width: 9px; height: 9px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
        background: var(--px-bg-3);
        border: 2px solid transparent;
        background-clip: content-box;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover { background-color: #3d3d47; background-clip: content-box; }
`);

/** The sheet every Editor element adopts, on top of its own. */
export const baseStyles = base;

/** Install the document-level tokens and shell layout. Safe to call more than once. */
export function installDocumentStyles() {
    if (!document.adoptedStyleSheets.includes(tokens)) {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, tokens];
    }
}
