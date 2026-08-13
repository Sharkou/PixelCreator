// Pixel Creator — design prototype (UX-2.5).
//
// THROWAWAY, and deliberately not built like production code. There is no model, no
// Property System, no binding: every value below is a literal, and the interactions exist
// only so the density, the affordances and the layout can be judged with a pointer rather
// than from a screenshot.
//
// The whole screen is rebuilt on every direction or layout change. That is the wrong
// architecture for an editor and the right one for a prototype: one code path, no stale
// state, instant A/B.
//
// Nothing in `src/` is imported except the icon shapes, which are copied into
// `design/icons.js` rather than referenced, so this folder can be deleted whole.

import { icon, mark } from './icons.js';

/* == helpers ============================================================== */

function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'style') node.style.cssText = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child);
    }
    return node;
}

/* == the fake project ===================================================== */

const TREE = [
    {
        id: 'player', name: 'Player', glyph: 'sprite', open: true, children: [
            { id: 'body', name: 'Body', glyph: 'rectangle' },
            { id: 'weapon', name: 'Weapon', glyph: 'sprite', lock: true }
        ]
    },
    {
        id: 'env', name: 'Environment', glyph: 'object', open: true, children: [
            { id: 'tree', name: 'Tree', glyph: 'sprite' },
            { id: 'rock', name: 'Rock', glyph: 'circle', visible: false }
        ]
    },
    { id: 'camera', name: 'Camera', glyph: 'camera' }
];

const ADD_COMPONENT = [
    {
        category: 'Rendering', items: [
            { name: 'Rectangle', glyph: 'rectangle', note: 'shape' },
            { name: 'Sprite', glyph: 'sprite', note: 'image' },
            { name: 'Particles', glyph: 'particles', note: 'fx' },
            { name: 'Tilemap', glyph: 'tilemap', note: 'grid' }
        ]
    },
    {
        category: 'Scene', items: [
            { name: 'Camera', glyph: 'camera', note: 'lens' },
            { name: 'Light', glyph: 'light', note: 'fx' }
        ]
    },
    {
        category: 'Physics', items: [
            { name: 'Rigidbody', glyph: 'physics', note: 'body' },
            { name: 'Collider', glyph: 'frame', note: 'shape' }
        ]
    },
    {
        category: 'Behaviour', items: [
            { name: 'Behavior Graph', glyph: 'graph', note: '.px' },
            { name: 'Script', glyph: 'script', note: '.js' }
        ]
    }
];

const CREATE_OBJECT = [
    {
        category: 'Basic', items: [
            { name: 'Empty', glyph: 'object', note: '' },
            { name: 'Rectangle', glyph: 'rectangle', note: '' },
            { name: 'Circle', glyph: 'circle', note: '' }
        ]
    },
    {
        category: 'Rendering', items: [
            { name: 'Sprite', glyph: 'sprite', note: '' },
            { name: 'Particles', glyph: 'particles', note: '' },
            { name: 'Tilemap', glyph: 'tilemap', note: '' }
        ]
    },
    {
        category: 'Scene', items: [
            { name: 'Camera', glyph: 'camera', note: '' },
            { name: 'Light', glyph: 'light', note: '' }
        ]
    }
];

const ASSETS = [
    { name: 'player.png', glyph: 'sprite', art: 'linear-gradient(140deg,#ff9366,#c0392b)' },
    { name: 'tiles.png', glyph: 'tilemap', art: 'repeating-linear-gradient(45deg,#3d6b4a 0 6px,#2f5540 6px 12px)' },
    { name: 'enemy.png', glyph: 'sprite', art: 'linear-gradient(140deg,#8b7bff,#4b3fa8)' },
    { name: 'jump.wav', glyph: 'audio', art: null },
    { name: 'walk.px', glyph: 'graph', art: null },
    { name: 'arena.scene', glyph: 'layers', art: null },
    { name: 'ui.png', glyph: 'sprite', art: 'linear-gradient(140deg,#4bd6a8,#1c7c5e)' },
    { name: 'hit.wav', glyph: 'audio', art: null }
];

/** Everything the mock remembers between rebuilds. */
const state = {
    direction: 'A',
    layout: 'L2',
    timeline: true,
    selected: 'player',
    open: new Set(['player', 'env']),
    lock: new Set(['weapon']),
    hiddenObjects: new Set(['rock']),
    sections: { object: true, transform: true, rect: true },
    rectActive: true,
    values: { x: 120, y: 64, rot: 45, sx: 1, sy: 1, w: 128, h: 96, alpha: 80, layer: 2 },
    fill: true,
    active: true,
    tab: 'project',
    assetQuery: '',
    hierarchySearch: false
};

/* == titlebar ============================================================= */

