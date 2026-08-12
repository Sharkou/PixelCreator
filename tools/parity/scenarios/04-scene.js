// Scene lifecycle and event ordering.

import { STATUS } from '../mapping.js';

export default [

    {
        id: 'scene/add-remove',
        title: 'Adding and removing an object: notifications and operations',
        status: STATUS.CONTRACT,
        run(api) {
            const o = api.createObject({ name: 'Player' });
            api.add(o);
            const afterAdd = Object.keys(api.scene.objects).length;
            api.remove(o);
            return { afterAdd, afterRemove: Object.keys(api.scene.objects).length };
        }
    },

    {
        id: 'scene/event-order',
        title: 'Exact event order over a realistic editing sequence',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const o = api.createObject({ name: 'Player', x: 0, y: 0 });
            api.add(o);
            recorder.clear();

            // What a creator does: rename, move, add a component, tune it.
            api.writeControlled(o, 'name', 'Hero');
            api.writeControlled(o, 'x', 64);
            const controller = api.createComponent('Controller', 2);
            api.addComponent(o, controller);
            api.writeControlled(controller, 'speed', 5);

            return {
                notificationKinds: recorder.notifications.map(n => n.kind),
                operationKinds: recorder.operations.map(o2 => o2.op)
            };
        }
    },

    {
        id: 'scene/lookup',
        title: 'Looking up objects by name and by tag',
        status: STATUS.CONTRACT,
        run(api) {
            const a = api.createObject({ name: 'Enemy' });
            const b = api.createObject({ name: 'Enemy' });
            const c = api.createObject({ name: 'Player' });
            a.tag = 'hostile';
            b.tag = 'hostile';
            c.tag = 'friendly';
            api.add(a); api.add(b); api.add(c);
            return {
                byNameFirst: api.scene.getObjectByName('Enemy')?.name,
                byNameCount: api.scene.getObjectsByName('Enemy').length,
                byTagCount: api.scene.getObjectsByTag('hostile').length
            };
        }
    },

    {
        id: 'scene/copy-from-live-object-wipes-containers',
        title: 'copy() from a live Object sets components / childs / image to undefined',
        status: STATUS.BUG,
        run(api, recorder) {
            // Cause: copy() walks `for (let prop in obj)`, which includes the
            // write-only $prop accessors. Reading obj.$components yields undefined, so
            // the `typeof !== 'object'` branch runs and assigns this.$components =
            // undefined — whose setter writes this.components = undefined.
            // Primitives survive because _prop immediately follows $prop in key order
            // and restores the value; containers are objects, so the restoring branch
            // skips them.
            const source = api.createObject({ name: 'Source', x: 5, y: 6, width: 10, height: 10 });
            recorder.clear();

            const clone = api.createObject({ name: 'Clone' });
            clone.copy(source);

            return {
                primitivesSurvive: { name: clone.name, x: clone.x, width: clone.width },
                components: typeof clone.components,
                childs: typeof clone.childs,
                image: typeof clone.image
            };
        }
    },

    {
        id: 'scene/instantiate-throws-with-components',
        title: 'instantiate() throws as soon as the source carries a component',
        status: STATUS.BUG,
        run(api, recorder) {
            const source = api.createObject({ name: 'Prefab', x: 5, y: 6 });
            api.addComponent(source, api.createComponent('Rotator', 3));
            recorder.clear();

            let thrown = null;
            try {
                api.scene.instantiate(source);
            } catch (error) {
                thrown = error.constructor.name;
            }

            return {
                thrown,
                // Consequence: the Editor path (prefabs, Network.add) is broken.
                instantiatedIntoScene: Boolean(api.scene.objects[source.id])
            };
        }
    },

    {
        id: 'scene/copy-from-plain-json-works',
        title: 'copy() from plain JSON works (no $ accessors to walk)',
        status: STATUS.QUIRK,
        run(api, recorder) {
            // This is why the network heartbeat works while instantiate() fails: the
            // data received from the server is flat JSON, with no $prop.
            const source = api.createObject({ name: 'Source', x: 5, y: 6, width: 10, height: 10 });
            api.addComponent(source, api.createComponent('Rotator', 3));
            const plain = JSON.parse(api.serialize(source));
            recorder.clear();

            const clone = api.createObject({ name: 'Clone' });
            let thrown = null;
            try { clone.copy(plain); } catch (error) { thrown = error.constructor.name; }

            return {
                thrown,
                components: Object.keys(clone.components ?? {}),
                rotatorSpeed: clone.components?.Rotator?.speed,
                x: clone.x
            };
        }
    },

    {
        id: 'scene/copy-drops-children',
        title: 'copy() does not copy children (explicit TODO in Legacy)',
        status: STATUS.BUG,
        run(api, recorder) {
            const parent = api.createObject({ name: 'Parent' });
            const child = api.createObject({ name: 'Child' });
            api.add(parent);
            api.add(child);
            api.addChild(parent, child);
            const plain = JSON.parse(api.serialize(parent));
            recorder.clear();

            const clone = api.createObject({ name: 'Clone' });
            clone.copy(plain);

            return { clonedChildCount: Object.keys(clone.childs ?? {}).length };
        }
    }
];
