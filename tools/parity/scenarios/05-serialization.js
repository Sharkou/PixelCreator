// Serialization: shape, size, duplication.

import { STATUS } from '../mapping.js';

export default [

    {
        id: 'serialization/public-shape',
        title: 'stringify() filters out the _ and $ prefixes',
        status: STATUS.CONTRACT,
        run(api) {
            const o = api.createObject({ name: 'Player', x: 10, y: 20, width: 32, height: 32 });
            api.addComponent(o, api.createComponent('Rotator', 2));
            const parsed = JSON.parse(api.serialize(o));
            return {
                keys: Object.keys(parsed).sort(),
                componentKeys: Object.keys(parsed.components?.Rotator ?? {}).sort()
            };
        }
    },

    {
        id: 'serialization/underscore-duplication',
        title: 'Raw JSON.stringify duplicates every property as _prop',
        status: STATUS.BUG,
        run(api) {
            const o = api.createObject({ name: 'Player', x: 10, y: 20, width: 32, height: 32 });
            const raw = JSON.stringify(o);
            const filtered = api.serialize(o);
            const rawKeys = Object.keys(JSON.parse(raw));
            return {
                rawKeyCount: rawKeys.length,
                filteredKeyCount: Object.keys(JSON.parse(filtered)).length,
                underscoreKeyCount: rawKeys.filter(k => k[0] === '_').length,
                // Rounded ratio: the order of magnitude matters, not the exact byte count.
                sizeRatio: Math.round((raw.length / filtered.length) * 10) / 10
            };
        }
    },

    {
        id: 'serialization/children-duplicated',
        title: 'A child is serialized inside the parent AND at the scene root',
        status: STATUS.BUG,
        run(api) {
            const parent = api.createObject({ name: 'Parent', x: 0, y: 0 });
            const child = api.createObject({ name: 'Child', x: 10, y: 10 });
            api.add(parent);
            api.add(child);
            api.addChild(parent, child);

            const parentJson = JSON.parse(api.serialize(parent));
            const childKeys = Object.keys(parentJson.childs ?? {});
            const nested = parentJson.childs?.[Object.keys(parentJson.childs ?? {})[0]];

            return {
                childEmbeddedInParent: childKeys.length,
                embeddedIsFullObject: nested ? Object.keys(nested).length > 5 : false,
                alsoAtSceneRoot: Object.keys(api.scene.objects).length
            };
        }
    },

    {
        id: 'serialization/round-trip',
        title: 'Round trip stringify -> parse through copy()',
        status: STATUS.CONTRACT,
        run(api) {
            const source = api.createObject({ name: 'Player', x: 11, y: 22, width: 33, height: 44 });
            api.addComponent(source, api.createComponent('Rotator', 7));
            const json = api.serialize(source);

            const restored = api.createObject({ name: 'Restored' });
            restored.parse(json);

            return {
                name: api.read(restored, 'name'),
                x: api.read(restored, 'x'),
                width: api.read(restored, 'width'),
                components: Object.keys(restored.components),
                rotatorSpeed: restored.components?.Rotator?.speed
            };
        }
    }
];
