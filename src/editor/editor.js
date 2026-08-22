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

import { Object, Scene, Transform, components, observe, registerStandardNodes } from '../core/mod.js';
import { Camera } from '../runtime/mod.js';
import { Selection } from './selection.js';
import { Subject } from './subject.js';
import { Layout } from './layout.js';
import { componentCatalogue, registerBuiltIns } from './registry.js';
import { addComponent, deleteObject } from './commands.js';
import { Workspace } from './project/workspace.js';
import { createDefinitions } from './project/definitions.js';
import { Transport, TransportState } from './transport.js';
import { fillStarterScene } from './project/starter.js';
import { installDocumentStyles, sheet } from './ui/styles.js';
import { el, fill } from './ui/element.js';
import { icon, iconForResource } from './ui/icons.js';
import { openMenu } from './ui/menu.js';
import { ResourceKind } from '../project/mod.js';
import { DropZone, describePayload } from './dnd/payload.js';
import { createDragGhost } from './ui/drag-ghost.js';
import { canDrop, performDrop } from './dnd/rules.js';
import { previewOffsets, rankAt } from './dnd/reflow.js';
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
import './windows/graph.js';
import './windows/timeline.js';

/**
 * Windows that can be shown or hidden, and the button that does it.
 *
 * In the order they sit in the shell — left column top, left column bottom, the band
 * across the scene, right column — so the row of buttons is a small map of the layout
 * rather than an arbitrary list.
 */
