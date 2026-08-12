// Legacy adapter — drives the untouched Legacy Core through the neutral scenario API.
//
// Legacy is READ-ONLY. Nothing here writes to legacy/. The only runtime interference is
// replacing Network.send with a recorder, and snapshotting System.events between
// scenarios so listeners do not leak (Legacy never removes them).
//
// SEMANTIC MAPPING (ADR-0003) — this is the important part of this file.
//
//   neutral API          Legacy                              v2
//   ------------------   ---------------------------------   -----------------------------
//   writeDirect          obj.x = v                           obj.x = v
//   writeControlled      obj.syncProperty('x', v)            obj.setProperty('x', v)
//   applyRemote          obj.x = v   (what Network.update does)  applyOperation(origin:'network')
//
//   probe.legacySetProperty  obj.setProperty('x', v)  — Legacy-only, NO v2 equivalent
//   probe.dollarWrite        obj.$x = v               — Legacy-only, REMOVED in v2
//
// `$` and `syncProperty()` are gone in v2; `setProperty()` takes over their role, while
// the Legacy `setProperty()` (a direct non-replicating write) disappears as such.
// Probes exist so the harness can still observe those Legacy paths without ever
// presenting them as v2 targets.

import { installGlobals } from '../env/globals.js';

installGlobals();

let core = null;

async function loadCore() {
    if (core) return core;
    const [{ System }, { Scene }, { Object: LegacyObject }, { Network }, components] =
        await Promise.all([
            import('/src/core/system.js'),
            import('/src/core/scene.js'),
            import('/src/core/object.js'),
            import('/src/network/network.js'),
            import('/src/core/mod.js')
        ]);
    core = { System, Scene, LegacyObject, Network, components };
    return core;
}

export const name = 'legacy';

export async function createTarget(recorder) {
    const { System, Scene, LegacyObject, Network, components } = await loadCore();

    // Isolate this scenario: Legacy accumulates listeners and never removes them.
    const savedEvents = System.events;
    System.events = {};

    const scene = new Scene('Parity Scene');
    Scene.main = scene;

    // --- notification stream -------------------------------------------------
    // Everything an Editor view reacts to.
    System.addEventListener('setProperty', d => recorder.notify({
        kind: 'change',
        target: recorder.ensure(d.object?.id),
        component: d.component?.name ?? null,
        prop: d.prop,
        value: d.value
    }));
    System.addEventListener('add', o => recorder.notify({ kind: 'add', target: recorder.ensure(o?.id) }));
    System.addEventListener('remove', o => recorder.notify({ kind: 'remove', target: recorder.ensure(o?.id) }));
    System.addEventListener('addComponent', d => recorder.notify({
        kind: 'addComponent', target: recorder.ensure(d.object?.id), component: d.component?.name ?? null
    }));
    System.addEventListener('removeComponent', d => recorder.notify({
        kind: 'removeComponent',
        target: recorder.ensure(d.object?.id),
        component: typeof d.component === 'string' ? d.component : d.component?.name ?? null
    }));
    System.addEventListener('addChild', d => recorder.notify({
        kind: 'addChild', target: recorder.ensure(d.object?.id), child: recorder.ensure(d.child?.id)
    }));
    System.addEventListener('removeChild', d => recorder.notify({
        kind: 'removeChild', target: recorder.ensure(d.object?.id), child: recorder.ensure(d.child?.id)
    }));

    // --- operation stream ----------------------------------------------------
    // In Legacy there is no Operation type. The faithful stand-in is exactly what
    // Network.sync() subscribes to — that set IS Legacy's implicit operation list
    // (see LEGACY_ANALYSIS.md §8.2).
    System.addEventListener('syncProperty', d => recorder.operation({
        op: 'SET_PROPERTY',
        target: recorder.ensure(d.object?.id),
        component: d.component?.name ?? null,
        prop: d.prop,
        value: d.value
    }));
    System.addEventListener('add', o => recorder.operation({ op: 'ADD_OBJECT', target: recorder.ensure(o?.id) }));
    System.addEventListener('remove', o => recorder.operation({ op: 'REMOVE_OBJECT', target: recorder.ensure(o?.id) }));
    System.addEventListener('addComponent', d => recorder.operation({
        op: 'ADD_COMPONENT', target: recorder.ensure(d.object?.id), component: d.component?.name ?? null
    }));
    System.addEventListener('removeComponent', d => recorder.operation({
        op: 'REMOVE_COMPONENT',
        target: recorder.ensure(d.object?.id),
        component: typeof d.component === 'string' ? d.component : d.component?.name ?? null
    }));
    System.addEventListener('addChild', d => recorder.operation({
        op: 'ADD_CHILD', target: recorder.ensure(d.object?.id), child: recorder.ensure(d.child?.id)
    }));
    System.addEventListener('removeChild', d => recorder.operation({
        op: 'REMOVE_CHILD', target: recorder.ensure(d.object?.id), child: recorder.ensure(d.child?.id)
    }));

    const api = {
        target: 'legacy',

        createObject({ name = 'Object', x = 0, y = 0, width = 0, height = 0, type = '' } = {}) {
            const obj = new LegacyObject(name, x, y, width, height);
            if (type) obj.type = type;   // skip when empty: an extra write would show up as an event
            // The constructor already emitted events, so the id is labelled `internal`.
            recorder.rename(obj.id, name);
            return obj;
        },

        createComponent(type, ...args) {
            const Ctor = components[type];
            if (!Ctor) throw new Error(`Unknown component: ${type}`);
            return new Ctor(...args);
        },

        scene,
        add: obj => scene.add(obj),
        remove: obj => scene.remove(obj),

        // object.x = v  →  direct state mutation (same shape in v2)
        writeDirect(target, prop, value) { target[prop] = value; },

        // v2: object.setProperty(prop, value). Legacy equivalent is syncProperty().
        writeControlled(target, prop, value) {
            if (typeof target.syncProperty === 'function') target.syncProperty(prop, value);
            else target[prop] = value;   // components have no syncProperty in Legacy
        },

        // What Network.update() actually does on an incoming message: a plain write.
        applyRemote(target, prop, value) { target[prop] = value; },

        addComponent: (obj, component) => obj.addComponent(component),
        removeComponent: (obj, component) => obj.removeComponent(component),
        addChild: (parent, child) => parent.addChild(child),
        removeChild: (parent, child) => parent.removeChild(child),

        read: (target, prop) => target[prop],
        serialize: obj => obj.stringify(),

        // Legacy-only observation points. Never used by v2 scenarios.
        probe: {
            available: true,
            dollarWrite(target, prop, value) { target['$' + prop] = value; },
            legacySetProperty(target, prop, value) { target.setProperty(prop, value); },
            legacySetPropertySilent(target, prop, value) { target.setProperty(prop, value, false); },
            internal(target, prop) {
                return {
                    public: target[prop],
                    underscore: target['_' + prop],
                    doubleUnderscore: target['__' + prop]
                };
            },
            ownKeys: target => Object.keys(target)
        },

        /** Turn on Legacy's real network layer, capturing send() payloads. */
        enableNetwork() {
            Network.scene = scene;
            Network.inspector = true;
            Network.users = {};
            Network.uid = 'local-uid';
            Network.send = (id, payload) => recorder.wire(id, payload);
            Network.sync();
        },

        dispose() {
            System.events = savedEvents;
        }
    };

    return api;
}
