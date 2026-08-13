// The scene a fresh Pixel Creator opens on.
//
// A PLACEHOLDER FOR PROJECT LOADING, NOT A FIXTURE. `Resource`, project files and the
// loader are a later step (docs/migration/MIGRATION_STATUS.md), so until an Editor can
// open a real project it has to start somewhere. Everything below is built with the same
// Core API a creator's own actions go through — real Objects, real Components, real
// Transform composition — so nothing here is a mock the Editor could accidentally come to
// depend on. Deleting this file once projects load costs one call site.
//
// It is also the smallest scene that exercises what the viewport claims: a parent whose
// child inherits its transform, objects at different layers, and an object with no
// geometry at all (the camera) that must still be selectable.

import { Object, Transform } from '../../core/mod.js';
import { Camera, RectangleRenderer } from '../../runtime/mod.js';

/**
 * Build the scene a new project starts from.
 * @param {object} scene - The scene to fill
 * @returns {object} The same scene
 */
export function fillStarterScene(scene) {
    scene.add(build('Main Camera', { components: [new Camera()] }));

    scene.add(build('Ground', {
        y: 160,
        layer: -1,
        components: [new RectangleRenderer(560, 48, '#33333a')]
    }));

    // Not the accent colour: the selection outline is drawn in it, and an object painted
    // the same shade as its own outline cannot be seen to be selected.
    const player = scene.add(build('Player', {
        y: 40,
        layer: 1,
        components: [new RectangleRenderer(64, 64, '#7b61ff')]
    }));

    // Parented, so moving or rotating the Player carries it. This is the composition
    // rule in core/components/transform.js, shown rather than described.
    const visor = scene.add(build('Visor', {
        y: -14,
        layer: 2,
        components: [new RectangleRenderer(40, 12, '#211a4d')]
    }));
    player.addChild(visor);

    scene.add(build('Crate', {
        x: -180,
        y: 104,
        layer: 1,
        components: [new RectangleRenderer(48, 48, '#8d6a3f')]
    }));

    scene.add(build('Crate 2', {
        x: 200,
        y: 88,
        rotation: 0.3,
        layer: 1,
        components: [new RectangleRenderer(80, 80, '#6b5330')]
    }));

    return scene;
}

function build(name, { x = 0, y = 0, rotation = 0, layer = 0, components = [] } = {}) {
    const object = new Object(name, { layer });
    object.addComponent(new Transform(x, y, rotation));
    for (const component of components) object.addComponent(component);
    return object;
}
