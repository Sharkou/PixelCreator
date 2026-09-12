// The picture pipeline: resolution, caching, invalidation, and the honest failures (ADR-0062).
//
// EVERY ONE OF THESE RUNS UNDER NODE, which is the point of injecting the decoder. What a
// browser contributes is `createImageBitmap`; what this file verifies is everything around it
// — that a payload is read once, that a stale one is re-read, that a picture nobody has is
// not asked for sixty times a second, and that a host with no image API at all simulates
// correctly and draws nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../../core/mod.js';
import { Canvas2DRenderer } from './canvas2d.js';
import { SceneRenderer } from './scene-renderer.js';
import { ImageCache, noImages } from './images.js';
import { Sprite } from './components/sprite.js';
import { registerBuiltIns } from '../builtins.js';

/** A decoder that counts, and answers a picture of the size a payload asks for. */
function decoder({ fail = false, sizes = {} } = {}) {
    const calls = [];
    const closed = [];

    const decode = async payload => {
        calls.push(payload);
        if (fail) throw new Error('broken picture');

        const size = sizes[payload] ?? { width: 16, height: 8 };
        return { ...size, payload, close: () => closed.push(payload) };
    };

    return { decode, calls, closed };
}

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
        imageSize: () => ({ width: 16, height: 8 }),
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
        fillText: record('fillText'),
        save: record('save'),
        restore: record('restore')
    };
}

// --- the cache -----------------------------------------------------------------------------

test('a picture is asked for synchronously and arrives one turn later', async () => {
    const spy = decoder();
    const cache = new ImageCache({ resolve: () => 'data:hero', decode: spy.decode });

    assert.equal(cache.get('res_hero'), null, 'nothing waits, and nothing is drawn yet');

    await cache.load('res_hero');
    assert.deepEqual(cache.size('res_hero'), { width: 16, height: 8 });
});

test('a hundred asks for one picture start one decode', async () => {
    const spy = decoder();
    const cache = new ImageCache({ resolve: () => 'data:hero', decode: spy.decode });

    for (let at = 0; at < 100; at++) cache.get('res_hero');
    await cache.load('res_hero');

    assert.equal(spy.calls.length, 1);
    assert.equal(cache.ready, 1);
});

test('a resource that is not there is remembered as absent, and asked for once', async () => {
    const spy = decoder();
    let reads = 0;
    const cache = new ImageCache({
        resolve: () => {
            reads++;
            return null;
        },
        decode: spy.decode
    });

    for (let frame = 0; frame < 60; frame++) cache.get('res_gone');
    await cache.load('res_gone');

    assert.equal(reads, 1, 'a Sprite pointed at nothing must not ask the project every frame');
    assert.equal(spy.calls.length, 0);
    assert.equal(cache.failed, 1);
    assert.equal(cache.get('res_gone'), null);
});

test('a picture that cannot be decoded fails once, and nothing throws', async () => {
    const spy = decoder({ fail: true });
    const cache = new ImageCache({ resolve: () => 'data:broken', decode: spy.decode });

    await assert.doesNotReject(() => cache.load('res_broken'));
    assert.equal(cache.get('res_broken'), null);
    assert.equal(cache.failed, 1);

    cache.get('res_broken');
    await cache.load('res_broken');
    assert.equal(spy.calls.length, 1, 'a broken picture is attempted once, not every frame');
});

test('invalidation makes the next ask read the payload again, and releases the old one', async () => {
    const spy = decoder({ sizes: { 'v1': { width: 8, height: 8 }, 'v2': { width: 32, height: 32 } } });
    let payload = 'v1';
    const cache = new ImageCache({ resolve: () => payload, decode: spy.decode });

    await cache.load('res_hero');
    assert.deepEqual(cache.size('res_hero'), { width: 8, height: 8 });

    payload = 'v2';
    assert.equal(cache.invalidate('res_hero'), true);
    assert.deepEqual(spy.closed, ['v1'], 'the picture that was replaced is let go');

    await cache.load('res_hero');
    assert.deepEqual(cache.size('res_hero'), { width: 32, height: 32 });
    assert.equal(spy.calls.length, 2);
});

test('COUNTER-PROOF: without invalidation, a replaced picture keeps the old pixels', async () => {
    // The regression the session's `refresh()` exists to prevent, shown rather than asserted
    // about: the SAME cache, not invalidated, answers the first decode for ever.
    const spy = decoder({ sizes: { 'v1': { width: 8, height: 8 }, 'v2': { width: 32, height: 32 } } });
    let payload = 'v1';
    const cache = new ImageCache({ resolve: () => payload, decode: spy.decode });

    await cache.load('res_hero');
    payload = 'v2';
    await cache.load('res_hero');

    assert.deepEqual(cache.size('res_hero'), { width: 8, height: 8 },
        'a cache that is never told is a cache that is stale, which is why `revision` drives it');
});

test('preload answers how many are usable, and waits for all of them', async () => {
    const spy = decoder();
    const cache = new ImageCache({
        resolve: id => (id === 'res_gone' ? null : `data:${id}`),
        decode: spy.decode
    });

    assert.equal(await cache.preload(['res_a', 'res_b', 'res_gone']), 2);
    assert.equal(cache.get('res_a')?.width, 16, 'the first frame after a preload is complete');
});

