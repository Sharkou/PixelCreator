// Property System mutation paths.
//
// This is the heart of the harness: each Legacy write path is isolated and its
// observable effect recorded. See ADR-0003 for the matching v2 semantics.

import { STATUS } from '../mapping.js';

export default [

    {
        id: 'property/direct-write',
        title: 'Direct write: notifies views, produces no operation',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player', x: 10, y: 20, width: 32, height: 32 });
            api.add(o);
            recorder.clear();                    // observe the write itself only
            api.writeDirect(o, 'x', 100);
            return { x: api.read(o, 'x') };
        }
    },

    {
        id: 'property/controlled-write',
        title: 'Controlled write: notifies AND produces an operation',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player', x: 10, y: 20 });
            recorder.clear();
            api.writeControlled(o, 'x', 200);
            return { x: api.read(o, 'x') };
        }
    },

    {
        id: 'property/controlled-write-string',
        title: 'Controlled write on a string (name editing)',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player' });
            recorder.clear();
            for (const value of ['P', 'Pl', 'Pla', 'Play']) {
                api.writeControlled(o, 'name', value);
            }
            return { name: api.read(o, 'name') };
        }
    },

    {
        id: 'property/remote-apply-no-echo',
        title: 'Applying an incoming change: notifies without producing an operation',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player', x: 0 });
            recorder.clear();
            api.applyRemote(o, 'x', 42);
            return { x: api.read(o, 'x') };
        }
    },

    {
        id: 'property/component-controlled-write',
        title: 'Controlled write on a component property',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player' });
            const controller = api.createComponent('Controller', 2);
            api.addComponent(o, controller);
            recorder.clear();
            api.writeControlled(controller, 'speed', 8);
            return { speed: api.read(controller, 'speed') };
        }
    },

    {
        id: 'property/dynamic-not-reactive',
        title: 'A property added after construction is not reactive',
        status: STATUS.BUG,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player' });
            recorder.clear();
            api.writeDirect(o, 'health', 100);   // property unknown to System.sync()
            api.writeDirect(o, 'health', 50);
            return { health: api.read(o, 'health') };
        }
    },

    {
        id: 'property/dollar-write',
        title: 'Legacy probe: $x replicates (syntax removed in v2)',
        status: STATUS.QUIRK,
        targets: ['legacy'],
        needsProbe: true,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player', x: 0 });
            recorder.clear();
            api.probe.dollarWrite(o, 'x', 300);
            return { x: api.read(o, 'x') };
        }
    },

    {
        id: 'property/legacy-set-property-path',
        title: 'Legacy probe: setProperty() writes without replicating (opposite meaning in v2)',
        status: STATUS.QUIRK,
        targets: ['legacy'],
        needsProbe: true,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player', x: 0 });
            recorder.clear();
            api.probe.legacySetProperty(o, 'x', 400);
            const afterLoud = api.read(o, 'x');
            api.probe.legacySetPropertySilent(o, 'x', 500);
            return { afterLoud, afterSilent: api.read(o, 'x') };
        }
    },

    {
        id: 'property/internal-layers',
        title: 'Legacy probe: internal layers x / _x / __x',
        status: STATUS.QUIRK,
        targets: ['legacy'],
        needsProbe: true,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player', x: 0, y: 0 });
            recorder.clear();
            api.writeDirect(o, 'x', 123);
            api.writeDirect(o, 'name', 'Hero');
            return {
                x: api.probe.internal(o, 'x'),
                name: api.probe.internal(o, 'name')
            };
        }
    },

    {
        id: 'property/construction-emits-every-property',
        title: 'Constructing an Object emits one notification per property',
        status: STATUS.QUIRK,
        run(api, recorder) {
            // System.sync() rewrites every property through its own setter to
            // "restore the value", so each rewrite emits setProperty — before the
            // object even belongs to a scene.
            recorder.clear();
            api.createObject({ name: 'Player', x: 1, y: 2, width: 3, height: 4 });
            return {
                notificationCount: recorder.notifications.length,
                operationCount: recorder.operations.length,
                props: recorder.notifications.map(n => n.prop)
            };
        }
    },

    {
        id: 'property/enumerable-pollution',
        title: 'Legacy probe: _prop and $prop pollute the enumerable keys',
        status: STATUS.QUIRK,
        targets: ['legacy'],
        needsProbe: true,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player' });
            recorder.clear();
            const keys = api.probe.ownKeys(o);
            return {
                total: keys.length,
                publicKeys: keys.filter(k => k[0] !== '_' && k[0] !== '$').length,
                underscoreKeys: keys.filter(k => k[0] === '_').length,
                dollarKeys: keys.filter(k => k[0] === '$').length
            };
        }
    }
];
