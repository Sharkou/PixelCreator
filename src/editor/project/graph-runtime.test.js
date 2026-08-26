// The whole chain of a `.px`, end to end and headless (ADR-0027).
//
//   ComponentDefinition  ->  payload  ->  project.save
//        ->  loadComponentDefinitions  ->  defineComponent + behaviors.bind
//             ->  Runtime.step  ->  the component's properties change
//
// IT LIVES IN THE EDITOR LAYER, and that is the architecture rather than a convenience.
// `project -> runtime` and `runtime -> project` are both forbidden (ADR-0020): the Runtime
// must never reach storage, and the Project must never sit behind a runtime API. Something
// has to hold one and hand it the other, and that something is whoever composes the
// application — the Editor here, a server's start-up in production. This test IS that seam,
// exercised without a DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentDefinition,
    ComponentRegistry,
    NodeRegistry,
    Object as SceneObject,
    PropertyType,
    Scene,
    Transform,
    registerStandardNodes
} from '../../core/mod.js';
import { Project, ResourceKind, loadComponentDefinitions } from '../../project/mod.js';
import { Behaviors, Runtime, createGraphInterpreter } from '../../runtime/mod.js';

const nodes = registerStandardNodes(new NodeRegistry());

/**
 * A project holding one `.px` that adds `step` to `total` on every update.
 * @returns {{project: object, resource: object, definition: object}} The project and its parts
 */
function projectWithComponent() {
    const project = new Project('Game');
    const resource = project.add({ kind: ResourceKind.COMPONENT, name: 'Counter.px' }, null);

    const definition = new ComponentDefinition({ type: resource.id, label: 'Counter' }, { registry: nodes });
    const total = definition.addProperty({ name: 'total', type: PropertyType.NUMBER, default: 0 });
    const step = definition.addProperty({ name: 'step', type: PropertyType.NUMBER, default: 2 });

    const graph = definition.graph;
    const update = graph.addNode({ type: 'event.update' });
    const read = graph.addNode({ type: 'property.get', params: { property: total.id } });
    const amount = graph.addNode({ type: 'property.get', params: { property: step.id } });
    const add = graph.addNode({ type: 'math.add' });
    const write = graph.addNode({ type: 'property.set', params: { property: total.id } });

    graph.connect({ node: update.id, port: 'out' }, { node: write.id, port: 'in' });
    graph.connect({ node: read.id, port: 'value' }, { node: add.id, port: 'a' });
    graph.connect({ node: amount.id, port: 'value' }, { node: add.id, port: 'b' });
    graph.connect({ node: add.id, port: 'result' }, { node: write.id, port: 'value' });

    project.save(resource.id, definition.serialize());
    return { project, resource, definition, properties: { total, step } };
}

test('a project loads its `.px`, and the runtime runs it', async () => {
    const { project, resource } = projectWithComponent();

    const registry = new ComponentRegistry();
    registry.register(Transform);
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));

    const loaded = await loadComponentDefinitions(project, { registry, behaviors });

    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].label, 'Counter');
    assert.equal(behaviors.has(resource.id), true, 'the graph was bound to the type');

    const scene = new Scene('Level', { registry });
    const object = scene.add(new SceneObject('Counter'));
    object.addComponent(new (registry.get(resource.id))());

    const runtime = new Runtime(scene, { behaviors });
    runtime.step();
    runtime.step();
    runtime.step();

    assert.equal(object.components[resource.id].total, 6);
});

test('the same project, stepped twice from scratch, reaches the same state', async () => {
    const run = async () => {
        const { project, resource } = projectWithComponent();
        const registry = new ComponentRegistry();
        const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
        await loadComponentDefinitions(project, { registry, behaviors });

        const scene = new Scene('Level', { registry });
        const object = scene.add(new SceneObject('Counter'));
        object.addComponent(new (registry.get(resource.id))());

        const runtime = new Runtime(scene, { behaviors });
        for (let index = 0; index < 10; index++) runtime.step(undefined);
        return object.components[resource.id].total;
    };

    // A client and a server run the same graph through the same code, so they must reach
    // the same number. There is no variant to keep in step (ADR-0011, ADR-0015 §8).
    assert.equal(await run(), 20);
    assert.equal(await run(), await run());
});