/** How far a pointer travels before a press on a tab becomes a reorder. */
const TAB_DRAG_THRESHOLD = 4;

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

    /* The transport, centred: it acts on the scene rather than on a panel, and it is
       grouped in its own well so the three read as one control instead of as three more
       chrome buttons. */
    .titlebar .transport {
        display: flex;
        align-items: center;
        gap: var(--px-space-0);
        flex: 0 0 auto;
        padding: var(--px-space-0);
        border-radius: var(--px-radius);
        background: var(--px-surface);
        border: 1px solid var(--px-border);
    }

    /* ONE COLOUR PER BUTTON, AND HOVER STRENGTHENS IT RATHER THAN INVENTING ONE. Play is
       go, Pause is hold, Stop is the destructive one — it throws away everything done
       since Play (ADR-0029 §4), and the danger token is what the Editor already uses to say
       so on a Delete. The tint stays on the glyph: a filled red button in the middle of
       the chrome would read as an alarm rather than as a control. */
    .titlebar .transport .ghost:hover { background: var(--px-surface-hover); }

    .titlebar .transport .play:hover:not([disabled]) { color: var(--px-success); }
    .titlebar .transport .play.on { color: var(--px-success); background: transparent; }

    .titlebar .transport .pause:hover:not([disabled]) { color: var(--px-warning); }
    .titlebar .transport .pause.on { color: var(--px-warning); background: transparent; }

    .titlebar .transport .stop:hover:not([disabled]) { color: var(--px-danger); }

    .titlebar .transport.running { border-color: var(--px-success); }
    .titlebar .transport[data-state='paused'] { border-color: var(--px-warning); }

    /* THE RUNNING SCENE IS MARKED, because everything changed while it runs is lost at
       Stop (ADR-0029 section 4). A hairline along the top of the stage: present enough to
       be noticed, quiet enough to work with. */
    .shell.playing .stage { box-shadow: inset 0 2px 0 var(--px-success); }
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

    /* The window the shell has decided a drop would land in (ADR-0028 §3). The viewport
       lives in the document, so its mark is written here; the windows in shadow roots
       style the same two classes on their own host.

       THE CANVAS WEARS ONE OF THE TWO MARKS AND NOT THE OTHER, and that is the same rule
       stated more precisely than before. Nothing is dropped on a graph yet, so an accent
       outline promising a drop would be the lie this Editor keeps refusing — it has no
       dnd-over mark. A refusal is the opposite statement: the gesture arrived, it was
       answered, and the answer is no. That one it wears. */
    px-viewport.dnd-over { outline: 2px dashed var(--px-accent); outline-offset: -3px; }
    px-viewport.dnd-refused,
    px-graph.dnd-refused { outline: 2px dashed var(--px-danger); outline-offset: -3px; }
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

    /* ── the stage ─────────────────────────────────────────────────────
       WHAT A CREATOR IS LOOKING AT, and the strip that says what else is open. The scene
       and every open .px share this space rather than each taking a column: they are
       the same kind of thing — a resource being edited — and a canvas needs the room
       (ADR-0027). The strip appears only when there is a choice to make. */
    .stage {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
    }

    .stage > px-viewport, .stage > px-graph { flex: 1; min-width: 0; min-height: 0; }

    .stage-tabs {
        display: flex;
        align-items: stretch;
        flex: 0 0 auto;
        gap: 1px;
        background: var(--px-surface-raised);
        border-bottom: 1px solid var(--px-border);
        overflow-x: auto;
        -webkit-user-select: none;
        user-select: none;
    }

    .stage-tabs[hidden] { display: none; }

    .stage-tab {
        display: flex;
        align-items: center;
        gap: var(--px-space-1);
        height: var(--px-hit);
        padding: 0 var(--px-space-1) 0 var(--px-space-2);
        border: none;
        border-right: 1px solid var(--px-border);
        background: transparent;
        color: var(--px-text-muted);
        font: inherit;
        font-size: var(--px-text-xs);
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
    }

    .stage-tab:hover { background: var(--px-surface-hover); color: var(--px-text); }
    .stage-tab.on { background: var(--px-surface); color: var(--px-text-strong); }

    /* THE GLYPH SAT ON A TEXT BASELINE, and that is the whole of the misalignment. The
       wrapper was an inline span, so the icon inside it was laid out as a character: it
       inherited the line box and rode a couple of pixels low against a label whose own
       box is centred by the flex row. Making the wrapper a flex box takes it out of the
       inline formatting context entirely: no offset hack, nothing to retune
       when the density tokens change. The label gets the same treatment for the same
       reason. */
    .stage-tab .glyph {
        display: flex;
        align-items: center;
        flex: 0 0 auto;
        color: var(--px-text-dim);
    }

    .stage-tab .name { display: flex; align-items: center; min-width: 0; }
    .stage-tab.on .glyph { color: var(--px-accent); }

    /* Carried, and stepping aside — the same two marks every other flat list wears
       (ADR-0028 §1). Which tab sits where is view state, so the move is announced by the
       Workspace and never recorded in the undo stack. */
    .stage-tab.dragging {
        position: relative;
        z-index: 2;
        opacity: 0.9;
        background: var(--px-surface-active);
        cursor: grabbing;
    }

    .stage-tab.sliding { transition: transform var(--px-duration) var(--px-ease); }

    /* The close button is always there — a tab with unsaved work is exactly the one a
       creator may want to close, and hiding the control behind the dot that says so was
       the worst possible trade. */
    .stage-tab .close {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
        border: none;
        border-radius: var(--px-radius-sm);
        background: transparent;
        color: inherit;
        cursor: pointer;
        opacity: 0.5;
    }

    .stage-tab .close:hover { background: var(--px-surface-active); opacity: 1; }
    .stage-tab .dot { width: 6px; height: 6px; margin: 0 6px; border-radius: 50%; background: var(--px-accent); }

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
    // The node catalogue, filled the same way and for the same reason: registration is an
    // application concern, and a module with a side effect on import cannot be imported
    // without accepting it (editor/registry.js, ADR-0027).
    registerStandardNodes();

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

    // A `.px` IS A COMPONENT, and something has to register it as a type before an object
    // can carry one. The Project layer owns that step (project/definitions.js); the shell
    // owns the registry, so it is the shell that hands the two to each other — the same
    // arrangement `project/graphs.js` describes for binding a graph.
    const definitions = createDefinitions({ project: workspace.project, registry: components, workspace, scene });

    // ONE INTENTION CHANNEL FOR THREE SUBJECTS (ADR-0032). A window says what the creator
    // is working on; it does not have to know that a second holder exists, and it cannot
    // forget to empty it. This replaces the pair of echoing observers that used to live
    // further down, and the re-entrancy flag they needed.
    const subject = new Subject({ selection, workspace });

    const viewport = el('px-viewport').bind({ scene, camera, selection, subject, onError: reportFailure });
    const hierarchy = el('px-hierarchy').bind({ scene, selection, subject, viewport, workspace });
    const inspector = el('px-inspector').bind({ scene, selection, subject, registry: components, workspace, definitions });
    const project = el('px-project').bind({ workspace, scene, selection, subject });
    const graph = el('px-graph', { hidden: true });
    const timeline = el('px-timeline');

    // The creation tools are slotted INTO the viewport, beside Frame selection and Reset
    // view, rather than standing as a rail down the left edge of the workspace. They act
    // on the scene, so they live with the scene; the rail spent a full column of chrome on
    // three buttons and put them as far from the surface they drop onto as the layout
    // allowed. The drag itself is unchanged and still belongs to <px-toolbar> — the
    // viewport only provides the slot (docs/architecture/EDITOR.md).
    const toolbar = el('px-toolbar', { slot: 'tools' }).bind({ scene, selection, subject, viewport });
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
    // THE SCENE AND EVERY OPEN `.px` SHARE ONE SURFACE (ADR-0027). They are the same kind
    // of thing — a resource being edited — and both want the room; a strip above says what
    // else is open, and appears only when there is more than one.
    const tabs = stageTabs({ workspace, viewport, graph });
    const stack = el('div', { class: 'stack' },
        el('div', { class: 'work' },
            columnLeft,
            leftSplit,
            el('div', { class: 'stage' }, tabs.element, viewport, graph)
        ),
        timelineSplit,
        timeline
    );

    const chrome = titlebar(scene, layout, workspace);
    const shell = el('div', { class: 'shell' },
        chrome.element,
        el('div', { class: 'workspace' }, stack, rightSplit, columnRight)
    );

    mount.append(shell);
    layout.mount(shell);

    // AFTER THE MOUNT, AND THAT IS NOT AN ACCIDENT OF ORDER. The Viewport builds its
    // Runtime when it connects, so there is nothing to drive until the shell is in the
    // document — and the transport takes the Runtime that is already drawing rather than
    // making a second one, which is the whole of ADR-0029 section 1.
    const transport = new Transport({
        scene,
        runtime: viewport.runtime,
        histories,
        registry: components
    });
    chrome.transport(transport);

    // The Viewport draws on demand, and `running` is not something it watches — so the
    // transport tells it once that there is a reason to. From there the running branch of
    // its own tick keeps the frames coming.
    transport.observe(() => viewport.wake());

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

    // THREE SUBJECTS, ONE PANEL, AND ONE PLACE THAT ROUTES BETWEEN THEM — `subject`, above
    // (ADR-0032). An Object, a Resource and a graph node are all things a creator selects,
    // and the Inspector shows one at a time.
    //
    // WHAT USED TO BE HERE, AND WHY IT IS GONE. Each holder's change was propagated to the
    // other behind a re-entrancy flag. That deduced the intention from its consequences,
    // and it missed the one case that matters: `Selection.set(null)` emits nothing when the
    // selection was already empty, so clicking bare canvas never announced anything and the
    // Project tile stayed selected. An intention is now announced by whoever caused it, so
    // there is no echo to cut and no flag to get right.

    // The canvas announces what it selected; the shell routes it. Neither element holds a
    // reference to the other (ADR-0006).
    // A NODE IS EDITED IN THE GRAPH, AND THE INSPECTOR SHOWS THE `.px` IT BELONGS TO.
    // There used to be a third subject here: selecting a node swapped the Inspector for a
    // panel of that node's params. Two problems with it, and the second is the reason it
    // is gone. A creator wiring a graph read the value in one window and typed it in
    // another — the params are now inside the node (windows/graph.js). And the panel that
    // vanished was the Component's own: its properties, the very things the nodes refer
    // to, disappeared the moment a node was touched.
    //
    // So a node selection means "the Component is what you are working on", which is a
    // resource selection — the subject the Workspace already owns, routed like any other
    // (ADR-0025). The Graph keeps its own selection for moving and deleting.
    shell.addEventListener('px-node-selected', event => {
        const { definition } = event.detail;
        if (definition) subject.resource(definition.type);
    });

    // DOUBLE-CLICK OPENS A RESOURCE. The Project panel announces the intent and knows
    // nothing about what an editor is; this is the one place that decides a `.px` opens a
    // canvas — and a kind with no editor is refused out loud rather than ignored
    // (ADR-0026, ADR-0027).
    shell.addEventListener('px-open-resource', async event => {
        const { resource } = event.detail;
        const model = await workspace.open(resource.id, { registry: components });
        if (!model) reportUnopenable(resource);
    });

    bindDragAndDrop({ shell, scene, subject, viewport, graph, workspace, hierarchy, inspector, project });
    bindShortcuts({ scene, selection, subject, viewport, history, workspace });

    return { scene, camera, selection, subject, layout, viewport, history, histories, workspace, transport, definitions };
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

