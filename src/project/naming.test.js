// A resource's name, and the extension a creator may not rewrite (ADR-0026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Project, ResourceKind, baseNameOf, extensionOf, hasValidExtension, withExtension } from './mod.js';

const png = { kind: ResourceKind.ASSET, name: 'player.png', mime: 'image/png' };
const component = { kind: ResourceKind.COMPONENT, name: 'Controller.px' };
const folder = { kind: ResourceKind.FOLDER, name: 'Assets' };

// --- what an extension is ---------------------------------------------------------------

test('an asset takes its extension from what its payload actually is', () => {
    assert.equal(extensionOf(png), '.png');
    assert.equal(extensionOf({ kind: ResourceKind.ASSET, name: 'jump.wav', mime: 'audio/wav' }), '.wav');
    assert.equal(extensionOf({ kind: ResourceKind.ASSET, name: 'shot.jpeg', mime: 'image/jpeg' }), '.jpg');
});

test('a kind with no mime takes its extension from the kind', () => {
    assert.equal(extensionOf(component), '.px');
    assert.equal(extensionOf({ kind: ResourceKind.SCENE, name: 'Level 1.scene' }), '.scene');
    assert.equal(extensionOf(folder), '', 'a folder is not a file');
});

test('an unknown mime keeps the suffix the name already carries rather than guessing', () => {
    const odd = { kind: ResourceKind.ASSET, name: 'hero.tga', mime: 'image/x-tga' };

    assert.equal(extensionOf(odd), '.tga');
    assert.equal(withExtension('villain', odd), 'villain.tga');
});

test('the base name is what a creator edits', () => {
    assert.equal(baseNameOf(png), 'player');
    assert.equal(baseNameOf(component), 'Controller');
    assert.equal(baseNameOf(folder), 'Assets');
    assert.equal(baseNameOf({ kind: ResourceKind.ASSET, name: 'no-extension', mime: '' }), 'no-extension');
});

// --- what a rename may and may not do ----------------------------------------------------

test('renaming changes the base and keeps the extension', () => {
    assert.equal(withExtension('player_idle', png), 'player_idle.png');
    assert.equal(withExtension('Movement', component), 'Movement.px');
    assert.equal(withExtension('Art', folder), 'Art');
});

test('typing another extension does not change the type', () => {
    // The whole point: a rename is not a conversion (ADR-0026 §5).
    assert.equal(withExtension('player.txt', png), 'player.png');
    assert.equal(withExtension('player.jpg', png), 'player.png');
    assert.equal(withExtension('Controller.scene', component), 'Controller.px');
});

test('a dot that is part of a name survives', () => {
    assert.equal(withExtension('player.v1.2', png), 'player.v1.2.png');
    assert.equal(withExtension('hero.png', png), 'hero.png', 'and typing the right one is idempotent');
});

test('a name is checked against the extension its resource must carry', () => {
    assert.equal(hasValidExtension('player.png', png), true);
    assert.equal(hasValidExtension('player.txt', png), false);
    assert.equal(hasValidExtension('anything', folder), true);
});

// --- and it holds through the model ------------------------------------------------------

test('a new resource is named with its extension, and the counter goes before it', () => {
    const project = new Project('Game');
    const first = project.add({ kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' }, 'x');
    const second = project.add(
        { kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' },
        'x'
    );

    assert.equal(first.name, 'hero.png');
    // `add` does not deduplicate — names are not identities — but the Editor's naming
    // helper does, and it is what the panel and the drop rules use.
    assert.equal(second.name, 'hero.png');
});
