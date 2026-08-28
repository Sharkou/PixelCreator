// The graph interpreter: events, flow, data, properties, failures, determinism
// (ADR-0027, ADR-0009 Q7, ADR-0015).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentDefinition,
    GraphError,
    GraphIssueCode,
    NodeRegistry,
    Object as SceneObject,
    PropertyType,
    Scene,
    Transform,
    ComponentRegistry,
    defineComponent,
    deserializeScene,
    observe,
    registerStandardNodes,
    serializeScene
} from '../../core/mod.js';
import { Behaviors } from './behaviors.js';
import { createGraphInterpreter, interpretGraph } from './interpreter.js';
import { validateGraph } from '../../core/graph/validate.js';
import { Runtime } from '../runtime.js';

const registry = registerStandardNodes(new NodeRegistry());

/**
 * A `.px` being written, with a helper to place and wire nodes by hand.
 */
function px({ label = 'Controller' } = {}) {
    const model = new ComponentDefinition({ type: 'res_c3', label }, { registry });
    return {
        model,
        property: spec => model.addProperty(spec),
        node: (type, params = {}) => model.graph.addNode({ type, params }),
        wire: (from, to) => model.graph.connect(
            { node: from[0].id, port: from[1] },
            { node: to[0].id, port: to[1] }
        )
    };
}

/**
 * Attach a Component built from a definition to an Object, as the Editor would.
 * @returns {{object: object, component: object}} The object and its reactive component
 */
function attach(definition) {
    const payload = definition.serialize();
    const Component = defineComponent(payload);
    const object = new SceneObject('Hero');
    object.addComponent(new Component());
    return { object, component: object.components[payload.type], payload };
}

function behaviourFor(definition, options = {}) {
    const { object, component, payload } = attach(definition);
    const create = interpretGraph(payload.graph, { registry, ...options });
    return { object, component, behavior: create(component) };
}

// --- events ---------------------------------------------------------------------------------

test('On Start runs once, on the first step', () => {
    const file = px();
    const counter = file.property({ name: 'runs', type: PropertyType.NUMBER, default: 0 });
    const start = file.node('event.start');
    const set = file.node('property.set', { property: counter.id });
    const one = file.node('value.number', { value: 1 });
    file.wire([start, 'out'], [set, 'in']);
    file.wire([one, 'value'], [set, 'value']);

    const { component, behavior } = behaviourFor(file.model);

    behavior.update(null, {});
    behavior.update(null, {});
    behavior.update(null, {});

    assert.equal(component.runs, 1);
});

test('On Update runs every step, and reads the step\'s own delta', () => {
    const file = px();
    const total = file.property({ name: 'total', type: PropertyType.NUMBER, default: 0 });
    const update = file.node('event.update');
    const get = file.node('property.get', { property: total.id });
    const add = file.node('math.add');
    const set = file.node('property.set', { property: total.id });

    file.wire([update, 'out'], [set, 'in']);
    file.wire([get, 'value'], [add, 'a']);
    file.wire([update, 'deltaTime'], [add, 'b']);
    file.wire([add, 'result'], [set, 'value']);

    const { component, behavior } = behaviourFor(file.model);

    behavior.update(null, { deltaTime: 0.5 });
    behavior.update(null, { deltaTime: 0.5 });

    assert.equal(component.total, 1);
});

test('a graph with no event node is inert, not broken', () => {
    const file = px();
    file.node('value.number', { value: 3 });

    const { behavior } = behaviourFor(file.model);

    assert.doesNotThrow(() => behavior.update(null, {}));
});

// --- flow -------------------------------------------------------------------------------------

test('Branch follows the side its condition says', () => {
    const file = px();
    const flag = file.property({ name: 'flag', type: PropertyType.BOOLEAN, default: false });
    const hit = file.property({ name: 'hit', type: PropertyType.STRING, default: '' });

    const update = file.node('event.update');
    const branch = file.node('flow.branch');
    const condition = file.node('property.get', { property: flag.id });
    const yes = file.node('property.set', { property: hit.id });
    const no = file.node('property.set', { property: hit.id });
    const yesText = file.node('value.string', { value: 'yes' });
    const noText = file.node('value.string', { value: 'no' });

    file.wire([update, 'out'], [branch, 'in']);
    file.wire([condition, 'value'], [branch, 'condition']);
    file.wire([branch, 'true'], [yes, 'in']);
    file.wire([branch, 'false'], [no, 'in']);
    file.wire([yesText, 'value'], [yes, 'value']);
    file.wire([noText, 'value'], [no, 'value']);

    const { component, behavior } = behaviourFor(file.model);

    behavior.update(null, {});
    assert.equal(component.hit, 'no');

    component.flag = true;
    behavior.update(null, {});
    assert.equal(component.hit, 'yes');
});

test('Sequence runs its first branch to the end before its second', () => {
    const file = px();

    const update = file.node('event.update');
    const outer = file.node('flow.sequence');
    const inner = file.node('flow.sequence');

    // A `Log` at each leaf, each fed its own text, so the ORDER is what is asserted.
    const leaves = ['a', 'b', 'c'].map(mark => {
        const log = file.node('debug.log');
        const text = file.node('value.string', { value: mark });
        file.wire([text, 'value'], [log, 'value']);
        return log;
    });

    file.wire([update, 'out'], [outer, 'in']);
    file.wire([outer, 'first'], [inner, 'in']);
    file.wire([outer, 'second'], [leaves[2], 'in']);
    file.wire([inner, 'first'], [leaves[0], 'in']);
    file.wire([inner, 'second'], [leaves[1], 'in']);

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const object = new SceneObject('Hero');
    object.addComponent(new Component());

    // The sink is handed in, so the order is observable without the node reaching for a
    // console — which is the whole reason `Log` takes its sink from the host.
    const seen = [];
    const create = interpretGraph(payload.graph, { registry, log: value => seen.push(value) });

    create(object.components[payload.type]).update(null, {});

    assert.deepEqual(seen, ['a', 'b', 'c'], 'depth-first, and in declaration order');
});

// --- data --------------------------------------------------------------------------------------

test('an unconnected data input takes the port\'s declared default', () => {
    const file = px();
    const result = file.property({ name: 'result', type: PropertyType.NUMBER, default: -1 });
    const update = file.node('event.update');
    const add = file.node('math.add');
    const set = file.node('property.set', { property: result.id });

    file.wire([update, 'out'], [set, 'in']);
    file.wire([add, 'result'], [set, 'value']);

    const { component, behavior } = behaviourFor(file.model);
    behavior.update(null, {});

    assert.equal(component.result, 0);
});

test('a value is evaluated once per flow step and shared by everything reading it', () => {
    const file = px();
    const out = file.property({ name: 'out', type: PropertyType.NUMBER, default: 0 });
    const update = file.node('event.update');
    const number = file.node('value.number', { value: 4 });
    const add = file.node('math.add');
    const set = file.node('property.set', { property: out.id });

    file.wire([update, 'out'], [set, 'in']);
    file.wire([number, 'value'], [add, 'a']);
    file.wire([number, 'value'], [add, 'b']);
    file.wire([add, 'result'], [set, 'value']);

    const { component, behavior } = behaviourFor(file.model);
    behavior.update(null, {});

    assert.equal(component.out, 8);
});

test('a Get Property after a Set Property reads what was just written', () => {
    const file = px();
    const value = file.property({ name: 'value', type: PropertyType.NUMBER, default: 0 });

    const update = file.node('event.update');
    const first = file.node('property.set', { property: value.id });
    const ten = file.node('value.number', { value: 10 });
    const sequence = file.node('flow.sequence');
    const read = file.node('property.get', { property: value.id });
    const add = file.node('math.add');
    const one = file.node('value.number', { value: 1 });
    const second = file.node('property.set', { property: value.id });

    file.wire([update, 'out'], [sequence, 'in']);
    file.wire([sequence, 'first'], [first, 'in']);
    file.wire([ten, 'value'], [first, 'value']);
    file.wire([sequence, 'second'], [second, 'in']);
    file.wire([read, 'value'], [add, 'a']);
    file.wire([one, 'value'], [add, 'b']);
    file.wire([add, 'result'], [second, 'value']);

    const { component, behavior } = behaviourFor(file.model);
    behavior.update(null, {});

    assert.equal(component.value, 11, 'a stale cache would have produced 1');
});

test('arithmetic and comparison do what they say, and dividing by zero yields zero', () => {
    const file = px();
    const out = file.property({ name: 'out', type: PropertyType.NUMBER, default: 0 });
    const update = file.node('event.update');
    const divide = file.node('math.divide');
    const set = file.node('property.set', { property: out.id });
    const numerator = file.node('value.number', { value: 8 });

    file.wire([update, 'out'], [set, 'in']);
    file.wire([numerator, 'value'], [divide, 'a']);
    file.wire([divide, 'result'], [set, 'value']);

    const { component, behavior } = behaviourFor(file.model);
    behavior.update(null, {});

    assert.equal(component.out, 0, 'not Infinity, which would spread through every frame after it');
});

// --- properties ---------------------------------------------------------------------------------

test('renaming a property leaves the running graph reading the same value', () => {
    const file = px();
    const speed = file.property({ name: 'speed', type: PropertyType.NUMBER, default: 7 });
    const out = file.property({ name: 'out', type: PropertyType.NUMBER, default: 0 });

    const update = file.node('event.update');
    const get = file.node('property.get', { property: speed.id });
    const set = file.node('property.set', { property: out.id });
    file.wire([update, 'out'], [set, 'in']);
    file.wire([get, 'value'], [set, 'value']);

    file.model.renameProperty(speed.id, 'walkSpeed');

    const { component, behavior } = behaviourFor(file.model);
    behavior.update(null, {});

    assert.equal(component.walkSpeed, 7);
    assert.equal(component.out, 7);
});

test('a node reading a property that was deleted throws a structured error', () => {
    const file = px();
    const speed = file.property({ name: 'speed', type: PropertyType.NUMBER, default: 7 });
    const out = file.property({ name: 'out', type: PropertyType.NUMBER, default: 0 });

    const update = file.node('event.update');
    const get = file.node('property.get', { property: speed.id });
    const set = file.node('property.set', { property: out.id });
    file.wire([update, 'out'], [set, 'in']);
    file.wire([get, 'value'], [set, 'value']);

    file.model.removeProperty(speed.id);

    const { behavior } = behaviourFor(file.model);

    assert.throws(() => behavior.update(null, {}), error => {
        assert.equal(error instanceof GraphError, true);
        assert.equal(error.code, GraphIssueCode.MISSING_PROPERTY);
        return true;
    });
});

