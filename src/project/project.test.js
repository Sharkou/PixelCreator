// Resource, ResourceId, ResourceStore, and the Project pipeline (ADR-0020).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, componentGraph, componentLabel, invert } from '../core/mod.js';
import {
    MANIFEST_VERSION,
    MemoryResourceStore,
    Project,
    ResourceKind,
    ResourceStore,
    bindGraph,
    createResource,
    createResourceId,
    isResourceId,
    loadComponentDefinitions
} from './mod.js';

/** A stand-in for the runtime's Behaviors, so this layer never imports it. */
function behaviorsSpy() {
    const bound = new Map();
    return {
        bound,
        bind(type, graph) {
            bound.set(typeof type === 'string' ? type : type.type, graph);
            return this;
        }
    };
}

function controllerProject() {
    const project = new Project('My game');
    const graph = { version: 1, nodes: ['On Update'], connections: [] };
    // ONE `.px`: identity, properties and behaviour in one payload (ADR-0026). The
    // definition's `type` IS the ResourceId of its own resource (ADR-0021), so the entry is
    // declared first and written once its id exists.
    const component = project.add({ kind: ResourceKind.COMPONENT, name: 'Controller' }, null);
    project.save(component.id, {
        type: component.id,
        label: 'Controller',
        properties: { speed: { type: 'number', default: 120 } },
        graph
    });

    return { project, graph, component };
}

// --- identity -------------------------------------------------------------------------

test('a ResourceId is opaque, and never derived from a name or a path', () => {
    const first = createResource({ kind: ResourceKind.SCENE, name: 'Level 1' });
    const second = createResource({ kind: ResourceKind.SCENE, name: 'Level 1' });

    assert.notEqual(first.id, second.id, 'same name, same folder, different resources');
    assert.equal(first.id.includes('Level'), false);
    assert.equal(first.id.includes('scenes'), false);
    assert.equal(isResourceId(createResourceId()), true);
    assert.equal(isResourceId(''), false);
    assert.equal(isResourceId(null), false);
});

test('an unknown kind is refused', () => {
    assert.throws(() => createResource({ kind: 'document' }), /unknown resource kind/);
    assert.deepEqual(
        globalThis.Object.values(ResourceKind),
        ['folder', 'scene', 'component', 'graph', 'asset']
    );
});

test('renaming or moving a resource changes nothing that anything references', () => {
    const project = new Project('Game');
    const folder = project.addFolder({ name: 'Act 2' });
    const resource = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });

    project.setProperty(resource.id, 'name', 'The Cellar');
    project.move(resource.id, folder.id);

    assert.equal(project.get(resource.id).name, 'The Cellar');
    assert.equal(project.get(resource.id).parent, folder.id);
    assert.equal(project.get(resource.id).id, resource.id, 'the identity did not move');
});

test('a ResourceId cannot be rewritten', () => {
    const project = new Project('Game');
    const resource = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });

    assert.throws(() => project.setProperty(resource.id, 'id', 'other'), /immutable/);
});

// --- the store ---------------------------------------------------------------------

test('the base store refuses to pretend it works', () => {
    const store = new ResourceStore();

    assert.throws(() => store.list(), /not implemented/);
    assert.throws(() => store.read('x'), /not implemented/);
    assert.throws(() => store.write({}, null), /not implemented/);
    assert.throws(() => store.delete('x'), /not implemented/);
});

test('a payload read from the store is a value, not a live handle', () => {
    const store = new MemoryResourceStore();
    const resource = createResource({ kind: ResourceKind.GRAPH, name: 'G' });
    store.write(resource, { nodes: ['a'] });

    const read = store.read(resource.id);
    read.nodes.push('b');

    assert.deepEqual(store.read(resource.id).nodes, ['a'], 'a caller cannot reach into the store');
    assert.equal(store.read('nothing'), null);
    assert.equal(store.has(resource.id), true);
    assert.deepEqual(store.list(), [resource]);
});

test('a store can be handed its contents at construction', () => {
    const resource = createResource({ kind: ResourceKind.ASSET, name: 'player.png', mime: 'image/png' });
    const store = new MemoryResourceStore([{ resource, payload: 'binary' }]);

    assert.equal(store.read(resource.id), 'binary');
    assert.equal(resource.mime, 'image/png');
});

