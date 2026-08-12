// Composition: add, remove, lifecycle, update/draw contract.

import { STATUS } from '../mapping.js';

export default [

    {
        id: 'component/add',
        title: 'Adding a component: key = type name, activated, operation emitted',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player' });
            api.add(o);
            recorder.clear();
            const controller = api.createComponent('Controller', 4);
            api.addComponent(o, controller);
            return {
                keys: Object.keys(o.components),
                componentName: controller.name,
                active: controller.active,
                speed: api.read(controller, 'speed')
            };
        }
    },

    {
        id: 'component/single-per-type',
        title: 'A second component of the same type replaces the first',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player' });
            api.add(o);
            api.addComponent(o, api.createComponent('Controller', 2));
            recorder.clear();
            api.addComponent(o, api.createComponent('Controller', 9));
            return {
                keys: Object.keys(o.components),
                speed: api.read(o.components.Controller, 'speed')
            };
        }
    },

    {
        id: 'component/remove',
        title: 'Removing a component detaches it and produces an operation',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player' });
            api.add(o);
            const controller = api.createComponent('Controller', 2);
            api.addComponent(o, controller);
            recorder.clear();
            api.removeComponent(o, controller);
            return { keys: Object.keys(o.components) };
        }
    },

    {
        id: 'component/lifecycle-hooks',
        title: 'Which hooks the components actually declare',
        status: STATUS.CONTRACT,
        run(api) {
            const inspect = type => {
                const component = api.createComponent(type);
                return {
                    update: typeof component.update === 'function',
                    draw: typeof component.draw === 'function',
                    preview: typeof component.preview === 'function'
                };
            };
            return {
                Texture: inspect('Texture'),
                RectangleRenderer: inspect('RectangleRenderer'),
                CircleRenderer: inspect('CircleRenderer'),
                Controller: inspect('Controller'),
                Rotator: inspect('Rotator'),
                ParticleSystem: inspect('ParticleSystem'),
                Camera: inspect('Camera')
            };
        }
    },

    {
        id: 'component/tilemap-signature',
        title: 'Tilemap.draw(ctx, camera) is incompatible with Object.draw()',
        status: STATUS.BUG,
        run(api) {
            const tilemap = api.createComponent('Tilemap', 16, 4, 4);
            // Object.draw() calls component.draw(this): `ctx` receives the Object,
            // and `camera` stays undefined.
            return {
                drawArity: tilemap.draw.length,
                conformsToObjectDraw: tilemap.draw.length <= 1
            };
        }
    },

    {
        id: 'component/private-fields-invisible',
        title: '#private fields escape the Property System',
        status: STATUS.BUG,
        run(api) {
            const texture = api.createComponent('Texture', 'sprite.png');
            const keys = Object.keys(texture);
            return {
                visible: keys.filter(k => k[0] !== '_' && k[0] !== '$'),
                hasScaleX: keys.includes('scaleX'),
                hasScaleFromBox: keys.includes('scaleFromBox')
            };
        }
    },

    {
        id: 'component/update-swallows-errors',
        title: 'Object.update() isolates component errors (contract preserved)',
        status: STATUS.CONTRACT,
        run(api) {
            const o = api.createObject({ name: 'Player' });
            api.add(o);
            let called = 0;
            const broken = { name: 'Broken', active: true, update() { throw new Error('boom'); } };
            const healthy = { name: 'Healthy', active: true, update() { called++; } };
            o.components.Broken = broken;
            o.components.Healthy = healthy;

            const originalError = console.error;
            console.error = () => {};
            let threw = false;
            try { o.update(); } catch { threw = true; } finally { console.error = originalError; }

            return { threw, healthyStillRan: called === 1 };
        }
    }
];