// THE TRANSPORT IS HERE NOW, AND IT ARRIVED WITH ITS MECHANISM. This file used to say:
//
//   "THERE IS NO TRANSPORT HERE, AND THAT IS DELIBERATE. Play needs a scene snapshot
//    restored on stop, which does not exist yet. A green button that does nothing would be
//    the one kind of lie this Editor has consistently refused."
//
// serializeScene() / restoreScene(), Clock.reset() and a Viewport that owns the frame loop
// are what was missing; editor/transport.js is the three-state machine ADR-0029 describes,
// and these three buttons are its only control surface. They are not decoration: Play
// really runs the scene, and Stop really puts it back.
//
// There is still no Ctrl K bar: there is no command registry to search. It is named in the
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

    // The transport is filled in once the shell is mounted, because the Runtime it drives
    // does not exist until the Viewport connects. A slot rather than a rebuild: the bar is
    // assembled once, in the order it is read.
    const slot = el('div', { class: 'transport-slot' });

    const element = el('div', { class: 'titlebar' },
        el('div', { class: 'mark' }),
        el('span', { class: 'product', textContent: 'Pixel Creator' }),
        el('span', { class: 'sep', textContent: '/' }),
        name,
        unsaved,
        el('div', { class: 'spacer' }),
        slot,
        el('div', { class: 'spacer' }),
        el('div', { class: 'toggles' }, buttons),
        el('div', { class: 'gap' }),
        share,
        profile
    );

    return { element, transport: machine => fill(slot, transportControls(machine)) };
}