function titlebar() {
    const dir = state.direction;

    const brand = el('div', { class: 'brand' },
        mark(dir === 'C' ? 16 : 18),
        el('span', { class: 'product', textContent: 'Pixel Creator' })
    );

    const crumb = el('div', { class: 'crumb' },
        el('span', { class: 'sep', textContent: '/' }),
        el('span', { textContent: 'Medieval Arena' }),
        el('span', { class: 'sep', textContent: '/' }),
        el('span', { class: 'scene-name', textContent: 'Arena 01' })
    );

    const transport = el('div', { class: 'transport' },
        el('button', { class: 'primary', title: 'Play' }, icon('play', 13)),
        el('button', { title: 'Pause', disabled: true }, icon('pause', 13)),
        el('button', { title: 'Stop', disabled: true }, icon('stop', 12))
    );

    const actions = el('div', { class: 'tb-actions' },
        dir === 'C' ? el('div', { class: 'kbar' },
            icon('search', 12),
            el('span', { textContent: 'Search anything' }),
            el('kbd', { textContent: 'Ctrl K' })
        ) : null,
        el('button', { class: 'iconbtn on', title: 'Hierarchy' }, icon('hierarchy', 15)),
        el('button', { class: 'iconbtn on', title: 'Inspector' }, icon('inspector', 15)),
        el('button', {
            class: `iconbtn${state.timeline ? ' on' : ''}`,
            title: 'Timeline',
            onclick: () => { state.timeline = !state.timeline; render(); }
        }, icon('timeline', 15)),
        el('span', { style: 'width:6px' }),
        el('button', { class: 'iconbtn', title: 'Share' }, icon('share', 15)),
        el('div', { class: 'avatar' })
    );

    return el('div', { class: 'titlebar' },
        brand,
        dir === 'C' ? null : crumb,
        el('div', { class: 'spacer' }),
        transport,
        el('div', { class: 'spacer' }),
        dir === 'C' ? crumb : null,
        actions
    );
}

/* == panel shell ========================================================== */

function panel({ title, glyph, family, tools, header, body, plain, extraClass }) {
    return el('div', {
        class: `panel${extraClass ? ' ' + extraClass : ''}`,
        style: family ? `--family: var(--hue-${family})` : ''
    },
        el('div', { class: 'panel-head' },
            glyph ? icon(glyph, 15) : null,
            title ? el('h2', { textContent: title }) : null,
            header ? el('div', { class: 'head-slot' }, header) : null,
            el('div', { class: 'tools' }, tools ?? [])
        ),
        body
    );
}

/* == hierarchy ============================================================ */

function hierarchy() {
    const rows = [];
    const walk = (nodes, depth) => {
        for (const node of nodes) {
            rows.push(row(node, depth));
            if (node.children && state.open.has(node.id)) walk(node.children, depth + 1);
        }
    };
    walk(TREE, 0);

    const tree = el('div', { class: 'tree' }, rows);

    const input = el('input', {
        type: 'search',
        placeholder: 'Search objects',
        spellcheck: false,
        onkeydown: event => { if (event.key === 'Escape') closeSearch(); }
    });

    const bar = el('div', { class: `searchbar${state.hierarchySearch ? ' open' : ''}` },
        el('div', { class: 'inner' },
            el('div', { class: 'field' },
                icon('search', 13),
                input,
                el('button', {
                    class: 'iconbtn', title: 'Clear and close', onclick: () => closeSearch()
                }, icon('close', 12))
            )
        )
    );

    function closeSearch() {
        state.hierarchySearch = false;
        input.value = '';
        bar.classList.remove('open');
        magnifier.classList.remove('on');
    }

    const magnifier = el('button', {
        class: `iconbtn${state.hierarchySearch ? ' on' : ''}`,
        title: 'Search objects',
        onclick: () => {
            state.hierarchySearch = !state.hierarchySearch;
            bar.classList.toggle('open', state.hierarchySearch);
            magnifier.classList.toggle('on', state.hierarchySearch);
            if (state.hierarchySearch) setTimeout(() => input.focus(), 60);
            else input.value = '';
        }
    }, icon('search', 15));

    const create = el('button', {
        class: 'iconbtn', title: 'Create object',
        onclick: () => openMenu(create, CREATE_OBJECT, { search: false, label: 'Create object' })
    }, icon('plus', 15));

    return panel({
        title: 'Hierarchy',
        glyph: 'hierarchy',
        family: 'hierarchy',
        tools: [magnifier, create],
        body: el('div', { class: 'panel-body scroll' }, bar, tree)
    });
}

function row(node, depth) {
    const selected = state.selected === node.id;
    const locked = state.lock.has(node.id);
    const shown = !state.hiddenObjects.has(node.id);
    const hasChildren = Boolean(node.children?.length);
    const open = state.open.has(node.id);

    const twisty = el('span', {
        class: `twisty${hasChildren ? '' : ' leaf'}${open ? ' open' : ''}`,
        onclick: event => {
            event.stopPropagation();
            if (!hasChildren) return;
            if (open) state.open.delete(node.id); else state.open.add(node.id);
            render();
        }
    }, icon('chevron', 12));

    const stateButton = (title, glyph, on, toggle) => el('button', {
        class: `iconbtn${on ? ' on' : ''}`,
        title,
        onclick: event => { event.stopPropagation(); toggle(); render(); }
    }, icon(glyph, 13));

    return el('div', {
        class: `node${selected ? ' selected' : ''}${locked ? ' locked' : ''}${shown ? '' : ' hidden'}`,
        dataset: { depth: String(depth) },
        style: `padding-left:${6 + depth * 13}px`,
        onclick: () => { state.selected = node.id; render(); }
    },
        twisty,
        el('span', { class: 'glyph' }, icon(node.glyph, 14)),
        el('span', { class: 'nm', textContent: node.name }),
        el('div', { class: 'acts' },
            stateButton(locked ? 'Unlock' : 'Lock', locked ? 'lock' : 'unlock', locked,
                () => { if (locked) state.lock.delete(node.id); else state.lock.add(node.id); }),
            stateButton(shown ? 'Hide' : 'Show', shown ? 'eye' : 'eye-off', !shown,
                () => { if (shown) state.hiddenObjects.add(node.id); else state.hiddenObjects.delete(node.id); }),
            el('button', { class: 'iconbtn danger', title: 'Delete', onclick: event => event.stopPropagation() },
                icon('trash', 13))
        )
    );
}

