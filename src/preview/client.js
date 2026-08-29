// The game client: a canvas, a Runtime, and nothing else (ADR-0042 §5).
//
// WHAT THIS IS NOT is the shorter half of the description. It is not an Editor with its
// panels hidden: there is no selection, no Operation, no undo and no way to change the
// project — not because they are switched off, but because this application does not import
// them and could not perform one if it wanted to. `tools/layers` holds that line.
//
// IT DOES NOT KNOW WHERE ITS GAME CAME FROM. The page is opened with an identifier and asks
// `resolve(id)` for a bundle. Whether that identifier names a preview sitting in this
// browser or a game published on a server is a question for `preview/store.js`, and the day
// the answer changes nothing here is touched (ADR-0042 §3).
//
// ONE WINDOW IS ONE CLIENT, and that is the whole of the multiplayer preparation. Two
// windows are already two clients running the same bundle; what they still lack is an
// `owner` each and a transport between them — the two things ADR-0011 and ADR-0014 left
// open, and neither of them is a change to this file's shape.

import { Matrix, components, defineComponent } from '../core/mod.js';
import { registerStandardNodes } from '../core/mod.js';
import { loadComponentDefinitions, loadScene } from '../project/mod.js';
import {
    Behaviors,
    Canvas2DRenderer,
    Runtime,
    Viewport,
    createGraphInterpreter,
    registerBuiltIns,
    viewMatrix
} from '../runtime/mod.js';
import { openBundle } from './bundle.js';
import { idFromHash, resolvePreview } from './store.js';
import { LiveMessage, openLiveChannel } from './live.js';
import { bindInput } from './input.js';

/**
 * Open whatever this page was pointed at, and play it.
 *
 * @param {HTMLElement} [mount] - Where the surface goes
 * @returns {Promise<object|null>} The running game, or null when there is nothing to run
 */
export async function start(mount = document.body) {
    const id = idFromHash(globalThis.location?.hash ?? '');
    if (!id) return fail(mount, 'No game to play', 'This page needs a game to open.');

    const bundle = await resolvePreview(id);
    // A LINK THAT NAMES NOTHING GETS A SENTENCE, NEVER A BLANK PAGE. A preview belongs to
    // the browser that made it, so a link opened elsewhere lands here — and being told why
    // is the difference between a limitation and a bug (ADR-0042 §4).
    if (!bundle) {
        return fail(mount, 'This preview is not here',
            'A preview lives in the browser that created it. Open it from the editor that made it.');
    }

    let opened;
    try {
        opened = openBundle(bundle);
    } catch (error) {
        return fail(mount, 'This game could not be opened', error.message);
    }

    // REGISTRATION IS THE APPLICATION'S JOB, and this application is one. The same two calls
    // the Editor makes, for the same reason: a module with a side effect on import cannot be
    // imported without accepting it.
    registerBuiltIns(components);
    registerStandardNodes();

    // A `.px` IS A BEHAVIOUR (ADR-0015). The interpreter reads the catalogue filled above,
    // and the `Log` node is given somewhere to talk to — a game's console is the browser's.
    const behaviors = new Behaviors(createGraphInterpreter({
        log: value => console.log('[game]', value)
    }));
    await loadComponentDefinitions(opened.project, { registry: components, behaviors });

    const scene = opened.scene
        ? await loadScene(opened.project, opened.scene, { registry: components })
        : null;
    if (!scene) {
        return fail(mount, 'This project has no scene', 'There is nothing to play yet.');
    }

    document.title = `${opened.name} — Pixel Creator`;
    const game = run(mount, scene, behaviors);

    // AND IT FOLLOWS THE EDITOR FROM HERE (ADR-0044 §3). A Preview used to be a snapshot
    // that could only be replaced by closing it and pressing the button again, which is
    // not what "preview" means to anyone: a creator nudging a position wants to see the
    // nudge. What arrives is an Operation, the same record the Editor's own history holds,
    // and applying one announces nothing back — so this page still cannot author anything
    // (ADR-0042 §5 holds).
    const live = followEdits(opened, { scene, behaviors, registry: components });
    const stop = game.stop;
    return { ...game, stop: () => { live.close(); stop(); } };
}

/**
 * Apply what the Editor of this project says, for as long as the page is open.
 *
 * @param {object} opened - What `openBundle()` answered
 * @param {object} context - `{ scene, behaviors, registry }`
 * @returns {{close: Function}} A handle that stops following
 */
function followEdits(opened, { scene, behaviors, registry }) {
    const channel = openLiveChannel(opened.project?.id);
    if (!channel) return { close: () => {} };

    /**
     * The live schema record of each `.px`, so an old instance reports the new shape.
     *
     * ONE CLASS PER TYPE, MUTATED IN PLACE — the same conclusion the Editor reached
     * (editor/project/definitions.js): an instance carries its class, so registering a NEW
     * class on every edit leaves every object already in the scene declaring the old one.
     * `defineComponent()` closes over the record it is given AND exposes it as
     * `static schema`, so one mutation updates what a new instance is built with and what
     * an old instance reports.
     */
    const schemas = new globalThis.Map();

    channel.onmessage = event => {
        const message = event?.data ?? null;

        if (message?.kind === LiveMessage.OPERATION && message.resource === opened.scene) {
            // APPLIED, NOT SUBMITTED. `apply()` performs an already-authoritative change
            // without arbitrating it and without announcing it, which is the whole of what
            // a follower does (ADR-0011).
            scene.operations.apply(message.operation);
            return;
        }

        if (message?.kind === LiveMessage.DEFINITION) applyDefinition(message, { behaviors, registry, schemas });
    };

    return { close: () => channel.close?.() };
}

