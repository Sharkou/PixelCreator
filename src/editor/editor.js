// The Editor, assembled.
//
// This file is the composition root and nothing else: it builds the model, the camera and
// the selection, arranges the windows, and binds the few shortcuts that belong to no
// single window. There is no application object holding state, because the state is the
// Scene — the Editor orchestrates, the Core is the truth (docs/ARCHITECTURE.md §5).
//
//   Editor UI  ->  Core (Scene / Object / Component)  ->  Runtime  ->  Renderer  ->  Viewport
//
// and never a parallel model beside it.
//
// SHORTCUTS ARE SHORTCUTS. Everything bound below also has a control you can reach with a
// finger: delete sits in the Hierarchy row, framing is a double-click, deselecting is a
// tap on empty space. A tablet must never hit a wall (docs/architecture/EDITOR.md).

import { Object, Scene, Transform, components } from '../core/mod.js';
import { Camera } from '../runtime/mod.js';
import { Selection } from './selection.js';
import { Layout } from './layout.js';
import { registerBuiltIns } from './registry.js';
import { deleteObject } from './commands.js';
import { fillStarterScene } from './project/starter.js';
import { installDocumentStyles, sheet } from './ui/styles.js';
import { el } from './ui/element.js';
import { icon } from './ui/icons.js';

import './ui/window.js';
import './ui/menu.js';
import './ui/field.js';
import './ui/splitter.js';
import './ui/tabs.js';
import './viewport/viewport.js';
import './windows/hierarchy.js';
import './windows/inspector.js';
import './windows/toolbar.js';
import './windows/dock.js';

/** Windows that can be shown or hidden, and the button that does it. */
const TOGGLES = [
    { panel: 'hierarchy', label: 'Hierarchy', icon: 'hierarchy' },
    { panel: 'inspector', label: 'Inspector', icon: 'inspector' },
    { panel: 'dock', label: 'Project & Timeline', icon: 'folder' }
];

const shellStyles = sheet(`
    .titlebar {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 38px;
        flex: 0 0 auto;
        padding: 0 8px 0 12px;
        background: var(--px-bg-2);
        border-bottom: 1px solid var(--px-line);
        -webkit-user-select: none;
        user-select: none;
    }

    .titlebar .mark {
        width: 13px;
        height: 13px;
        border-radius: 3px;
        background: var(--px-accent);
        box-shadow: 0 0 0 3px var(--px-accent-soft);
        flex: 0 0 auto;
    }

    .titlebar .product {
        font-weight: 600;
        letter-spacing: 0.2px;
        color: var(--px-text-strong);
        white-space: nowrap;
    }

    .titlebar .scene {
        color: var(--px-text-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .titlebar .scene::before { content: '/'; margin-right: 9px; color: var(--px-line-soft); }
    .titlebar .spacer { flex: 1; }
    .titlebar .toggles { display: flex; gap: 2px; }

    .titlebar button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--px-hit);
        height: var(--px-hit);
        border-radius: var(--px-radius-sm);
        border: 0;
        background: none;
        color: var(--px-text-dim);
        cursor: pointer;
        transition: background 90ms ease, color 90ms ease;
    }

    .titlebar button:hover { background: var(--px-bg-3); color: var(--px-text-strong); }
    .titlebar button.on { color: var(--px-accent); background: var(--px-accent-soft); }

    .stage { position: relative; }

    /* Narrow: the sidebar stops taking space and floats over the scene instead of
       squeezing it into nothing. Same Editor, not a second one. */
    @media (max-width: 760px) {
        .stage > .sidebar {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: min(var(--px-right), 78vw);
            box-shadow: -10px 0 24px rgba(0, 0, 0, 0.45);
            z-index: 4;
        }
        .stage > px-splitter { display: none; }
    }

    .sidebar { width: min(var(--px-right), 46vw); }
    .workspace > px-dock { height: min(var(--px-dock), 52vh); }
`);

/**
 * Build and mount the Editor.
 * @param {HTMLElement} [mount] - Where the shell goes
 * @returns {object} The editor context: { scene, camera, selection, layout, viewport }
 */