test('a graph writes through the reactive component, so a write is observable', () => {
    const file = px();
    const speed = file.property({ name: 'speed', type: PropertyType.NUMBER, default: 0 });
    const update = file.node('event.update');
    const set = file.node('property.set', { property: speed.id });
    const nine = file.node('value.number', { value: 9 });
    file.wire([update, 'out'], [set, 'in']);
    file.wire([nine, 'value'], [set, 'value']);

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const scene = new Scene('Level', { registry: new ComponentRegistry() });
    const object = scene.add(new SceneObject('Hero'));
    object.addComponent(new Component());

    const component = object.components[payload.type];
    const changes = [];
    observe(component, 'speed', change => changes.push(change));
    const operations = [];
    scene.operations.on('operation', operation => operations.push(operation));

    const create = interpretGraph(payload.graph, { registry });
    create(component).update(object, {});

    assert.equal(changes.length, 1);
    assert.equal(changes[0].prop, 'speed');
    assert.equal(changes[0].value, 9);
    // A behaviour running inside update() is a simulation output, not an authored intent
    // (ADR-0003): it produces a Change and no Operation.
    assert.equal(operations.length, 0);
});

// --- failures ------------------------------------------------------------------------------------

test('a node type nobody declares refuses to be read', () => {
    assert.throws(
        () => interpretGraph({ version: 1, nodes: [{ id: 'n1', type: 'magic', params: {} }] }, { registry }),
        error => error.code === GraphIssueCode.UNKNOWN_NODE_TYPE
    );
});

test('a graph payload from an unknown version refuses to be read', () => {
    assert.throws(
        () => interpretGraph({ version: 42, nodes: [] }, { registry }),
        error => error.code === GraphIssueCode.UNKNOWN_VERSION
    );
});

test('a flow that never ends is stopped by the budget, not by the frame', () => {
    const file = px();
    const update = file.node('event.update');
    const first = file.node('flow.sequence');
    const second = file.node('flow.sequence');

    file.wire([update, 'out'], [first, 'in']);
    file.wire([first, 'first'], [second, 'in']);
    file.wire([second, 'first'], [first, 'in']);

    const { behavior } = behaviourFor(file.model, { budget: 200 });

    assert.throws(() => behavior.update(null, {}), error => {
        assert.equal(error.code, GraphIssueCode.BUDGET_EXCEEDED);
        return true;
    });
});

// --- the seam ---------------------------------------------------------------------------------------

test('the interpreter plugs into Behaviors, and each instance gets its own state', () => {
    const file = px();
    const runs = file.property({ name: 'runs', type: PropertyType.NUMBER, default: 0 });
    const start = file.node('event.start');
    const get = file.node('property.get', { property: runs.id });
    const add = file.node('math.add');
    const one = file.node('value.number', { value: 1 });
    const set = file.node('property.set', { property: runs.id });
    file.wire([start, 'out'], [set, 'in']);
    file.wire([get, 'value'], [add, 'a']);
    file.wire([one, 'value'], [add, 'b']);
    file.wire([add, 'result'], [set, 'value']);

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);

    const types = new ComponentRegistry();
    types.register(Transform);
    types.register(Component);
    const scene = new Scene('Level', { registry: types });

    const first = scene.add(new SceneObject('One'));
    const second = scene.add(new SceneObject('Two'));
    first.addComponent(new Component());
    second.addComponent(new Component());

    const runtime = new Runtime(scene, { behaviors });
    runtime.step();
    runtime.step();

    assert.equal(first.components[payload.type].runs, 1);
    assert.equal(second.components[payload.type].runs, 1, 'two instances never share an execution state');
});

test('a graph failure is isolated and reported, and the rest of the scene still runs', () => {
    const file = px();
    const speed = file.property({ name: 'speed', type: PropertyType.NUMBER, default: 1 });
    const update = file.node('event.update');
    const get = file.node('property.get', { property: speed.id });
    const set = file.node('property.set', { property: speed.id });
    file.wire([update, 'out'], [set, 'in']);
    file.wire([get, 'value'], [set, 'value']);
    file.model.removeProperty(speed.id);

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);

    const types = new ComponentRegistry();
    types.register(Transform);
    types.register(Component);
    const scene = new Scene('Level', { registry: types });

    const broken = scene.add(new SceneObject('Broken'));
    broken.addComponent(new Component());
    const fine = scene.add(new SceneObject('Fine'));
    fine.addComponent(new Transform(1, 2));

    const reports = [];
    const runtime = new Runtime(scene, { behaviors, onError: report => reports.push(report) });
    runtime.step();

    assert.equal(reports.length, 1);
    assert.equal(reports[0].phase, 'update');
    assert.equal(reports[0].error.code, GraphIssueCode.MISSING_PROPERTY);
    assert.equal(fine.components.Transform.x, 1, 'the rest of the scene is untouched');
    // ADR-0012: the runtime reports and changes nothing.
    assert.equal(broken.components[payload.type].active, undefined);
});

// --- determinism ---------------------------------------------------------------------------------------

test('the same graph and the same inputs reach the same state, twice', () => {
    const file = px();
    const total = file.property({ name: 'total', type: PropertyType.NUMBER, default: 0 });
    const update = file.node('event.update');
    const get = file.node('property.get', { property: total.id });
    const add = file.node('math.add');
    const step = file.node('value.number', { value: 3 });
    const set = file.node('property.set', { property: total.id });
    file.wire([update, 'out'], [set, 'in']);
    file.wire([get, 'value'], [add, 'a']);
    file.wire([step, 'value'], [add, 'b']);
    file.wire([add, 'result'], [set, 'value']);

    const payload = file.model.serialize();

    const run = () => {
        const Component = defineComponent(payload);
        const object = new SceneObject('Hero');
        object.addComponent(new Component());
        const component = object.components[payload.type];
        const behavior = interpretGraph(payload.graph, { registry })(component);
        for (let index = 0; index < 5; index++) behavior.update(object, { deltaTime: 1 / 60 });
        return component.total;
    };

    assert.equal(run(), 15);
    assert.equal(run(), run(), 'a client and a server must reach the same number');
});

// --- what an unconnected port yields (ADR-0031 §1) ---------------------------------------
//
// The priority is `connection > node.inputs[port] > the type's declared default`, and it is
// resolved in one place so the Editor and the Runtime cannot disagree. These run the graph
// rather than reading the model, because it is the RUNNING answer that matters.

/**
 * A `.px` whose graph adds two numbers and logs the result on every step.
 *
 * @returns {{file: object, add: object, log: () => number[]}} The graph and what it printed
 */
function adder() {
    const file = px();
    const update = file.node('event.update');
    const add = file.node('math.add');
    const print = file.node('debug.log');
    file.wire([update, 'out'], [print, 'in']);
    file.wire([add, 'result'], [print, 'value']);

    return {
        graph: file.model.graph,
        add,
        // COMPILED AT RUN TIME, NOT AT SETUP. A graph is read once and identified by its
        // object identity (ADR-0016 §7), so a behaviour built before the edits below would
        // faithfully run the graph as it was — which is right, and useless for a test
        // about what the edits do.
        run: () => {
            const printed = [];
            const { behavior } = behaviourFor(file.model, { log: value => printed.push(value) });
            behavior.update(null, { deltaTime: 0.016, time: 0 });
            return printed;
        }
    };
}

test('an unconnected input falls back to what the catalogue declares', () => {
    const { run } = adder();
    assert.deepEqual(run(), [0], 'Add declares both of its inputs as 0');
});

test('an instance value beats the declared default', () => {
    const { graph, add, run } = adder();

    graph.setInput(add.id, 'a', 5);
    graph.setInput(add.id, 'b', 7);

    assert.deepEqual(run(), [12]);
});

test('a connection beats an instance value', () => {
    const { graph, add, run } = adder();

    graph.setInput(add.id, 'a', 5);
    const literal = graph.addNode({ type: 'value.number', params: { value: 100 } });
    graph.connect({ node: literal.id, port: 'value' }, { node: add.id, port: 'a' });

    assert.deepEqual(run(), [100], 'the wire wins, and the 5 waits behind it');
});

test('unwiring gives the instance value back', () => {
    const { graph, add, run } = adder();

    graph.setInput(add.id, 'a', 5);
    const literal = graph.addNode({ type: 'value.number', params: { value: 100 } });
    const wire = graph.connect({ node: literal.id, port: 'value' }, { node: add.id, port: 'a' });
    graph.disconnect(wire.id);

    assert.deepEqual(run(), [5], 'wiring and unwiring is a non-destructive experiment');
});

test('zero is a value a creator meant, not an absence', () => {
    const { graph, add, run } = adder();

    graph.setInput(add.id, 'a', 0);
    graph.setInput(add.id, 'b', 4);
    assert.deepEqual(run(), [4]);
});

test('clearing an instance value returns the port to the catalogue', () => {
    const { graph, add, run } = adder();

    graph.setInput(add.id, 'a', 5);
    graph.setInput(add.id, 'b', 5);
    graph.clearInput(add.id, 'a');

    assert.deepEqual(run(), [5], '0 + 5');
});

// --- the scene around this component (ADR-0034 §3.2 and §3.3) ---------------------------
//
// `Log` is how these tests observe what a port carried: its input is `any`, so a handle
// reaches it unchanged and can be compared by IDENTITY — which is the whole point of a
// handle, and something an identifier could never be checked for.

/**
 * A `.px` run against a real scene, with one value piped into `Log`.
 *
 * @param {Function} build - (sheet, scene) => [node, port] to observe, or nothing
 * @returns {object} The scene, the object, the payload, what was logged, and a step()
 */
function inScene(build) {
    const scene = new Scene('Main');
    const written = [];
    const sheet = px();

    const update = sheet.node('event.update');
    const log = sheet.node('debug.log');
    sheet.wire([update, 'out'], [log, 'in']);

    const observed = build(sheet, scene);
    if (observed) sheet.wire(observed, [log, 'value']);

    const payload = sheet.model.serialize();
    const Component = defineComponent(payload);
    const object = scene.add(new SceneObject('Hero'));
    object.addComponent(new Component());

    const behavior = interpretGraph(payload.graph, {
        registry,
        log: value => written.push(value)
    })(object.components[payload.type]);

    return {
        scene,
        object,
        written,
        model: sheet.model,
        step: () => behavior.update(object, { time: 0, deltaTime: 0.016, scene })
    };
}

