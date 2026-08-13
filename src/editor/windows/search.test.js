import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform } from '../../core/mod.js';
import { matches, visibleObjects } from './search.js';

/** Player > Arm > Hand, plus Enemy and a tagged Crate. */
function world() {
    const scene = new Scene('Main');
    const make = (name, tag = '') => {
        const object = new Object(name, { tag });
        object.addComponent(new Transform());
        return scene.add(object);
    };

    const player = make('Player');
    const arm = make('Arm');
    const hand = make('Hand');
    player.addChild(arm);
    arm.addChild(hand);

    return { scene, player, arm, hand, enemy: make('Enemy'), crate: make('Crate', 'pickup') };
}

const names = set => [...set].map(object => object.name).sort();

test('an empty query filters nothing at all', () => {
    const { scene } = world();
    assert.equal(visibleObjects(scene.roots(), ''), null);
    assert.equal(visibleObjects(scene.roots(), '   '), null);
});

test('a match brings its ancestors with it', () => {
    const { scene } = world();

    assert.deepEqual(names(visibleObjects(scene.roots(), 'hand')), ['Arm', 'Hand', 'Player'],
        'a nested match would be unreachable without the branch above it');
});

test('a match does not bring its children', () => {
    const { scene } = world();
    assert.deepEqual(names(visibleObjects(scene.roots(), 'arm')), ['Arm', 'Player']);
});

test('matching is case-insensitive and partial', () => {
    const { scene } = world();
    assert.deepEqual(names(visibleObjects(scene.roots(), 'PLAY')), ['Player']);
    assert.deepEqual(names(visibleObjects(scene.roots(), 'e')), ['Crate', 'Enemy', 'Player']);
});

test('tags are searched too', () => {
    const { scene, crate } = world();

    assert.equal(matches(crate, 'pickup'), true);
    assert.deepEqual(names(visibleObjects(scene.roots(), 'pickup')), ['Crate']);
});

test('an empty tag never matches an empty-ish query', () => {
    const { player } = world();
    assert.equal(matches(player, 'z'), false);
});

test('no result is an empty set, not null', () => {
    const { scene } = world();
    const visible = visibleObjects(scene.roots(), 'nothing here');

    assert.equal(visible.size, 0, 'null means "not filtering", which is a different answer');
});

test('filtering leaves the scene untouched', () => {
    const { scene, player } = world();
    visibleObjects(scene.roots(), 'enemy');

    assert.equal(scene.size, 5);
    assert.equal(player.children.length, 1);
});
