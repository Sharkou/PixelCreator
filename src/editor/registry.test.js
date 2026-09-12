// What the Editor knows about the Component types a project can use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, BoxCollider, registerBuiltIns } from '../runtime/mod.js';
import { FieldKind, describeComponent } from './inspector/schema.js';
import { componentCatalogue, describeType, groupTypes } from './registry.js';

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
