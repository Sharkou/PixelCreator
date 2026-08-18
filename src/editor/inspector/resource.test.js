// What the Inspector shows for a Resource (ADR-0025).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Project, ResourceKind } from '../../project/mod.js';
import { describeResource, formatBytes, formatDate, hasContentPanel } from './resource.js';
import { FieldKind } from './schema.js';

function labelled(description, label) {
    return description.metadata.find(entry => entry.label === label);
}

// --- what every resource shows ----------------------------------------------------------

test('a resource describes one editable field, and it is the name', () => {
    const project = new Project('Game');
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' }, { objects: [] });

    const description = describeResource(scene, { project });

    assert.deepEqual(description.fields.map(field => field.name), ['name']);
    assert.equal(description.fields[0].kind, FieldKind.STRING);
    assert.equal(description.fields[0].readonly, false);
    assert.equal(description.title, 'Level 1');
});

test('the facts are read-only, and named rather than raw', () => {
    const project = new Project('Game');
    const folder = project.addFolder({ name: 'Scenes' });
    const scene = project.add(
        { kind: ResourceKind.SCENE, name: 'Level 1', parent: folder.id },
        { objects: [{}, {}] }
    );

    const description = describeResource(scene, { project, payload: { objects: [{}, {}] }, size: 2048 });

    assert.ok(description.metadata.every(entry => entry.kind === FieldKind.READONLY));
    assert.equal(labelled(description, 'Type').value, 'Scene');
    assert.equal(labelled(description, 'Location').value, 'Scenes');
    assert.equal(labelled(description, 'Size').value, '2.0 KB');
    assert.equal(labelled(description, 'Identifier').value, scene.id);
    assert.equal(labelled(description, 'Objects').value, 2);
});

test('a resource at the top level says where it is rather than nothing', () => {
    const project = new Project('Game');
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });

    assert.equal(labelled(describeResource(scene, { project }), 'Location').value, 'Project');
});

test('a missing measurement is shown as missing, never as zero', () => {
    const project = new Project('Game');
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });

    const description = describeResource(scene, { project, size: null });

    assert.equal(labelled(description, 'Size').value, '—');
    assert.equal(formatBytes(null), null);
    assert.equal(formatBytes(900), '900 B');
    assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
    assert.equal(formatDate(undefined), null);
    assert.equal(typeof formatDate(Date.now()), 'string');
});

// --- per kind, without a branch in the panel --------------------------------------------

test('a folder reports what it holds, and no payload facts', () => {
    const project = new Project('Game');
    const folder = project.addFolder({ name: 'Assets' });
    project.add({ kind: ResourceKind.ASSET, name: 'a.png', parent: folder.id });
    project.add({ kind: ResourceKind.ASSET, name: 'b.png', parent: folder.id });

    const description = describeResource(project.get(folder.id), { project });

    assert.equal(labelled(description, 'Contents').value, '2 items');
    assert.equal(labelled(description, 'Size'), undefined, 'a folder has no bytes');
    assert.equal(labelled(description, 'Revision'), undefined);
    assert.equal(hasContentPanel(folder), false);
});

test('a component reports its properties and the graph it carries', () => {
    const project = new Project('Game');
    const component = project.add({ kind: ResourceKind.COMPONENT, name: 'Controller' });
    const payload = {
        type: component.id,
        properties: { speed: {}, jump: {} },
        graph: { version: 1, nodes: ['On Update'], connections: [] }
    };

    const description = describeResource(component, { project, payload });

    assert.equal(labelled(description, 'Properties').value, 2);
    assert.equal(labelled(description, 'Graph nodes').value, 1);
    assert.equal(labelled(describeResource(component, { project, payload: {} }), 'Graph nodes').value, 0);
});

test('an asset is the kind with content, and says what could not be drawn', () => {
    const project = new Project('Game');
    const asset = project.add({ kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' });

    assert.equal(hasContentPanel(asset), true);

    const drawable = describeResource(asset, { project, payload: 'data:image/png;base64,AAAA' });
    assert.equal(drawable.content.preview.type, 'image');
    assert.equal(drawable.content.replaceable, true);

    const empty = describeResource(asset, { project, payload: null });
    assert.equal(empty.content.preview.type, 'none');
    assert.ok(empty.content.preview.note.length > 0);
});

test('a kind the table says nothing about still inspects', () => {
    // The table adds fields; it does not decide whether a resource can be shown at all.
    const description = describeResource({
        id: 'res_x',
        kind: 'something-new',
        name: 'Mystery',
        parent: null,
        revision: 1,
        created: Date.now(),
        modified: Date.now()
    });

    assert.equal(description.fields[0].name, 'name');
    assert.equal(labelled(description, 'Type').value, 'something-new');
    assert.equal(description.content, null);
});

test('describing nothing is nothing, not an empty panel', () => {
    assert.equal(describeResource(null), null);
});