test('Self yields the very Object the scene holds, not a copy of it', () => {
    const it = inScene(sheet => [sheet.node('scene.self'), 'object']);

    it.step();

    assert.equal(it.written[0], it.object);
    assert.equal(it.written[0], it.scene.get(it.object.id));
});

test('Parent yields the Object above the one it is given', () => {
    const it = inScene(sheet => {
        const self = sheet.node('scene.self');
        const parent = sheet.node('scene.parent');
        sheet.wire([self, 'object'], [parent, 'object']);
        return [parent, 'parent'];
    });

    it.step();
    assert.equal(it.written[0], null, 'a root has nothing above it');

    const above = it.scene.add(new SceneObject('Above'));
    above.addChild(it.object);
    it.step();
    assert.equal(it.written[1], above);
});

test('an unconnected object input yields nothing', () => {
    // ADR-0034 §3.2. It is not "Self", and it is not an error: a port with nothing wired to
    // it answers with the absence of an Object, which is the one thing it can honestly say.
    const it = inScene(sheet => [sheet.node('scene.parent'), 'parent']);

    it.step();

    assert.equal(it.written[0], null);
});

test('Find By Tag answers the first Object in hierarchy order, not in insertion order', () => {
    let a, b;
    const it = inScene((sheet, scene) => {
        a = scene.add(new SceneObject('A', { tag: 'enemy' }));
        b = scene.add(new SceneObject('B', { tag: 'enemy' }));
        const find = sheet.node('scene.findByTag');
        sheet.model.graph.setInput(find.id, 'tag', 'enemy');
        return [find, 'object'];
    });

    it.step();
    assert.equal(it.written[0], a);

    // A goes under B. The tree changed; the storage did not — and it is the tree that
    // decides, because it is the tree that both machines hold (ADR-0034 §3.1).
    it.scene.reparent(a, b, 0);
    it.step();

    assert.equal(it.written[1], b, 'B is first now, because B is first in the tree');
    assert.equal(it.scene.objects()[0], a, 'while the storage still lists A first');
});

test('Find By Tag with no tag finds nothing rather than the first object of the scene', () => {
    // Every Object carries an empty tag by default, so matching on one would answer with
    // whichever object happens to come first — a silent wrong answer.
    const it = inScene((sheet, scene) => {
        scene.add(new SceneObject('Untagged'));
        return [sheet.node('scene.findByTag'), 'object'];
    });

    it.step();

    assert.equal(it.written[0], null);
});

test('Is Valid tells a handle from nothing', () => {
    const held = inScene(sheet => {
        const self = sheet.node('scene.self');
        const check = sheet.node('object.isValid');
        sheet.wire([self, 'object'], [check, 'object']);
        return [check, 'result'];
    });
    held.step();
    assert.equal(held.written[0], true);

    const empty = inScene(sheet => [sheet.node('object.isValid'), 'result']);
    empty.step();
    assert.equal(empty.written[0], false);
});

test('no handle, and no identity of a scene, reaches the serialized `.px`', () => {
    // ADR-0034 invariants 1 and 3. What a `.px` carries is node types, port identifiers and
    // positions. A handle is runtime and nothing else, and no node turns one back into an
    // identifier — which is what lets the same `.px` be used in more than one scene.
    const it = inScene((sheet, scene) => {
        scene.add(new SceneObject('Target', { tag: 'enemy' }));

        const self = sheet.node('scene.self');
        const parent = sheet.node('scene.parent');
        const find = sheet.node('scene.findByTag');
        const check = sheet.node('object.isValid');
        sheet.model.graph.setInput(find.id, 'tag', 'enemy');
        sheet.wire([self, 'object'], [parent, 'object']);
        sheet.wire([find, 'object'], [check, 'object']);
        return [check, 'result'];
    });

    it.step();

    const payload = it.model.serialize();
    const text = JSON.stringify(payload);

    for (const object of it.scene.objects()) {
        assert.equal(text.includes(object.id), false, `${object.name}'s identity reached the payload`);
    }
    assert.deepEqual(JSON.parse(text), payload, 'the payload is plain JSON, so it holds no handle');
});

// --- reaching another Object's Component (ADR-0034 §3.3) --------------------------------

/**
 * A scene where a `.px` reaches a tagged Object carrying a `Health` Component.
 *
 * The target is found by tag, which is how a graph names something it does not own: no
 * identity of a scene enters the `.px`, only a string of project scope.
 *
 * @param {Function} build - (sheet, parts) => [node, port] to observe, or nothing
 * @param {object} [options] - `{ attached }` — whether the target carries the Component
 */
function reaching(build, { attached = true, tag = 'enemy' } = {}) {
    const catalogue = new ComponentRegistry();
    const Health = defineComponent({
        type: 'res_health',
        label: 'Health',
        properties: { hp: { id: 'p_hp', type: PropertyType.NUMBER, default: 3 } }
    });
    catalogue.register(Health);

    const scene = new Scene('Main', { registry: catalogue });
    const target = scene.add(new SceneObject('Enemy', { tag: 'enemy' }));
    if (attached) target.addComponent(new Health());

    const written = [];
    const sheet = px();
    const update = sheet.node('event.update');
    const find = sheet.node('scene.findByTag');
    sheet.model.graph.setInput(find.id, 'tag', tag);

    const observed = build(sheet, { update, find, scene, target });

    if (observed) {
        const log = sheet.node('debug.log');
        sheet.wire([update, 'out'], [log, 'in']);
        sheet.wire(observed, [log, 'value']);
    }

    const payload = sheet.model.serialize();
    const Behaviour = defineComponent(payload);
    const holder = scene.add(new SceneObject('Hero'));
    holder.addComponent(new Behaviour());

    const behavior = interpretGraph(payload.graph, {
        registry,
        log: value => written.push(value)
    })(holder.components[payload.type]);

    return {
        scene,
        target,
        holder,
        written,
        health: () => target.getComponent('res_health') ?? null,
        step: () => behavior.update(holder, { time: 0, deltaTime: 0.016, scene })
    };
}

/** A `.px` that reads `hp` off whatever the Find node produced. */
const reads = (sheet, { find }) => {
    const get = sheet.node('property.get', { component: 'res_health', property: 'p_hp' });
    sheet.wire([find, 'object'], [get, 'object']);
    return [get, 'value'];
};

/** A `.px` that writes a number into `hp` on whatever the Find node produced. */
const writes = value => (sheet, { update, find }) => {
    const set = sheet.node('property.set', { component: 'res_health', property: 'p_hp' });
    const literal = sheet.node('value.number', { value });
    sheet.wire([update, 'out'], [set, 'in']);
    sheet.wire([find, 'object'], [set, 'object']);
    sheet.wire([literal, 'value'], [set, 'value']);
    return null;
};

test('Get Property reads the property of a Component on another Object', () => {
    const it = reaching(reads);
    it.health().hp = 7;

    it.step();

    assert.equal(it.written[0], 7);
});

test('Get Property answers the declared default when there is nothing to read', () => {
    // A TARGET THAT IS GONE IS A STATE OF THE SCENE, NOT A FAULT (ADR-0034 §3.4). All three
    // shapes of absence answer the same way, and none of them reports an error.
    const missing = reaching(reads, { tag: 'nobody' });
    missing.step();
    assert.equal(missing.written[0], 3, 'nothing was found');

    const bare = reaching(reads, { attached: false });
    bare.step();
    assert.equal(bare.written[0], 3, 'the Object does not carry the Component');

    const removed = reaching(reads);
    removed.health().hp = 9;
    removed.step();
    assert.equal(removed.written[0], 9);
    removed.scene.remove(removed.target);
    removed.step();
    assert.equal(removed.written[1], 3, 'the Object was deleted between two steps');
});

test('Set Property writes onto the Component of another Object', () => {
    const it = reaching(writes(12));

    it.step();

    assert.equal(it.health().hp, 12);
});

test('Set Property does nothing when there is nothing to write to', () => {
    const missing = reaching(writes(12), { tag: 'nobody' });
    assert.doesNotThrow(() => missing.step());
    assert.equal(missing.health().hp, 3, 'the target was never found, so nothing moved');

    const bare = reaching(writes(12), { attached: false });
    assert.doesNotThrow(() => bare.step());
    assert.equal(bare.target.getComponent('res_health'), undefined);

    const removed = reaching(writes(12));
    removed.scene.remove(removed.target);
    assert.doesNotThrow(() => removed.step());
    assert.equal(removed.health().hp, 3, 'a deleted target is a no-op, not a failure');
});

test('a write onto another Object is observable, and is still not an Operation', () => {
    // ADR-0034 invariant 5, and the same rule `Set Property` lives by: a behaviour running
    // inside `update()` is a simulation output, so it produces a Change and nothing else.
    // An Operation per frame per instance is what a graph must never put on a network.
    const it = reaching(writes(12));

    const changes = [];
    const operations = [];
    observe(it.health(), 'hp', change => changes.push(change.value));
    it.scene.operations.on('operation', operation => operations.push(operation));

    it.step();
    it.step();
    it.step();

    assert.deepEqual(changes, [12], 'written once, and then already equal');
    assert.deepEqual(operations, [], 'three steps, no Operation');
});

test('a node naming a Component type nothing declares refuses, with the reason', () => {
    // A reference a design-time check COULD resolve and cannot is a fault (ADR-0034 §3.4),
    // and it is told apart from a target that simply is not there.
    const it = reaching((sheet, { find }) => {
        const get = sheet.node('property.get', { component: 'res_ghost', property: 'p_hp' });
        sheet.wire([find, 'object'], [get, 'object']);
        return [get, 'value'];
    });

    assert.throws(() => it.step(), error => error instanceof GraphError
        && error.code === GraphIssueCode.MISSING_PROPERTY);
});

