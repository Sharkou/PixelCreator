// What the Editor knows about the Component types a project can use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxCollider, registerBuiltIns } from '../runtime/mod.js';
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

test('a Box Collider describes four numbers a creator can type into', () => {
    // ADR-0059 §3: a collider is DECLARED, so it has to be readable and editable with the
    // Inspector's own primitives — no bespoke control, no gizmo needed to use it.
    registerBuiltIns();

    assert.equal(describeType('BoxCollider').label, 'Box Collider');

    const fields = describeComponent(new BoxCollider());
    assert.deepEqual(fields.map(field => field.name),
        ['width', 'height', 'offsetX', 'offsetY']);
    assert.ok(fields.every(field => field.kind === FieldKind.NUMBER),
        'four plain numbers, each editable with the control every other number uses');
});
