import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    componentPayload,
    describePayload,
    filesPayload,
    objectPayload,
    resourcePayload
} from './payload.js';

test('a dragged resource is named by its name', () => {
    const described = describePayload(resourcePayload({ id: 'r1', name: 'player.png' }));

    assert.equal(described.label, 'player.png');
    assert.equal(typeof described.icon, 'string');
});

test('a dragged object is named by its name', () => {
    assert.equal(describePayload(objectPayload({ name: 'Player' })).label, 'Player');
});

test('a dragged component is named by its type', () => {
    assert.equal(describePayload(componentPayload({}, 'RectangleRenderer')).label, 'RectangleRenderer');
});

test('one file shows its name, several show how many', () => {
    const one = filesPayload([{ name: 'hero.png', mime: 'image/png', payload: 'x' }]);
    assert.equal(describePayload(one).label, 'hero.png');

    const many = filesPayload([
        { name: 'a.png', mime: 'image/png', payload: 'x' },
        { name: 'b.png', mime: 'image/png', payload: 'y' }
    ]);
    assert.equal(describePayload(many).label, '2 files');
});

test('a nameless thing still says something rather than nothing', () => {
    // A ghost with an empty label reads as broken, and an unnamed resource is legal.
    assert.equal(describePayload(resourcePayload({ id: 'r1', name: '' })).label, 'Resource');
    assert.equal(describePayload(objectPayload({ name: '' })).label, 'Object');
    assert.equal(describePayload(filesPayload([])).label, '0 files');
});

test('an unknown payload is described rather than thrown at', () => {
    assert.equal(describePayload(null).label, 'Item');
    assert.equal(describePayload({ kind: 'something-new' }).label, 'Item');
    assert.equal(typeof describePayload(undefined).icon, 'string');
});
