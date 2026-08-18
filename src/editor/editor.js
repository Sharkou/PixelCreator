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
import { Workspace } from './project/workspace.js';
import { fillStarterScene } from './project/starter.js';
import { installDocumentStyles, sheet } from './ui/styles.js';
import { el } from './ui/element.js';
import { icon } from './ui/icons.js';
import { openMenu } from './ui/menu.js';
import { DropZone } from './dnd/payload.js';
import { canDrop, performDrop } from './dnd/rules.js';
import { carriesFiles, readDroppedFiles } from './dnd/files.js';

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

    .titlebar .unsaved {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--px-accent);
        flex: 0 0 auto;
    }

    .titlebar .sep { color: var(--px-border-subtle); }
    .titlebar .gap { width: var(--px-space-2); flex: 0 0 auto; }

    /* The prototype's avatar: a gradient disc, 22 px, and a real button — it opens a menu
       rather than pretending to be a signed-in user. */
    .titlebar .avatar {
        width: 22px;
        height: 22px;
        margin-left: var(--px-space-1);
        border-radius: 50%;
        border: none;
        flex: 0 0 auto;
        background: linear-gradient(140deg, var(--px-accent), #7b4bff);
        cursor: pointer;
    }

    .titlebar .avatar:hover { filter: brightness(1.15); }

    /* A file dragged over the scene: the surface says it will take it. */
    px-viewport.importing { outline: 2px dashed var(--px-accent); outline-offset: -4px; }
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

    // THE SCENE IS A RESOURCE, not a loose model the shell happens to hold. Declaring it
    // is what gives it an identity that survives storage, a payload the Project panel can
    // list, and — because a manifest mutation is an Operation like any other — an undo
    // stack of its own beside the scene's (ADR-0020, ADR-0024).
    //
    // It starts in memory. An IndexedDB store is a swap of one implementation, which is
    // the whole reason `ResourceStore` is an interface.
    const workspace = new Workspace();
    workspace.create(scene);
    const histories = workspace.histories;
    const history = workspace.history;

    const viewport = el('px-viewport').bind({ scene, camera, selection, onError: reportFailure });
    const hierarchy = el('px-hierarchy').bind({ scene, selection, viewport, workspace });
    const inspector = el('px-inspector').bind({ scene, selection, registry: components, workspace });
    const project = el('px-project').bind({ workspace, scene, selection });
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
        titlebar(scene, layout, workspace),
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

    // ONE INSPECTOR, SO ONE SUBJECT. An object and a resource are both things a creator
    // selects, and the panel shows one at a time: selecting in either place clears the
    // other, here rather than inside a window, because neither window should have to know
    // the other exists (ADR-0025).
    selection.observe(({ object }) => {
        if (object) workspace.select(null);
    });
    workspace.on('selection', ({ id }) => {
        if (id) selection.clear();
    });

    bindDragAndDrop({ shell, scene, selection, viewport, workspace, hierarchy, inspector });
    bindShortcuts({ scene, selection, viewport, history, workspace });

    return { scene, camera, selection, layout, viewport, history, histories, workspace };
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
function titlebar(scene, layout, workspace) {
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

    // The one place the shell says "there is work the store does not have". A dot, not a
    // word: it is derived from the pipeline, so it appears the moment an intent is
    // authored and clears on Ctrl S, with nothing to keep in step by hand.
    const name = el('span', { class: 'scene-name', textContent: scene.name });
    const unsaved = el('span', { class: 'unsaved', title: 'Unsaved changes', hidden: true });

    if (workspace) {
        const sync = () => {
            unsaved.hidden = !workspace.dirty;
        };
        for (const event of ['dirty', 'saved', 'opened', 'closed']) workspace.on(event, sync);
        sync();
    }

    // SHARE AND THE PROFILE, as the prototype draws them (design/prototype.js, titlebar).
    // Neither is wired to anything, and both say so when pressed: there is no publishing
    // pipeline and no account system, and inventing a fake one is the kind of lie this
    // Editor has consistently refused. What they are here for is the SHAPE — the row of
    // chrome the real feature slots into, in the place a creator will look for it.
    const share = el('button', {
        class: 'ghost',
        type: 'button',
        title: 'Share',
        'aria-label': 'Share',
        onclick: () => openMenu(share, [
            { heading: 'Share' },
            { id: 'soon', label: 'Publishing is not built yet', icon: 'share' }
        ], () => {}, { label: 'sharing' })
    }, icon('share'));

    const profile = el('button', {
        class: 'avatar',
        type: 'button',
        title: 'Profile',
        'aria-label': 'Profile',
        onclick: () => openMenu(profile, [
            { heading: 'Profile' },
            { id: 'soon', label: 'Accounts are not built yet', icon: 'object' }
        ], () => {}, { label: 'profile' })
    });

    return el('div', { class: 'titlebar' },
        el('div', { class: 'mark' }),
        el('span', { class: 'product', textContent: 'Pixel Creator' }),
        el('span', { class: 'sep', textContent: '/' }),
        name,
        unsaved,
        el('div', { class: 'spacer' }),
        el('div', { class: 'toggles' }, buttons),
        el('div', { class: 'gap' }),
        share,
        profile
    );
}

/**
 * Drag and drop, wired once, for the whole Editor.
 *
 * TWO TRANSPORTS, ONE VOCABULARY (ADR-0026). A file from the desktop arrives as a
 * `DataTransfer` and only the browser can read it; a resource carried out of the Project
 * panel is a pointer gesture with no `DataTransfer` at all. Both become a payload, and both
 * are answered by the same rules — which is why this function is short, and why no window
 * contains a line about what an image means.
 *
 * @param {object} context - The windows, and the model they act on
 */
function bindDragAndDrop({ shell, scene, selection, viewport, workspace, hierarchy, inspector }) {
    const context = () => ({
        scene,
        project: workspace.project,
        workspace,
        folder: null,
        select: object => selection.set(object)
    });

    // Files dropped on the scene surface: imported, then placed where they landed.
    viewport.addEventListener('dragover', event => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        viewport.classList.add('importing');
    });
    viewport.addEventListener('dragleave', () => viewport.classList.remove('importing'));
    viewport.addEventListener('drop', async event => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        viewport.classList.remove('importing');

        const payload = await readDroppedFiles(event);
        if (!payload) return;

        const point = viewport.worldAt(event.clientX, event.clientY);
        performDrop(payload, { zone: DropZone.SCENE, x: point.x, y: point.y }, context());
    });

    // A resource carried out of the Project panel. The panel announces the drag; the shell
    // decides which window the pointer ended over, and asks the rules the same question
    // each of those windows would have asked.
    let carried = null;

    shell.addEventListener('px-drag-start', event => {
        carried = event.detail.payload;
    });

    shell.addEventListener('px-drag-end', event => {
        const payload = carried;
        carried = null;
        if (!payload) return;

        const { clientX, clientY } = event.detail;

        if (inspector.drop(payload, clientX, clientY)) return;

        if (viewport.containsClient(clientX, clientY)) {
            const point = viewport.worldAt(clientX, clientY);
            const target = { zone: DropZone.SCENE, x: point.x, y: point.y };
            if (canDrop(payload, target).allowed) performDrop(payload, target, context());
            return;
        }

        if (within(hierarchy, clientX, clientY)) hierarchy.drop(payload);
    });
}