/**
 * Play, Pause and Stop, in the middle of the chrome where every editor puts them.
 *
 * THREE BUTTONS, THREE DEFINED MEANINGS (ADR-0029). Play takes a snapshot and starts the
 * runtime; Pause holds time without leaving the session; Stop restores the snapshot. The
 * state machine is editor/transport.js and it holds no DOM, so what is left here is drawing
 * the three states and saying which one the Editor is in.
 *
 * THE RUNNING STATE IS VISIBLE, and it has to be: everything a creator changes while the
 * scene runs is lost at Stop (ADR-0029 section 4). A transport that looked the same running
 * and stopped would make that a discovery rather than a warning.
 *
 * @param {Transport} transport - The machine these three drive
 * @returns {HTMLElement} The control group
 */
function transportControls(transport) {
    const play = el('button', {
        class: 'ghost play',
        type: 'button',
        title: 'Play',
        'aria-label': 'Play',
        onclick: () => transport.play()
    }, icon('play'));

    const pause = el('button', {
        class: 'ghost pause',
        type: 'button',
        title: 'Pause',
        'aria-label': 'Pause',
        onclick: () => transport.pause()
    }, icon('pause'));

    const stop = el('button', {
        class: 'ghost stop',
        type: 'button',
        title: 'Stop — restores the scene as Play found it',
        'aria-label': 'Stop',
        onclick: () => transport.stop()
    }, icon('stop'));

    const group = el('div', { class: 'transport' }, play, pause, stop);

    transport.observe(state => {
        const editing = state === TransportState.EDITING;
        play.classList.toggle('on', state === TransportState.PLAYING);
        pause.classList.toggle('on', state === TransportState.PAUSED);
        // Pause and Stop mean nothing before Play, so they say so rather than doing nothing
        // when pressed.
        pause.disabled = editing;
        stop.disabled = editing;
        play.title = state === TransportState.PAUSED ? 'Resume' : 'Play';
        group.classList.toggle('running', !editing);
        group.dataset.state = state;

        // The whole shell carries the state, because a scene that is running is a fact
        // about the Editor rather than about three buttons.
        group.closest('.shell')?.classList.toggle('playing', !editing);
    });

    return group;
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
function bindDragAndDrop({ shell, scene, subject, viewport, graph, workspace, hierarchy, inspector, project }) {
    const context = () => ({
        scene,
        project: workspace.project,
        workspace,
        folder: null,
        select: object => subject.object(object),
        install: id => definitions.install(id),
        addComponent: (object, type) => addComponent(object, type, components)
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
    const ghost = createDragGhost(shell);

    /**
     * The drop target under a point, and the window that owns it.
     *
     * ONE RESOLUTION, THREE READERS. The hover outline, the cursor and the drop itself
     * have to agree about what is under the pointer, so they ask this rather than each
     * walking the windows in its own order. No rule is evaluated here: this says WHERE
     * the pointer is, and `canDrop()` says what that means (ADR-0026 §6).
     *
     * A REFUSED ZONE IS STILL A ZONE. The Inspector used to answer `null` for a property
     * that will not take what is being carried, which sent the search on to the viewport
     * behind it — so dropping an image on a `number` field silently placed it in the
     * scene. Being over something that says no is not the same as being over nothing.
     *
     * @param {object} payload - What is being carried
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     * @returns {{target: object, element: HTMLElement}|null} Where it would land
     */
    function targetAt(payload, clientX, clientY) {
        const found = inspector.zoneAt(payload, clientX, clientY);
        if (found) return { target: found.zone, element: inspector };

        if (viewport.containsClient(clientX, clientY)) {
            const point = viewport.worldAt(clientX, clientY);
            return { target: { zone: DropZone.SCENE, x: point.x, y: point.y }, element: viewport };
        }

        // THE OTHER SURFACE OF THE STAGE. The canvas and the scene share the slot and are
        // mutually exclusive — the hidden one has no box, so only one of these two can
        // answer. It is asked like every other window, by its own bounds, rather than being
        // whatever is left when nothing else matched: a zone reached by elimination is a
        // zone that silently grows every time a panel is added.
        //
        // NOTHING LANDS HERE YET, and that is exactly why it has to be asked: a target no
        // rule mentions produces silence, and the rule table now answers for this one with
        // a sentence per kind of drag (dnd/rules.js, ADR-0034 §3.7).
        if (within(graph, clientX, clientY)) {
            // The canvas answers which NODE is under the pointer, because a drop onto one
            // configures it while a drop beside it is refused. Always a zone either way.
            return { target: graph.zoneAt(clientX, clientY), element: graph };
        }

        if (within(hierarchy, clientX, clientY)) {
            return { target: { zone: DropZone.HIERARCHY }, element: hierarchy };
        }
        if (within(project, clientX, clientY)) {
            const target = project.dropTargetAt(clientX, clientY);
            return target ? { target, element: project } : null;
        }

        return null;
    }

    /**
     * Show, everywhere at once, what releasing here would do (ADR-0028 §3).
     *
     * THREE MARKS, ONE ANSWER: the window that would take the drop is outlined, the
     * cursor says accepted or refused, and the ghost carries the rule's own sentence.
     * They are set together because they are one statement — a window outlined in accent
     * under a `no-drop` cursor is the Editor contradicting itself.
     *
     * @param {object|null} found - What `targetAt()` answered
     * @param {object|null} verdict - What `canDrop()` said about it
     */
    let marked = null;
    function markTarget(found, verdict) {
        const element = verdict?.allowed === false && !found ? null : found?.element ?? null;

        if (marked && marked !== element) marked.classList.remove('dnd-over', 'dnd-refused');
        marked = element;

        element?.classList.toggle('dnd-over', verdict?.allowed === true);
        element?.classList.toggle('dnd-refused', verdict?.allowed === false);

        // THREE STATES, AND THE THIRD ONE HAD NO WAY TO SHOW. `ui/cursors.js` draws carry,
        // accept and refuse — "nothing under it answers", "this lands here", "not here" —
        // and `!== true` collapsed the first into the last: a drag over empty space wore the
        // struck-through circle, which says the creator did something wrong when they have
        // merely not arrived yet. `=== false` is the verdict; no verdict is not a refusal.
        shell.classList.toggle('dragging-copy', verdict?.allowed === true);
        shell.classList.toggle('dragging-refused', verdict?.allowed === false);
    }

    /** Take every mark off, whatever state the gesture ended in. */
    function clearMarks() {
        marked?.classList.remove('dnd-over', 'dnd-refused');
        marked = null;
        inspector.clearDropMarks();
        shell.classList.remove('dragging', 'dragging-copy', 'dragging-refused');
    }

    shell.addEventListener('px-drag-start', event => {
        carried = event.detail.payload;
        const { clientX, clientY } = event.detail;
        ghost.show(describePayload(carried), clientX ?? 0, clientY ?? 0);
        shell.classList.add('dragging');
    });

    shell.addEventListener('px-drag-move', event => {
        if (!carried) return;
        const { clientX, clientY } = event.detail;
        ghost.move(clientX, clientY);

        // The rules already answer whether a drop is legal AND why. Showing that answer
        // is the whole of the fix: a refusal used to look like empty space.
        const found = targetAt(carried, clientX, clientY);
        const verdict = found ? canDrop(carried, found.target) : null;

        markTarget(found, verdict);
        ghost.verdict(verdict && !verdict.reason
            ? { ...verdict, reason: verdict.allowed ? null : 'This cannot be dropped here.' }
            : verdict);
    });

    shell.addEventListener('px-drag-end', event => {
        const payload = carried;
        carried = null;
        ghost.hide();
        clearMarks();
        if (!payload) return;

        const { clientX, clientY } = event.detail;
        const found = targetAt(payload, clientX, clientY);
        if (!found) return;

        // The Inspector performs its own drop, because it has to redraw the panel the
        // value landed in; everything else goes straight through the rules.
        if (found.element === inspector) {
            inspector.drop(payload, clientX, clientY);
            return;
        }
        if (found.element === hierarchy) {
            hierarchy.drop(payload);
            return;
        }
        // The canvas performs its own, for the reason the Inspector does: the rule acts
        // through the window, which owns the batch the change travels under.
        if (found.element === graph) {
            graph.drop(payload, clientX, clientY);
            return;
        }
        if (canDrop(payload, found.target).allowed) performDrop(payload, found.target, context());
    });
}

/** Whether a point is inside an element's box. */
function within(element, clientX, clientY) {
    const box = element.getBoundingClientRect();
    return clientX >= box.left && clientX < box.right && clientY >= box.top && clientY < box.bottom;
}

function bindShortcuts({ scene, selection, subject, viewport, history, workspace }) {
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
            subject.clear();
            deleteObject(scene, object);
            return;
        }

        if (event.key === 'f' || event.key === 'F') {
            if (selection.object) viewport.focusOn(selection.object);
            return;
        }

        if (event.key === 'Escape') subject.clear();
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

/**
 * The strip of open editors, and which one the stage is showing.
 *
 * WHAT A TAB IS HERE, AND WHAT IT IS NOT. It is a view of `Workspace.opened()` — the
 * resources a window is presenting — and clicking one calls `activate()`. It is NOT a
 * document model, not a drag-to-reorder strip, and not detachable: which resource is open
 * is Workspace state (ADR-0020), and everything a tab strip usually accumulates beyond
 * that is view state nobody has asked for yet.
 *
 * The strip hides itself when there is nothing to choose between, so a creator who never
 * opens a `.px` never sees a row of chrome (ADR-0026 §14: only what exists).
 *
 * @param {object} context - The workspace and the two surfaces it switches between
 * @returns {{element: HTMLElement, sync: Function}} The strip, and how to refresh it
 */
function stageTabs({ workspace, viewport, graph }) {
    const element = el('div', { class: 'stage-tabs', role: 'tablist' });

    // A NAME IS THE MODEL'S, AND A TAB READS IT LIKE EVERY OTHER VIEW. The strip used to
    // print `resource.name` once per rebuild, so renaming a scene from the Project panel
    // left the tab showing the old name until something unrelated happened to redraw it —
    // the one representation in the Editor that did not follow a keystroke (ADR-0026 §3).
    // Now each tab subscribes to the entry it names, and the subscriptions are dropped
    // whenever the strip is rebuilt.
    let watching = [];
    const unwatch = () => {
        for (const stop of watching) stop();
        watching = [];
    };

    // --- reordering ------------------------------------------------------------------
    //
    // A flat list, so it reorganises under the pointer like every other one (ADR-0028 §1),
    // and the arithmetic is the shared one. What it is NOT is undoable: which tab sits
    // where is view state, and `Workspace.reorder()` says why.
    let drag = null;

    const cancelDrag = () => {
        if (!drag) return;
        for (const tab of element.children) {
            tab.classList.remove('dragging', 'sliding');
            tab.style.transform = '';
        }
        drag = null;
    };

    const beginDrag = (event, tab, id) => {
        if (event.button > 0) return;
        drag = { tab, id, pointerId: event.pointerId, from: event.clientX, started: false, shown: null };
    };

    const moveDrag = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;

        if (!drag.started) {
            if (Math.abs(event.clientX - drag.from) < TAB_DRAG_THRESHOLD) return;
            drag.started = true;
            try {
                drag.tab.setPointerCapture(drag.pointerId);
            } catch {
                // The gesture still resolves from the events it does receive.
            }

            // Measured before anything slides: reading a tab mid-transition would make the
            // rank depend on how far the previous answer had got to drawing itself.
            drag.tabs = [...element.children];
            drag.boxes = drag.tabs.map(tab => {
                const box = tab.getBoundingClientRect();
                return { start: box.left, size: box.width };
            });
            drag.index = drag.tabs.indexOf(drag.tab);
            drag.tab.classList.add('dragging');
        }

        event.preventDefault();
        const to = rankAt(event.clientX, drag.boxes);
        if (to !== drag.shown) {
            drag.shown = to;
            const offsets = previewOffsets(drag.boxes.map(box => box.size), drag.index, to);
            drag.tabs.forEach((tab, i) => {
                if (i === drag.index) return;
                tab.classList.add('sliding');
                tab.style.transform = offsets[i] === 0 ? '' : `translateX(${offsets[i]}px)`;
            });
        }
        drag.tab.style.transform = `translateX(${event.clientX - drag.from}px)`;
    };

    const endDrag = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;

        const moved = drag.started;
        const { id, shown, index } = drag;
        cancelDrag();

        if (moved && shown !== null && shown !== index) workspace.reorder(id, shown);
        return moved;
    };

    const sync = () => {
        // A rebuild in the middle of a gesture would drop the element under the pointer.
        if (drag?.started) return;

        unwatch();
        const open = workspace.opened();
        const active = workspace.activeId;

        // ONE TAB IS NO CHOICE. The strip earns its row the moment there are two.
        element.hidden = open.length < 2;

        fill(element, open.map(resource => {
            const on = resource.id === active;
            const dirty = workspace.dirty && on;

            const close = el('button', {
                class: 'close',
                type: 'button',
                title: `Close ${resource.name}`,
                'aria-label': `Close ${resource.name}`,
                onpointerdown: event => event.stopPropagation(),
                onclick: event => {
                    event.stopPropagation();
                    workspace.close(resource.id);
                }
            }, icon('close', 12));

            const label = el('span', { class: 'name', textContent: resource.name || 'Untitled' });

            const tab = el('button', {
                class: `stage-tab${on ? ' on' : ''}`,
                type: 'button',
                role: 'tab',
                'aria-selected': globalThis.String(on),
                onpointerdown: event => beginDrag(event, tab, resource.id),
                onpointermove: moveDrag,
                onpointerup: event => {
                    // A press that became a drag is not a click on a tab.
                    if (endDrag(event)) return;
                    workspace.activate(resource.id);
                },
                onpointercancel: cancelDrag
            },
                el('span', { class: 'glyph' }, icon(iconForResource(resource), 14)),
                label,
                // THE DOT DOES NOT REPLACE THE CLOSE BUTTON. Sharing one slot looked tidy
                // and meant a tab with unsaved work could not be closed at all — the one
                // state in which a creator most needs the choice. Both, always.
                dirty ? el('span', { class: 'dot', title: 'Unsaved changes' }) : null,
                close
            );

            const entry = workspace.project.get(resource.id);
            if (entry) {
                watching.push(observe(entry, 'name', change => {
                    label.textContent = change.value || 'Untitled';
                    close.title = `Close ${change.value}`;
                }));
            }

            return tab;
        }));

        // WHICH SURFACE IS SHOWN follows the active editor's KIND, not a flag somebody has
        // to remember to set. A scene shows the viewport; a `.px` shows the canvas.
        const showing = workspace.activeId ? workspace.project.get(workspace.activeId) : null;
        const isGraph = showing?.kind === ResourceKind.COMPONENT && workspace.isOpen(showing.id);

        viewport.hidden = isGraph;
        graph.hidden = !isGraph;
        graph.bind(isGraph ? workspace.attached(showing.id) : null,
            { components: () => componentCatalogue(components) });


    };

    for (const event of ['opened', 'closed', 'active', 'dirty', 'saved', 'reordered']) {
        workspace.on(event, sync);
    }
    sync();

    return { element, sync };
}

/**
 * Say why a resource did not open.
 *
 * A refusal with a reason, like every other refusal in this Editor: "nothing happened" is
 * the worst possible answer to a gesture a creator spent a double-click on (ADR-0026 §6).
 * The Console window is a later step, so for now this goes where a developer sees it.
 *
 * @param {object} resource - The manifest entry that has no editor
 */
function reportUnopenable(resource) {
    console.warn(`[editor] "${resource.name}" has no editor yet — nothing opens a ${resource.kind}.`);
}

function reportFailure(report) {
    // The Console window is a later step; until it exists a failure goes where a
    // developer will see it, structured rather than stringified (ADR-0012).
    console.error(
        `[runtime] ${report.phase}() failed on ${report.type} of "${report.object?.name}"`,
        report.error
    );
}
