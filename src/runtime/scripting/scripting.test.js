import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform, observe } from '../../core/mod.js';
import { Scripting } from './scripting.js';
import { Script } from './script.js';
import { Runtime } from '../runtime.js';
import { Clock } from '../clock/clock.js';
import { Input } from '../input/input.js';

/**
 * A stand-in script kind. The real ones — a `.px` graph interpreter and `.js` module
 * loading — are separate steps (ADR-0009); what is under test here is the seam.
 */
function movementKind() {
    return new Scripting().define('test', source => ({
        update(self, ctx) {
            source.ran?.push(ctx.time);
            self.x += (source.speed ?? 0) * ctx.deltaTime;
        }
    }));
}

function scriptedScene(source, { kind = 'test' } = {}) {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    const script = object.addComponent(new Script(source, kind));
    return { scene, object, script };
}

// --- the registry -----------------------------------------------------------------

test('a host ships with no kind registered', () => {
    // Correct empty state: this is a registry, not a language.
    const scripting = new Scripting();

    assert.deepEqual(scripting.kinds(), []);
    assert.equal(scripting.has('js'), false);
});

test('a kind is registered and compiles a source', () => {
    const scripting = new Scripting().define('test', source => ({ update() { return source; } }));

    assert.equal(scripting.has('test'), true);
    assert.deepEqual(scripting.kinds(), ['test']);
    assert.equal(typeof scripting.compile({ kind: 'test', source: 1 }).update, 'function');
});

test('registering the same kind twice is refused', () => {
    const scripting = new Scripting().define('test', () => ({}));

    assert.throws(() => scripting.define('test', () => ({})), /already defined/);
});

test('a kind needs a name and a compile function', () => {
    const scripting = new Scripting();

    assert.throws(() => scripting.define('', () => ({})), TypeError);
    assert.throws(() => scripting.define('test', 'not a function'), TypeError);
});

test('an unknown kind names what is registered', () => {
    const scripting = new Scripting().define('px', () => ({}));

    assert.throws(
        () => scripting.compile({ kind: 'js', source: '' }),
        /no compiler for script kind "js" \(registered: px\)/
    );
});

test('a compiler that returns nothing usable is refused', () => {
    const scripting = new Scripting().define('test', () => undefined);

    assert.throws(() => scripting.compile({ kind: 'test', source: '' }), TypeError);
});

// --- execution --------------------------------------------------------------------

test('a script runs on every step and reads the context', () => {
    const source = { speed: 60, ran: [] };
    const { scene, object } = scriptedScene(source);

    const runtime = new Runtime(scene, {
        scripting: movementKind(),
        clock: new Clock({ fixedStep: 0.1 })
    });
    runtime.step();
    runtime.step();

    assert.deepEqual(source.ran, [0, 0.1], 'the script saw the simulation time of each step');
    assert.ok(Math.abs(object.x - 12) < 1e-9, 'and acted on the object through self');
});

test('a script reaches input and scripting through the context', () => {
    const seen = [];
    const scripting = new Scripting().define('test', () => ({
        update(self, ctx) {
            seen.push({
                keys: ctx.input.of(self.owner).keys(),
                scene: ctx.scene,
                hasScripting: Boolean(ctx.scripting),
                delta: ctx.deltaTime
            });
        }
    }));
    const { scene } = scriptedScene(null);
    const input = new Input();
    input.local.press('KeyW');

    new Runtime(scene, { scripting, clock: new Clock({ fixedStep: 0.25 }) }).step(input);

    assert.deepEqual(seen[0].keys, ['KeyW']);
    assert.equal(seen[0].scene, scene);
    assert.equal(seen[0].hasScripting, true);
    assert.equal(seen[0].delta, 0.25);
});

test('scripts run in scene insertion order, with the components around them', () => {
    const order = [];
    const scripting = new Scripting().define('test', label => ({
        update() { order.push(`script:${label}`); }
    }));
    class Marker {
        static type = 'Marker';
        constructor(label) { this.label = label; }
        update() { order.push(`marker:${this.label}`); }
    }

    const scene = new Scene('Main');
    for (const label of ['a', 'b']) {
        const object = scene.add(new Object(label));
        object.addComponent(new Script(label, 'test'));
        object.addComponent(new Marker(label));
    }

    new Runtime(scene, { scripting }).step();

    assert.deepEqual(order, ['script:a', 'marker:a', 'script:b', 'marker:b']);
});

test('a source is compiled once and reused', () => {
    let compiles = 0;
    const scripting = new Scripting().define('test', () => {
        compiles++;
        return { update() {} };
    });
    const { scene } = scriptedScene('v1');

    const runtime = new Runtime(scene, { scripting });
    for (let i = 0; i < 5; i++) runtime.step();

    assert.equal(compiles, 1);
});