/**
 * Take a `.px` the Editor has just rewritten, and make the running game use it.
 *
 * @param {object} message - `{ resource, payload }`
 * @param {object} context - `{ behaviors, registry, schemas }`
 */
function applyDefinition({ resource, payload }, { behaviors, registry, schemas }) {
    if (!payload) return;

    const live = schemas.get(resource) ?? null;
    let Component = registry.has(resource) ? registry.get(resource) : null;

    if (live && Component) {
        for (const name of globalThis.Object.keys(live)) delete live[name];
        globalThis.Object.assign(live, payload.properties ?? {});
        Component.label = payload.label || resource;
        Component.definition = payload;
    } else {
        const record = { ...(payload.properties ?? {}) };
        schemas.set(resource, record);
        Component = defineComponent({ ...payload, type: resource, properties: record });
        registry.register(Component, { replace: true });
    }

    // THE OTHER HALF OF A `.px`, AND THE ONE THE CREATOR IS WATCHING FOR. A graph is read
    // once and identified by object identity, so binding a fresh payload replaces the
    // running behaviour on the next step, on every instance, with nothing to reload
    // (ADR-0016 §7).
    if (payload.graph) behaviors.bind(Component, payload.graph);
}

/**
 * Draw and step a scene until the page goes away.
 *
 * @param {HTMLElement} mount - Where the surface goes
 * @param {object} scene - The scene to play
 * @param {object} behaviors - The bound behaviours
 * @returns {object} `{ scene, runtime, stop }`
 */
function run(mount, scene, behaviors) {
    const canvas = document.createElement('canvas');
    mount.replaceChildren(canvas);

    const renderer = new Canvas2DRenderer(canvas.getContext('2d'));
    const runtime = new Runtime(scene, { renderer, behaviors });
    // THE ONE DIFFERENCE FROM THE EDITOR'S VIEWPORT, and it is the whole point: this one
    // runs. `running = false` is what makes the Editor draw a scene without simulating it
    // (ADR-0029 §1); a game client has no such state.
    runtime.running = true;

    // THREE SIZES, AND THEY ARE NOT THE SAME NUMBER — the arrangement the Editor's surface
    // already uses (`editor/viewport/viewport.js`), transcribed because this page has no
    // Editor to borrow it from:
    //
    //   canvas.width/height   the BACKING STORE, in device pixels
    //   renderer             the same, because it is what it clears and draws into
    //   viewport             CSS pixels, so one world unit is one CSS pixel at zoom 1
    //
    // and the density is applied ABOVE the view matrix, never inside the viewport.
    let density = 1;
    const viewport = new Viewport(1, 1);
    const resize = () => {
        density = globalThis.devicePixelRatio || 1;
        const cssWidth = Math.max(1, canvas.clientWidth);
        const cssHeight = Math.max(1, canvas.clientHeight);
        const width = Math.max(1, Math.round(cssWidth * density));
        const height = Math.max(1, Math.round(cssHeight * density));
        if (canvas.width === width && canvas.height === height) return;

        canvas.width = width;
        canvas.height = height;
        // THE RENDERER HAS TO BE TOLD, AND NOTHING TOLD IT. `Canvas2DRenderer` keeps the
        // size it was constructed with — the canvas's default 300 x 150, because this one
        // is created empty and sized afterwards — and `clear()` erases exactly that box.
        // Every pixel drawn outside it survived the frame that drew it, so an object moved
        // by a graph left a copy of itself at every position it had ever been.
        renderer.resize(width, height);
        viewport.resize(cssWidth, cssHeight);
    };

    // THE CAMERA IS AN OBJECT OF THE SCENE, not a setting of this page (ADR-0013). A scene
    // that ships without one is still playable, centred — `viewMatrix` says so itself.
    const cameraOf = () => scene.objects().find(object => object.getComponent?.('Camera')) ?? null;
    // THE DEVICE SCALE SITS ABOVE THE VIEW, so `zoom` keeps meaning CSS pixels per world
    // unit and a game looks the same size here as it does in the Editor. Feeding the
    // viewport device pixels instead drew every scene at 1/density — a 2x display showed a
    // game at half size, and only the Preview did it.
    const view = () => Matrix.compose(0, 0, 0, density, density)
        .multiply(viewMatrix(cameraOf(), viewport));

    const input = bindInput(canvas, runtime.input, { view, density: () => globalThis.devicePixelRatio || 1 });

    let last = 0;
    let frame = null;
    const tick = now => {
        frame = globalThis.requestAnimationFrame(tick);
        resize();

        // A TAB THAT WAS IN THE BACKGROUND HANDS OVER A GAP OF SECONDS. Clamped, so
        // returning to a game does not simulate a minute of it in one frame — the same
        // guard the Editor's viewport applies, and for the same reason.
        const elapsed = last === 0 ? 0 : Math.min((now - last) / 1000, 0.25);
        last = now;

        if (elapsed > 0) runtime.advance(elapsed);
        runtime.render({ view: view() });
    };

    frame = globalThis.requestAnimationFrame(tick);

    return {
        scene,
        runtime,
        stop: () => {
            if (frame !== null) globalThis.cancelAnimationFrame(frame);
            frame = null;
            input.stop();
        }
    };
}

/** Say what went wrong, in words a creator can act on. */
function fail(mount, title, detail) {
    const notice = document.createElement('div');
    notice.className = 'notice';

    const heading = document.createElement('strong');
    heading.textContent = title;
    const line = document.createElement('span');
    line.textContent = detail;

    notice.append(heading, line);
    mount.replaceChildren(notice);
    return null;
}
