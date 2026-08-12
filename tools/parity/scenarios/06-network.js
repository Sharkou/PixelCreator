// Network behaviour: what actually goes on the wire.
//
// The Legacy network layer is enabled for real (Network.sync()), with Network.send
// replaced by a recorder. The observed payloads are therefore the real ones.

import { STATUS } from '../mapping.js';

export default [

    {
        id: 'network/controlled-write-is-sent',
        title: 'A controlled write produces an update message on the wire',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            api.enableNetwork();
            const o = api.createObject({ name: 'Player', x: 0, type: 'object' });
            api.add(o);
            recorder.clear();
            api.writeControlled(o, 'x', 128);
        }
    },

    {
        id: 'network/direct-write-is-not-sent',
        title: 'A direct write does NOT go on the wire',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            api.enableNetwork();
            const o = api.createObject({ name: 'Player', x: 0, type: 'object' });
            api.add(o);
            recorder.clear();
            api.writeDirect(o, 'x', 128);
        }
    },

    {
        id: 'network/remote-apply-has-no-echo',
        title: 'Applying an incoming change sends nothing back on the wire',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            api.enableNetwork();
            const o = api.createObject({ name: 'Player', x: 0, type: 'object' });
            api.add(o);
            recorder.clear();
            api.applyRemote(o, 'x', 77);
        }
    },

    {
        id: 'network/structural-operations-are-sent',
        title: 'add / addComponent / addChild go on the wire',
        status: STATUS.CONTRACT,
        run(api, recorder) {
            api.enableNetwork();
            const parent = api.createObject({ name: 'Parent', type: 'object' });
            const child = api.createObject({ name: 'Child', type: 'object' });
            recorder.clear();
            api.add(parent);
            api.add(child);
            api.addComponent(parent, api.createComponent('Rotator', 1));
            api.addChild(parent, child);
            return { wireIds: recorder.network.map(m => m.id) };
        }
    },

    {
        id: 'network/no-batching',
        title: 'No batching: every keystroke produces its own operation',
        status: STATUS.BUG,
        // The number of messages actually emitted depends on the millisecond: the
        // Network.sync() throttle uses delay = 0, so depending on whether two writes
        // land in the same millisecond, one is sent immediately and the other deferred
        // by setTimeout (cancelling the previous one). The network stream is therefore
        // deliberately excluded from the comparison — only the operation stream, which
        // is synchronous and deterministic, is authoritative.
        volatile: ['network'],
        run(api, recorder) {
            api.enableNetwork();
            const o = api.createObject({ name: 'Player', type: 'object' });
            api.add(o);
            recorder.clear();
            for (const value of ['P', 'Pl', 'Pla', 'Play']) {
                api.writeControlled(o, 'name', value);
            }
            return {
                keystrokes: 4,
                operationsProduced: recorder.operations.length,
                batched: recorder.operations.length < 4
            };
        }
    }
];
