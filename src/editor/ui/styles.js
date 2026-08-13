// The Editor's visual language, in two sheets.
//
// Tokens live on `:root` in a document-level sheet, because custom properties cross
// shadow boundaries and nothing else does. A shadow root then adopts `base`, which is
// the handful of rules every window would otherwise repeat.
//
// This is the answer to Legacy's thirty global stylesheets: two shared sheets, plus one
// `static styles` per element, scoped by its shadow root and impossible to leak out of.
//
// The palette continues Legacy's — dark greys, `#339af0` as the single accent — because
// the product has a look and this is a modernisation, not a rebrand.
//
// TOUCH IS NOT A SEPARATE SKIN. `@media (pointer: coarse)` grows the density tokens and
// every control follows, so there is one Editor and not a desktop one plus a mobile one.
// Nothing important is ever revealed by hover alone; hover only strengthens what is
// already visible.

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
        --px-bg-0: #141417;
        --px-bg-1: #1c1c20;
        --px-bg-2: #232329;
        --px-bg-3: #2c2c34;
        --px-bg-4: #383842;
        --px-line: #0e0e10;
        --px-line-soft: #2e2e37;

        --px-text: #c6c6d0;
        --px-text-dim: #7c7c8a;
        --px-text-strong: #f2f2f7;

        --px-accent: #339af0;
        --px-accent-soft: rgba(51, 154, 240, 0.15);
        --px-accent-line: rgba(51, 154, 240, 0.45);
        --px-danger: #e5484d;

        --px-radius: 6px;
        --px-radius-sm: 4px;

        /* Density. These four are what touch changes; everything else follows. */
        --px-row: 26px;
        --px-control: 22px;
        --px-hit: 24px;
        --px-grip: 8px;

        --px-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, sans-serif;
        --px-mono: 'SF Mono', 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace;

        /* Layout, written by layout.js */
        --px-toolbar: 44px;
        --px-right: 304px;
        --px-hierarchy: 250px;
        --px-dock: 200px;

        color-scheme: dark;
    }

    @media (pointer: coarse) {
        :root {
            --px-row: 34px;
            --px-control: 30px;
            --px-hit: 34px;
            --px-grip: 14px;
        }
    }

    * { box-sizing: border-box; }

    html, body {
        height: 100%;
        margin: 0;
        overflow: hidden;
        overscroll-behavior: none;
        background: var(--px-bg-0);
        color: var(--px-text);
        font-family: var(--px-font);
        font-size: 12px;
        -webkit-font-smoothing: antialiased;
        -webkit-tap-highlight-color: transparent;
    }

    .shell {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .workspace {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
    }

    .stage {
        display: flex;
        flex: 1;
        min-height: 0;
    }

    .stage > px-viewport { flex: 1; min-width: 0; }

    .sidebar {
        display: flex;
        flex-direction: column;
        width: var(--px-right);
        flex: 0 0 auto;
        min-width: 0;
    }

    /* The Hierarchy is the shorter of the two, by design: it lists, the Inspector edits.
       Clamped rather than fixed, so a short window cannot leave the Inspector a sliver —
       the seam still drags, it just cannot cross half the column. */
    .sidebar > px-hierarchy {
        height: clamp(110px, var(--px-hierarchy), 50%);
        flex: 0 0 auto;
        min-height: 0;
    }

    .sidebar > px-inspector { flex: 1; min-height: 0; }

    /* One window left in the sidebar takes all of it, splitter withdrawn. */
    .sidebar.single > px-hierarchy { flex: 1; height: auto; }

    .workspace > px-dock { height: var(--px-dock); flex: 0 0 auto; min-height: 0; }

    [hidden] { display: none !important; }
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
        -webkit-tap-highlight-color: transparent;
    }

    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    [tabindex]:focus-visible {
        outline: 2px solid var(--px-accent);
        outline-offset: -1px;
    }

    /* An icon button: square, quiet until touched, always visible. */
    .ghost {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--px-hit);
        height: var(--px-hit);
        border-radius: var(--px-radius-sm);
        color: var(--px-text-dim);
        transition: background 90ms ease, color 90ms ease, opacity 90ms ease;
    }

    .ghost:hover { background: var(--px-bg-3); color: var(--px-text-strong); }
    .ghost:active { background: var(--px-bg-4); }
    .ghost.on { color: var(--px-accent); }
    .ghost[disabled] { opacity: 0.3; cursor: default; }
    .ghost[disabled]:hover { background: none; color: var(--px-text-dim); }

    input, select, textarea {
        font: inherit;
        color: var(--px-text-strong);
        background: var(--px-bg-0);
        border: 1px solid var(--px-line);
        border-radius: var(--px-radius-sm);
        padding: 0 6px;
        height: var(--px-control);
        min-width: 0;
        width: 100%;
    }

    input:hover, select:hover { border-color: var(--px-line-soft); }

    input:focus, select:focus {
        outline: none;
        border-color: var(--px-accent);
        box-shadow: 0 0 0 2px var(--px-accent-soft);
    }

    input::placeholder { color: var(--px-text-dim); }

    select {
        appearance: none;
        cursor: pointer;
        padding-right: 20px;
        background-image: linear-gradient(45deg, transparent 50%, var(--px-text-dim) 50%),
                          linear-gradient(135deg, var(--px-text-dim) 50%, transparent 50%);
        background-position: calc(100% - 11px) center, calc(100% - 7px) center;
        background-size: 4px 4px, 4px 4px;
        background-repeat: no-repeat;
    }

    /* A toggle, not a default checkbox. */
    input[type='checkbox'] {
        appearance: none;
        width: 28px;
        height: 16px;
        padding: 0;
        border-radius: 8px;
        background: var(--px-bg-3);
        border: 1px solid var(--px-line);
        position: relative;
        cursor: pointer;
        flex: 0 0 auto;
        transition: background 120ms ease;
    }

    input[type='checkbox']::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--px-text-dim);
        transition: transform 120ms ease, background 120ms ease;
    }

    input[type='checkbox']:checked { background: var(--px-accent); border-color: transparent; }
    input[type='checkbox']:checked::after { transform: translateX(12px); background: #fff; }

    input[type='color'] {
        padding: 2px;
        cursor: pointer;
        background: var(--px-bg-0);
    }

    input[type='color']::-webkit-color-swatch-wrapper { padding: 0; }
    input[type='color']::-webkit-color-swatch { border: none; border-radius: 2px; }

    input[type='range'] {
        appearance: none;
        height: var(--px-control);
        padding: 0;
        background: none;
        border: 0;
        cursor: pointer;
    }

    input[type='range']::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 2px;
        background: var(--px-bg-3);
    }

    input[type='range']::-webkit-slider-thumb {
        appearance: none;
        width: 12px;
        height: 12px;
        margin-top: -4px;
        border-radius: 50%;
        background: var(--px-accent);
        border: 2px solid var(--px-bg-1);
    }

    input[type='range']::-moz-range-track { height: 4px; border-radius: 2px; background: var(--px-bg-3); }
    input[type='range']::-moz-range-thumb {
        width: 12px; height: 12px; border-radius: 50%;
        background: var(--px-accent); border: 2px solid var(--px-bg-1);
    }

    .icon {
        display: inline-flex;
        flex: 0 0 auto;
        line-height: 0;
        color: currentColor;
    }

    .muted { color: var(--px-text-dim); }

    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
        background: var(--px-bg-3);
        border: 3px solid transparent;
        background-clip: content-box;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover { background-color: var(--px-bg-4); background-clip: content-box; }
    ::-webkit-scrollbar-corner { background: transparent; }
`);

/** The sheet every Editor element adopts, on top of its own. */
export const baseStyles = base;

/** Install the document-level tokens and shell layout. Safe to call more than once. */
export function installDocumentStyles() {
    if (!document.adoptedStyleSheets.includes(tokens)) {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, tokens];
    }
}