// --- the manifest, and its pipeline ---------------------------------------------------

test('adding a resource is one Operation, and it is invertible', () => {
    const project = new Project('Game');
    const announced = [];
    project.operations.on('operation', operation => announced.push(operation));

    const resource = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' }, { objects: [] });

    assert.equal(announced.length, 1);
    assert.equal(announced[0].type, 'ADD_RESOURCE');
    assert.equal(project.has(resource.id), true);

    // A second pipeline, same machine: undo works here exactly as it does on a scene.
    project.operations.submit(invert(announced[0]));
    assert.equal(project.has(resource.id), false);
    assert.equal(project.store.read(resource.id), null);
});

test('removing a resource carries its payload, so it can be put back', () => {
    const project = new Project('Game');
    const resource = project.add({ kind: ResourceKind.GRAPH, name: 'Controller' }, { nodes: ['a'] });

    const removals = [];
    project.operations.on('operation', operation => removals.push(operation));
    assert.equal(project.remove(resource.id), true);

    assert.equal(project.has(resource.id), false);

    project.operations.submit(invert(removals[0]));
    assert.equal(project.has(resource.id), true);
    assert.deepEqual(project.read(resource.id), { nodes: ['a'] }, 'with what it was holding');
});

test('removing something the project does not declare is refused', () => {
    const project = new Project('Game');

    assert.equal(project.remove('nothing'), false);
    assert.deepEqual(project.setProperty('nothing', 'name', 'x'), {
        applied: false, operation: null, decision: null
    });
});

test('resources keep their manifest order, and can be listed by kind', () => {
    const project = new Project('Game');
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });
    const graph = project.add({ kind: ResourceKind.GRAPH, name: 'Controller' });
    const first = project.add({ kind: ResourceKind.SCENE, name: 'Title' }, null, { index: 0 });

    assert.deepEqual(project.resources().map(entry => entry.name), ['Title', 'Level 1', 'Controller']);
    assert.deepEqual(project.resources(ResourceKind.SCENE).map(entry => entry.id), [first.id, scene.id]);
    assert.equal(project.resources(ResourceKind.GRAPH)[0].id, graph.id);
});

test('saving a payload bumps the revision', () => {
    const project = new Project('Game');
    const resource = project.add({ kind: ResourceKind.GRAPH, name: 'Controller' }, { nodes: [] });

    assert.equal(project.get(resource.id).revision, 1);
    project.save(resource.id, { nodes: ['a'] });

    assert.equal(project.get(resource.id).revision, 2, 'so Behaviors knows the graph changed');
    assert.deepEqual(project.read(resource.id), { nodes: ['a'] });
    assert.equal(project.save('nothing', {}), null);
});

test('a manifest round-trips', () => {
    const project = new Project('Game');
    project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });
    project.add({ kind: ResourceKind.ASSET, name: 'player.png', mime: 'image/png' });

    const data = JSON.parse(JSON.stringify(project.serialize()));
    assert.equal(data.format, MANIFEST_VERSION);

    const restored = Project.deserialize(data);
    assert.deepEqual(restored.serialize(), project.serialize());
    assert.throws(() => Project.deserialize({ format: 99 }), /unsupported manifest format/);
});

test('reopening a manifest declares its entries without touching the payloads', () => {
    // Rebuilding is construction, not an intent: it must submit nothing, and above all it
    // must not write over what the store already holds. Going through add() did both, and
    // wiped every payload of a project reopened from a shared store (ADR-0020).
    const store = new MemoryResourceStore();
    const project = new Project('Game', { store });
    const graph = project.add({ kind: ResourceKind.GRAPH, name: 'Controller' }, { nodes: ['a'] });

    const reopened = Project.deserialize(project.serialize(), { store });
    const emitted = [];
    reopened.operations.on('operation', operation => emitted.push(operation));

    assert.deepEqual(reopened.read(graph.id), { nodes: ['a'] });
    assert.deepEqual(emitted, []);

    // And the pipeline still numbers the first real intent 1, because none was consumed.
    const added = reopened.add({ kind: ResourceKind.SCENE, name: 'Level 1' });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].seq, 1);
    assert.equal(reopened.get(added.id).name, 'Level 1');
});

