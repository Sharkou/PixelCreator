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