// --- one node, whichever Object it acts on (ADR-0040 §2, §3) -----------------------------
//
// FOUR NODES BECAME TWO. `Get Property On` existed because the Core looks in two places for
// a property — this Component's own declarations, or those of a type named in a param — and
// the creator was made to choose between them by picking a NODE. That is an engine
// distinction, and it was never the creator's question: they want a value, and where it is
// filed is the answer's shape.
//
// SO THE MERGED NODE ANSWERS ALL THREE CASES, and the tests are the three: this Component's
// own property, another Component on the SAME Object (nothing wired, nothing pointed at —
// Self), and a Component on another Object (a wire). Nothing about the node changes but the
// answer to its one picker.

test('an empty Object port means Self, so a node reaches its own Object\'s other Components', () => {
    // THE COMMONEST SENTENCE A BEGINNER WRITES: "turn me". It used to need `Get Property On`
    // plus a `Self` node plus a wire; it is now one node with nothing connected (ADR-0040 §3).
    const file = px();
    const update = file.node('event.update');
    const set = file.node('property.set', { component: 'Transform', property: 'x' });
    const literal = file.node('value.number', { value: 42 });
    file.wire([update, 'out'], [set, 'in']);
    file.wire([literal, 'value'], [set, 'value']);

    const payload = file.model.serialize();
    const Behaviour = defineComponent(payload);
    const catalogue = new ComponentRegistry();
    catalogue.register(Transform);
    const scene = new Scene('Main', { registry: catalogue });
    const holder = scene.add(new SceneObject('Hero'));
    holder.addComponent(new Transform());
    holder.addComponent(new Behaviour());

    const behavior = interpretGraph(payload.graph, { registry })(holder.components[payload.type]);
    behavior.update(holder, { time: 0, deltaTime: 0.016, scene });

    assert.equal(holder.components.Transform.x, 42, 'no wire, no picker, and it found itself');
});

test('the same node with nothing named at all still reads this Component\'s own property', () => {
    // The case that used to be a DIFFERENT node type. No Component named means this one.
    const file = px();
    const speed = file.property({ name: 'speed', type: PropertyType.NUMBER, default: 5 });
    const update = file.node('event.update');
    const get = file.node('property.get', { property: speed.id });
    const log = file.node('debug.log');
    file.wire([update, 'out'], [log, 'in']);
    file.wire([get, 'value'], [log, 'value']);

    const written = [];
    const { behavior } = behaviourFor(file.model, { log: value => written.push(value) });
    behavior.update(null, {});

    assert.deepEqual(written, [5]);
});

// --- a graph written before the merge (ADR-0040 §2) --------------------------------------
//
// THE SECOND DOOR. `Graph.deserialize` migrates what the Editor loads; the Runtime never
// builds a `Graph` at all — it compiles the raw payload straight off the `.px` — so a
// migration that lived only in the model would rename nodes in the editor and leave every
// published game refusing to run. Both doors, one table.

test('a published graph naming the removed node types still runs', () => {
    const file = px();
    const speed = file.property({ name: 'speed', type: PropertyType.NUMBER, default: 5 });
    const update = file.node('event.update');
    const get = file.node('property.get', { property: speed.id });
    const log = file.node('debug.log');
    file.wire([update, 'out'], [log, 'in']);
    file.wire([get, 'value'], [log, 'value']);

    // The payload as a `.px` published before the merge holds it: the old name, on disk.
    const payload = file.model.serialize();
    payload.graph.nodes.find(node => node.type === 'property.get').type = 'property.getOn';

    const written = [];
    const Behaviour = defineComponent(payload);
    const holder = new SceneObject('Hero');
    holder.addComponent(new Behaviour());

    const behavior = interpretGraph(payload.graph, {
        registry,
        log: value => written.push(value)
    })(holder.components[payload.type]);
    behavior.update(null, {});

    assert.deepEqual(written, [5], 'the old name compiled as the node that replaced it');
});

test('an unknown node type is still refused, so the migration is a table and not a shrug', () => {
    const file = px();
    const payload = file.model.serialize();
    payload.graph.nodes.push({ id: 'x', type: 'property.getSideways', x: 0, y: 0, params: {} });

    assert.throws(() => interpretGraph(payload.graph, { registry }),
        error => error instanceof GraphError && error.code === GraphIssueCode.UNKNOWN_NODE_TYPE);
});

// --- a graph written before the event split (ADR-0041 §3.3) ------------------------------

test('a graph that read Is Down off the old Key node still reads it', () => {
    // THE HALF THAT IS NOT A MIGRATION AT ALL. `input.key` kept its type name and its `held`
    // port precisely so this graph would not need one — only the label changed.
    const it = keyboard();

    it.input.local.press('Space');
    it.runtime.step();

    assert.equal(it.component.held, true);
});

test('a wire to a port the split removed is skipped, and the rest of the graph runs', () => {
    // The honest degradation (ADR-0041 §3.3): a fil naming `pressed` on the state node is
    // reported by the validator and stepped over by the interpreter, rather than rewritten
    // into a topology nobody asked for.
    const file = px();
    const flag = file.property({ name: 'flag', type: PropertyType.BOOLEAN, default: false });
    const seen = file.property({ name: 'seen', type: PropertyType.BOOLEAN, default: false });

    const update = file.node('event.update');
    const key = file.node('input.key', { key: 'Space' });
    const stale = file.node('property.set', { property: flag.id });
    const alive = file.node('property.set', { property: seen.id });
    const yes = file.node('value.boolean', { value: true });

    file.wire([update, 'out'], [stale, 'in']);
    file.wire([stale, 'out'], [alive, 'in']);
    file.wire([yes, 'value'], [alive, 'value']);

    // The payload as an older build wrote it: a data wire off a port that is gone.
    const payload = file.model.serialize();
    payload.graph.connections.push({
        id: 'stale',
        from: { node: key.id, port: 'pressed' },
        to: { node: stale.id, port: 'value' }
    });

    const issues = validateGraph(payload.graph, { registry });
    assert.ok(issues.some(issue => issue.connection === 'stale'), 'the panel is told which wire');

    const Component = defineComponent(payload);
    const holder = new SceneObject('Hero');
    holder.addComponent(new Component());
    const behavior = interpretGraph(payload.graph, { registry })(holder.components[payload.type]);

    assert.doesNotThrow(() => behavior.update(null, {}));
    assert.equal(holder.components[payload.type].seen, true, 'everything after the stale wire ran');
});

// --- what an object port will and will not take (ADR-0034 §3.6) -------------------------

/**
 * `Is Valid` as the observer: it answers whether an Object arrived at all, which is exactly
 * the question the protection decides.
 *
 * @param {Function} [forge] - (graph, node) => void, to plant a value the Editor never would
 */
function reachesPort(forge, { wireSelf = false } = {}) {
    const scene = new Scene('Main');
    const written = [];
    const sheet = px();

    const update = sheet.node('event.update');
    const check = sheet.node('object.isValid');
    const log = sheet.node('debug.log');
    sheet.wire([update, 'out'], [log, 'in']);
    sheet.wire([check, 'result'], [log, 'value']);

    if (wireSelf) sheet.wire([sheet.node('scene.self'), 'object'], [check, 'object']);
    forge?.(sheet.model.graph, check);

    const payload = sheet.model.serialize();
    const Behaviour = defineComponent(payload);
    const object = scene.add(new SceneObject('Hero'));
    object.addComponent(new Behaviour());

    interpretGraph(payload.graph, { registry, log: value => written.push(value) })(
        object.components[payload.type]
    ).update(object, { time: 0, deltaTime: 0.016, scene });

    return written[0];
}

test('an object port takes a handle from a wire, and a value from nowhere else', () => {
    assert.equal(reachesPort(null, { wireSelf: true }), true, 'a real handle travels');
    assert.equal(reachesPort(null), false, 'an unconnected port yields nothing');

    // THE THREE SHAPES A FORCED VALUE COULD TAKE, and the last is why the protection refuses
    // the VALUE rather than inspecting it: a forged record is indistinguishable from a
    // handle to anything that duck-types.
    assert.equal(reachesPort(graph => graph.setInput(graph.nodes()[1].id, 'object', 'obj_7f3a91c2')), false);
    assert.equal(reachesPort(graph => graph.setInput(graph.nodes()[1].id, 'object', 42)), false);
    assert.equal(
        reachesPort(graph => graph.setInput(graph.nodes()[1].id, 'object', { id: 'obj_fake', name: 'Fake' })),
        false
    );
});

test('a payload written by hand cannot smuggle an Object into a port either', () => {
    // The protection lives in the interpreter's own fallback, so it holds for a `.px` that
    // no Editor produced — which is the only way such a value could exist at all.
    const scene = new Scene('Main');
    const object = scene.add(new SceneObject('Hero'));
    const written = [];

    const forged = {
        version: 1,
        nodes: [
            { id: 'n1', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'n2', type: 'object.isValid', x: 0, y: 0, params: {}, inputs: { object: 'obj_7f3a91c2' } },
            { id: 'n3', type: 'debug.log', x: 0, y: 0, params: {} }
        ],
        connections: [
            { id: 'c1', from: { node: 'n1', port: 'out' }, to: { node: 'n3', port: 'in' } },
            { id: 'c2', from: { node: 'n2', port: 'result' }, to: { node: 'n3', port: 'value' } }
        ]
    };

    class Bare { static type = 'res_bare'; static schema = {}; }
    object.addComponent(new Bare());

    interpretGraph(forged, { registry, log: value => written.push(value) })(object.components.res_bare)
        .update(object, { time: 0, deltaTime: 0.016, scene });

    assert.deepEqual(written, [false], 'the identity in the payload never became an Object');
});

// --- the objectref boundary (ADR-0034 §3.5, ADR-0036) -----------------------------------
//
// A property declared `objectref` is an IDENTITY where it is stored and a HANDLE where it
// travels. `portTypeOf()` has always translated the type; these cover the translation of
// the VALUE, in both directions, through a running graph.

/**
 * A scene where a `.px` reads and writes references — its own, and another Object's.
 *
 * `Link` carries nothing but a reference, declared exactly as §3.5 declares one, so both
 * `Get Property` (the graph's own Component) and `Get Property` (someone else's) can be
 * aimed at the same shape of value.
 *
 * @param {Function} build - (sheet, parts) => [node, port] to observe, or nothing
 * @param {object} [options] - `{ own, linked }` — what each reference starts at, given the
 *   scene's objects; `remove` names an object to delete before the step
 */