test('the runtime never sees a ResourceId: the Project resolves the graph first', async () => {
    const { project } = projectWithComponent();
    const registry = new ComponentRegistry();
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));

    await loadComponentDefinitions(project, { registry, behaviors });

    for (const type of behaviors.types()) {
        assert.equal(typeof behaviors.graphOf(type), 'object');
    }
    assert.throws(() => behaviors.bind('Whatever', 'res_something'), /ResourceId/);
});

test('editing the `.px` and reloading rebinds: a behaviour is edited by rebinding, not mutating', async () => {
    const { project, resource, definition, properties } = projectWithComponent();
    const registry = new ComponentRegistry();
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    await loadComponentDefinitions(project, { registry, behaviors });

    const scene = new Scene('Level', { registry });
    const object = scene.add(new SceneObject('Counter'));
    object.addComponent(new (registry.get(resource.id))());
    const runtime = new Runtime(scene, { behaviors });
    runtime.step();
    assert.equal(object.components[resource.id].total, 2);

    // The creator changes the graph and saves. A graph is immutable to the runtime, so what
    // takes effect is the NEW payload being bound (ADR-0016 §7).
    definition.setPropertyDefault(properties.step.id, 10);
    const literal = definition.graph.addNode({ type: 'value.number', params: { value: 100 } });
    const write = definition.graph.nodes().find(node => node.type === 'property.set');
    definition.graph.connect({ node: literal.id, port: 'value' }, { node: write.id, port: 'value' });
    project.save(resource.id, definition.serialize());

    await loadComponentDefinitions(project, { registry, behaviors });
    runtime.step();

    assert.equal(object.components[resource.id].total, 100, 'the running behaviour was replaced');
});

test('a `.px` whose graph is broken is reported, and the project still opens', async () => {
    const project = new Project('Game');
    const resource = project.add({ kind: ResourceKind.COMPONENT, name: 'Broken.px' }, null);
    project.save(resource.id, {
        type: resource.id,
        label: 'Broken',
        // A property type the Core dropped (ADR-0023): `defineComponent()` refuses the whole
        // definition rather than showing a field nobody could ever edit.
        properties: { thing: { type: 'object' } },
        graph: { version: 1, nodes: [], connections: [] }
    });

    const registry = new ComponentRegistry();
    const failures = [];

    const loaded = await loadComponentDefinitions(project, {
        registry,
        behaviors: new Behaviors(createGraphInterpreter({ registry: nodes })),
        onError: failure => failures.push(failure)
    });

    assert.equal(loaded.length, 0);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].resource.id, resource.id);
});

// --- the same chain, but through an Editor session -----------------------------------
//
// ABOVE IS THE HEADLESS LOAD: a payload in the store, `loadComponentDefinitions()`, a
// Runtime. That path was proven and the live Editor never took it — it installed the
// SCHEMA of a `.px` (project/definitions.js) and bound no graph, so a creator could wire
// `Counter.px`, drop it on an object, press Play, and watch nothing happen. The whole
// chain existed and one call was missing from it.
//
// What follows is that chain as a creator actually walks it:
//
//   new .px in the Project panel   ->  project.add
//   opened, and wired              ->  workspace.attach, a live ComponentDefinition
//   dropped on an Object           ->  definitions.install  (registers AND binds)
//   Play                           ->  definitions.refresh, then Runtime.advance
//
// It never saves. That is the point of the last two assertions: what plays is the model on
// screen, and the Runtime is handed a graph rather than an identifier (ADR-0020).

import { Workspace } from './workspace.js';
import { createDefinitions } from './definitions.js';
import { createResourceOfKind } from './commands.js';

// The Workspace resolves a `.px`'s node types in the default catalogue, so that is the one
// an Editor session fills — `editor.js` calls exactly this on start-up.
registerStandardNodes();

/**
 * An Editor session: a scene, a `.px` being edited, and the two hosts the shell owns.
 * @returns {Promise<object>} The session
 */
