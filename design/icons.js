// Icon set for the design prototype.
//
// The 24 glyphs of `src/editor/ui/icons.js` are reused verbatim (same 16-unit grid, same
// stroke weight) so the comparison is about the design directions and not about a new
// icon set. A handful of glyphs the prototype needs and the Editor does not ship yet
// (play, pause, stop, light, share, …) are drawn to the same rules.
//
// PROTOTYPE ONLY — `src/editor/ui/icons.js` is untouched.

const S = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

export const PATHS = {
    // --- Reused from src/editor/ui/icons.js ---------------------------------
    object: `<path d="M3 5.5V3.5h2M11 3.5h2v2M13 10.5v2h-2M5 12.5H3v-2" ${S}/>`
        + `<circle cx="8" cy="8" r="1.35" ${F}/>`,
    rectangle: `<rect x="2.5" y="4" width="11" height="8" rx="1" ${S}/>`,
    circle: `<circle cx="8" cy="8" r="5" ${S}/>`,
    camera: `<path d="M1.5 5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1z" ${S}/>`
        + `<path d="M9.5 8 14 5.5v5L9.5 10.5z" ${S}/>`,
    sprite: `<rect x="2.5" y="3.5" width="11" height="9" rx="1" ${S}/>`
        + `<path d="M2.7 10.5 6 7.5l2.4 2.2L10.4 8l2.9 2.6" ${S}/>`
        + `<circle cx="5.6" cy="6.1" r="0.9" ${F}/>`,
    particles: `<circle cx="4" cy="11.5" r="1.5" ${F}/><circle cx="8.2" cy="7.6" r="1.1" ${F}/>`
        + `<circle cx="12" cy="4.2" r="0.9" ${F}/><circle cx="11.6" cy="9.6" r="0.7" ${F}/>`
        + `<circle cx="6.4" cy="4.4" r="0.7" ${F}/>`,
    tilemap: `<rect x="2.5" y="2.5" width="11" height="11" rx="1" ${S}/>`
        + `<path d="M6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" ${S}/>`,
    component: `<path d="M8 1.8 13.7 5v6L8 14.2 2.3 11V5z" ${S}/><path d="M2.3 5 8 8.2 13.7 5" ${S}/>`
        + `<path d="M8 8.2v6" ${S}/>`,
    hierarchy: `<path d="M3 3.5h4M3 3.5v9h3M6 8h4" ${S}/><path d="M6 3.5v4.5" ${S}/>`
        + `<path d="M10 2.2h3.2v2.6H10zM10 6.7h3.2v2.6H10zM10 11.2h3.2v2.6H10z" ${S}/>`
        + `<path d="M6 12.5h4" ${S}/>`,
    inspector: `<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" ${S}/>`
        + `<circle cx="6" cy="4.5" r="1.7" ${S}/><circle cx="10.5" cy="8" r="1.7" ${S}/>`
        + `<circle cx="5" cy="11.5" r="1.7" ${S}/>`,
    folder: `<path d="M1.8 12.2V4.3a.8.8 0 0 1 .8-.8h3l1.5 1.8h6.1a.8.8 0 0 1 .8.8v6.1a.8.8 0 0 1-.8.8H2.6a.8.8 0 0 1-.8-.8z" ${S}/>`,
    timeline: `<path d="M1.8 8h12.4" ${S}/><path d="M2 3.5v2.2M14 3.5v2.2" ${S}/>`
        + `<path d="M5.4 6.4 7 8l-1.6 1.6L3.8 8zM11.4 6.4 13 8l-1.6 1.6L9.8 8z" ${S}/>`,
    chevron: `<path d="M6 4l4 4-4 4" ${S}/>`,
    plus: `<path d="M8 3.5v9M3.5 8h9" ${S}/>`,
    minus: `<path d="M3.5 8h9" ${S}/>`,
    trash: `<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" ${S}/>`,
    close: `<path d="M4 4l8 8M12 4l-8 8" ${S}/>`,
    search: `<circle cx="7.2" cy="7.2" r="4.2" ${S}/><path d="M10.4 10.4 13.5 13.5" ${S}/>`,
    focus: `<path d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" ${S}/>`
        + `<circle cx="8" cy="8" r="2" ${S}/>`,
    grid: `<path d="M2 6h12M2 10h12M6 2v12M10 2v12" ${S}/>`,
    eye: `<path d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8z" ${S}/>`
        + `<circle cx="8" cy="8" r="1.8" ${S}/>`,
    'eye-off': `<path d="M6.3 4.1A6.8 6.8 0 0 1 8 3.8c4 0 6.5 4.2 6.5 4.2a12.4 12.4 0 0 1-2 2.4" ${S}/>`
        + `<path d="M3.7 5.2A12.2 12.2 0 0 0 1.5 8S4 12.2 8 12.2a6.7 6.7 0 0 0 2.2-.4" ${S}/>`
        + `<path d="M2.8 2.8l10.4 10.4" ${S}/>`,
    lock: `<rect x="3.5" y="7" width="9" height="6.2" rx="1.2" ${S}/>`
        + `<path d="M5.8 7V5.3a2.2 2.2 0 0 1 4.4 0V7" ${S}/>`,
    unlock: `<rect x="3.5" y="7" width="9" height="6.2" rx="1.2" ${S}/>`
        + `<path d="M5.8 7V5.3a2.2 2.2 0 0 1 4.2-.8" ${S}/>`,

    // --- New, drawn to the same rules --------------------------------------
    play: `<path d="M4.5 3.2 12.8 8l-8.3 4.8z" ${F}/>`,
    pause: `<path d="M5 3.4h2.1v9.2H5zM8.9 3.4H11v9.2H8.9z" ${F}/>`,
    stop: `<rect x="4.2" y="4.2" width="7.6" height="7.6" rx="0.6" ${F}/>`,
    step: `<path d="M4.5 3.4 10.4 8l-5.9 4.6z" ${F}/><path d="M11.6 3.4h1.5v9.2h-1.5z" ${F}/>`,
    light: `<path d="M8 1.9v1.6M8 12.9v1.2M2.4 8h1.5M12.1 8h1.5M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" ${S}/>`
        + `<circle cx="8" cy="8" r="2.6" ${S}/>`,
    audio: `<path d="M3 6.2h2.3L8.4 3.6v8.8L5.3 9.8H3z" ${S}/>`
        + `<path d="M10.6 6.1a2.8 2.8 0 0 1 0 3.8M12.4 4.5a5.2 5.2 0 0 1 0 7" ${S}/>`,
    script: `<path d="M4 2.5h5.4L12.4 5.6v7.9H4z" ${S}/><path d="M9.2 2.6v3.1h3.1" ${S}/>`
        + `<path d="M6 8.4h4.2M6 10.6h3" ${S}/>`,
    graph: `<circle cx="4" cy="4.5" r="1.8" ${S}/><circle cx="12" cy="7.6" r="1.8" ${S}/>`
        + `<circle cx="5.2" cy="12" r="1.8" ${S}/><path d="M5.7 5.3 10.3 7M10.7 9 6.6 10.9" ${S}/>`,
    physics: `<circle cx="8" cy="8" r="2" ${F}/>`
        + `<ellipse cx="8" cy="8" rx="6.2" ry="2.6" ${S}/>`
        + `<ellipse cx="8" cy="8" rx="6.2" ry="2.6" transform="rotate(60 8 8)" ${S}/>`,
    share: `<circle cx="12" cy="4" r="1.9" ${S}/><circle cx="4" cy="8" r="1.9" ${S}/>`
        + `<circle cx="12" cy="12" r="1.9" ${S}/><path d="M5.7 7.1 10.3 4.9M5.7 8.9l4.6 2.2" ${S}/>`,
    more: `<circle cx="3.6" cy="8" r="1.2" ${F}/><circle cx="8" cy="8" r="1.2" ${F}/>`
        + `<circle cx="12.4" cy="8" r="1.2" ${F}/>`,
    layers: `<path d="M8 2.2 14 5.4 8 8.6 2 5.4z" ${S}/><path d="m2 8.6 6 3.2 6-3.2" ${S}/>`
        + `<path d="m2 11.4 6 3.2 6-3.2" ${S}/>`,
    drag: `<circle cx="6" cy="4" r="1.05" ${F}/><circle cx="10" cy="4" r="1.05" ${F}/>`
        + `<circle cx="6" cy="8" r="1.05" ${F}/><circle cx="10" cy="8" r="1.05" ${F}/>`
        + `<circle cx="6" cy="12" r="1.05" ${F}/><circle cx="10" cy="12" r="1.05" ${F}/>`,
    check: `<path d="M3.2 8.4 6.4 11.6 12.8 4.8" ${S}/>`,
    ruler: `<rect x="1.6" y="5.4" width="12.8" height="5.2" rx="0.8" ${S}/>`
        + `<path d="M4.4 5.4v2M7 5.4v3M9.6 5.4v2M12.2 5.4v3" ${S}/>`,
    magnet: `<path d="M4 12.5V6.4a4 4 0 0 1 8 0v6.1" ${S}/><path d="M4 9.4h3.4M12 9.4H8.6" ${S}/>`,
    frame: `<path d="M2.4 5.6v-3.2h3.2M13.6 5.6v-3.2h-3.2M2.4 10.4v3.2h3.2M13.6 10.4v3.2h-3.2" ${S}/>`
};

