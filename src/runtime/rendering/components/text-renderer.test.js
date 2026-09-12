// Text on the screen: the declaration, the drawing, the extent, and the round trip.
//
// The interesting cases are the ones where a component could quietly disagree with itself
// — a value written by a graph that is not a string, an alignment that moves the box
// `bounds()` reports but not the one that is drawn, and an `active: false` that the scene
// renderer honours for every other component.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ComponentRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    deserializeScene,
    serializeComponent,
    serializeScene
} from '../../../core/mod.js';
import { Canvas2DRenderer } from '../canvas2d.js';
import { SceneRenderer } from '../scene-renderer.js';
import { registerBuiltIns } from '../../builtins.js';
import { AVERAGE_ADVANCE, TextRenderer } from './text-renderer.js';

function recordingRenderer() {
    const calls = [];
    const record = name => (...args) => calls.push({ name, args });

    return {
        calls,
        of: name => calls.filter(call => call.name === name),
        clear: record('clear'),
        save: record('save'),
        restore: record('restore'),
        setTransform: record('setTransform'),
        setBlendMode: record('setBlendMode'),
        fillRect: record('fillRect'),
        strokeRect: record('strokeRect'),
        fillCircle: record('fillCircle'),
        drawImage: record('drawImage'),
        imageSize: () => null,
        visibleBounds: () => null,
        fillText: record('fillText')
    };
}

function recordingContext() {
    const calls = [];
    const record = name => (...args) => calls.push({ name, args });

    return {
        calls,
        of: name => calls.filter(call => call.name === name),
        canvas: { width: 320, height: 180 },
        imageSmoothingEnabled: true,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: '',
        strokeStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        lineWidth: 1,
        setTransform: record('setTransform'),
        clearRect: record('clearRect'),
        fillRect: record('fillRect'),
        strokeRect: record('strokeRect'),
        beginPath: record('beginPath'),
        arc: record('arc'),
        fill: record('fill'),
        stroke: record('stroke'),
        drawImage: record('drawImage'),
        imageSize: () => null,
        visibleBounds: () => null,
        fillText: record('fillText'),
        save: record('save'),
        restore: record('restore')
    };
}

function label(values = {}) {
    const object = new SceneObject('Score');
    object.addComponent(new Transform(values.x ?? 0, values.y ?? 0));

    const text = new TextRenderer();
    for (const [name, value] of globalThis.Object.entries(values)) {
        if (name !== 'x' && name !== 'y') text[name] = value;
    }
    object.addComponent(text);
    return object;
}

// --- what it declares -----------------------------------------------------------------

test('a fresh Text Renderer is beginner-friendly and shows something', () => {
    const text = new TextRenderer();

    assert.equal(text.text, 'Text');
    assert.equal(text.fontSize, 16);
    assert.equal(text.fontFamily, 'sans-serif');
    assert.equal(text.color, '#ffffff');
    assert.equal(text.align, 'left');
    assert.equal(text.alpha, 1);
});

test('the schema states the same defaults the constructor does', () => {
    const fresh = new TextRenderer();

    for (const [name, declared] of globalThis.Object.entries(TextRenderer.schema)) {
        assert.equal(fresh[name], declared.default, `${name} disagrees with its schema`);
    }
});

test('alignment offers three options and no more', () => {
    assert.deepEqual(TextRenderer.schema.align.values, ['left', 'center', 'right']);
    assert.deepEqual(TextRenderer.schema.align.labels, ['Left', 'Center', 'Right']);
});

// --- drawing --------------------------------------------------------------------------

test('it draws through the renderer contract, never into a canvas', () => {
    const renderer = recordingRenderer();
    new TextRenderer('Hello', 24, 'monospace', '#ff0000', 'center', 0.5).draw(null, renderer);

    const [call] = renderer.of('fillText');
    assert.equal(call.args[0], 'Hello');
    assert.deepEqual([call.args[1], call.args[2]], [0, 0]);
    assert.deepEqual(call.args[3], {
        color: '#ff0000',
        alpha: 0.5,
        fontSize: 24,
        fontFamily: 'monospace',
        align: 'center',
        baseline: 'middle'
    });
});

test('a number written by a graph is drawn as text, and a zero is not nothing', () => {
    const renderer = recordingRenderer();
    const text = new TextRenderer();

    text.text = 0;
    text.draw(null, renderer);

    assert.equal(renderer.of('fillText')[0].args[0], '0');
});

test('empty text and a size of zero draw nothing at all', () => {
    const renderer = recordingRenderer();

    new TextRenderer('').draw(null, renderer);
    new TextRenderer('Hi', 0).draw(null, renderer);

    assert.equal(renderer.of('fillText').length, 0);
});