function referencing(build, { own, linked, remove = null } = {}) {
    const catalogue = new ComponentRegistry();
    const Link = defineComponent({
        type: 'res_link',
        label: 'Link',
        properties: { target: { id: 'p_target', type: PropertyType.OBJECTREF, default: null } }
    });
    catalogue.register(Link);

    const scene = new Scene('Main', { registry: catalogue });
    const root = scene.add(new SceneObject('Root'));
    const player = scene.add(new SceneObject('Player'));
    root.addChild(player);
    const enemy = scene.add(new SceneObject('Enemy', { tag: 'enemy' }));
    enemy.addComponent(new Link());

    const written = [];
    const sheet = px();
    const mine = sheet.property({ name: 'target', type: PropertyType.OBJECTREF });
    const update = sheet.node('event.update');

    const observed = build(sheet, { update, scene, root, player, enemy, mine });
    if (observed) {
        const log = sheet.node('debug.log');
        sheet.wire([update, 'out'], [log, 'in']);
        sheet.wire(observed, [log, 'value']);
    }

    const payload = sheet.model.serialize();
    catalogue.register(defineComponent(payload));
    const holder = scene.add(new SceneObject('Hero'));
    holder.addComponent(new (catalogue.get(payload.type))());
    const component = holder.components[payload.type];

    if (own !== undefined) component.target = own({ root, player, enemy, holder });
    if (linked !== undefined) enemy.getComponent('res_link').target = linked({ root, player, enemy, holder });
    if (remove) scene.remove(remove({ root, player, enemy, holder }));

    const behavior = interpretGraph(payload.graph, { registry, log: value => written.push(value) })(component);

    return {
        scene,
        holder,
        player,
        enemy,
        component,
        catalogue,
        payload,
        written,
        link: () => enemy.getComponent('res_link') ?? null,
        step: () => behavior.update(holder, { time: 0, deltaTime: 0.016, scene })
    };
}

/** Reads the graph's OWN reference, and reports whether an Object arrived. */
const ownIsValid = (sheet, { mine }) => {
    const get = sheet.node('property.get', { property: mine.id });
    const check = sheet.node('object.isValid');
    sheet.wire([get, 'value'], [check, 'object']);
    return [check, 'result'];
};

/** Reads the graph's OWN reference, and reports the parent of whatever it points at. */
const ownParent = (sheet, { mine }) => {
    const get = sheet.node('property.get', { property: mine.id });
    const parent = sheet.node('scene.parent');
    sheet.wire([get, 'value'], [parent, 'object']);
    return [parent, 'parent'];
};

/** Reads ANOTHER Object's reference, found by tag, and reports what arrived. */
const foreignRead = observer => (sheet, parts) => {
    const find = sheet.node('scene.findByTag');
    sheet.model.graph.setInput(find.id, 'tag', 'enemy');
    const get = sheet.node('property.get', { component: 'res_link', property: 'p_target' });
    sheet.wire([find, 'object'], [get, 'object']);

    const node = sheet.node(observer);
    sheet.wire([get, 'value'], [node, 'object']);
    return [node, observer === 'scene.parent' ? 'parent' : 'result'];
};

test('a live reference of this Component is read as a handle, not as an identity', () => {
    const valid = referencing(ownIsValid, { own: ({ player }) => player.id });
    valid.step();
    assert.equal(valid.written[0], true, 'an Object arrived');

    // THE TEST THAT SAYS IT IS REALLY A HANDLE. `Is Valid` only proves the value is not
    // null — an ObjectId string would have passed it. Reading the hierarchy through it
    // cannot be faked by a string.
    const parent = referencing(ownParent, { own: ({ player }) => player.id });
    parent.step();
    assert.equal(parent.written[0], parent.scene.get(parent.player.parent.id));
    assert.equal(parent.written[0].name, 'Root');
});

test('a live reference of ANOTHER Object\'s Component is read as a handle too', () => {
    const valid = referencing(foreignRead('object.isValid'), { linked: ({ player }) => player.id });
    valid.step();
    assert.equal(valid.written[0], true);

    const parent = referencing(foreignRead('scene.parent'), { linked: ({ player }) => player.id });
    parent.step();
    assert.equal(parent.written[0]?.name, 'Root', 'Get Property crosses the same boundary');
});

test('a reference whose target was deleted is nothing, and never the old identity', () => {
    // THE DEFECT THIS CLOSES. The stored ObjectId survives the deletion on purpose (§3.4);
    // what must not survive is its passage onto a port typed `object`, or `Is Valid` — the
    // one thing a creator has to defend themselves with — answers `true` on a dead target.
    const valid = referencing(ownIsValid, {
        own: ({ player }) => player.id,
        remove: ({ player }) => player
    });
    valid.step();

    assert.equal(valid.written[0], false, 'nothing arrived');
    assert.equal(typeof valid.component.target, 'string', 'and the stored identity was kept');

    const parent = referencing(ownParent, {
        own: ({ player }) => player.id,
        remove: ({ player }) => player
    });
    parent.step();
    assert.equal(parent.written[0], null, 'a deleted target has no parent');

    const foreign = referencing(foreignRead('object.isValid'), {
        linked: ({ player }) => player.id,
        remove: ({ player }) => player
    });
    foreign.step();
    assert.equal(foreign.written[0], false, 'and the same holds through Get Property');
});

test('an empty reference is nothing', () => {
    const valid = referencing(ownIsValid, { own: () => null });
    valid.step();
    assert.equal(valid.written[0], false);

    const parent = referencing(ownParent, { own: () => null });
    parent.step();
    assert.equal(parent.written[0], null);
});

/** Writes whatever `Self` produces into the graph's own reference. */
const writeSelf = (sheet, { update, mine }) => {
    const self = sheet.node('scene.self');
    const set = sheet.node('property.set', { property: mine.id });
    sheet.wire([update, 'out'], [set, 'in']);
    sheet.wire([self, 'object'], [set, 'value']);
    return null;
};

/** Writes whatever `Self` produces into ANOTHER Object's reference. */
const writeSelfOn = (sheet, { update }) => {
    const self = sheet.node('scene.self');
    const find = sheet.node('scene.findByTag');
    sheet.model.graph.setInput(find.id, 'tag', 'enemy');
    const set = sheet.node('property.set', { component: 'res_link', property: 'p_target' });
    sheet.wire([update, 'out'], [set, 'in']);
    sheet.wire([find, 'object'], [set, 'object']);
    sheet.wire([self, 'object'], [set, 'value']);
    return null;
};

test('writing a handle into a reference stores the identity, never the handle', () => {
    const it = referencing(writeSelf);
    it.step();

    assert.equal(it.component.target, it.holder.id);
    assert.equal(typeof it.component.target, 'string', 'a handle is never a stored value');
});

test('writing a handle onto ANOTHER Object\'s reference stores the identity too', () => {
    const it = referencing(writeSelfOn);
    it.step();

    assert.equal(it.link().target, it.holder.id);
    assert.equal(typeof it.link().target, 'string');
});

test('a scene carrying a written reference serializes it as an identity', () => {
    // INVARIANT 3: a handle is never persisted, nor serialized. Before the boundary was
    // closed this wrote the whole Object record — name, tag, layer, owner — into the scene.
    const it = referencing(writeSelf);
    it.step();

    const payload = serializeScene(it.scene);
    const hero = payload.objects.find(entry => entry.name === 'Hero');
    const values = hero.components.find(entry => entry.type === it.payload.type).values;

    assert.equal(values.target, it.holder.id);
    assert.equal(typeof values.target, 'string');

    // Stated as the invariant rather than as a shape: NO component value anywhere in the
    // payload is a record. A handle serializes as one, so this catches the defect wherever
    // it could reappear rather than only where it appeared.
    for (const entry of payload.objects) {
        for (const component of entry.components) {
            for (const [key, value] of globalThis.Object.entries(component.values)) {
                assert.ok(value === null || typeof value !== 'object',
                    `${entry.name}.${component.type}.${key} holds a record rather than a value`);
            }
        }
    }
});

test('a reference survives the round trip and is read back as a handle', () => {
    const it = referencing(writeSelf);
    it.step();

    const restored = deserializeScene(serializeScene(it.scene), { registry: it.catalogue });
    const hero = restored.objects().find(object => object.name === 'Hero');

    assert.equal(hero.components[it.payload.type].target, it.holder.id, 'the identity came back');

    // And it resolves, in the restored scene, to the Object it names — which is the whole
    // point of storing an identity rather than a handle.
    const behavior = interpretGraph(it.payload.graph, { registry })(hero.components[it.payload.type]);
    assert.doesNotThrow(() => behavior.update(hero, { time: 0, deltaTime: 0.016, scene: restored }));
    assert.equal(restored.get(hero.components[it.payload.type].target), hero);
});

test('a reference to a deleted Object survives serialization and still resolves to nothing', () => {
    const it = referencing(ownIsValid, { own: ({ player }) => player.id });
    it.scene.remove(it.player);

    const restored = deserializeScene(serializeScene(it.scene), { registry: it.catalogue });
    const hero = restored.objects().find(object => object.name === 'Hero');
    const component = hero.components[it.payload.type];

    assert.equal(component.target, it.player.id, 'the value is kept, as §3.4 requires');
    assert.equal(restored.get(component.target), undefined, 'and it resolves to nothing');

    const written = [];
    interpretGraph(it.payload.graph, { registry, log: value => written.push(value) })(component)
        .update(hero, { time: 0, deltaTime: 0.016, scene: restored });

    assert.deepEqual(written, [false], 'a dead reference reads as nothing after a reload too');
});