/* == inspector ============================================================ */

function inspector() {
    const name = findNode(state.selected)?.name ?? 'Player';

    const addButton = el('button', { class: 'addbtn' }, icon('plus', 13),
        el('span', { textContent: 'Add Component' }));
    addButton.addEventListener('click', () => {
        addButton.classList.add('open');
        openMenu(addButton, ADD_COMPONENT, {
            search: true, label: 'Add component', onClose: () => addButton.classList.remove('open')
        });
    });

    return panel({
        title: 'Inspector',
        glyph: 'inspector',
        family: 'inspector',
        tools: [el('button', { class: 'iconbtn', title: 'More' }, icon('more', 15))],
        body: el('div', { class: 'panel-body scroll' },
            el('div', { class: 'identity' },
                el('span', { class: 'glyph' }, icon(findNode(state.selected)?.glyph ?? 'object', 17)),
                el('div', { class: 'who' },
                    el('b', { textContent: name }),
                    el('span', { textContent: '3 components · 2 children' })
                ),
                el('span', { class: 'pill', textContent: 'player' })
            ),
            section({
                key: 'object', label: 'Object', glyph: 'object', rows: [
                    propRow('Name', [el('input', { class: 'text-in', value: name, spellcheck: false })]),
                    propRow('Layer', [numberField({ value: state.values.layer, key: 'layer', integer: true })], { single: true }),
                    propRow('Active', [toggle(state.active, value => { state.active = value; })])
                ]
            }),
            section({
                key: 'transform', label: 'Transform', glyph: 'object', grip: true, rows: [
                    pairRow('Position', [
                        numberField({ prefix: 'X', value: state.values.x, key: 'x', integer: true }),
                        numberField({ prefix: 'Y', value: state.values.y, key: 'y', integer: true })
                    ]),
                    propRow('Rotation', [numberField({ value: state.values.rot, key: 'rot', unit: '°' })], { single: true }),
                    pairRow('Scale', [
                        numberField({ prefix: 'X', value: state.values.sx, key: 'sx', step: 0.1 }),
                        numberField({ prefix: 'Y', value: state.values.sy, key: 'sy', step: 0.1 })
                    ])
                ]
            }),
            section({
                key: 'rect',
                label: 'Rectangle Renderer',
                glyph: 'rectangle',
                grip: true,
                removable: true,
                off: !state.rectActive,
                rows: [
                    pairRow('Size', [
                        numberField({ prefix: 'W', value: state.values.w, key: 'w', integer: true }),
                        numberField({ prefix: 'H', value: state.values.h, key: 'h', integer: true })
                    ]),
                    propRow('Color', [colorField('#FF7A45')]),
                    propRow('Alpha', [sliderField(state.values.alpha)]),
                    propRow('Fill', [toggle(state.fill, value => { state.fill = value; })])
                ]
            }),
            addButton
        )
    });
}

function findNode(id, nodes = TREE) {
    for (const node of nodes) {
        if (node.id === id) return node;
        const found = node.children && findNode(id, node.children);
        if (found) return found;
    }
    return null;
}

function section({ key, label, glyph, rows, grip, removable, off }) {
    const open = state.sections[key] !== false;

    const head = el('div', { class: 'sect-head' },
        el('span', {
            class: `grip${grip ? '' : ' fixed'}`,
            title: grip ? 'Drag to reorder' : ''
        }, icon('drag', 12)),
        el('span', { class: 'caret' }, icon('chevron', 11)),
        el('span', { class: 'glyph' }, icon(glyph, 14)),
        el('span', { class: 'label', textContent: label }),
        el('div', { class: 'tools' },
            removable ? el('button', {
                class: `iconbtn${off ? ' on' : ''}`,
                title: off ? 'Enable' : 'Disable',
                onclick: event => { event.stopPropagation(); state.rectActive = !state.rectActive; render(); }
            }, icon(off ? 'eye-off' : 'eye', 13)) : null,
            removable ? el('button', { class: 'iconbtn danger', title: 'Remove' }, icon('close', 13)) : null
        )
    );

    head.addEventListener('click', () => {
        state.sections[key] = !open;
        render();
    });

    return el('div', { class: `sect${open ? ' open' : ''}${off ? ' off' : ''}` },
        head,
        el('div', { class: 'sect-body' }, rows)
    );
}