test('changing the source recompiles it', () => {
    const compiled = [];
    const scripting = new Scripting().define('test', source => {
        compiled.push(source);
        return { update() {} };
    });
    const { scene, script } = scriptedScene('v1');

    const runtime = new Runtime(scene, { scripting });
    runtime.step();
    script.source = 'v2';
    runtime.step();
    runtime.step();

    assert.deepEqual(compiled, ['v1', 'v2'], 'edited in the Inspector, live on the next step');
});

test('a behavior with no update is harmless', () => {
    const scripting = new Scripting().define('test', () => ({}));
    const { scene } = scriptedScene('');

    assert.doesNotThrow(() => new Runtime(scene, { scripting }).step());
});

test('a compiled behavior never leaks into serialization', () => {
    // It is derived from kind and source, not state, so it must not reach a snapshot or
    // a replicated payload.
    const { scene, script } = scriptedScene({ speed: 1 });
    new Runtime(scene, { scripting: movementKind() }).step();

    assert.deepEqual(globalThis.Object.keys(script).sort(), ['kind', 'source']);
});

// --- errors, per ADR-0012 ---------------------------------------------------------

test('a script that throws is reported and changes nothing', () => {
    const thrown = new Error('script blew up');
    const scripting = new Scripting().define('test', () => ({
        update() { throw thrown; }
    }));
    const { scene, script, object } = scriptedScene('');
    const reports = [];
    const changes = [];
    observe(object, () => changes.push('object'));
    observe(script, () => changes.push('component'));

    const runtime = new Runtime(scene, { scripting, onError: report => reports.push(report) });
    for (let i = 0; i < 10; i++) runtime.step();

    assert.equal(reports.length, 10, 'reported every step, never silenced');
    assert.equal(reports[0].error, thrown);
    assert.equal(reports[0].type, 'Script');
    assert.equal(reports[0].phase, 'update');
    assert.equal(script.active, undefined, 'never disabled by the runtime');
    assert.deepEqual(changes, [], 'and no Change came out of the error handling');
});

test('a script that fails to compile is reported like any other failure', () => {
    const scripting = new Scripting().define('test', () => {
        throw new SyntaxError('bad source');
    });
    const { scene } = scriptedScene('nonsense');
    const reports = [];

    new Runtime(scene, { scripting, onError: report => reports.push(report) }).step();

    assert.equal(reports.length, 1);
    assert.ok(reports[0].error instanceof SyntaxError);
    assert.equal(reports[0].phase, 'update');
});

test('a script with no scripting host says so instead of failing silently', () => {
    const { scene } = scriptedScene('');
    const reports = [];

    new Runtime(scene, { onError: report => reports.push(report) }).step();

    assert.match(reports[0].error.message, /carries no Scripting host/);
});

test('a failing script does not stop the rest of the scene', () => {
    const scripting = new Scripting().define('test', () => ({
        update() { throw new Error('nope'); }
    }));
    const { scene } = scriptedScene('');
    let ran = 0;
    class Marker {
        static type = 'Marker';
        update() { ran++; }
    }
    scene.objects()[0].addComponent(new Marker());
    const other = scene.add(new Object('Other'));
    other.addComponent(new Marker());

    new Runtime(scene, { scripting, onError: () => {} }).step();

    assert.equal(ran, 2);
});

// --- determinism and portability --------------------------------------------------

test('the same context produces the same result', () => {
    const run = () => {
        const { scene, object } = scriptedScene({ speed: 60 });
        const input = new Input();
        const runtime = new Runtime(scene, {
            scripting: movementKind(),
            clock: new Clock({ fixedStep: 1 / 60 })
        });
        for (let i = 0; i < 30; i++) runtime.advance(1 / 60, input);
        return object.x;
    };

    assert.equal(run(), run());
});

test('scripting runs headless, with no renderer and no DOM', () => {
    // The server case: the same script, the same contract, no browser anywhere.
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');

    const { scene, object } = scriptedScene({ speed: 60 });
    const runtime = new Runtime(scene, {
        scripting: movementKind(),
        clock: new Clock({ fixedStep: 0.1 })
    });

    runtime.step();

    assert.equal(runtime.renders, false);
    assert.ok(Math.abs(object.x - 6) < 1e-9);
});

test('a Script draws nothing, so a scripted object costs no render transform', () => {
    // Deliberate: a permanent draw hook would make every logic-only scripted object pay
    // a save/setTransform/restore each frame and count as drawn.
    assert.equal(typeof Script.prototype.draw, 'undefined');
});