test('closing the boundary opened no path from a graph value to an Object', () => {
    // ADR-0034 §3.6 stands untouched: what is resolved is an instance value whose type is
    // DECLARED, and a value forged into `node.inputs` is still refused without inspection.
    // A record shaped like a stored reference is the sharpest case, because it is exactly
    // what the read path now accepts — from the other side of the boundary.
    assert.equal(reachesPort(graph => graph.setInput(graph.nodes()[1].id, 'object', 'obj_7f3a91c2')), false);

    // THE TWO PROVENANCES, ON ONE GRAPH, THROUGH ONE NODE TYPE. The forged record sits on an
    // UNCONNECTED port, which is the only place `defaultOf()` is consulted and therefore the
    // only place the refusal can be observed — a wired port never reaches it.
    const it = referencing((sheet, { update, mine }) => {
        const get = sheet.node('property.get', { property: mine.id });
        const declared = sheet.node('object.isValid');
        sheet.wire([get, 'value'], [declared, 'object']);

        const forged = sheet.node('object.isValid');
        sheet.model.graph.setInput(forged.id, 'object', { id: 'obj_fake', name: 'Fake' });

        const first = sheet.node('debug.log');
        const second = sheet.node('debug.log');
        sheet.wire([update, 'out'], [first, 'in']);
        sheet.wire([first, 'out'], [second, 'in']);
        sheet.wire([declared, 'result'], [first, 'value']);
        sheet.wire([forged, 'result'], [second, 'value']);
        return null;
    }, { own: ({ player }) => player.id });

    it.step();
    assert.deepEqual(it.written, [true, false],
        'the declared reference resolved, and the forged record did not');
});

test('a property that is not a reference is unchanged by the boundary', () => {
    // Every other shape of value crosses the same four nodes and must be handed over as it
    // is — including the falsy ones, which a nullish translation would have replaced.
    const sheet = px();
    const count = sheet.property({ name: 'count', type: PropertyType.NUMBER, default: 0 });
    const flag = sheet.property({ name: 'flag', type: PropertyType.BOOLEAN, default: false });
    const label = sheet.property({ name: 'label', type: PropertyType.STRING, default: '' });

    const update = sheet.node('event.update');
    const log = sheet.node('debug.log');
    const get = sheet.node('property.get', { property: count.id });
    const set = sheet.node('property.set', { property: flag.id });
    const text = sheet.node('property.set', { property: label.id });
    const literal = sheet.node('value.string', { value: 'named' });

    sheet.wire([update, 'out'], [set, 'in']);
    sheet.wire([set, 'out'], [text, 'in']);
    sheet.wire([text, 'out'], [log, 'in']);
    sheet.wire([get, 'value'], [log, 'value']);
    sheet.wire([literal, 'value'], [text, 'value']);
    sheet.model.graph.setInput(set.id, 'value', false);

    const written = [];
    const { object, component, behavior } = behaviourFor(sheet.model, { log: value => written.push(value) });
    component.count = 0;
    // Started at the opposite value, so `false` landing here proves the write happened AND
    // that it was not turned into a null on the way.
    component.flag = true;
    behavior.update(object, { time: 0, deltaTime: 0.016, scene: new Scene('Main') });

    assert.deepEqual(written, [0], 'a zero is a value, not an absence');
    assert.equal(component.flag, false, 'and so is a false');
    assert.equal(component.label, 'named');
});

// --- Choice and List, end to end (ADR-0031 §2, §3) --------------------------------------
//
// The parameter a Choice and a List carry is part of their type (core/graph/nodes.js), so
// what these pin is the whole chain: a declaration becomes a port type, the port type decides
// which wires are allowed, and the value that travels is the one the property holds.

test('a Choice travels from one property to another of the same Choice', () => {
    const file = px();
    const from = file.property({ name: 'mood', type: PropertyType.ENUM, values: ['calm', 'angry'], default: 'angry' });
    const to = file.property({ name: 'shown', type: PropertyType.ENUM, values: ['calm', 'angry'], default: 'calm' });

    const update = file.node('event.update');
    const read = file.node('property.get', { property: from.id });
    const write = file.node('property.set', { property: to.id });

    file.wire([update, 'out'], [write, 'in']);
    assert.ok(file.wire([read, 'value'], [write, 'value']), 'two Choices offering the same options are one type');

    const { component, behavior } = behaviourFor(file.model);
    behavior.update(null, {});

    assert.equal(component.shown, 'angry');
});

test('a Choice reads as Text, and refuses to be written from one', () => {
    const file = px();
    const mood = file.property({ name: 'mood', type: PropertyType.ENUM, values: ['calm', 'angry'], default: 'calm' });
    const label = file.property({ name: 'label', type: PropertyType.STRING, default: '' });

    const read = file.node('property.get', { property: mood.id });
    const asText = file.node('property.set', { property: label.id });
    assert.ok(file.wire([read, 'value'], [asText, 'value']), 'every option is a string, so nothing is lost');

    // The reverse is where a Choice would stop being a Choice: an arbitrary string is not one
    // of the options, and this is the wire the type system exists to refuse.
    const text = file.node('value.string', { value: 'furious' });
    const write = file.node('property.set', { property: mood.id });
    const verdict = file.model.graph.canConnect(
        { node: text.id, port: 'value' }, { node: write.id, port: 'value' }
    );

    assert.equal(verdict.allowed, false);
    assert.equal(verdict.code, GraphIssueCode.TYPE_MISMATCH);
});

test('two Choices offering different options refuse each other', () => {
    const file = px();
    const mood = file.property({ name: 'mood', type: PropertyType.ENUM, values: ['calm', 'angry'] });
    const heading = file.property({ name: 'heading', type: PropertyType.ENUM, values: ['up', 'down'] });

    const read = file.node('property.get', { property: mood.id });
    const write = file.node('property.set', { property: heading.id });

    assert.equal(file.model.graph.canConnect(
        { node: read.id, port: 'value' }, { node: write.id, port: 'value' }
    ).allowed, false, 'the value could never be one of the target\'s options');
});

test('a List travels whole, and a list of something else refuses it', () => {
    const file = px();
    const from = file.property({ name: 'waypoints', type: PropertyType.ARRAY, of: PropertyType.NUMBER, default: [3, 4] });
    const to = file.property({ name: 'copy', type: PropertyType.ARRAY, of: PropertyType.NUMBER, default: [] });
    const names = file.property({ name: 'names', type: PropertyType.ARRAY, of: PropertyType.STRING, default: [] });

    const update = file.node('event.update');
    const read = file.node('property.get', { property: from.id });
    const write = file.node('property.set', { property: to.id });
    file.wire([update, 'out'], [write, 'in']);
    file.wire([read, 'value'], [write, 'value']);

    const { component, behavior } = behaviourFor(file.model);
    behavior.update(null, {});
    assert.deepEqual(component.copy, [3, 4]);

    const wrong = file.node('property.set', { property: names.id });
    assert.equal(file.model.graph.canConnect(
        { node: read.id, port: 'value' }, { node: wrong.id, port: 'value' }
    ).allowed, false, 'a List of Number is not a List of Text');
});

test('a List is not the thing it holds', () => {
    const file = px();
    const list = file.property({ name: 'waypoints', type: PropertyType.ARRAY, of: PropertyType.NUMBER, default: [] });

    const read = file.node('property.get', { property: list.id });
    const add = file.node('math.add');

    assert.equal(file.model.graph.canConnect(
        { node: read.id, port: 'value' }, { node: add.id, port: 'a' }
    ).allowed, false);
});

// --- a List of references crosses the boundary ADR-0034 §3.5 draws ------------------------

test('a List of Objects reads as handles and is stored as identities', () => {
    const file = px();
    const targets = file.property({ name: 'targets', type: PropertyType.ARRAY, of: PropertyType.OBJECTREF, default: [] });
    const copy = file.property({ name: 'copy', type: PropertyType.ARRAY, of: PropertyType.OBJECTREF, default: [] });

    const update = file.node('event.update');
    const read = file.node('property.get', { property: targets.id });
    const write = file.node('property.set', { property: copy.id });
    file.wire([update, 'out'], [write, 'in']);
    file.wire([read, 'value'], [write, 'value']);

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const scene = new Scene();
    const holder = scene.add(new SceneObject('Holder'));
    const first = scene.add(new SceneObject('First'));
    const second = scene.add(new SceneObject('Second'));
    holder.addComponent(new Component());
    const component = holder.components[payload.type];
    component.targets = [first.id, second.id];

    const behavior = interpretGraph(payload.graph, { registry })(component);
    behavior.update(holder, { scene });

    // What was written is the IDENTITY, never the handle that arrived: `serializeScene()`
    // must never find an Object record inside a component's values (§3.5, invariant 3).
    assert.deepEqual(component.copy, [first.id, second.id]);

    const written = serializeScene(scene).objects
        .find(entry => entry.id === holder.id).components[0].values;
    assert.deepEqual(written.copy, [first.id, second.id]);
    assert.equal(JSON.stringify(written).includes('"name"'), false, 'no Object record was persisted');
});

test('a reference in a List that points at nothing reads as nothing, and keeps its place', () => {
    // A target that is gone is a state of the running scene, not a fault (ADR-0034 §3.4).
    // Read through a wire, because what a port hands downstream is the whole point: a list
    // that silently lost an element would renumber every index after it.
    const file = px();
    const targets = file.property({ name: 'targets', type: PropertyType.ARRAY, of: PropertyType.OBJECTREF, default: [] });
    const copy = file.property({ name: 'copy', type: PropertyType.ARRAY, of: PropertyType.OBJECTREF, default: [] });

    const update = file.node('event.update');
    const read = file.node('property.get', { property: targets.id });
    const write = file.node('property.set', { property: copy.id });
    file.wire([update, 'out'], [write, 'in']);
    file.wire([read, 'value'], [write, 'value']);

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const scene = new Scene();
    const holder = scene.add(new SceneObject('Holder'));
    const alive = scene.add(new SceneObject('Alive'));
    holder.addComponent(new Component());
    const component = holder.components[payload.type];
    component.targets = [alive.id, 'obj_gone'];

    interpretGraph(payload.graph, { registry })(component).update(holder, { scene });

    assert.deepEqual(component.copy, [alive.id, null],
        'a dead reference is a hole in the list, not a shorter list');
});

// --- the values survive the scene payload -------------------------------------------------

test('Choice and List values survive serialize then deserialize', () => {
    const file = px();
    const mood = file.property({ name: 'mood', type: PropertyType.ENUM, values: ['calm', 'angry'], default: 'calm' });
    file.property({ name: 'waypoints', type: PropertyType.ARRAY, of: PropertyType.NUMBER, default: [] });

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const registryOfComponents = new ComponentRegistry();
    registryOfComponents.register(Component);

    const scene = new Scene();
    const hero = scene.add(new SceneObject('Hero'));
    hero.addComponent(new Component());
    const component = hero.components[payload.type];
    component.mood = 'angry';
    component.waypoints = [1, 2.5, -3];

    const written = serializeScene(scene);
    assert.deepEqual(JSON.parse(JSON.stringify(written)), written, 'already JSON, with no migration');

    const reopened = deserializeScene(written, { registry: registryOfComponents });
    const back = reopened.get(hero.id).components[payload.type];

    assert.equal(back.mood, 'angry');
    assert.deepEqual(back.waypoints, [1, 2.5, -3]);
    assert.notEqual(back.waypoints, component.waypoints, 'and it is a list of its own');

    // Unused so the linter and the reader agree it is the identity that matters.
    assert.ok(mood.id);
});