function propRow(label, fields, { single = false } = {}) {
    return el('div', { class: 'row' },
        el('label', { textContent: label }),
        el('div', { class: `fields${single ? ' single' : ''}` }, fields, single ? el('span') : null)
    );
}

function pairRow(label, fields) {
    return el('div', { class: 'row' },
        el('label', { textContent: label }),
        el('div', { class: 'fields pair' }, fields)
    );
}

/* == the numeric field ==================================================== */

function numberField({ prefix = null, value = 0, key = null, integer = false, step = 1, unit = null }) {
    const input = el('input', {
        type: 'text',
        inputMode: 'decimal',
        spellcheck: false,
        value: format(value)
    });

    const field = el('div', { class: 'num' });

    const commit = next => {
        const bounded = integer ? Math.round(next) : Math.round(next * 100) / 100;
        input.value = format(bounded);
        if (key) state.values[key] = bounded;
        syncViewport();
    };

    input.addEventListener('focus', () => field.classList.add('focused'));
    input.addEventListener('blur', () => field.classList.remove('focused'));
    input.addEventListener('keydown', event => {
        const factor = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowUp') { event.preventDefault(); commit(read() + step * factor); }
        if (event.key === 'ArrowDown') { event.preventDefault(); commit(read() - step * factor); }
    });
    input.addEventListener('input', () => { if (key && Number.isFinite(read())) { state.values[key] = read(); syncViewport(); } });

    const read = () => {
        const parsed = Number(input.value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    // Press and hold repeats — the behaviour the current px-number does not have.
    const stepper = direction => {
        const button = el('button', {
            class: direction > 0 ? 'up' : 'down',
            tabIndex: -1,
            title: direction > 0 ? 'Increase (hold to repeat)' : 'Decrease (hold to repeat)'
        }, el('i'));

        let timer = null;
        let repeat = null;
        const start = event => {
            event.preventDefault();
            button.classList.add('pressed');
            commit(read() + direction * step);
            timer = setTimeout(() => {
                repeat = setInterval(() => commit(read() + direction * step), 45);
            }, 320);
        };
        const stop = () => {
            button.classList.remove('pressed');
            clearTimeout(timer);
            clearInterval(repeat);
        };
        button.addEventListener('pointerdown', start);
        button.addEventListener('pointerup', stop);
        button.addEventListener('pointerleave', stop);
        button.addEventListener('pointercancel', stop);
        return button;
    };

    if (prefix) {
        const handle = el('span', { class: 'pre', textContent: prefix, title: `Drag to scrub ${prefix}` });
        let scrub = null;
        handle.addEventListener('pointerdown', event => {
            event.preventDefault();
            handle.setPointerCapture(event.pointerId);
            field.classList.add('scrubbing');
            scrub = { from: event.clientX, base: read() };
        });
        handle.addEventListener('pointermove', event => {
            if (!scrub) return;
            commit(scrub.base + Math.round((event.clientX - scrub.from) / 4) * step);
        });
        const end = () => { scrub = null; field.classList.remove('scrubbing'); };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
        field.append(handle);
    }

    field.append(input);
    if (unit) field.append(el('span', { class: 'unit', textContent: unit }));
    field.append(el('span', { class: 'step' }, stepper(1), stepper(-1)));

    return field;
}

function format(value) {
    return String(Number(Number(value).toPrecision(10)));
}

function toggle(on, onChange) {
    const node = el('button', { class: 'toggle', role: 'switch', 'aria-checked': String(on) });
    node.addEventListener('click', () => {
        const next = node.getAttribute('aria-checked') !== 'true';
        node.setAttribute('aria-checked', String(next));
        onChange?.(next);
    });
    return node;
}

function colorField(hex) {
    return el('div', { class: 'swatch' },
        el('span', { class: 'chip', style: `background:${hex}` }),
        el('code', { textContent: hex })
    );
}

function sliderField(percent) {
    const fill = el('div', { class: 'fill', style: `right:${100 - percent}%` });
    const knob = el('div', { class: 'knob', style: `left:${percent}%` });
    const amount = el('span', { class: 'amount', textContent: `${percent}%` });
    const track = el('div', { class: 'track' }, fill, knob);

    const set = event => {
        const rect = track.getBoundingClientRect();
        const value = Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100)));
        fill.style.right = `${100 - value}%`;
        knob.style.left = `${value}%`;
        amount.textContent = `${value}%`;
        state.values.alpha = value;
        syncViewport();
    };

    track.addEventListener('pointerdown', event => {
        track.setPointerCapture(event.pointerId);
        track.dataset.dragging = '1';
        set(event);
    });
    track.addEventListener('pointermove', event => { if (track.dataset.dragging) set(event); });
    track.addEventListener('pointerup', () => { delete track.dataset.dragging; });

    return el('div', { class: 'slider' }, track, amount);
}

/* == menus ================================================================ */

let openMenuNode = null;
let lastMenu = { anchor: null, at: 0 };

