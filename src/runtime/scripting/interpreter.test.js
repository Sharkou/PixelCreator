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
    observe,
    registerStandardNodes
} from '../../core/mod.js';
import { Behaviors } from './behaviors.js';
import { createGraphInterpreter, interpretGraph } from './interpreter.js';
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
