// What the Editor knows about the Component types a project can use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, BoxCollider, registerBuiltIns } from '../runtime/mod.js';
import { BUILT_IN } from '../runtime/builtins.js';
import { FieldKind, describeComponent } from './inspector/schema.js';
import { CATEGORIES, componentCatalogue, describeType, groupTypes } from './registry.js';
import { iconForComponent } from './ui/icons.js';

test('the three readers fall back to the shipped registry rather than throwing', () => {
    // A LATENT `ReferenceError`, FOUND BY CALLING THEM THE WAY THEIR SIGNATURES INVITE. All
    // three declare `registry = defaultRegistry` and the symbol was never imported, so every
    // call that omitted the argument threw — naming a variable that appeared nowhere in the
    // file. Every caller in the Editor happened to pass one, which is why nothing failed.
    registerBuiltIns();

    assert.equal(describeType('Transform').label, 'Transform');
    assert.ok(componentCatalogue().some(entry => entry.type === 'BoxCollider'));
    assert.ok(groupTypes(['Transform', 'BoxCollider']).some(group => group.entries.length > 0));
});

test('the gameplay components are on the Scene shelf of the Add Component menu', () => {
    registerBuiltIns();

    const shelves = groupTypes(['Transform', 'Velocity', 'BoxCollider', 'RectangleRenderer']);
    const scene = shelves.find(group => group.category === 'Scene');

    assert.deepEqual(scene.entries.map(entry => entry.label).sort(),
        ['Box Collider', 'Transform', 'Velocity']);
});

test('a Body offers one number to type and one fact to read (ADR-0067 §5)', () => {
    registerBuiltIns();

    assert.equal(describeType('Body').label, 'Body');
    assert.ok(componentCatalogue().some(entry => entry.type === 'Body'),
        'it is in the Add Component menu, like every other shipped type');

    const fields = describeComponent(new Body(900));
    assert.deepEqual(fields.map(field => field.name), ['gravity', 'grounded']);

    const gravity = fields[0];
    assert.equal(gravity.kind, FieldKind.NUMBER);
    assert.equal(gravity.readonly, false, 'a creator types this one');

    // COMPUTED, THEREFORE NOT TYPED INTO. Only the pass that stopped the body can know it,
    // and the next step overwrites whatever anybody wrote.
    const grounded = fields[1];
    assert.equal(grounded.kind, FieldKind.BOOLEAN);
    assert.equal(grounded.readonly, true);
});

test('a Box Collider describes four numbers and the one word that makes it a wall', () => {
    // ADR-0059 §3: a collider is DECLARED, so it has to be readable and editable with the
    // Inspector's own primitives — no bespoke control, no gizmo needed to use it.
    registerBuiltIns();

    assert.equal(describeType('BoxCollider').label, 'Box Collider');

    const fields = describeComponent(new BoxCollider());
    assert.deepEqual(fields.map(field => field.name),
        ['width', 'height', 'solid', 'offsetX', 'offsetY']);
    assert.ok(fields.filter(field => field.name !== 'solid')
        .every(field => field.kind === FieldKind.NUMBER),
        'four plain numbers, each editable with the control every other number uses');
    // ADR-0067 §2: a tickbox, on by default, and nothing else to learn.
    const solid = fields.find(field => field.name === 'solid');
    assert.equal(solid.kind, FieldKind.BOOLEAN);
    assert.equal(solid.default, true);
});

test('every type the engine ships is named and shelved, none lands in Other', () => {
    // THE GUARD THAT WAS MISSING. `Body`, `Follow` and `TilemapCollider` were shipped in
    // `runtime/builtins.js` and never added to the Editor's table, so `describeType()` fell
    // through to the class name and to the catch-all category: the Add Component menu offered
    // `TilemapCollider` under `Other`, two shelves away from the `Tilemap` it completes.
    registerBuiltIns();

    for (const ComponentClass of BUILT_IN) {
        const type = ComponentClass.type ?? ComponentClass.name;
        const described = describeType(type);

        assert.notEqual(described.category, 'Other', `${type} has no shelf`);
        assert.ok(CATEGORIES.includes(described.category), `${type} is on a shelf the menu shows`);
        // A CLASS NAME IS NOT A LABEL. `TilemapCollider` is how the file spells it;
        // `Tilemap Collider` is how a creator reads it.
        assert.doesNotMatch(described.label, /[a-z][A-Z]/, `${type} is offered under its class name`);
    }
});

test('a type whose name does not say what it does carries a sentence that does', () => {
    // `Tilemap Collider` has an EMPTY schema, so its section in the Inspector is the label
    // and nothing else; `No properties` told a beginner it works and shows nothing, when it
    // is a component that does nothing at all without a Tilemap beside it.
    registerBuiltIns();

    assert.match(describeType('TilemapCollider').note ?? '', /Tilemap/);
    assert.match(describeType('Body').note ?? '', /Velocity/);
    assert.equal(describeType('Sprite').note, null, 'and a name that answers for itself carries none');
    assert.equal(describeType('res_unknown').note, null);
});

test('every type the engine ships has a glyph of its own', () => {
    registerBuiltIns();

    for (const ComponentClass of BUILT_IN) {
        const type = ComponentClass.type ?? ComponentClass.name;
        assert.notEqual(iconForComponent(ComponentClass, type), 'component',
            `${type} wears the mark of a type nobody can name`);
    }
});