/** Whether a point is inside an element's box. */
function within(element, clientX, clientY) {
    const box = element.getBoundingClientRect();
    return clientX >= box.left && clientX < box.right && clientY >= box.top && clientY < box.bottom;
}

function bindShortcuts({ scene, selection, viewport, history, workspace }) {
    /**
     * The stack `Ctrl Z` acts on.
     *
     * ONE STACK PER RESOURCE, so the shortcut has to say WHICH resource the creator is
     * working in (ADR-0024). The Workspace answers it, from the last intent that was
     * authored — not from the selection, which a deletion clears: the undo that would put
     * a deleted resource back must not be aimed at the scene (ADR-0025).
     *
     * @returns {object|null} The History to act on
     */
    const active = () => workspace?.activeHistory ?? history;

    globalThis.addEventListener('keydown', event => {
        // Undo is the one shortcut that must work while a field has focus — a creator
        // mid-edit expects Ctrl Z to take back the last thing they did, and letting the
        // browser undo the input's text instead is the wrong answer.
        if (event.metaKey || event.ctrlKey) {
            const key = event.key.toLowerCase();
            // Save is bound here and not in a window because it saves what is OPEN, which
            // is a fact about the workspace rather than about any one panel.
            if (key === 's') {
                event.preventDefault();
                workspace?.save();
                return;
            }
            if (key === 'z' && !event.shiftKey) {
                const stack = active();
                if (stack?.canUndo) event.preventDefault();
                stack?.undo();
                return;
            }
            if ((key === 'z' && event.shiftKey) || key === 'y') {
                const stack = active();
                if (stack?.canRedo) event.preventDefault();
                stack?.redo();
            }
            return;
        }

        if (isEditing()) return;

        if (event.key === 'Delete' || event.key === 'Backspace') {
            // Whichever of the two selections holds something. A folder takes its contents
            // with it, as one undo entry (ADR-0025).
            const resource = workspace?.selected;
            if (resource) {
                if (!workspace.canRemove(resource.id).allowed) return;
                event.preventDefault();
                workspace.project.removeTree(resource.id);
                return;
            }

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

        if (event.key === 'Escape') {
            selection.clear();
            workspace.select(null);
        }
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