test('nothing belonging to a scene ever reaches the `.px` payload', () => {
    // A `.px` is of PROJECT scope and an ObjectId belongs to ONE scene (ADR-0034 §3.5), so a
    // graph that reads and writes a list of references still carries no identity from the
    // scene it happened to run in.
    const file = px();
    const targets = file.property({ name: 'targets', type: PropertyType.ARRAY, of: PropertyType.OBJECTREF, default: [] });
    const update = file.node('event.update');
    const read = file.node('property.get', { property: targets.id });
    const write = file.node('property.set', { property: targets.id });
    file.wire([update, 'out'], [write, 'in']);
    file.wire([read, 'value'], [write, 'value']);

    const payload = JSON.stringify(file.model.serialize());

    assert.equal(/obj_/.test(payload), false, 'no ObjectId is serialized into a graph');
    assert.equal(payload.includes(PropertyType.OBJECTREF), true, 'the DECLARATION is project scope, and stays');
});

// --- what the player is doing (ADR-0014) ------------------------------------------------
//
// THE WHOLE SLICE, MINUS THE BROWSER. A key is pressed by hand here exactly as the Editor's
// adapter presses it (`editor/input.js`), and the graph reads it through the step context.
// Nothing in this file — or in anything it imports — has ever seen a `KeyboardEvent`, which
// is the property that makes a server able to replay what a player sent.

/**
 * A `.px` writing what one key is doing into three properties, stepped by a real Runtime.
 *
 * IT GOES THROUGH `Runtime.step()` RATHER THAN CALLING THE BEHAVIOUR, because the half of
 * the contract worth testing is the one the runtime owns: `commit()` at the end of a step is
 * what makes `Pressed` true exactly once.
 *
 * @param {object} [options] - `{ key, owner }`
 * @returns {object} The runtime, its input, and the component to read
 */
function keyboard({ key = 'Space', owner = null } = {}) {
    // `undefined` places the node with NO param at all, which is what the Editor writes for
    // a node nobody has typed into.
    const params = key === undefined ? {} : { key };
    const file = px();
    const held = file.property({ name: 'held', type: PropertyType.BOOLEAN, default: false });
    // COUNTERS, NOT FLAGS, because the model changed shape. A moment that fires a flow can
    // only be observed by counting how many times it ran; a flag would say "it happened at
    // least once" and could never say "and exactly once" (ADR-0041 §3).
    const presses = file.property({ name: 'presses', type: PropertyType.NUMBER, default: 0 });
    const releases = file.property({ name: 'releases', type: PropertyType.NUMBER, default: 0 });

    // THE STATE HALF: read every step, straight into a property.
    const update = file.node('event.update');
    const read = file.node('input.key', params);
    const writeHeld = file.node('property.set', { property: held.id });
    file.wire([update, 'out'], [writeHeld, 'in']);
    file.wire([read, 'held'], [writeHeld, 'value']);

    // THE EVENT HALF: one entry node, two flows, a counter on each. This is the sentence
    // the old model could not write — no `On Update`, and no `Branch`.
    const onKey = file.node('input.onKey', params);
    for (const [port, counter] of [['pressed', presses], ['released', releases]]) {
        const get = file.node('property.get', { property: counter.id });
        const one = file.node('value.number', { value: 1 });
        const add = file.node('math.add');
        const set = file.node('property.set', { property: counter.id });
        file.wire([onKey, port], [set, 'in']);
        file.wire([get, 'value'], [add, 'a']);
        file.wire([one, 'value'], [add, 'b']);
        file.wire([add, 'result'], [set, 'value']);
    }

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);

    const types = new ComponentRegistry();
    types.register(Component);
    const scene = new Scene('Level', { registry: types });
    const object = scene.add(new SceneObject('Hero', { owner }));
    object.addComponent(new Component());

    const runtime = new Runtime(scene, { behaviors });
    return { runtime, input: runtime.input, component: object.components[payload.type] };
}

test('a key nobody is holding reads as false, and starts nothing', () => {
    const it = keyboard();

    it.runtime.step();

    assert.equal(it.component.held, false);
    assert.equal(it.component.presses, 0);
    assert.equal(it.component.releases, 0);
});

test('a graph observes a key that is held', () => {
    const it = keyboard();

    it.input.local.press('Space');
    it.runtime.step();

    assert.equal(it.component.held, true);
});

test('Pressed runs on the step that observes the press, and on no other', () => {
    // THE SENTENCE THE WHOLE SPLIT EXISTS FOR: "when I press Space, jump". One node, one
    // wire, and it runs once. The other half of ADR-0014 §5 bounds it: `commit()` at the end
    // of a step is what makes a key held for a hundred steps one jump and not a hundred.
    const it = keyboard();

    it.input.local.press('Space');
    it.runtime.step();
    assert.equal(it.component.presses, 1);
    assert.equal(it.component.held, true);

    it.runtime.step();
    it.runtime.step();
    assert.equal(it.component.presses, 1, 'still held, and it did not fire again');
    assert.equal(it.component.held, true, 'but it is still down, which is a different question');
});

test('Released runs on the step that observes the release, and on no other', () => {
    const it = keyboard();

    it.input.local.press('Space');
    it.runtime.step();
    assert.equal(it.component.releases, 0);

    it.input.local.release('Space');
    it.runtime.step();
    assert.equal(it.component.releases, 1);
    assert.equal(it.component.held, false);

    it.runtime.step();
    assert.equal(it.component.releases, 1);
});

test('a tap too fast to span two steps is not seen at all, and that is ADR-0014, not this node', () => {
    // MEASURED, NOT ASSUMED. `pressed()` is `down now && !down before`, so a key pressed AND
    // released between two steps leaves both sets empty and neither transition is visible.
    // That is a property of the input model (ADR-0014 §5) and it predates the event nodes —
    // stated here so the limitation is recorded rather than rediscovered, and so a change to
    // the input model has a test that will notice.
    const it = keyboard();

    it.input.local.press('Space');
    it.input.local.release('Space');
    it.runtime.step();

    assert.equal(it.component.presses, 0, 'the press never spanned a step boundary');
    assert.equal(it.component.releases, 0);

    // Spread over two steps, both are seen — which is the ordinary case a game produces.
    it.input.local.press('Space');
    it.runtime.step();
    it.input.local.release('Space');
    it.runtime.step();

    assert.equal(it.component.presses, 1);
    assert.equal(it.component.releases, 1);
});

test('a graph reads the input of the owner its Object belongs to', () => {
    // ADR-0014 §3: input is a state per player, never one global keyboard. Someone else's
    // keys must not move this object, which is the whole reason `of()` takes an owner.
    const it = keyboard({ owner: 'alice' });

    it.input.of('bob').press('Space');
    it.runtime.step();
    assert.equal(it.component.held, false, "another player's keyboard is not this one's");

    it.input.of('alice').press('Space');
    it.runtime.step();
    assert.equal(it.component.held, true);
});

test('an object with no owner reads the local keyboard, so offline play needs no special case', () => {
    const it = keyboard({ owner: null });

    it.input.local.press('Space');
    it.runtime.step();

    assert.equal(it.component.held, true);
});

test('a Key node nobody has touched reads the key its field shows', () => {
    // MEASURED IN THE EDITOR, AND IT WAS SILENT. Adding a node stores `params: {}` — the
    // field draws the type's declared default, and nothing is written until a creator types.
    // A fallback of its own in `evaluate` therefore made the node READ `Space` and ANSWER as
    // if it read nothing: the demonstration graph did nothing at all, with no error to see.
    const it = keyboard({ key: undefined });

    it.input.local.press('Space');
    it.runtime.step();

    assert.equal(it.component.held, true);
});

test('a Key node whose field was emptied answers false rather than refusing', () => {
    // Not the same act as the one above, so not the same answer: `''` is a field a creator
    // CLEARED. And it is still not an error — a key is a LITERAL, like the value of a
    // `Number` node, not a reference to something that must exist. `property.get` throws
    // because it names a property the Component no longer declares; there is nothing here
    // that could have gone missing (ADR-0034 §3.4).
    const it = keyboard({ key: '' });

    it.input.local.press('Space');

    assert.doesNotThrow(() => it.runtime.step());
    assert.equal(it.component.held, false);
});

test('holding a key is still a condition, and still costs a Branch', () => {
    // DELIBERATELY UNCHANGED. "While held" is not an event — it is true on every step until
    // it is not — and dressing it as one would put a node in the catalogue that fires sixty
    // times a second while looking exactly like the one that fires once (ADR-0041 §3).
    const file = px();
    const steps = file.property({ name: 'steps', type: PropertyType.NUMBER, default: 0 });

    const update = file.node('event.update');
    const key = file.node('input.key', { key: 'Space' });
    const branch = file.node('flow.branch');
    const get = file.node('property.get', { property: steps.id });
    const one = file.node('value.number', { value: 1 });
    const add = file.node('math.add');
    const set = file.node('property.set', { property: steps.id });

    file.wire([update, 'out'], [branch, 'in']);
    file.wire([key, 'held'], [branch, 'condition']);
    file.wire([branch, 'true'], [set, 'in']);
    file.wire([get, 'value'], [add, 'a']);
    file.wire([one, 'value'], [add, 'b']);
    file.wire([add, 'result'], [set, 'value']);

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);

    const types = new ComponentRegistry();
    types.register(Component);
    const scene = new Scene('Level', { registry: types });
    const object = scene.add(new SceneObject('Hero'));
    object.addComponent(new Component());
    const runtime = new Runtime(scene, { behaviors });
    const component = object.components[payload.type];

    runtime.step();
    assert.equal(component.steps, 0, 'nothing held, the branch takes its other side');

    runtime.input.local.press('Space');
    runtime.step();
    runtime.step();
    assert.equal(component.steps, 2);

    runtime.input.local.release('Space');
    runtime.step();
    assert.equal(component.steps, 2, 'released, and the branch stops writing');
});