function openMenu(anchor, groups, { search = false, label = '', onClose = null } = {}) {
    closeMenu();

    // Clicking the open button again closes rather than reopens: the outside-pointerdown
    // has already fired by the time the click arrives.
    if (lastMenu.anchor === anchor && Date.now() - lastMenu.at < 250) {
        lastMenu = { anchor: null, at: 0 };
        onClose?.();
        return;
    }

    const list = el('div', { class: 'm-list' });
    const input = el('input', { type: 'text', placeholder: 'Filter…', spellcheck: false });

    const paint = query => {
        const needle = query.trim().toLowerCase();
        const nodes = [];
        for (const group of groups) {
            const items = group.items.filter(item => item.name.toLowerCase().includes(needle));
            if (items.length === 0) continue;
            nodes.push(el('div', { class: 'm-head', textContent: group.category }));
            for (const item of items) {
                nodes.push(el('button', { class: 'm-item', onclick: () => closeMenu() },
                    icon(item.glyph, 15),
                    el('span', { class: 'm-name', textContent: item.name }),
                    item.note ? el('span', { class: 'm-note', textContent: item.note }) : null
                ));
            }
        }
        if (nodes.length === 0) nodes.push(el('div', { class: 'm-empty', textContent: `Nothing matches “${query}”` }));
        list.replaceChildren(...nodes);
        list.querySelector('.m-item')?.classList.add('active');
    };

    input.addEventListener('input', () => paint(input.value));
    input.addEventListener('keydown', event => {
        const items = [...list.querySelectorAll('.m-item')];
        if (items.length === 0) return;
        const index = items.findIndex(item => item.classList.contains('active'));
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items.forEach(item => item.classList.remove('active'));
            items[next].classList.add('active');
            items[next].scrollIntoView({ block: 'nearest' });
        }
        if (event.key === 'Enter') { event.preventDefault(); closeMenu(); }
        if (event.key === 'Escape') closeMenu();
    });

    paint('');

    const menu = el('div', { class: 'menu' },
        search ? el('div', { class: 'm-search' }, icon('search', 13), input) : null,
        list,
        el('div', { class: 'm-foot' },
            el('span', {}, el('kbd', { textContent: '↑↓' })),
            el('span', { textContent: 'navigate' }),
            el('span', {}, el('kbd', { textContent: '↵' })),
            el('span', { textContent: label.toLowerCase() })
        )
    );

    // Inside `.app`, not on `document.body`: the tokens and the `data-dir` attribute live
    // on `.app`, so a body-mounted menu resolves none of its colours. `position: fixed`
    // still escapes the panel that opened it, because `.app` carries no transform.
    app.append(menu);
    place(menu, anchor);
    openMenuNode = { menu, onClose, anchor };
    if (search) setTimeout(() => input.focus(), 20);

    function outside(event) {
        // Only once the menu is actually on screen, so the click that opened it does not
        // close it on the way back up.
        if (!menu.isConnected) return;
        if (!menu.contains(event.target)) closeMenu();
    }
    menu._outside = outside;
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}

function closeMenu() {
    if (!openMenuNode) return;
    document.removeEventListener('pointerdown', openMenuNode.menu._outside, true);
    lastMenu = { anchor: openMenuNode.anchor, at: Date.now() };
    openMenuNode.menu.remove();
    openMenuNode.onClose?.();
    openMenuNode = null;
}

function place(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    requestAnimationFrame(() => {
        const own = menu.getBoundingClientRect();
        if (own.bottom > innerHeight - 10) menu.style.top = `${Math.max(10, rect.top - own.height - 4)}px`;
        if (own.right > innerWidth - 10) menu.style.left = `${Math.max(10, innerWidth - own.width - 10)}px`;
    });
}

/* == viewport ============================================================= */

const OBJECTS = [
    { id: 'ground', x: -280, y: 118, w: 620, h: 26, fill: '#2c3038' },
    { id: 'tree', x: -196, y: -18, w: 56, h: 136, fill: '#3d6b4a' },
    { id: 'rock', x: 232, y: 84, w: 44, h: 34, fill: '#4a4e58', round: true },
    { id: 'weapon', x: 214, y: -128, w: 72, h: 72, sprite: true },
    { id: 'player', x: 56, y: 16, w: 128, h: 96, fill: '#ff7a45', selected: true }
];

let viewportRefs = null;