test('the project holds no editor state', () => {
    // `Document` does not exist, and neither does an open-tab list. What a tab designates
    // is an OpenEditor, and it is never serialized here (ADR-0020).
    const project = new Project('Game');
    const data = project.serialize();

    assert.deepEqual(globalThis.Object.keys(data), ['format', 'id', 'name', 'resources']);
    assert.equal('selection' in project, false);
    assert.equal('openEditors' in data, false);
});

// --- graphs: who resolves, who binds ------------------------------------------------

test('the Project reads one `.px` and hands the graph it carries to Behaviors', () => {
    const { project, graph, component } = controllerProject();
    const registry = new ComponentRegistry();
    const behaviors = behaviorsSpy();

    return loadComponentDefinitions(project, { registry, behaviors }).then(loaded => {
        assert.equal(loaded.length, 1);

        const Controller = registry.get(component.id);
        assert.ok(Controller, 'registered under its ResourceId, not its name');
        assert.equal(componentLabel(Controller), 'Controller');
        assert.deepEqual(componentGraph(Controller), graph, 'the definition carries it');

        assert.deepEqual(behaviors.bound.get(component.id), graph,
            'the runtime received a graph, never an identifier');
        assert.equal(project.resources(ResourceKind.GRAPH).length, 0,
            'and no second resource exists for it (ADR-0026)');
    });
});

test('a definition with no graph registers, and simply has no behavior', () => {
    const project = new Project('Game');
    const component = project.add({ kind: ResourceKind.COMPONENT, name: 'Controller' });
    project.save(component.id, { type: component.id, label: 'Controller', graph: null });

    const registry = new ComponentRegistry();
    const behaviors = behaviorsSpy();

    return loadComponentDefinitions(project, { registry, behaviors }).then(() => {
        assert.ok(registry.get(component.id), 'the type still exists');
        assert.equal(behaviors.bound.size, 0, 'it just does nothing yet');
    });
});

test('one broken definition does not stop a project from opening', () => {
    const project = new Project('Game');
    const broken = project.add({ kind: ResourceKind.COMPONENT, name: 'Broken' });
    project.save(broken.id, { type: broken.id, properties: { x: { type: 'nonsense' } } });
    const fine = project.add({ kind: ResourceKind.COMPONENT, name: 'Fine' });
    project.save(fine.id, { type: fine.id, label: 'Fine' });

    const registry = new ComponentRegistry();
    const reported = [];

    return loadComponentDefinitions(project, { registry, onError: report => reported.push(report) })
        .then(loaded => {
            assert.equal(loaded.length, 1);
            assert.ok(registry.get(fine.id));
            assert.equal(reported.length, 1);
            assert.equal(reported[0].resource.id, broken.id);
        });
});

test('without an onError, a broken definition is loud', () => {
    const project = new Project('Game');
    const broken = project.add({ kind: ResourceKind.COMPONENT, name: 'Broken' });
    project.save(broken.id, { type: broken.id, properties: { x: { type: 'nonsense' } } });

    return assert.rejects(
        () => loadComponentDefinitions(project, { registry: new ComponentRegistry() }),
        /unknown property type/
    );
});

test('a type with no graph binds nothing', async () => {
    const project = new Project('Game');
    const behaviors = behaviorsSpy();
    class Marker { static type = 'Marker'; }

    assert.equal(await bindGraph(project, Marker, behaviors), null);
    assert.equal(behaviors.bound.size, 0);
});

test('the project layer reaches neither the Editor nor the Runtime', async () => {
    const fs = await import('node:fs/promises');
    const dir = new URL('./', import.meta.url);
    const files = (await fs.readdir(dir)).filter(name => name.endsWith('.js') && !name.endsWith('.test.js'));

    for (const name of files) {
        const source = await fs.readFile(new URL(name, dir), 'utf8');
        assert.equal(/from '\.\.\/editor/.test(source), false, `${name} imports the Editor`);
        assert.equal(/from '\.\.\/runtime/.test(source), false, `${name} imports the Runtime`);
        assert.equal(/\bdocument\.|globalThis\.document/.test(source), false, `${name} touches the DOM`);
    }
});
