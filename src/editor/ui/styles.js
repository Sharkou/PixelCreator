// The Editor's visual language: MODERN PIXEL.
//
// Two sheets, as before. Tokens live on `:root` in a document-level sheet, because custom
// properties cross shadow boundaries and nothing else does. A shadow root then adopts
// `base`, which is the handful of rules every window would otherwise repeat. That is the
// answer to Legacy's thirty global stylesheets: two shared sheets, plus one
// `static styles` per element, scoped by its shadow root and impossible to leak out of.
//
// WHAT CHANGED, AND WHY IT HAD TO. The previous version of this file said the palette
// "continues Legacy's … this is a modernisation, not a rebrand". That decision is
// reversed: the greys are cooler and more chromatic, and the accent is a warm coral
// instead of the blue every IDE already uses. Pixel Creator now looks like itself.
//
// TOKENS HAVE ROLES, NOT NUMBERS. `--px-bg-3` said where a colour sat in a ramp;
// `--px-surface-hover` says what it is for. A role can be retuned once and every control
// follows, and a reviewer can tell a wrong usage from a right one — neither is possible
// with a numbered ramp.
//
// THE PIXEL IS A GRAMMAR, NOT A SKIN. Nothing here is bitmap, retro or decorative: the
// chrome is vector, quiet and compact. The pixel moments — the mark, the selection
// handles, the cursor, the ruler graduations, the transparency checker — belong to the
// viewport and the shell and arrive with those files. Adding them here, with no
// consumer, would be decoration.
//
// SURFACES, NOT SHADOWS. Depth is a step in the surface ramp. There is deliberately no
// elevation token: the only two shadows left in the Editor live in `menu.js` and in the
// shell's narrow-mode drawer, and each gets one when its own file is rebuilt.
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
        /* ─── Surfaces ────────────────────────────────────────────────────
           A ramp of five, read as depth: the app floor, a panel, a header,
           a popover, and the well a value is typed into. Cool and desaturated
           so the coral is the only warm thing on screen. */
        --px-background: #16171b;
        --px-surface: #1b1d22;
        --px-surface-raised: #21242a;
        --px-surface-overlay: #262a32;
        --px-surface-input: #101216;

        /* Interaction states of a surface. Not ramp positions: a control that
           lightens on hover uses these two and nothing else. */
        --px-surface-hover: #2a2e36;
        --px-surface-active: #343943;

        /* ─── Borders ─────────────────────────────────────────────────────
           border separates structure and is nearly black, so a seam reads as
           a seam at any zoom. border-subtle divides content inside one
           surface. There is no third. */
        --px-border: #0e0f12;
        --px-border-subtle: #2b2f37;

        /* ─── Text ────────────────────────────────────────────────────────
           Four levels, in descending emphasis. text is the default.
           Measured against --px-surface: strong 15.0:1, text 10.0:1,
           muted 6.0:1, dim 4.6:1 — the dimmest level clears 4.5:1, because a
           label a creator has to lean in to read is not compact, it is broken.
           On --px-surface-raised, dim falls to 4.2:1: a panel title on a header
           belongs to --px-text-muted, and moves there as each window is
           rebuilt. */
        --px-text-strong: #f0f2f6;
        --px-text: #c3c7d1;
        --px-text-muted: #949aa8;
        --px-text-dim: #7e8595;

        /* ─── Accent ──────────────────────────────────────────────────────
           One accent, with its own states. accent-muted tints a selected row,
           accent-border outlines a focused control — neither is a second
           colour. */
        --px-accent: #ff7a45;
        --px-accent-hover: #ff9366;
        --px-accent-active: #e8632f;
        --px-accent-muted: rgba(255, 122, 69, 0.14);
        --px-accent-border: rgba(255, 122, 69, 0.5);

        /* ─── Status ──────────────────────────────────────────────────────
           Meaning, never decoration. success is Play, danger is a destructive
           control, warning is a runtime report. */
        --px-success: #3dd68c;
        --px-danger: #f0555c;
        --px-warning: #f5b544;

        /* ─── Type ────────────────────────────────────────────────────────
           A system sans for the interface. A mono for values only: numbers,
           the ruler, the zoom readout, coordinates — anything a creator reads
           digit by digit, so columns line up and a scrubbed value does not
           jitter as its digits change width. No bitmap face, ever: it exists
           at whole sizes only and breaks at fractional DPI. */
        --px-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, sans-serif;
        --px-font-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace;

        --px-text-2xs: 10px;   /* section headings, units, micro labels */
        --px-text-xs: 11px;    /* secondary labels, tabs */
        --px-text-sm: 12px;    /* the base size of the interface */
        --px-text-md: 13px;    /* panel titles, the inspected object's name */

        --px-leading-tight: 1.2;
        --px-leading: 1.45;

        --px-weight-normal: 400;
        --px-weight-medium: 500;
        --px-weight-bold: 600;

        --px-tracking-caps: 0.6px;

        /* ─── Space ───────────────────────────────────────────────────────
           Multiples of 4. --px-space-0 is the one documented half step, for
           the gap between an icon and its label where 4 is already too much. */
        --px-space-0: 2px;
        --px-space-1: 4px;
        --px-space-2: 8px;
        --px-space-3: 12px;
        --px-space-4: 16px;
        --px-space-6: 24px;
        --px-space-8: 32px;

        /* ─── Density ─────────────────────────────────────────────────────
           These are what touch changes; everything else follows. A control is
           22 tall and its hit area is 28 — the visual box stays compact while
           the target stays reachable, which is why the two are separate. */
        --px-row: 26px;
        --px-control: 22px;
        --px-hit: 28px;
        --px-grip: 8px;

        /* Icons exist at two sizes and nowhere in between (ui/icons.js). */
        --px-icon: 16px;
        --px-icon-lg: 20px;

        /* ─── Radius ──────────────────────────────────────────────────────
           Barely rounded. A 4 px corner reads as care; an 8 px corner reads
           as a web app. */
        --px-radius-sm: 3px;
        --px-radius: 4px;
        --px-radius-lg: 6px;

        /* ─── Motion ──────────────────────────────────────────────────────
           Short, and on colour only. Nothing in this Editor animates its
           position: a panel that slides is a panel you wait for. */
        --px-ease: cubic-bezier(0.2, 0, 0.2, 1);
        --px-duration-fast: 90ms;
        --px-duration: 140ms;

        /* ─── Layers ──────────────────────────────────────────────────────
           Named, so a new overlay is placed by meaning instead of by picking
           a number larger than the last one someone picked. */
        --px-z-content: 1;
        --px-z-splitter: 10;
        --px-z-drawer: 20;
        --px-z-overlay: 100;
        --px-z-drag: 200;

        /* ─── Layout, written by layout.js ────────────────────────────── */
        --px-toolbar: 44px;
        --px-right: 304px;
        --px-hierarchy: 250px;
        --px-dock: 200px;

        /* ─── Compatibility ───────────────────────────────────────────────
           TEMPORARY. The windows still name colours by ramp position; each
           alias disappears when its window is rebuilt, and this block is
           empty at the end of the phase. Nothing new may use these. */
        --px-bg-0: var(--px-surface-input);
        --px-bg-1: var(--px-surface);
        --px-bg-2: var(--px-surface-raised);
        --px-bg-3: var(--px-surface-hover);
        --px-bg-4: var(--px-surface-active);
        --px-line: var(--px-border);
        --px-line-soft: var(--px-border-subtle);
        --px-accent-soft: var(--px-accent-muted);
        --px-accent-line: var(--px-accent-border);
        --px-font: var(--px-font-sans);
        --px-mono: var(--px-font-mono);

        color-scheme: dark;
    }

    @media (pointer: coarse) {
        :root {
            --px-row: 34px;
            --px-control: 30px;
            --px-hit: 34px;
            --px-grip: 14px;
            /* Icon sizes do not grow: a finger needs a bigger target, not a
               bigger glyph. */
        }
    }

    * {
        box-sizing: border-box;
        /* Firefox has no ::-webkit-scrollbar. scrollbar-color inherits, but
           scrollbar-width does NOT, so it has to reach every element that could
           become a scroller rather than sit on :root alone. */
        scrollbar-width: thin;
        scrollbar-color: var(--px-surface-hover) transparent;
    }

    html, body {
        height: 100%;
        margin: 0;
        overflow: hidden;
        overscroll-behavior: none;
        background: var(--px-background);
        color: var(--px-text);
        font-family: var(--px-font-sans);
        font-size: var(--px-text-sm);
        line-height: var(--px-leading);
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
    /* A DOCUMENT RULE DOES NOT CROSS A SHADOW BOUNDARY. The tokens sheet says
       \`* { box-sizing: border-box }\` and that governs the document only, so every control
       inside every shadow root was laying out as content-box: a field declared
       --px-control (22px) with a 1px border rendered 24, and every density token in this
       file was quietly two pixels off wherever it was actually used. Restating it here is
       what makes the tokens mean what they say. */
    *, *::before, *::after { box-sizing: border-box; }

    :host {
        box-sizing: border-box;
        display: block;
        font-family: var(--px-font-sans);
        font-size: var(--px-text-sm);
        line-height: var(--px-leading);
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

    /* An icon button. The visible square is control-sized so it fits a 26 px row; the
       pressable area is hit-sized and reaches past it, invisibly. Separating the two is
       what lets the Editor be compact without shrinking the target. */
    .ghost {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--px-control);
        height: var(--px-control);
        border-radius: var(--px-radius-sm);
        color: var(--px-text-muted);
        transition: background var(--px-duration-fast) var(--px-ease),
                    color var(--px-duration-fast) var(--px-ease),
                    opacity var(--px-duration-fast) var(--px-ease);
    }

    .ghost::after {
        content: '';
        position: absolute;
        inset: calc((var(--px-control) - var(--px-hit)) / 2);
    }

    .ghost:hover { background: var(--px-surface-hover); color: var(--px-text-strong); }
    .ghost:active { background: var(--px-surface-active); }
    .ghost.on { color: var(--px-accent); }
    .ghost[disabled] { opacity: 0.35; cursor: default; }
    .ghost[disabled]:hover { background: none; color: var(--px-text-muted); }

    input, select, textarea {
        font: inherit;
        color: var(--px-text-strong);
        background: var(--px-surface-input);
        border: 1px solid var(--px-border);
        border-radius: var(--px-radius-sm);
        padding: 0 var(--px-space-2);
        height: var(--px-control);
        min-width: 0;
        width: 100%;
        transition: border-color var(--px-duration-fast) var(--px-ease),
                    box-shadow var(--px-duration-fast) var(--px-ease);
    }

    input:hover, select:hover { border-color: var(--px-border-subtle); }

    input:focus, select:focus {
        outline: none;
        border-color: var(--px-accent);
        box-shadow: 0 0 0 2px var(--px-accent-muted);
    }

    input::placeholder { color: var(--px-text-dim); }

    /* Values are read digit by digit, so they are set in the mono face with fixed-width
       figures: a column of numbers lines up, and a scrubbed value does not shift as its
       digits change. The inputmode attribute is how a numeric control already announces
       itself, so px-number gets this without knowing about it. */
    input[inputmode='decimal'],
    input[inputmode='numeric'],
    input[type='number'],
    .mono {
        font-family: var(--px-font-mono);
        font-variant-numeric: tabular-nums;
    }

    select {
        appearance: none;
        cursor: pointer;
        padding-right: var(--px-space-4);
        background-image: linear-gradient(45deg, transparent 50%, var(--px-text-muted) 50%),
                          linear-gradient(135deg, var(--px-text-muted) 50%, transparent 50%);
        background-position: calc(100% - 11px) center, calc(100% - 7px) center;
        background-size: 4px 4px, 4px 4px;
        background-repeat: no-repeat;
    }

    /* One clear control, never two: the native cross duplicates the Editor's own. */
    input[type='search']::-webkit-search-cancel-button,
    input[type='search']::-webkit-search-decoration {
        -webkit-appearance: none;
        appearance: none;
        display: none;
    }

    /* A toggle, not a default checkbox. */
    input[type='checkbox'] {
        appearance: none;
        width: 26px;
        height: 15px;
        padding: 0;
        border-radius: 8px;
        background: var(--px-surface-hover);
        border: 1px solid var(--px-border);
        position: relative;
        cursor: pointer;
        flex: 0 0 auto;
        transition: background var(--px-duration) var(--px-ease);
    }

    input[type='checkbox']::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--px-text-dim);
        transition: transform var(--px-duration) var(--px-ease),
                    background var(--px-duration) var(--px-ease);
    }

    input[type='checkbox']:checked { background: var(--px-accent); border-color: transparent; }
    input[type='checkbox']:checked::after { transform: translateX(11px); background: #fff; }
    input[type='checkbox']:hover:not(:checked) { background: var(--px-surface-active); }

    input[type='color'] {
        padding: 2px;
        cursor: pointer;
        background: var(--px-surface-input);
    }

    input[type='color']::-webkit-color-swatch-wrapper { padding: 0; }
    input[type='color']::-webkit-color-swatch { border: none; border-radius: 2px; }

    input[type='range'] {
        appearance: none;
        height: var(--px-control);
        padding: 0;
        background: none;
        border: 0;
        box-shadow: none;
        cursor: pointer;
    }

    input[type='range']:hover, input[type='range']:focus { border: 0; box-shadow: none; }

    input[type='range']::-webkit-slider-runnable-track {
        height: 3px;
        border-radius: 2px;
        background: var(--px-surface-hover);
    }

    input[type='range']::-webkit-slider-thumb {
        appearance: none;
        width: 11px;
        height: 11px;
        margin-top: -4px;
        border-radius: 50%;
        background: var(--px-accent);
        border: 2px solid var(--px-surface);
    }

    input[type='range']::-moz-range-track { height: 3px; border-radius: 2px; background: var(--px-surface-hover); }
    input[type='range']::-moz-range-thumb {
        width: 11px; height: 11px; border-radius: 50%;
        background: var(--px-accent); border: 2px solid var(--px-surface);
    }

    /* The span carries the exact box (ui/icons.js writes it), so a glyph never depends on
       an intrinsic size, and the SVG is a block so it cannot sit on a text baseline —
       between them, that is why icons used to look a pixel high beside a label. */
    .icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        line-height: 0;
        color: currentColor;
    }

    .icon svg { display: block; }

    .muted { color: var(--px-text-muted); }
    .dim { color: var(--px-text-dim); }
    .strong { color: var(--px-text-strong); }

    /* Scrollbars: the current ones are a keeper, and Firefox now gets them too. It has no
       ::-webkit-scrollbar and reads these two instead — applied to every element, because
       scrollbar-width does not inherit and a shadow root does not see the document rule. */
    :host, * {
        scrollbar-width: thin;
        scrollbar-color: var(--px-surface-hover) transparent;
    }

    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
        background: var(--px-surface-hover);
        border: 3px solid transparent;
        background-clip: content-box;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover { background-color: var(--px-surface-active); background-clip: content-box; }
    ::-webkit-scrollbar-corner { background: transparent; }

    @media (prefers-reduced-motion: reduce) {
        * { transition-duration: 1ms !important; animation-duration: 1ms !important; }
    }
`);

/** The sheet every Editor element adopts, on top of its own. */
export const baseStyles = base;

/** Install the document-level tokens and shell layout. Safe to call more than once. */
export function installDocumentStyles() {
    if (!document.adoptedStyleSheets.includes(tokens)) {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, tokens];
    }
}