function viewport() {
    const scene = el('div', { class: 'scene' });

    for (const object of OBJECTS) {
        const node = el('div', {
            class: `obj${object.sprite ? ' sprite' : ''}${object.selected ? ' sel' : ''}`,
            style: `left:calc(34% + ${object.x}px); top:calc(62% + ${object.y}px);`
                + `width:${object.w}px; height:${object.h}px;`,
            title: object.id
        }, el('div', {
            class: 'fillbox',
            style: object.fill
                ? `background:${object.fill};${object.round ? 'border-radius:50%;' : ''}`
                : ''
        }));
        scene.append(node);
    }

    // The selection, drawn as hard geometry — this is the pixel moment that matters most.
    const selbox = el('div', { class: 'selbox' },
        el('div', { class: 'pivot-h' }), el('div', { class: 'pivot-v' })
    );
    const handles = [
        [0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]
    ].map(([fx, fy], index) => el('div', {
        class: `handle${index === 4 ? ' hot' : ''}`,
        style: `left:${fx * 100}%; top:${fy * 100}%`
    }));
    selbox.append(...handles);

    const crossV = el('div', { class: 'crosshair-v' });
    const crossH = el('div', { class: 'crosshair-h' });
    const coordX = el('div', { class: 'coord' });
    const coordY = el('div', { class: 'coord' });

    const readout = el('div', { class: 'vp-readout' });

    const cursor = el('div', { class: 'px-cursor' });
    cursor.innerHTML = pixelCursor();

    const view = el('div', { class: 'viewport' },
        el('div', { class: 'vp-grid' }),
        el('div', { class: 'vp-axis-x' }),
        el('div', { class: 'vp-axis-y' }),
        scene,
        selbox,
        crossV, crossH, coordX, coordY,
        state.direction === 'C' ? null : cursor,
        el('div', { class: 'rulers' }, rulerTop(), rulerLeft()),
        el('div', { class: 'vp-badge' },
            icon('sprite', 13),
            el('b', { textContent: findNode(state.selected)?.name ?? 'Player' }),
            el('span', { textContent: '· move · drag a handle to resize' })
        ),
        readout,
        el('div', { class: 'vp-tools' },
            el('button', { class: 'iconbtn', title: 'Frame selection' }, icon('frame', 14)),
            el('button', { class: 'iconbtn', title: 'Snap to grid' }, icon('magnet', 14)),
            el('button', { class: 'iconbtn on', title: 'Rulers' }, icon('ruler', 14)),
            el('button', { class: 'iconbtn', title: 'Grid' }, icon('grid', 14))
        )
    );

    viewportRefs = { selbox, crossV, crossH, coordX, coordY, readout, cursor, scene };
    return view;
}

function rulerTop() {
    const strip = el('div', { class: 'ruler-t' });
    for (let i = -6; i <= 14; i++) {
        const major = i % 2 === 0;
        const left = `calc(34% + ${i * 64}px)`;
        strip.append(el('div', { class: `tick${major ? ' major' : ''}`, style: `left:${left}` }));
        if (major) strip.append(el('div', { class: 'lbl', style: `left:${left}`, textContent: `${i * 64}` }));
    }
    return strip;
}

function rulerLeft() {
    const strip = el('div', { class: 'ruler-l' });
    for (let i = -6; i <= 10; i++) {
        const major = i % 2 === 0;
        const top = `calc(62% + ${i * 64}px)`;
        strip.append(el('div', { class: `tick${major ? ' major' : ''}`, style: `top:${top}` }));
        if (major) strip.append(el('div', { class: 'lbl', style: `top:${top}`, textContent: `${i * 64}` }));
    }
    return strip;
}

function pixelCursor() {
    // A 12x19 arrow drawn on the pixel grid, never scaled — the cursor is the one piece
    // of chrome that is literally made of pixels in every direction that uses it.
    const rows = [
        '10000000', '11000000', '11100000', '11110000', '11111000', '11111100',
        '11111110', '11111111', '11111100', '11011100', '10001110', '10001110',
        '00000110'
    ];
    const cells = [];
    rows.forEach((line, y) => [...line].forEach((value, x) => {
        if (value === '1') cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }));
    return `<svg viewBox="0 0 8 13" width="12" height="19.5" shape-rendering="crispEdges">`
        + `<g fill="#000">${cells.map(c => c.replace('<rect ', '<rect ')).join('')}</g>`
        + `<g fill="#fff" transform="translate(0.6,0.6) scale(0.85)">${cells.join('')}</g></svg>`;
}

/** Keep the selection box, the crosshair and the readout in step with the Inspector. */
function syncViewport() {
    if (!viewportRefs) return;
    const { x, y, w, h } = state.values;
    const { selbox, crossV, crossH, coordX, coordY, readout, cursor } = viewportRefs;

    const left = x - w / 2;
    const top = y - h / 2;

    selbox.style.left = `calc(34% + ${left}px)`;
    selbox.style.top = `calc(62% + ${top}px)`;
    selbox.style.width = `${w}px`;
    selbox.style.height = `${h}px`;

    crossV.style.left = `calc(34% + ${x}px)`;
    crossH.style.top = `calc(62% + ${y}px)`;

    coordX.style.left = `calc(34% + ${x + 5}px)`;
    coordX.style.top = '22px';
    coordX.textContent = `${Math.round(x)} px`;

    coordY.style.top = `calc(62% + ${y + 5}px)`;
    coordY.style.left = '22px';
    coordY.textContent = `${Math.round(y)} px`;

    cursor.style.left = `calc(34% + ${x}px)`;
    cursor.style.top = `calc(62% + ${y}px)`;

    readout.replaceChildren(
        el('span', {}, 'X ', el('b', { textContent: `${Math.round(x)} px` })),
        el('span', {}, 'Y ', el('b', { textContent: `${Math.round(y)} px` })),
        el('span', {}, el('b', { textContent: `${Math.round(w)} × ${Math.round(h)} px` })),
        el('span', {}, 'Zoom ', el('b', { textContent: '100%' })),
        el('span', {}, 'Grid ', el('b', { textContent: '16 px' }))
    );

    const player = OBJECTS.find(object => object.id === 'player');
    const node = [...viewportRefs.scene.children].at(-1);
    if (player && node) {
        node.style.left = `calc(34% + ${left}px)`;
        node.style.top = `calc(62% + ${top}px)`;
        node.style.width = `${w}px`;
        node.style.height = `${h}px`;
        node.firstChild.style.opacity = String(state.values.alpha / 100);
    }
}