test('the same key script replayed reaches the same state, twice', () => {
    // The property a server's reconciliation rests on (ADR-0011), stated for input: the
    // graph is a function of the initial scene and of the keys it was given.
    const script = [true, true, false, true, false, false];

    const run = () => {
        const it = keyboard();
        const seen = [];
        for (const down of script) {
            if (down) it.input.local.press('Space'); else it.input.local.release('Space');
            it.runtime.step();
            seen.push([it.component.held, it.component.presses, it.component.releases]);
        }
        return seen;
    };

    const first = run();
    assert.deepEqual(first, run());
    assert.ok(first.some(([, presses]) => presses > 0), 'and the keys actually did something');
});

// --- where the player is pointing (ADR-0038) --------------------------------------------
//
// THE SAME PROOF AS FOR THE KEYBOARD, ONE SPACE FURTHER. The pointer is moved by hand here
// exactly as the Editor's adapter moves it, in WORLD coordinates — because that is what the
// adapter writes after asking the Viewport, and because a graph has no camera to convert
// with. Nothing in this file has seen a `PointerEvent`, and nothing needed to.

/**
 * A `.px` writing the pointer's world position into two properties, stepped by a Runtime.
 * @returns {object} The runtime, its input, and the component to read
 */
function pointing({ owner = null } = {}) {
    const file = px();
    const atX = file.property({ name: 'atX', type: PropertyType.NUMBER, default: 0 });
    const atY = file.property({ name: 'atY', type: PropertyType.NUMBER, default: 0 });

    const update = file.node('event.update');
    const pointer = file.node('input.pointer');
    const writeX = file.node('property.set', { property: atX.id });
    const writeY = file.node('property.set', { property: atY.id });

    file.wire([update, 'out'], [writeX, 'in']);
    file.wire([writeX, 'out'], [writeY, 'in']);
    file.wire([pointer, 'x'], [writeX, 'value']);
    file.wire([pointer, 'y'], [writeY, 'value']);

    return runnable(file, owner);
}

/**
 * A `.px` writing what one pointer button is doing into three properties.
 * @returns {object} The runtime, its input, and the component to read
 */
function clicking({ button, owner = null } = {}) {
    const file = px();
    const held = file.property({ name: 'held', type: PropertyType.BOOLEAN, default: false });
    // Counters, for the same reason `keyboard()` uses them: a flow that ran can only be
    // observed by counting, and a flag could never say "exactly once".
    const presses = file.property({ name: 'presses', type: PropertyType.NUMBER, default: 0 });
    const releases = file.property({ name: 'releases', type: PropertyType.NUMBER, default: 0 });
    const params = button === undefined ? {} : { button };

    const update = file.node('event.update');
    const read = file.node('input.pointerButton', params);
    const writeHeld = file.node('property.set', { property: held.id });
    file.wire([update, 'out'], [writeHeld, 'in']);
    file.wire([read, 'held'], [writeHeld, 'value']);

    const onButton = file.node('input.onPointerButton', params);
    for (const [port, counter] of [['pressed', presses], ['released', releases]]) {
        const get = file.node('property.get', { property: counter.id });
        const one = file.node('value.number', { value: 1 });
        const add = file.node('math.add');
        const set = file.node('property.set', { property: counter.id });
        file.wire([onButton, port], [set, 'in']);
        file.wire([get, 'value'], [add, 'a']);
        file.wire([one, 'value'], [add, 'b']);
        file.wire([add, 'result'], [set, 'value']);
    }

    return runnable(file, owner);
}

/** Bind a `.px` to a one-object scene and hand back the Runtime that steps it. */
function runnable(file, owner) {
    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);

    const types = new ComponentRegistry();
    types.register(Component);
    const scene = new Scene('Level', { registry: types });
    const object = scene.add(new SceneObject('Hero', { owner }));
    object.addComponent(new Component());

    const runtime = new Runtime(scene, { behaviors });
    return { runtime, input: runtime.input, object, component: object.components[payload.type] };
}

test('a graph reads the pointer in world coordinates', () => {
    const it = pointing();

    it.input.local.movePointerInWorld(120, -45);
    it.runtime.step();

    assert.equal(it.component.atX, 120);
    assert.equal(it.component.atY, -45);
});

test('the pointer node ignores the screen position entirely', () => {
    // The two are different facts (ADR-0038). A node that read the screen one would place
    // an object hundreds of units away the moment the camera moved.
    const it = pointing();

    it.input.local.movePointer(400, 300);
    it.runtime.step();

    assert.equal(it.component.atX, 0, 'a screen point is not what this node carries');
    assert.equal(it.component.atY, 0);
});

test('an untouched pointer reads the world origin rather than nothing', () => {
    const it = pointing();

    it.runtime.step();

    assert.equal(it.component.atX, 0);
    assert.equal(it.component.atY, 0);
});

test('a graph reads the pointer of the owner its Object belongs to', () => {
    const it = pointing({ owner: 'alice' });

    it.input.of('bob').movePointerInWorld(999, 999);
    it.runtime.step();
    assert.equal(it.component.atX, 0, "another player's aim is not this one's");

    it.input.of('alice').movePointerInWorld(64, 32);
    it.runtime.step();
    assert.equal(it.component.atX, 64);
    assert.equal(it.component.atY, 32);
});

test('a button nobody is holding reads as false', () => {
    const it = clicking();

    it.runtime.step();

    assert.equal(it.component.held, false);
    assert.equal(it.component.presses, 0);
    assert.equal(it.component.releases, 0);
});

test('Pressed runs on the step that observes the click, and on no other', () => {
    const it = clicking();

    it.input.local.pressButton(0);
    it.runtime.step();
    assert.equal(it.component.presses, 1);
    assert.equal(it.component.held, true);

    it.runtime.step();
    assert.equal(it.component.presses, 1, 'still held, and it did not fire again');
    assert.equal(it.component.held, true);
});

test('Released runs on the step that observes the release, and on no other', () => {
    const it = clicking();

    it.input.local.pressButton(0);
    it.runtime.step();

    it.input.local.releaseButton(0);
    it.runtime.step();
    assert.equal(it.component.releases, 1);
    assert.equal(it.component.held, false);

    it.runtime.step();
    assert.equal(it.component.releases, 1);
});

test('a Pointer Button node watches the button it names, and no other', () => {
    const right = clicking({ button: 'right' });

    right.input.local.pressButton(0);
    right.runtime.step();
    assert.equal(right.component.held, false, 'the primary button is not the secondary one');

    right.input.local.pressButton(2);
    right.runtime.step();
    assert.equal(right.component.held, true);
});

test('a Pointer Button node nobody has touched watches the primary button', () => {
    // Same trap as `input.key`: adding a node stores `params: {}`, so a fallback that did
    // not match the declared default would make the node silent.
    const it = clicking({ button: undefined });

    it.input.local.pressButton(0);
    it.runtime.step();

    assert.equal(it.component.held, true);
});

test('a button drives an existing node: a held click branches, and the branch writes', () => {
    const file = px();
    const clicks = file.property({ name: 'clicks', type: PropertyType.NUMBER, default: 0 });

    // THE SAME GRAPH THE OLD MODEL NEEDED FOUR NODES FOR. `On Update -> Branch` is gone:
    // counting clicks is what an event output IS (ADR-0041 §3).
    const button = file.node('input.onPointerButton');
    const get = file.node('property.get', { property: clicks.id });
    const one = file.node('value.number', { value: 1 });
    const add = file.node('math.add');
    const set = file.node('property.set', { property: clicks.id });

    file.wire([button, 'pressed'], [set, 'in']);
    file.wire([get, 'value'], [add, 'a']);
    file.wire([one, 'value'], [add, 'b']);
    file.wire([add, 'result'], [set, 'value']);

    const it = runnable(file, null);

    it.runtime.step();
    assert.equal(it.component.clicks, 0);

    it.input.local.pressButton(0);
    it.runtime.step();
    it.runtime.step();
    assert.equal(it.component.clicks, 1, 'one press is one click, however long it is held');

    // A SECOND CLICK NEEDS A STEP BETWEEN THE TWO. Releasing and pressing again inside one
    // step leaves the button down at both boundaries, so the simulation never saw it come
    // up — which is the fixed-step contract, not a shortcoming of this node.
    it.input.local.releaseButton(0);
    it.runtime.step();
    assert.equal(it.component.clicks, 1);

    it.input.local.pressButton(0);
    it.runtime.step();
    assert.equal(it.component.clicks, 2);
});

test('the pointer drives an existing node: aiming moves a Transform', () => {
    // The demonstration the slice is for, headless: `Pointer -> Set Property -> Transform`.
    const file = px();
    const update = file.node('event.update');
    const pointer = file.node('input.pointer');
    const self = file.node('scene.self');
    const setX = file.node('property.set', { component: 'Transform', property: 'x' });

    file.wire([update, 'out'], [setX, 'in']);
    file.wire([self, 'object'], [setX, 'object']);
    file.wire([pointer, 'x'], [setX, 'value']);

    const payload = file.model.serialize();
    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);

    const types = new ComponentRegistry();
    types.register(Transform);
    types.register(Component);
    const scene = new Scene('Level', { registry: types });
    const object = scene.add(new SceneObject('Hero'));
    object.addComponent(new Transform());
    object.addComponent(new Component());

    const runtime = new Runtime(scene, { behaviors });
    runtime.input.local.movePointerInWorld(87, -12);
    runtime.step();

    assert.equal(object.components.Transform.x, 87);
});

test('the same pointer script replayed reaches the same state, twice', () => {
    const script = [[0, 0, false], [10, 5, true], [20, 10, true], [20, 10, false]];

    const run = () => {
        const it = clicking();
        const seen = [];
        for (const [x, y, down] of script) {
            it.input.local.movePointerInWorld(x, y);
            if (down) it.input.local.pressButton(0); else it.input.local.releaseButton(0);
            it.runtime.step();
            seen.push([it.component.held, it.component.presses, it.component.releases]);
        }
        return seen;
    };

    const first = run();
    assert.deepEqual(first, run());
    assert.ok(first.some(([, presses]) => presses > 0), 'and the clicks actually did something');
});