/**
 * Build an icon element.
 * @param {string} name - One of the keys of PATHS
 * @param {number} [size] - Edge length in pixels; 16 and 20 keep the grid aligned
 * @returns {HTMLElement} A span holding the SVG
 */
export function icon(name, size = 16) {
    const span = document.createElement('span');
    span.className = 'ic';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 16 16" width="${size}" height="${size}">${PATHS[name] ?? PATHS.object}</svg>`;
    return span;
}

/**
 * The product mark — a real 16x16 pixel sprite, not a rounded square.
 *
 * Drawn as hard 1-unit cells with `shape-rendering: crispEdges`, which is the one place
 * the identity is literally made of pixels.
 *
 * @param {number} [size] - Edge length in pixels; use multiples of 16 to stay crisp
 * @returns {HTMLElement} A span holding the SVG
 */
export function mark(size = 18) {
    // 16x16, two tones: the accent body and a lighter highlight.
    const body = [
        '0011111111111100',
        '0111111111111110',
        '1111111111111111',
        '1112222222211111',
        '1112111111211111',
        '1112111111211111',
        '1112222222211111',
        '1112111111111111',
        '1112111111111111',
        '1111111111111111',
        '1111111133111111',
        '1111111133111111',
        '1111111111111111',
        '1111111111111111',
        '0111111111111110',
        '0011111111111100'
    ];
    const cells = [];
    body.forEach((line, y) => {
        [...line].forEach((value, x) => {
            if (value === '0') return;
            const fill = value === '1' ? 'var(--mark-body)'
                : value === '2' ? 'var(--mark-face)'
                    : 'var(--mark-dot)';
            cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`);
        });
    });

    const span = document.createElement('span');
    span.className = 'mark';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 16 16" width="${size}" height="${size}" `
        + `shape-rendering="crispEdges">${cells.join('')}</svg>`;
    return span;
}
