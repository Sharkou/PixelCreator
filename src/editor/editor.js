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
import { Histories } from './history.js';
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
import './windows/project.js';
import './windows/timeline.js';

/**
 * Windows that can be shown or hidden, and the button that does it.
 *
 * In the order they sit in the shell — left column top, left column bottom, the band
 * across the scene, right column — so the row of buttons is a small map of the layout
 * rather than an arbitrary list.
 */
const TOGGLES = [
    { panel: 'hierarchy', label: 'Hierarchy', icon: 'hierarchy' },
    { panel: 'project', label: 'Project', icon: 'folder' },
    { panel: 'timeline', label: 'Timeline', icon: 'timeline' },
    { panel: 'inspector', label: 'Inspector', icon: 'inspector' }
];

const shellStyles = sheet(`
    /* Density, not a number: a hit target plus one step, which is 40 on a mouse and 46
       under a coarse pointer. */
    .titlebar {
        display: flex;
        align-items: center;
        gap: var(--px-space-3);
        height: calc(var(--px-hit) + var(--px-space-3));
        flex: 0 0 auto;
        padding: 0 var(--px-space-1) 0 var(--px-space-3);
        background: var(--px-surface-raised);
        border-bottom: 1px solid var(--px-border);
        -webkit-user-select: none;
        user-select: none;
    }

    /* The one pixel in the chrome: a square with a soft ring, 12 and 4, so the mark reads
       at exactly the 20 px of a presence glyph. */
    .titlebar .mark {
        width: 12px;
        height: 12px;
        border-radius: var(--px-radius-sm);
        background: var(--px-accent);
        box-shadow: 0 0 0 var(--px-space-1) var(--px-accent-muted);
        flex: 0 0 auto;
    }

    .titlebar .product {
        font-weight: var(--px-weight-bold);
        color: var(--px-text-strong);
        white-space: nowrap;
    }

    /* NOT .scene — the viewport already owns that word, and this sheet is in the document
       where there are no shadow roots to keep the two apart. */
    .titlebar .scene-name {
        color: var(--px-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .titlebar .sep { color: var(--px-border-subtle); }
    .titlebar .spacer { flex: 1; }
    .titlebar .toggles { display: flex; gap: var(--px-space-0); }

    /* The chrome bar has no 26 px row to fit into, so its buttons are hit-sized outright
       rather than control-sized with the hit area reaching past them. */
    .titlebar .ghost { width: var(--px-hit); height: var(--px-hit); }

    /* Narrow: the Inspector stops taking space and floats over the scene instead of
       squeezing it into nothing. Same Editor, not a second one. */
    @media (max-width: 760px) {
        .workspace { position: relative; }

        .workspace > .col-right {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: min(var(--px-right), 78vw);
            box-shadow: -10px 0 24px rgba(0, 0, 0, 0.45);
            z-index: var(--px-z-drawer);
        }

        .workspace > px-splitter { display: none; }
    }

    /* A size restored from storage must never be able to swallow the window. */
    .col-left { width: min(var(--px-left), 40vw); }
    .col-right { width: min(var(--px-right), 46vw); }
    .col-left > px-project { height: min(var(--px-project), 60%); }
    .stack > px-timeline { height: min(var(--px-timeline), 45vh); }
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

    const scene = fillStarterScene(new Scene('Untitled Scene', { registry: components }));
    const selection = new Selection();
    const camera = createEditorCamera();
    const layout = new Layout();

    // One stack per resource (ADR-0024). Only the scene is editable today; a Graph window
    // and the Project panel get their own by asking for theirs, not by sharing this one.
    const histories = new Histories();
    const history = histories.for(scene.id, scene.operations);

    const viewport = el('px-viewport').bind({ scene, camera, selection, onError: reportFailure });
    const hierarchy = el('px-hierarchy').bind({ scene, selection, viewport });
    const inspector = el('px-inspector').bind({ scene, selection, registry: components });
    const project = el('px-project');
    const timeline = el('px-timeline');

    // The creation tools are slotted INTO the viewport, beside Frame selection and Reset
    // view, rather than standing as a rail down the left edge of the workspace. They act
    // on the scene, so they live with the scene; the rail spent a full column of chrome on
    // three buttons and put them as far from the surface they drop onto as the layout
    // allowed. The drag itself is unchanged and still belongs to <px-toolbar> — the
    // viewport only provides the slot (docs/architecture/EDITOR.md).
    const toolbar = el('px-toolbar', { slot: 'tools' }).bind({ scene, selection, viewport });
    viewport.append(toolbar);

    // `invert` is "moving towards the origin grows this size", which is true of every
    // seam whose window sits after it: the Project and the Timeline below, the Inspector
    // to the right. The left column is the one that grows the way the pointer travels.
    const projectSplit = el('px-splitter').bind({
        axis: 'y',
        invert: true,
        get: () => layout.get('project'),
        set: value => layout.set('project', value)
    });
    const leftSplit = el('px-splitter').bind({
        axis: 'x',
        get: () => layout.get('left'),
        set: value => layout.set('left', value)
    });
    const timelineSplit = el('px-splitter').bind({
        axis: 'y',
        invert: true,
        get: () => layout.get('timeline'),
        set: value => layout.set('timeline', value)
    });
    const rightSplit = el('px-splitter').bind({
        axis: 'x',
        invert: true,
        get: () => layout.get('right'),
        set: value => layout.set('right', value)
    });

    const columnLeft = el('div', { class: 'col-left' }, hierarchy, projectSplit, project);
    const columnRight = el('div', { class: 'col-right' }, inspector);
    const stack = el('div', { class: 'stack' },
        el('div', { class: 'work' }, columnLeft, leftSplit, viewport),
        timelineSplit,
        timeline
    );

    const shell = el('div', { class: 'shell' },
        titlebar(scene, layout),
        el('div', { class: 'workspace' }, stack, rightSplit, columnRight)
    );

    mount.append(shell);
    layout.mount(shell);

    const applyVisibility = () => {
        hierarchy.hidden = !layout.shows('hierarchy');
        project.hidden = !layout.shows('project');
        inspector.hidden = !layout.shows('inspector');
        timeline.hidden = !layout.shows('timeline');
        timelineSplit.hidden = !layout.shows('timeline');

        columnRight.hidden = !layout.shows('inspector');
        rightSplit.hidden = !layout.shows('inspector');

        const leftShown = layout.shows('hierarchy') || layout.shows('project');
        columnLeft.hidden = !leftShown;
        leftSplit.hidden = !leftShown;
        // With one window left there is no seam to drag, and the survivor takes the lot.
        const both = layout.shows('hierarchy') && layout.shows('project');
        projectSplit.hidden = !both;
        columnLeft.classList.toggle('single', !both);
    };

    layout.observe(applyVisibility);
    applyVisibility();

    // A deleted object must not stay selected: the Inspector would be editing something
    // the scene no longer holds.
    scene.on('removed', object => {
        if (selection.has(object)) selection.clear();
    });

    bindShortcuts({ scene, selection, viewport, history });

    return { scene, camera, selection, layout, viewport, history, histories };
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

// THERE IS NO TRANSPORT HERE, AND THAT IS DELIBERATE. The prototype draws Play / Pause /
// Stop, and Play needs a scene snapshot restored on stop, which does not exist yet
// (docs/migration/MIGRATION_STATUS.md). A green button that does nothing would be the one
// kind of lie this Editor has consistently refused. It arrives with its mechanism.
//
// Nor is there a Ctrl K bar: there is no command registry to search. Both are named in the
// report rather than mocked up here.
function titlebar(scene, layout) {
    const buttons = TOGGLES.map(toggle => {
        const button = el('button', {
            class: 'ghost',
            type: 'button',
            title: `Toggle ${toggle.label}`,
            'aria-label': `Toggle ${toggle.label}`,
            'aria-pressed': 'true',
            onclick: () => layout.show(toggle.panel)
        }, icon(toggle.icon));

        const sync = () => {
            const shown = layout.shows(toggle.panel);
            button.classList.toggle('on', shown);
            button.setAttribute('aria-pressed', globalThis.String(shown));
        };
        layout.observe(sync);
        sync();
        return button;
    });

    return el('div', { class: 'titlebar' },
        el('div', { class: 'mark' }),
        el('span', { class: 'product', textContent: 'Pixel Creator' }),
        el('span', { class: 'sep', textContent: '/' }),
        el('span', { class: 'scene-name', textContent: scene.name }),
        el('div', { class: 'spacer' }),
        el('div', { class: 'toggles' }, buttons)
    );
}

function bindShortcuts({ scene, selection, viewport, history }) {
    globalThis.addEventListener('keydown', event => {
        // Undo is the one shortcut that must work while a field has focus — a creator
        // mid-edit expects Ctrl Z to take back the last thing they did, and letting the
        // browser undo the input's text instead is the wrong answer.
        if (event.metaKey || event.ctrlKey) {
            const key = event.key.toLowerCase();
            if (key === 'z' && !event.shiftKey) {
                if (history?.canUndo) event.preventDefault();
                history?.undo();
                return;
            }
            if ((key === 'z' && event.shiftKey) || key === 'y') {
                if (history?.canRedo) event.preventDefault();
                history?.redo();
            }
            return;
        }

        if (isEditing()) return;

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