/* == project ============================================================== */

function project() {
    const grid = el('div', { class: 'assets' });
    const search = el('input', {
        class: 'text-in',
        type: 'search',
        placeholder: 'Search assets',
        spellcheck: false,
        value: state.assetQuery,
        oninput: event => { state.assetQuery = event.target.value; paint(); }
    });

    function paint() {
        const needle = state.assetQuery.trim().toLowerCase();
        const found = ASSETS.filter(asset => asset.name.toLowerCase().includes(needle));

        if (found.length === 0) {
            grid.className = '';
            grid.replaceChildren(el('div', { class: 'empty' },
                el('span', { class: 'glyph' }, icon('folder', 26)),
                el('strong', { textContent: 'No asset matches' }),
                el('span', { textContent: `Nothing in this project is called “${state.assetQuery.trim()}”.` })
            ));
            return;
        }

        grid.className = 'assets';
        grid.replaceChildren(...found.map((asset, index) => el('div', {
            class: `asset${index === 0 ? ' sel' : ''}`, title: asset.name
        },
            el('div', { class: 'thumb' },
                asset.art ? el('div', { class: 'art', style: `background:${asset.art}` }) : icon(asset.glyph, 20)
            ),
            el('div', { class: 'nm2', textContent: asset.name })
        )));
    }

    paint();

    const tabs = el('div', { class: 'tabs' }, ['project', 'prefabs'].map(id => el('button', {
        role: 'tab',
        'aria-selected': String(state.tab === id),
        onclick: () => { state.tab = id; render(); }
    },
        icon(id === 'project' ? 'folder' : 'component', 13),
        el('span', { textContent: id === 'project' ? 'Project' : 'Prefabs' })
    )));

    const body = state.tab === 'project'
        ? el('div', { class: 'panel-body scroll' }, grid)
        : el('div', { class: 'panel-body plain' }, el('div', { class: 'empty' },
            el('span', { class: 'glyph' }, icon(state.tab === 'prefabs' ? 'component' : 'script', 26)),
            el('strong', { textContent: state.tab === 'prefabs' ? 'No prefab yet' : 'No script yet' }),
            el('span', {
                textContent: state.tab === 'prefabs'
                    ? 'Drag an object from the Hierarchy here to make it reusable.'
                    : 'Create a Behavior Graph from Add Component.'
            })
        ));

    return panel({
        extraClass: 'project',
        family: 'project',
        header: tabs,
        tools: [
            el('button', {
                class: 'iconbtn', title: 'Search assets',
                onclick: () => search.focus()
            }, icon('search', 15)),
            el('button', { class: 'iconbtn', title: 'Import' }, icon('plus', 15))
        ],
        body: el('div', { class: 'panel-body scroll', style: 'display:flex; flex-direction:column' },
            el('div', { style: 'padding:6px 8px; flex:0 0 auto; display:flex; gap:6px' }, search),
            el('div', { style: 'flex:1; min-height:0; overflow:auto' }, body)
        )
    });
}

/* == timeline ============================================================= */

function timeline() {
    const tracks = el('div', { class: 'tl-tracks' },
        el('div', { class: 'tl-track head' }, icon('sprite', 13), el('span', { textContent: 'Player' })),
        el('div', { class: 'tl-track' }, icon('object', 13), el('span', { textContent: 'Transform.x' })),
        el('div', { class: 'tl-track' }, icon('object', 13), el('span', { textContent: 'Transform.y' })),
        el('div', { class: 'tl-track' }, icon('sprite', 13), el('span', { textContent: 'Sprite.frame' }))
    );

    const ruler = el('div', { class: 'tl-ruler' });
    for (let i = 0; i <= 10; i++) {
        ruler.append(el('div', { class: 't', style: `left:${i * 9}%`, textContent: `${i * 12}f` }));
    }

    const lane = keys => el('div', { class: 'tl-lane' },
        keys.map(([position, dim]) => el('div', {
            class: `tl-key${dim ? ' dim' : ''}`, style: `left:${position}%`
        }))
    );

    const grid = el('div', { class: 'tl-grid' },
        ruler,
        el('div', { style: 'height:24px' }),
        lane([[0], [27], [54, true], [81]]),
        lane([[0], [36], [72, true]]),
        lane([[0], [9], [18], [27], [36], [45]]),
        el('div', { class: 'tl-play', style: 'left:27%' })
    );

    return el('div', { class: 'timeline' }, panel({
        title: 'Timeline',
        glyph: 'timeline',
        family: 'timeline',
        tools: [
            el('button', { class: 'iconbtn', title: 'Add key' }, icon('plus', 15)),
            el('button', { class: 'iconbtn', title: 'Close', onclick: () => { state.timeline = false; render(); } },
                icon('close', 15))
        ],
        body: el('div', { class: 'panel-body plain' }, el('div', { class: 'tl-body' }, tracks, grid))
    }));
}

/* == splitters ============================================================ */