test('a resolver may be asynchronous, which is how the Editor hands over project.read', async () => {
    const spy = decoder();
    const cache = new ImageCache({
        resolve: async id => globalThis.Promise.resolve(`payload:${id}`),
        decode: spy.decode
    });

    await cache.load('res_hero');
    assert.deepEqual(spy.calls, ['payload:res_hero']);
});

test('clearing releases everything it had decoded', async () => {
    const spy = decoder();
    const cache = new ImageCache({ resolve: id => id, decode: spy.decode });

    await cache.preload(['res_a', 'res_b']);
    cache.clear();

    assert.deepEqual(spy.closed.sort(), ['res_a', 'res_b']);
    assert.equal(cache.ready, 0);
});

test('a host with no image API answers nothing, and the simulation is unaffected', async () => {
    const cache = noImages();

    assert.equal(await cache.load('res_hero'), null);
    assert.equal(cache.get('res_hero'), null);
    assert.equal(cache.size('res_hero'), null);
});

test('a cache needs a resolver, because nothing else can turn an identity into pixels', () => {
    assert.throws(() => new ImageCache({}), /resolve/);
});

// --- the backend ---------------------------------------------------------------------------

test('the Canvas 2D backend resolves the identity and draws what it got', async () => {
    const spy = decoder();
    const images = new ImageCache({ resolve: () => 'data:hero', decode: spy.decode });
    await images.load('res_hero');

    const context = recordingContext();
    const renderer = new Canvas2DRenderer(context, { images });
    renderer.drawImage('res_hero', -8, -4, 16, 8, { alpha: 0.5 });

    const [call] = context.of('drawImage');
    assert.equal(call.args[0].payload, 'data:hero', 'the decoded picture, resolved here and nowhere else');
    assert.deepEqual(call.args.slice(1), [-8, -4, 16, 8]);
    assert.equal(context.globalAlpha, 1, 'and the alpha is put back');
});

test('a clip draws a rectangle of the sheet, which is the whole of a spritesheet', async () => {
    const spy = decoder();
    const images = new ImageCache({ resolve: () => 'data:sheet', decode: spy.decode });
    await images.load('res_sheet');

    const context = recordingContext();
    new Canvas2DRenderer(context, { images })
        .drawImage('res_sheet', 0, 0, 32, 32, { clip: { x: 64, y: 32, width: 32, height: 32 } });

    assert.deepEqual(context.of('drawImage')[0].args.slice(1), [64, 32, 32, 32, 0, 0, 32, 32]);
});

test('a picture that has not arrived draws nothing at all', () => {
    const images = new ImageCache({ resolve: () => 'data:hero', decode: () => new globalThis.Promise(() => {}) });
    const context = recordingContext();

    new Canvas2DRenderer(context, { images }).drawImage('res_hero', 0, 0, 16, 16);
    assert.equal(context.of('drawImage').length, 0);
});

test('a backend built with no cache draws no pictures and does not throw', () => {
    const context = recordingContext();
    const renderer = new Canvas2DRenderer(context);

    assert.doesNotThrow(() => renderer.drawImage('res_hero', 0, 0, 16, 16));
    assert.equal(renderer.imageSize('res_hero'), null);
});

// --- the Sprite ------------------------------------------------------------------------------

test('a Sprite with no size drawn takes the picture own size (ADR-0062 §3)', () => {
    const renderer = recordingRenderer();
    const sprite = new Sprite('res_hero');

    sprite.draw(null, renderer);

    assert.deepEqual(renderer.of('drawImage')[0].args.slice(1, 5), [-8, -4, 16, 8]);
    assert.deepEqual(sprite.bounds(null), { x: -8, y: -4, width: 16, height: 8 });
});

test('one dimension given keeps the aspect ratio of what is actually drawn', () => {
    const renderer = recordingRenderer();

    new Sprite('res_hero', 32).draw(null, renderer);
    assert.deepEqual(renderer.of('drawImage')[0].args.slice(3, 5), [32, 16]);

    new Sprite('res_hero', 0, 16).draw(null, renderer);
    assert.deepEqual(renderer.of('drawImage')[1].args.slice(3, 5), [32, 16]);
});

test('a Sprite whose picture has not arrived reports no bounds rather than a guess', () => {
    const renderer = { ...recordingRenderer(), imageSize: () => null };
    const sprite = new Sprite('res_hero');

    sprite.draw(null, renderer);
    assert.equal(sprite.bounds(null), null, 'and Editor picking falls back to the handle square');
});

test('a spawned prefab shows its picture on the frame it appears', async () => {
    // LOT C's real claim: nothing about a Sprite is set up by the Editor, so an Object that
    // came out of `Spawn Prefab` mid-step draws exactly like one that was always there.
    const spy = decoder();
    const images = new ImageCache({ resolve: () => 'data:bullet', decode: spy.decode });
    await images.preload(['res_bullet']);

    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Level', { registry });
    const spawned = scene.add(new SceneObject('Bullet'));
    spawned.addComponent(new Transform(40, 20));
    spawned.addComponent(new Sprite('res_bullet'));

    const context = recordingContext();
    new SceneRenderer(new Canvas2DRenderer(context, { images })).render(scene);

    assert.equal(context.of('drawImage').length, 1);
});
