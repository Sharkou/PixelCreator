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
import { Behaviors, Camera, createGraphInterpreter } from '../runtime/mod.js';
import { Selection } from './selection.js';
import { Subject } from './subject.js';
import { Layout } from './layout.js';
import { componentCatalogue, registerBuiltIns } from './registry.js';
import { addComponent, deleteObject } from './commands.js';
import { Workspace } from './project/workspace.js';
import { createDefinitions } from './project/definitions.js';
import { Transport, TransportState } from './transport.js';
import { openPreview } from './preview.js';
import { broadcastEdits } from './live.js';
import { KeyboardInput, PointerInput } from './input.js';
import { fillStarterScene } from './project/starter.js';
import { installDocumentStyles, sheet } from './ui/styles.js';
import { el, fill } from './ui/element.js';
import { isEditing } from './ui/focus.js';
import { icon } from './ui/icons.js';
import { openMenu } from './ui/menu.js';
import { DropZone, describePayload } from './dnd/payload.js';
import { createDragGhost } from './ui/drag-ghost.js';
import { canDrop, performDrop } from './dnd/rules.js';
import { previewOffsets, rankAt } from './dnd/reflow.js';
import { carriesFiles, readDroppedFiles } from './dnd/files.js';
import { activeDocument, documentViews } from './windows/documents.js';

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

    /* PRESSED, AND IT HAD NO WAY TO SHOW. The shared ghost active rule exists (ui/styles.js)
       and was being outranked by the hover rule above — a pointer is still hovering while it
       presses, and at equal specificity the later rule wins. So the press is stated here,
       after it, with the token the rest of the Editor already presses with. */
    .titlebar .transport .ghost:active:not([disabled]) { background: var(--px-surface-active); }

    .titlebar .transport .play:hover:not([disabled]) { color: var(--px-success); }
    .titlebar .transport .play.on { color: var(--px-success); background: transparent; }

    .titlebar .transport .pause:hover:not([disabled]) { color: var(--px-warning); }
    .titlebar .transport .pause.on { color: var(--px-warning); background: transparent; }

    .titlebar .transport .stop:hover:not([disabled]) { color: var(--px-danger); }

    /* PREVIEW SITS WITH SHARE, NOT WITH THE TRANSPORT, and the move is the whole of the
       fix. Play, Pause and Stop act on the scene in THIS window; Preview and Share both act
       on the whole GAME and both leave it — one opens it in its own window, the other will
       publish it (ADR-0042 §1). Inside the transport's well, separated by a hairline, it
       still read as a fourth transport button that someone had fenced off. */
    .titlebar .preview:hover:not([disabled]) { color: var(--px-accent); }

    .titlebar .transport.running { border-color: var(--px-success); }
    .titlebar .transport[data-state='paused'] { border-color: var(--px-warning); }

    /* THE RUNNING SCENE IS MARKED, because everything changed while it runs is lost at
       Stop (ADR-0029 section 4). A hairline along the top of the stage: present enough to
       be noticed, quiet enough to work with. */
    .shell.playing .area-upper { box-shadow: inset 0 2px 0 var(--px-success); }
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

        /* THE INSPECTOR'S SEAM, AND ONLY IT. The Inspector is floating over the scene
           here, so there is nothing on its far side to trade against; the left column is
           still a real column and keeps its seam. Before the shell became three columns
           this rule named one element by accident of nesting — it names it on purpose
           now. */
        .workspace > px-splitter.seam-right { display: none; }
    }

    /* ── the stage ─────────────────────────────────────────────────────
       ONE TAB BAR OVER ONE BODY. The Scene and every open .px file share this space: they
       are the same kind of thing — a document being edited — and a canvas needs the room
       (ADR-0027). The strip appears only when there is a choice to make. */
    .stage {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
    }

    /* One surface at a time, and the others are HIDDEN rather than detached: a detached
       element releases every subscription it took (ui/element.js), and a canvas holds its
       own pan, zoom and selection that a rebuild would throw away. */
    .stage-body {
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
    }

    .stage-body > * { flex: 1; min-width: 0; min-height: 0; }

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

    /* The Scene has nothing to close, so it has no room reserved for a button. */
    .stage-tab.permanent { padding-right: var(--px-space-2); }
    /* A size restored from storage must never be able to swallow the window. */
    .col-left { width: min(var(--px-left), 40vw); }
    .col-right { width: min(var(--px-right), 46vw); }
    .col-left > px-project { height: min(var(--px-project), 60%); }
    /* A seam dragged to the ceiling must still leave the Scene something. Wanting the
       document alone is answered by carrying its tab up instead, which folds the band
       rather than crushing what is above it. */
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
    const workspace = new Workspace({ components });
    const sceneResource = workspace.create(scene);
    const histories = workspace.histories;
    const history = workspace.history;

    // A `.px` IS A COMPONENT, and something has to register it as a type before an object
    // can carry one. The Project layer owns that step (project/definitions.js); the shell
    // owns the registry, so it is the shell that hands the two to each other — the same
    // arrangement `project/graphs.js` describes for binding a graph.
    // AND A `.px` IS A BEHAVIOUR TOO, which is the half that never reached the Runtime.
    // `Behaviors` interprets a graph once per graph and runs one execution state per
    // component instance (ADR-0015 §3). The interpreter reads the very catalogue
    // `registerStandardNodes()` filled above, and is handed a sink for the `Log` node —
    // the one node that talks to the outside, and which is inert until a host gives it
    // somewhere to talk to (core/graph/standard.js).
    const behaviors = new Behaviors(createGraphInterpreter({ log: reportLog }));

    const definitions = createDefinitions({
        project: workspace.project,
        registry: components,
        workspace,
        scene,
        behaviors
    });

    // EVERY PREVIEW OF THIS PROJECT FOLLOWS FROM HERE (ADR-0044 §3). Nothing is pushed
    // unless a window is listening, and nothing about the Editor changes when none is: the
    // pipelines it already announces on are simply also heard somewhere else.
    broadcastEdits(workspace);

    // ONE INTENTION CHANNEL FOR THREE SUBJECTS (ADR-0032). A window says what the creator
    // is working on; it does not have to know that a second holder exists, and it cannot
    // forget to empty it. This replaces the pair of echoing observers that used to live
    // further down, and the re-entrancy flag they needed.
    const subject = new Subject({ selection, workspace });

    const viewport = el('px-viewport').bind({ scene, camera, selection, subject, onError: reportFailure, behaviors });
    const hierarchy = el('px-hierarchy').bind({ scene, selection, subject, viewport, workspace });
    const inspector = el('px-inspector').bind({ scene, selection, subject, registry: components, workspace, definitions });
    const project = el('px-project').bind({ workspace, scene, selection, subject });
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
    const rightSplit = el('px-splitter', { class: 'seam-right' }).bind({
        axis: 'x',
        invert: true,
        get: () => layout.get('right'),
        set: value => layout.set('right', value)
    });

    const columnLeft = el('div', { class: 'col-left' }, hierarchy, projectSplit, project);
    const columnRight = el('div', { class: 'col-right' }, inspector);

    // THE SCENE KEEPS THE STAGE, AND THE CANVASES MOVED UNDER IT. They used to share one
    // surface and switch each other out, so wiring a behaviour meant losing sight of the
    // scene it acts on — which is the one thing a creator needs to see while wiring
    // (ADR-0027, docs/architecture/EDITOR.md). The band L4 already grants the bottom of the
    // shell now carries a strip of views over one body: the Timeline, and one canvas per
    // open `.px`. It spans exactly what it spanned before and still stops at the
    // Inspector's seam.
    // ONE TAB BAR FOR THE DOCUMENTS, and the Timeline alone in the band under everything.
    // The nesting is the layout: `.work` is the row of left column plus document area, and
    // the Timeline sits under that row — which is why the Project stops at the seam when
    // the Timeline is open and reaches the floor when it is closed, with no rule saying so.
    // That is L4 exactly as D8 settled it (design/README.md).
    const docs = documentArea({ workspace, viewport, scene });

    const stack = el('div', { class: 'stack' },
        el('div', { class: 'work' }, columnLeft, leftSplit, docs.element),
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
        registry: components,
        // THE EDITOR HANDS OVER A FUNCTION, NOT A WINDOW. Everything about how a preview is
        // stored and addressed lives in `preview.js` and `preview/`; the shell only knows
        // that pressing the button opens the game somewhere else (ADR-0042 §2).
        // ITS OWN VOICE, NOT THE CREATOR'S. `reportLog` is where the `Log` NODE writes, so
        // routing the Preview's own failure there printed `[graph] The browser blocked…` —
        // an Editor message wearing a creator's prefix.
        preview: () => openPreview(workspace, {
            report: message => console.info('[preview]', message)
        })
    });
    chrome.transport(transport);

    // The Viewport draws on demand, and `running` is not something it watches — so the
    // transport tells it once that there is a reason to. From there the running branch of
    // its own tick keeps the frames coming.
    transport.observe(() => viewport.wake());

    // THE KEYBOARD REACHES THE GAME HERE, AND NOWHERE ELSE (ADR-0014). The adapter writes
    // into the `Input` the Runtime already holds; the Runtime reads it on every step and has
    // no idea a browser exists. That asymmetry is the whole design — the same graph runs
    // here, headless, and on a server replaying key names off the network.
    //
    // IT IS COMPOSED HERE BECAUSE THE TWO HALVES MEET HERE. The Viewport owns the Runtime
    // and the Transport owns the session; the adapter needs one to write into and the other
    // to know when. `editor.js` is already the file that holds both, and putting the wiring
    // in either of them would have made that one reach for the other.
    //
    // A SESSION LISTENS; EDITING DOES NOT. `PAUSED` is `PLAYING` without the clock (ADR-0029
    // §6), so it keeps listening: dropping the keyboard on a pause would mean a key released
    // while held stayed down for the resume, which is a stuck key and not a paused game.
    //
    // THE POINTER LISTENS ON THE VIEWPORT, THE KEYBOARD ON THE WINDOW, and the difference is
    // the whole of the focus rule (ADR-0038). A key has nowhere to land, so the keyboard has
    // to ask whether a field is being typed into; a pointer lands somewhere, and a press in
    // the Inspector simply never reaches the surface the game is drawn on. The Viewport is
    // also asked WHERE the pointer is — zoom, pan and the camera all live there, and none of
    // them may reach the Runtime.
    const input = viewport.runtime.input;
    const keyboard = new KeyboardInput({ input });
    const pointer = new PointerInput({
        input,
        target: viewport,
        locate: (clientX, clientY) => viewport.locate(clientX, clientY)
    });

    transport.observe(state => {
        const playing = state !== TransportState.EDITING;
        for (const adapter of [keyboard, pointer]) {
            if (playing) adapter.start(); else adapter.stop();
        }
    });

    // PLAY MEANS WATCH THE SCENE, so Play makes sure there is a Scene to watch. Not a mode
    // switch invented for the occasion — it is what the button already means. A creator who
    // has carried a graph into the upper area is looking at the graph, and starting the
    // scene behind it would hide the very thing that was started; ADR-0029 §4 turns that
    // from an annoyance into a hazard, since everything changed while the scene runs is lost
    // at Stop and the mark that says so is drawn on the Scene.
    //
    // IT PUTS NOTHING BACK AT STOP. The graph is still a tab away, and choosing for the
    // creator which of the two they wanted to be looking at is the guess this Editor keeps
    // declining to make.
    transport.observe(state => {
        if (state !== TransportState.EDITING) workspace.activate(sceneResource.id);
    });

    // WHAT PLAYS IS WHAT IS ON SCREEN. A graph edited after its type was installed leaves
    // the bound behaviour behind — moving a node is not a schema change and deliberately
    // does not re-register the class (project/definitions.js) — so the session about to
    // run re-reads every `.px` first, model before store, saved or not.
    //
    // ON THE WAY IN FROM `EDITING`, AND ONLY THERE. Re-binding hands `Behaviors` a new
    // payload, which is how ADR-0016 §7 says a graph is edited: the running behaviour is
    // replaced, and its execution state — including whether `On Start` has run — starts
    // again. Doing that on a resume would make Pause then Play re-run `On Start`, which is
    // not what resuming means (ADR-0029 §2).
    let previousState = transport.state;
    transport.observe(state => {
        const starting = previousState === TransportState.EDITING && state === TransportState.PLAYING;
        previousState = state;
        if (starting) definitions.refresh();
    });

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


    bindDragAndDrop({ shell, scene, subject, viewport, graph: () => docs.graph, workspace, hierarchy, inspector, project, definitions });
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

    // PREVIEW, BESIDE SHARE, because those two are the pair. Both act on the whole GAME
    // rather than on the scene in this window, and both take it somewhere else: one opens
    // it in its own window now, the other publishes it later (ADR-0042 §1). It used to sit
    // inside the transport's well behind a hairline, which said "a fourth transport button,
    // fenced off" — the separator was doing the work a position should do.
    //
    // THE MACHINE ARRIVES LATER, so the handler asks for it rather than closing over it: the
    // Runtime the transport drives does not exist until the Viewport connects, which is the
    // same reason the three transport buttons are filled into a slot below.
    let machine = null;
    const preview = el('button', {
        class: 'ghost preview',
        type: 'button',
        title: 'Preview — opens the game in its own window',
        'aria-label': 'Preview',
        onclick: () => machine?.preview?.()
    }, icon('preview'));

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
        preview,
        share,
        profile
    );

    return {
        element,
        transport: next => {
            machine = next;
            fill(slot, transportControls(next));
        }
    };
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

    // PREVIEW IS NOT HERE, AND THAT IS THE POINT. Play, Pause and Stop act on the scene in
    // this window (ADR-0029); Preview opens a different window, running a snapshot, with no
    // editor around it (ADR-0042 §1). It used to sit in this group behind a hairline, which
    // answered the question by fencing rather than by placing — it now lives beside Share,
    // with the other control that acts on the whole game (`chrome()`).
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
function bindDragAndDrop({ shell, scene, subject, viewport, graph, workspace, hierarchy, inspector, project, definitions }) {
    // THE CANVAS IS NOW ONE OF SEVERAL, so it is asked for rather than held. Each open `.px`
    // has its own `<px-graph>`, and the workbench answers which one a pointer could be over.
    // The pointer decides the same way it decides between any two windows: by which one it
    // is actually inside.
    //
    // NORMALISED HERE, BECAUSE THE ANSWER CAME IN TWO SHAPES AND ONE OF THEM THREW. The
    // supplier returns a single element or null (`docs.graph`); this loop wanted a list, and
    // iterating an element raises `not iterable` — inside a drag listener, where it aborted
    // the whole resolution and left every drop on a canvas doing nothing. It was invisible
    // for as long as the branch above it claimed the pointer first, which is what made this
    // look like "the rules do not work" rather than like an exception nobody saw.
    //
    // One function, one shape, whatever it is handed.
    const canvases = () => {
        const answer = typeof graph === 'function' ? graph() : graph;
        if (!answer) return [];
        return globalThis.Array.isArray(answer) ? answer.filter(Boolean) : [answer];
    };
    const context = () => ({
        scene,
        project: workspace.project,
        workspace,
        folder: null,
        select: object => subject.object(object),
        install: id => definitions.install(id),
        // The options travel: a rule that attaches a Component AND writes its value is one
        // gesture, so both Operations share the batch it mints (ADR-0024 §4).
        addComponent: (object, type, options) => addComponent(object, type, components, options)
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

        // ONE TEST FOR "WHICH WINDOW IS THE POINTER IN", AND EVERY WINDOW TAKES IT. The
        // viewport used to answer with `containsClient()`, which is its own question — it
        // maps a page point into the SCENE, from the rectangle it caches for that purpose
        // and refreshes when a gesture starts. Asked while the viewport was HIDDEN behind a
        // graph tab, it answered from the rectangle it held when it was last on screen: a
        // surface that is not displayed claimed every drop in the workbench, and the graph
        // below was never reached. Nothing dropped on a canvas worked — not an Object, not a
        // Component, not a property, not a resource — while every rule and every test about
        // them passed, because the rules were never asked.
        //
        // `within()` reads a LIVE box, so a hidden surface is 0x0 and matches nothing. It is
        // the test the Hierarchy, the Project panel and each canvas already take, and taking
        // it here is what makes "hidden windows cannot be dropped on" true by construction
        // rather than by each window remembering to check.
        if (within(viewport, clientX, clientY)) {
            const point = viewport.worldAt(clientX, clientY);
            return { target: { zone: DropZone.SCENE, x: point.x, y: point.y }, element: viewport };
        }

        // THE CANVAS IN THE WORKBENCH. The scene and the shown graph no longer exclude one
        // another, so both are asked — the viewport first because it is where the pointer
        // spends its time. Each is asked by its own bounds, like every other window, rather
        // than being whatever is left when nothing else matched: a zone reached by
        // elimination is a zone that silently grows every time a panel is added.
        //
        // NOTHING LANDS HERE YET, and that is exactly why it has to be asked: a target no
        // rule mentions produces silence, and the rule table now answers for this one with
        // a sentence per kind of drag (dnd/rules.js, ADR-0034 §3.7).
        for (const shown of canvases()) {
            if (!within(shown, clientX, clientY)) continue;
            // The canvas answers which NODE is under the pointer, because a drop onto one
            // configures it while a drop beside it is refused. Always a zone either way.
            return { target: shown.zoneAt(clientX, clientY), element: shown };
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
        // through the window, which owns the batch the change travels under. Asked by what
        // the element IS rather than by identity with one particular canvas, because there
        // may be one in each area and `targetAt` has already chosen between them.
        if (found.element.tagName === 'PX-GRAPH') {
            found.element.drop(payload, clientX, clientY);
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
                // Which editor gets written is the Workspace's answer, not this file's:
                // save and undo ask one question — which editor is being worked in — and
                // asking it in two places is how they came to disagree (ADR-0024).
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
 * The document area: one tab bar over one body.
 *
 * WHAT A TAB IS, AND WHAT IT IS NOT. It is a view of `Workspace.opened()` — the resources a
 * window is presenting — and clicking one calls `activate()`. It is NOT a document model:
 * the resource, its live model, its pipeline and its undo stack are `OpenEditor` state the
 * Workspace already owns and never serializes (ADR-0020, ADR-0024). Nothing here holds a
 * second copy of any of it, and nothing here holds an order of its own: the strip IS
 * `opened()`, so reordering a tab is `Workspace.reorder()` and nothing else.
 *
 * ONE SURFACE INSTANCE PER OPEN DOCUMENT, KEPT CONNECTED. A canvas holds its own pan, zoom
 * and node selection; rebuilding it on every tab change would throw all three away, and
 * detaching it would release the subscription that keeps it in step with its model
 * (`ui/element.js`). So a surface is made when the document opens, hidden when another tab
 * is chosen, and removed only when the resource closes — which is exactly when the
 * Workspace releases its model and its stack.
 *
 * THE VIEWPORT IS ONE OF THESE SURFACES. It is handed in rather than made here because it
 * exists whether or not anything is open, and because the shell has already given it its
 * tools and its runtime.
 *
 * @param {object} context - The workspace, the Scene's surface, and the Scene itself — the
 *   last of them for one write and one only: an Object dropped on a canvas points this
 *   scene's instances at it (ADR-0043).
 * @returns {object} `{ element, graph, sync }`
 */
function documentArea({ workspace, viewport, scene }) {
    const tabs = el('div', { class: 'stage-tabs', role: 'tablist' });
    const body = el('div', { class: 'stage-body' }, viewport);
    const element = el('div', { class: 'stage' }, tabs, body);

    /** ResourceId -> the canvas showing it. One instance per open `.px`. */
    const canvases = new globalThis.Map();

    /** The document on screen. Held only so a rebuild does not lose it to a fallback. */
    let shown = null;

    // A NAME IS THE MODEL'S, AND A TAB READS IT LIKE EVERY OTHER VIEW. A tab used to print
    // `resource.name` once per rebuild, so renaming a `.px` from the Project panel left the
    // tab showing the old name until something unrelated redrew it — the one representation
    // in the Editor that did not follow a keystroke (ADR-0026 §3).
    let watching = [];
    const unwatch = () => {
        for (const stop of watching) stop();
        watching = [];
    };

    /** The element that draws a document, made once and kept. */
    const surfaceOf = view => {
        if (view.surface === 'scene') return viewport;

        let canvas = canvases.get(view.id);
        if (!canvas) {
            canvas = el('px-graph');
            canvases.set(view.id, canvas);
            canvas.bind(workspace.attached(view.id), {
                components: () => componentCatalogue(components, { project: workspace.project }),
                // A ResourceId is of project scope like the `.px` itself, so a node may hold
                // one — and the control that shows WHICH resource needs the manifest.
                project: workspace.project,
                // AND THE SCENE, FOR ONE WRITE AND ONE ONLY: an Object dropped on the canvas
                // declares a socket in the `.px` and points this scene's instances at that
                // Object (ADR-0043). Nothing of the scene is ever read into the file.
                scene
            });
        }
        return canvas;
    };

    /**
     * Tell the surface on screen that it is on screen.
     *
     * A CANVAS THAT IS NOT SHOWING HAS NO BOX TO FRAME INTO. It is hidden while another tab
     * is chosen, so the framing it attempts on connect measures zero and would be remembered
     * as done; the canvas declines an empty box and this is what asks it again (graph.js).
     */
    const wake = () => {
        const surface = [...body.children].find(child => !child.hidden);
        surface?.wake?.();
    };

    // --- carrying a tab --------------------------------------------------------------
    //
    // REORDERING, AND ONLY REORDERING. There is one strip, so there is nowhere else a tab
    // could be taken; it reorganises under the pointer like every other flat list in this
    // Editor and the arithmetic is the shared one (ADR-0028 §1, dnd/reflow.js). It is not
    // undoable: which tab sits where is view state, and `Workspace.reorder()` says why.
    //
    // TWO THINGS THIS GOT WRONG ONCE, both found by using it rather than by testing it, and
    // both written down because they are traps this shape of code falls into again:
    //
    //   1. THE THRESHOLD MEASURED HORIZONTAL TRAVEL ONLY, so a press that set off at any
    //      angle had to be nudged sideways before the strip would answer. It is a distance
    //      now, which is what `windows/project.js` has always used.
    //   2. THE MOVE AND UP HANDLERS LIVED ON THE TAB. A press that ended anywhere else left
    //      the gesture set, and since a mouse always reports the same pointerId, the next tab
    //      the pointer touched resumed the ABANDONED drag — from coordinates recorded
    //      somewhere else, so it jumped. The gesture owns window-level listeners for exactly
    //      as long as it lasts, and there is no way for one to outlive it.
    let drag = null;

    /**
     * Whether the press that is ending was a drag.
     *
     * A `click` still fires after a drag that began on a button, and it would read as a
     * choice of tab. Cleared by the next press, so a drag that ended over some other element
     * cannot swallow the tab's next real click.
     */
    let dragged = false;

    const stopGesture = () => {
        if (!drag) return;
        globalThis.removeEventListener('pointermove', moveDrag);
        globalThis.removeEventListener('pointerup', endDrag);
        globalThis.removeEventListener('pointercancel', abortDrag);
        if (drag.tab.hasPointerCapture?.(drag.pointerId)) {
            drag.tab.releasePointerCapture(drag.pointerId);
        }

        for (const tab of tabs.children) {
            tab.classList.remove('dragging', 'sliding');
            tab.style.transform = '';
        }
        drag = null;
    };

    function beginDrag(event, tab, view) {
        if (event.button > 0) return;

        dragged = false;
        drag = {
            tab, view,
            pointerId: event.pointerId,
            from: { x: event.clientX, y: event.clientY },
            started: false,
            rank: null
        };

        // Captured at once rather than at the threshold: it is what keeps the moves coming
        // when the pointer leaves the tab, and leaving the tab is most of the gesture.
        try {
            tab.setPointerCapture(event.pointerId);
        } catch {
            // Nothing to capture. The window listeners below still resolve the gesture.
        }
        globalThis.addEventListener('pointermove', moveDrag);
        globalThis.addEventListener('pointerup', endDrag);
        globalThis.addEventListener('pointercancel', abortDrag);
    }

    function moveDrag(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;

        if (!drag.started) {
            // A DISTANCE, NOT A WIDTH. See note 1 above.
            if (Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y) < TAB_DRAG_THRESHOLD) return;
            drag.started = true;

            // Measured before anything slides: reading a tab mid-transition would make the
            // rank depend on how far the previous answer had got to drawing itself.
            drag.tabs = [...tabs.children];
            drag.boxes = drag.tabs.map(each => {
                const box = each.getBoundingClientRect();
                return { start: box.left, size: box.width };
            });
            drag.index = drag.tabs.indexOf(drag.tab);
            drag.tab.classList.add('dragging');
        }

        event.preventDefault();

        const to = rankAt(event.clientX, drag.boxes);
        if (to !== drag.rank) {
            drag.rank = to;
            const offsets = previewOffsets(drag.boxes.map(box => box.size), drag.index, to);
            drag.tabs.forEach((each, i) => {
                if (i === drag.index) return;
                each.classList.add('sliding');
                each.style.transform = offsets[i] === 0 ? '' : `translateX(${offsets[i]}px)`;
            });
        }

        drag.tab.style.transform =
            `translate(${event.clientX - drag.from.x}px, ${event.clientY - drag.from.y}px)`;
    }

    function abortDrag(event) {
        if (event && drag && event.pointerId !== drag.pointerId) return;
        const started = drag?.started;
        stopGesture();
        if (started) sync();
    }

    function endDrag(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;

        const { started, view, rank, index } = drag;
        stopGesture();
        dragged = started;

        // A press that never became a drag is a click, and the tab handles it.
        if (!started) return;

        // THE STRIP IS `opened()`, RANK FOR RANK (windows/documents.js), so the rank the
        // pointer landed on is the rank the Workspace is given. No translation, because
        // there is no second order to translate between.
        if (rank !== null && rank !== index) workspace.reorder(view.id, rank);
        sync();
    }

    const renderTabs = views => {
        // ONE TAB IS NO CHOICE. The strip earns its row the moment there are two — a
        // creator who never opens a `.px` never sees it (ADR-0026 §14: only what exists).
        tabs.hidden = views.length < 2;

        fill(tabs, views.map(view => {
            const on = view.id === shown;
            // Per tab, not per active editor: several documents are open at once, and a mark
            // only the shown one could wear would go quiet exactly when it matters.
            const dirty = workspace.dirtyOf(view.id);

            const close = view.closable ? el('button', {
                class: 'close',
                type: 'button',
                title: `Close ${view.label}`,
                'aria-label': `Close ${view.label}`,
                onpointerdown: event => event.stopPropagation(),
                onclick: event => {
                    event.stopPropagation();
                    workspace.close(view.id);
                }
            }, icon('close', 12)) : null;

            const label = el('span', { class: 'name', textContent: view.label });

            const tab = el('button', {
                class: `stage-tab${on ? ' on' : ''}${view.closable ? '' : ' permanent'}`,
                type: 'button',
                role: 'tab',
                'aria-selected': globalThis.String(on),
                title: view.label,
                // ONLY THE PRESS IS THE TAB'S. Everything after it belongs to the gesture and
                // is listened for on the window, so a release anywhere at all ends it — and a
                // tab the pointer merely passes over cannot inherit it.
                onpointerdown: event => beginDrag(event, tab, view),
                onclick: () => {
                    if (dragged) {
                        dragged = false;
                        return;
                    }
                    // WHICH EDITOR THE SHORTCUTS ACT ON follows the tab, as it always has.
                    workspace.activate(view.id);
                }
            },
                el('span', { class: 'glyph' }, icon(view.icon, 14)),
                label,
                // THE DOT DOES NOT REPLACE THE CLOSE BUTTON. Sharing one slot looked tidy
                // and meant a tab with unsaved work could not be closed at all — the one
                // state in which a creator most needs the choice. Both, always.
                dirty ? el('span', { class: 'dot', title: 'Unsaved changes' }) : null,
                close
            );

            const entry = workspace.project.get(view.id);
            if (entry) {
                watching.push(observe(entry, 'name', change => {
                    label.textContent = change.value || 'Untitled';
                    if (close) close.title = `Close ${change.value}`;
                }));
            }

            return tab;
        }));
    };

    const sync = () => {
        // A rebuild in the middle of a gesture would drop the element under the pointer.
        if (drag?.started) return;

        unwatch();
        const views = documentViews(workspace.opened());

        // A canvas whose `.px` closed has nothing left to show: the Workspace has released
        // its model and its undo stack.
        const live = new globalThis.Set(views.map(view => view.id));
        for (const [id, canvas] of canvases) {
            if (live.has(id)) continue;
            canvas.remove();
            canvases.delete(id);
        }

        shown = activeDocument(views, workspace.activeId, shown);

        for (const view of views) {
            const surface = surfaceOf(view);
            if (surface.parentElement !== body) body.append(surface);
            surface.hidden = view.id !== shown;
        }

        renderTabs(views);
        wake();
    };

    for (const event of ['opened', 'closed', 'active', 'dirty', 'saved', 'reordered']) {
        workspace.on(event, sync);
    }
    sync();

    return {
        element,
        /** The canvas a pointer could be over: the one showing, when a `.px` is showing. */
        get graph() {
            return [...canvases.values()].find(canvas => !canvas.hidden && canvas.isConnected) ?? null;
        },
        sync
    };
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

function reportLog(value) {
    // Where `Log` writes until there is a Console window, in the spirit of the report
    // below: a creator's own trace, marked as theirs rather than mixed into the Editor's.
    console.log('[graph]', value);
}

function reportFailure(report) {
    // The Console window is a later step; until it exists a failure goes where a
    // developer will see it, structured rather than stringified (ADR-0012).
    console.error(
        `[runtime] ${report.phase}() failed on ${report.type} of "${report.object?.name}"`,
        report.error
    );
}