test('the Canvas 2D backend composes the font the way a canvas reads it', () => {
    const context = recordingContext();
    new Canvas2DRenderer(context).fillText('Score: 3', 20, 20, {
        color: '#00ff00',
        fontSize: 18,
        fontFamily: 'Georgia, serif',
        align: 'right',
        baseline: 'middle'
    });

    assert.equal(context.font, '18px Georgia, serif');
    assert.equal(context.textAlign, 'right');
    assert.equal(context.textBaseline, 'middle');
    assert.equal(context.fillStyle, '#00ff00');
    assert.deepEqual(context.of('fillText')[0].args, ['Score: 3', 20, 20]);
});

test('the Canvas 2D backend puts the alpha back, so the next primitive is not faded', () => {
    const context = recordingContext();
    new Canvas2DRenderer(context).fillText('x', 0, 0, { alpha: 0.25 });

    assert.equal(context.globalAlpha, 1);
});

test('the Canvas 2D backend draws nothing for empty text', () => {
    const context = recordingContext();
    new Canvas2DRenderer(context).fillText('', 0, 0);

    assert.equal(context.of('fillText').length, 0);
});

// --- the transform ---------------------------------------------------------------------

test('a label obeys position, rotation, scale, parenting and layer like everything else', () => {
    const scene = new Scene('Main');
    const parent = scene.add(label({ x: 100, y: 50, text: 'Parent' }));
    const child = scene.add(label({ x: 10, y: 0, text: 'Child' }));
    parent.addChild(child);
    parent.getComponent('Transform').scaleX = 2;

    const renderer = recordingRenderer();
    new SceneRenderer(renderer).render(scene);

    // The child's world transform is composed through the parent's: 100 + 10 * 2.
    const matrices = renderer.of('setTransform').map(call => call.args[0]);
    assert.equal(matrices.length, 2);
    assert.equal(matrices[1].e, 120);
    assert.equal(matrices[1].f, 50);
});

test('an inactive object and a switched-off component both draw nothing', () => {
    const scene = new Scene('Main');
    const hidden = scene.add(label({ text: 'Hidden' }));
    const off = scene.add(label({ text: 'Off' }));
    hidden.active = false;
    off.getComponent('TextRenderer').active = false;

    const renderer = recordingRenderer();
    new SceneRenderer(renderer).render(scene);

    assert.equal(renderer.of('fillText').length, 0);
});

// --- the extent -----------------------------------------------------------------------

test('the extent grows with the text and with the size', () => {
    const short = new TextRenderer('ab').bounds(null);
    const long = new TextRenderer('abcd').bounds(null);
    const big = new TextRenderer('ab', 32).bounds(null);

    assert.equal(long.width, short.width * 2);
    assert.equal(big.width, short.width * 2);
    assert.equal(big.height, 32);
});

test('alignment moves the box the way it moves the glyphs', () => {
    const width = 4 * 16 * AVERAGE_ADVANCE;

    assert.equal(new TextRenderer('abcd', 16, 'sans-serif', '#fff', 'left').bounds(null).x, 0);
    assert.equal(new TextRenderer('abcd', 16, 'sans-serif', '#fff', 'center').bounds(null).x, -width / 2);
    assert.equal(new TextRenderer('abcd', 16, 'sans-serif', '#fff', 'right').bounds(null).x, -width);
});

test('the box is centred on the origin vertically, where the baseline puts the glyphs', () => {
    const box = new TextRenderer('abcd', 20).bounds(null);
    assert.equal(box.y, -10);
    assert.equal(box.height, 20);
});

// --- the format -----------------------------------------------------------------------

test('every declared value survives a save and a load', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Main', { registry });
    scene.add(label({ text: 'Score: 0', fontSize: 28, fontFamily: 'Courier', color: '#ff00ff', align: 'right', alpha: 0.75 }));

    const reloaded = deserializeScene(serializeScene(scene), { registry });
    const text = reloaded.objects()[0].getComponent('TextRenderer');

    assert.equal(text.text, 'Score: 0');
    assert.equal(text.fontSize, 28);
    assert.equal(text.fontFamily, 'Courier');
    assert.equal(text.color, '#ff00ff');
    assert.equal(text.align, 'right');
    assert.equal(text.alpha, 0.75);
});

test('serialization writes the schema keys and nothing else', () => {
    const written = serializeComponent(new TextRenderer());

    assert.deepEqual(
        globalThis.Object.keys(written).sort(),
        ['align', 'alpha', 'color', 'fontFamily', 'fontSize', 'text']
    );
});

test('the type is registered with the engine\'s built-ins', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    assert.equal(registry.get('TextRenderer'), TextRenderer);
});