function splitter(axis, variable, invert = false, extra = '') {
    const node = el('div', { class: `split ${axis === 'x' ? 'v' : 'h'} ${extra}` });
    let start = 0;
    let from = 0;

    node.addEventListener('pointerdown', event => {
        node.setPointerCapture(event.pointerId);
        node.classList.add('dragging');
        start = axis === 'x' ? event.clientX : event.clientY;
        from = parseInt(getComputedStyle(app).getPropertyValue(variable), 10);
    });
    node.addEventListener('pointermove', event => {
        if (!node.classList.contains('dragging')) return;
        const position = axis === 'x' ? event.clientX : event.clientY;
        const travelled = (position - start) * (invert ? -1 : 1);
        app.style.setProperty(variable, `${Math.max(160, Math.min(560, from + travelled))}px`);
    });
    const end = () => node.classList.remove('dragging');
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    return node;
}

/* == assembly ============================================================= */

const stage = document.getElementById('stage');
let app = null;

function render() {
    closeMenu();

    const previous = app ? {
        left: app.style.getPropertyValue('--left'),
        right: app.style.getPropertyValue('--right'),
        dock: app.style.getPropertyValue('--dock'),
        tl: app.style.getPropertyValue('--tl')
    } : null;

    app = el('div', {
        class: `app${state.timeline && state.layout === 'L4' ? ' tl-on' : ''}`,
        dataset: { dir: state.direction, layout: state.layout }
    });
    for (const key of ['left', 'right', 'dock', 'tl']) {
        if (previous?.[key]) app.style.setProperty(`--${key}`, previous[key]);
    }

    const left = el('div', { class: 'col-left' },
        hierarchy(),
        splitter('y', '--dock'),
        el('div', { style: 'height:var(--dock); flex:0 0 auto; display:flex; min-height:0' }, project())
    );

    const centre = el('div', { class: 'col-center' }, viewport());

    const work = el('div', { class: 'work' },
        left,
        splitter('x', '--left'),
        centre
    );

    const stackChildren = [work];
    if (state.layout === 'L4') {
        stackChildren.push(splitter('y', '--tl', true, 'tl'), timeline());
    }

    const stack = el('div', { class: 'stack' }, stackChildren);

    app.append(
        titlebar(),
        el('div', { class: 'body' },
            stack,
            splitter('x', '--right', true),
            el('div', { class: 'col-right' }, inspector())
        )
    );

    stage.replaceChildren(app);
    paintNote();
    syncViewport();
    paintSwitches();
}

const NOTES = {
    A: {
        color: '#ff7a45',
        title: 'A — Modern Pixel',
        text: 'Chrome vectoriel et sobre, neutres froids, accent corail. Le pixel est réservé au logo, '
            + 'aux poignées, au curseur, aux graduations de ruler et au damier de transparence.'
    },
    B: {
        color: '#ff4d6d',
        title: 'B — Pixel Studio',
        text: 'Aucun rayon, arêtes dures, une couleur par famille de fenêtre, libellés en mono tracké, '
            + 'poignées façon sprite. Identité plus forte, contraintes de rendu plus fortes.'
    },
    C: {
        color: '#38bdf8',
        title: 'C — Minimal Game Dev',
        text: 'Pas de bordures, séparation par niveaux de surface, en-têtes qui apparaissent à '
            + 'l’approche, Play dominant, rulers masqués, viewport maximal.'
    }
};

function paintNote() {
    const note = NOTES[state.direction];
    const bar = document.getElementById('proto-note');
    if (!bar) return;
    bar.replaceChildren(
        el('span', { class: 'dot', style: `background:${note.color}` }),
        el('b', { textContent: note.title }),
        el('span', { textContent: '·' }),
        el('span', { textContent: note.text })
    );
}

/* == prototype chrome ===================================================== */

function paintSwitches() {
    for (const button of document.querySelectorAll('[data-dir-btn]')) {
        button.setAttribute('aria-pressed', String(button.dataset.dirBtn === state.direction));
    }
    for (const button of document.querySelectorAll('[data-layout-btn]')) {
        button.setAttribute('aria-pressed', String(button.dataset.layoutBtn === state.layout));
    }
    const tl = document.getElementById('tl-toggle');
    if (tl) {
        tl.checked = state.timeline;
        tl.parentElement.style.opacity = state.layout === 'L4' ? '1' : '0.35';
    }
}

document.addEventListener('click', event => {
    const dir = event.target.closest('[data-dir-btn]');
    if (dir) { state.direction = dir.dataset.dirBtn; render(); return; }
    const layout = event.target.closest('[data-layout-btn]');
    if (layout) { state.layout = layout.dataset.layoutBtn; render(); }
});

document.getElementById('tl-toggle').addEventListener('change', event => {
    state.timeline = event.target.checked;
    render();
});

document.addEventListener('keydown', event => {
    if (event.target.matches('input')) return;
    const keys = { 1: () => (state.direction = 'A'), 2: () => (state.direction = 'B'), 3: () => (state.direction = 'C'),
        4: () => (state.layout = 'L2'), 5: () => (state.layout = 'L4') };
    if (keys[event.key]) { keys[event.key](); render(); }
});

addEventListener('resize', () => syncViewport());

render();
