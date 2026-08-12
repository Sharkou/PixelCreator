// Parent/child relationships and hierarchical propagation.

import { STATUS } from '../mapping.js';

export default [

    {
        id: 'hierarchy/add-child',
        title: 'Adding a child links both directions and produces an operation',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const parent = api.createObject({ name: 'Parent', x: 100, y: 100 });
            const child = api.createObject({ name: 'Child', x: 120, y: 100 });
            api.add(parent);
            api.add(child);
            recorder.clear();
            api.addChild(parent, child);
            return {
                childCount: Object.keys(parent.childs ?? parent.children ?? {}).length,
                childParent: api.read(child, 'parent')   // normalized by the Recorder
            };
        }
    },

    {
        id: 'hierarchy/position-propagates-to-child',
        title: 'Moving the parent in x/y moves its children by the same delta',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const parent = api.createObject({ name: 'Parent', x: 100, y: 100 });
            const child = api.createObject({ name: 'Child', x: 120, y: 140 });
            api.add(parent);
            api.add(child);
            api.addChild(parent, child);
            recorder.clear();

            api.writeDirect(parent, 'x', 150);   // +50
            api.writeDirect(parent, 'y', 200);   // +100

            return {
                parent: { x: api.read(parent, 'x'), y: api.read(parent, 'y') },
                child: { x: api.read(child, 'x'), y: api.read(child, 'y') }
            };
        }
    },

    {
        id: 'hierarchy/size-does-not-propagate',
        title: 'width / height / rotation do NOT propagate to children',
        status: STATUS.QUIRK,
        run(api, recorder) {
            const parent = api.createObject({ name: 'Parent', x: 0, y: 0, width: 10, height: 10 });
            const child = api.createObject({ name: 'Child', x: 0, y: 0, width: 10, height: 10 });
            api.add(parent);
            api.add(child);
            api.addChild(parent, child);
            recorder.clear();

            api.writeDirect(parent, 'width', 200);
            api.writeDirect(parent, 'rotation', 1.5);

            return {
                parent: { width: api.read(parent, 'width'), rotation: api.read(parent, 'rotation') },
                child: { width: api.read(child, 'width'), rotation: api.read(child, 'rotation') }
            };
        }
    },

    {
        id: 'hierarchy/remove-child',
        title: 'Removing a child cuts the link in both directions',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const parent = api.createObject({ name: 'Parent' });
            const child = api.createObject({ name: 'Child' });
            api.add(parent);
            api.add(child);
            api.addChild(parent, child);
            recorder.clear();
            api.removeChild(parent, child);
            return {
                childCount: Object.keys(parent.childs ?? parent.children ?? {}).length,
                childParent: api.read(child, 'parent')
            };
        }
    },

    {
        id: 'hierarchy/controlled-write-propagates',
        title: 'A controlled write on the parent also propagates to children',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            const parent = api.createObject({ name: 'Parent', x: 0, y: 0 });
            const child = api.createObject({ name: 'Child', x: 50, y: 0 });
            api.add(parent);
            api.add(child);
            api.addChild(parent, child);
            recorder.clear();
            api.writeControlled(parent, 'x', 25);
            return { parentX: api.read(parent, 'x'), childX: api.read(child, 'x') };
        }
    }
];