export function start(mount = document.body) {
    installDocumentStyles();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, shellStyles];
    registerBuiltIns(components);

    const scene = fillStarterScene(new Scene('Untitled Scene'));
    const selection = new Selection();
    const camera = createEditorCamera();
    const layout = new Layout();

    const viewport = el('px-viewport').bind({ scene, camera, selection, onError: reportFailure });
    const hierarchy = el('px-hierarchy').bind({ scene, selection, viewport });
    const inspector = el('px-inspector').bind({ scene, selection, registry: components });
    const toolbar = el('px-toolbar').bind({ scene, selection, viewport });
    const dock = el('px-dock');

    const hierarchySplit = el('px-splitter').bind({
        axis: 'y',
        get: () => layout.get('hierarchy'),
        set: value => layout.set('hierarchy', value)
    });
    const sidebarSplit = el('px-splitter').bind({
        axis: 'x',
        invert: true,
        get: () => layout.get('right'),
        set: value => layout.set('right', value)
    });
    const dockSplit = el('px-splitter').bind({
        axis: 'y',
        invert: true,
        get: () => layout.get('dock'),
        set: value => layout.set('dock', value)
    });

    const sidebar = el('div', { class: 'sidebar' }, hierarchy, hierarchySplit, inspector);
    const shell = el('div', { class: 'shell' },
        titlebar(scene, layout),
        el('div', { class: 'workspace' },
            el('div', { class: 'stage' }, toolbar, viewport, sidebarSplit, sidebar),
            dockSplit,
            dock
        )
    );

    mount.append(shell);
    layout.mount(shell);

    const applyVisibility = () => {
        hierarchy.hidden = !layout.shows('hierarchy');
        inspector.hidden = !layout.shows('inspector');
        dock.hidden = !layout.shows('dock');
        dockSplit.hidden = !layout.shows('dock');

        const sidebarShown = layout.shows('hierarchy') || layout.shows('inspector');
        sidebar.hidden = !sidebarShown;
        sidebarSplit.hidden = !sidebarShown;
        // With one window left there is no seam to drag, and the survivor takes the lot.
        const both = layout.shows('hierarchy') && layout.shows('inspector');
        hierarchySplit.hidden = !both;
        sidebar.classList.toggle('single', !both);
    };

    layout.observe(applyVisibility);
    applyVisibility();

    // A deleted object must not stay selected: the Inspector would be editing something
    // the scene no longer holds.
    scene.on('removed', object => {
        if (selection.has(object)) selection.clear();
    });

    bindShortcuts({ scene, selection, viewport });

    return { scene, camera, selection, layout, viewport };
}

/**
 * The Object the editor viewport looks through.
 *
 * An ordinary Object with a Transform and a Camera (ADR-0013), deliberately never added
 * to the scene: a point of view is not part of the project, so it must not show up in
 * the Hierarchy, be serialized, or be deletable.
 *
 * @returns {object} The camera object
 */
export function createEditorCamera() {
    const camera = new Object('Editor Camera');
    camera.addComponent(new Transform());
    camera.addComponent(new Camera());
    return camera;
}

function titlebar(scene, layout) {
    const buttons = TOGGLES.map(toggle => {
        const button = el('button', {
            type: 'button',
            title: `Toggle ${toggle.label}`,
            'aria-label': `Toggle ${toggle.label}`,
            onclick: () => layout.show(toggle.panel)
        }, icon(toggle.icon, 15));

        const sync = () => button.classList.toggle('on', layout.shows(toggle.panel));
        layout.observe(sync);
        sync();
        return button;
    });

    return el('div', { class: 'titlebar' },
        el('div', { class: 'mark' }),
        el('span', { class: 'product', textContent: 'Pixel Creator' }),
        el('span', { class: 'scene', textContent: scene.name }),
        el('div', { class: 'spacer' }),
        el('div', { class: 'toggles' }, buttons)
    );
}

function bindShortcuts({ scene, selection, viewport }) {
    globalThis.addEventListener('keydown', event => {
        if (isEditing() || event.metaKey || event.ctrlKey) return;

        if (event.key === 'Delete' || event.key === 'Backspace') {
            const object = selection.object;
            if (!object) return;
            event.preventDefault();
            selection.clear();
            deleteObject(scene, object);
            return;
        }

        if (event.key === 'f' || event.key === 'F') {
            if (selection.object) viewport.focusOn(selection.object);
            return;
        }

        if (event.key === 'Escape') selection.clear();
    });
}

/**
 * Whether the creator is typing, in which case shortcuts must keep out of the way.
 *
 * Walks into shadow roots: the field being typed into is inside one, so
 * `document.activeElement` alone only ever reports the window.
 *
 * @returns {boolean} True when a text control has focus
 */
function isEditing() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;

    if (!element) return false;
    if (element.isContentEditable) return true;
    return element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA';
}

function reportFailure(report) {
    // The Console window is a later step; until it exists a failure goes where a
    // developer will see it, structured rather than stringified (ADR-0012).
    console.error(
        `[runtime] ${report.phase}() failed on ${report.type} of "${report.object?.name}"`,
        report.error
    );
}