async function session() {
    const registry = new ComponentRegistry();
    registry.register(Transform);

    const workspace = new Workspace();
    const scene = new Scene('Level', { registry });
    workspace.create(scene);

    const behaviors = new Behaviors(createGraphInterpreter());
    const definitions = createDefinitions({
        project: workspace.project,
        registry,
        workspace,
        scene,
        behaviors
    });

    const px = createResourceOfKind(workspace.project, ResourceKind.COMPONENT, { parent: null });
    const model = await workspace.attach(px.id, { registry });

    return { workspace, scene, registry, behaviors, definitions, px, model };
}

/**
 * Wire the smallest interactive graph there is: a counter that moves what carries it.
 *
 * ```
 *   [On Update] ──► [Set count] ──► [Set Transform.x On]
 *                        ▲                  ▲     ▲
 *                     [Add]              [Self]  [Get count]
 *                    ▲     ▲
 *          [Get count]     [Number 1]
 * ```
 *
 * @param {object} model - The live ComponentDefinition
 * @returns {object} The property it counts in
 */
function wireCounter(model) {
    const count = model.addProperty({ name: 'count', type: PropertyType.NUMBER, default: 0 });
    const graph = model.graph;

    const update = graph.addNode({ type: 'event.update' });
    const read = graph.addNode({ type: 'property.get', params: { property: count.id } });
    const one = graph.addNode({ type: 'value.number', params: { value: 1 } });
    const add = graph.addNode({ type: 'math.add' });
    const write = graph.addNode({ type: 'property.set', params: { property: count.id } });

    const self = graph.addNode({ type: 'scene.self' });
    const readAgain = graph.addNode({ type: 'property.get', params: { property: count.id } });
    const move = graph.addNode({
        type: 'property.setOn',
        params: { component: 'Transform', property: 'x' }
    });

    graph.connect({ node: update.id, port: 'out' }, { node: write.id, port: 'in' });
    graph.connect({ node: read.id, port: 'value' }, { node: add.id, port: 'a' });
    graph.connect({ node: one.id, port: 'value' }, { node: add.id, port: 'b' });
    graph.connect({ node: add.id, port: 'result' }, { node: write.id, port: 'value' });

    graph.connect({ node: write.id, port: 'out' }, { node: move.id, port: 'in' });
    graph.connect({ node: self.id, port: 'object' }, { node: move.id, port: 'object' });
    graph.connect({ node: readAgain.id, port: 'value' }, { node: move.id, port: 'value' });

    return count;
}

test('an Editor session wires a `.px`, drops it on an Object, and the Runtime runs it', async () => {
    const { scene, registry, behaviors, definitions, px, model } = await session();
    wireCounter(model);

    // What dropping the `.px` on an Object does (dnd/rules.js, `component-to-object`).
    assert.equal(await definitions.install(px.id), px.id);

    const object = new SceneObject('Counter');
    object.addComponent(new Transform());
    object.addComponent(new (registry.get(px.id))());
    scene.add(object);

    const runtime = new Runtime(scene, { behaviors });
    runtime.step();
    runtime.step();
    runtime.step();

    assert.equal(object.components[px.id].count, 3, 'the graph read, computed and wrote');
    assert.equal(object.getComponent('Transform').x, 3,
        'and it reached a shipped Component, which is what makes the result visible');
});

test('a graph edited after the drop runs once the session refreshes, without a save', async () => {
    const { scene, registry, behaviors, definitions, px, model, workspace } = await session();
    const count = wireCounter(model);
    await definitions.install(px.id);

    const object = new SceneObject('Counter');
    object.addComponent(new Transform());
    object.addComponent(new (registry.get(px.id))());
    scene.add(object);

    // The creator carries on wiring: the step becomes ten. Moving nodes is not a schema
    // change, so nothing re-registers the class and the bound graph is now behind.
    const literal = model.graph.nodes().find(node => node.type === 'value.number');
    model.graph.setParam(literal.id, 'value', 10);

    // Play, as the shell performs it.
    await definitions.refresh();

    const runtime = new Runtime(scene, { behaviors });
    runtime.step();

    assert.equal(object.components[px.id].count, 10, 'what plays is what is on screen');
    assert.equal(workspace.dirtyOf(px.id), true, 'and it never had to be saved first');
    assert.equal(count.name, 'count');
});
