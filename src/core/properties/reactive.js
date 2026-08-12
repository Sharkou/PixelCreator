// Property System: one Proxy per reactive target (ADR-0003).
//
// THE RULE THAT SHAPES EVERYTHING ELSE:
// the write trap emits a Change and never, under any circumstance, creates an
// Operation. Operations are created by setProperty() alone (see operations/). That is
// what makes a replication echo structurally impossible rather than something an
// anti-echo flag has to prevent: applying an incoming network Operation goes through
// this very same write path, so it notifies views and stops there.
//
// A Proxy replaces Legacy's per-property Object.defineProperty for three measured
// reasons (docs/migration/LEGACY_ANALYSIS.md §2.3 and §2.4):
//   - properties added after construction stay reactive; in Legacy they were silently
//     inert;
//   - no `_prop` / `$prop` shadow storage, so nothing pollutes enumeration or
//     serialization (Legacy paid a x3 payload for it);
//   - writes measured ~4x faster than the accessor pair.
//
// `_x` and `__x` do not exist here. They were Legacy implementation details and are
// not part of any v2 API.

import { Emitter } from '../events.js';
import { currentOrigin, withOrigin } from './origin.js';

/** Marks a reactive target and carries its bookkeeping. Non-enumerable, symbol-keyed. */
const RECORD = Symbol('pixelcreator.reactive');

/** Observer key meaning "any property of this target". */
const ANY = Symbol('pixelcreator.anyProperty');

const handler = {

    get(raw, prop, receiver) {
        if (typeof prop === 'symbol') return Reflect.get(raw, prop, receiver);

        const record = raw[RECORD];
        if (record.resolveFacade && !(prop in raw)) {
            const provider = record.resolveFacade(prop);
            if (provider) return provider[prop];
        }

        return Reflect.get(raw, prop, receiver);
    },

    set(raw, prop, value) {
        if (typeof prop === 'symbol') return Reflect.set(raw, prop, value);

        const record = raw[RECORD];

        // A facade property is not stored here: it is forwarded to the component that
        // owns it, so there is only ever one source of truth (ADR-0002).
        if (record.resolveFacade && !(prop in raw)) {
            const provider = record.resolveFacade(prop);
            if (provider) {
                provider[prop] = value;
                return true;
            }
        }

        const previous = raw[prop];
        if (sameValue(previous, value)) return true;

        if (!Reflect.set(raw, prop, value)) {
            throw new TypeError(`Cannot write read-only property "${prop}"`);
        }

        notify(record, {
            object: record.owner ?? record.proxy,
            component: record.owner ? record.proxy : null,
            prop,
            value,
            previous,
            origin: currentOrigin()
        });

        return true;
    }
};

/**
 * Wrap a target so its property writes emit Changes.
 * @param {object} raw - The plain instance to wrap; it is never exposed afterwards
 * @returns {Proxy} The reactive target, which is the only reference to hand out
 */
export function makeReactive(raw) {
    if (raw[RECORD]) return raw[RECORD].proxy;

    const record = {
        raw,
        proxy: null,
        emitter: new Emitter(),
        /** Owning Object when this target is a component, null otherwise. */
        owner: null,
        /** Property names this target publishes on its owner, or null. */
        exposes: null,
        /** Resolves a facade property to the component providing it, or null. */
        resolveFacade: null
    };

    globalThis.Object.defineProperty(raw, RECORD, {
        value: record,
        enumerable: false,
        writable: false,
        configurable: false
    });

    record.proxy = new Proxy(raw, handler);
    return record.proxy;
}

/**
 * Tell whether a value is a reactive target.
 * @param {any} value - Any value
 * @returns {boolean} True when the value came from makeReactive()
 */
export function isReactive(value) {
    return Boolean(value) && typeof value === 'object' && Boolean(value[RECORD]);
}

/**
 * Subscribe to property changes.
 * @param {object} target - A reactive target
 * @param {string|Function} prop - Property name, or the listener to observe every property
 * @param {Function} [listener] - Called with the Change
 * @returns {Function} Unsubscribe function
 */
export function observe(target, prop, listener) {
    if (typeof prop === 'function') {
        listener = prop;
        prop = ANY;
    }
    return recordOf(target).emitter.on(prop, listener);
}

/**
 * Apply a property write through the one fundamental write path, under a given origin.
 *
 * This is what applying an Operation uses, including an Operation received from the
 * network. It is a plain write: it notifies observers and produces no Operation, which
 * is precisely why replication cannot loop.
 *
 * @param {object} target - A reactive target
 * @param {string} prop - Property name
 * @param {any} value - New value
 * @param {string} origin - One of Origin
 */
export function applyProperty(target, prop, value, origin) {
    withOrigin(origin, () => {
        target[prop] = value;
    });
}

/**
 * Read a property without going through facade resolution.
 * @param {object} target - A reactive target
 * @param {string} prop - Property name
 * @returns {any} The stored value, undefined when the target does not hold it
 */
export function ownValue(target, prop) {
    return recordOf(target).raw[prop];
}

/**
 * List the target's own data property names, in insertion order.
 * @param {object} target - A reactive target
 * @returns {string[]} Enumerable own property names
 */
export function ownKeys(target) {
    return globalThis.Object.keys(recordOf(target).raw);
}

/**
 * Internal wiring: describe how this target participates in an Object's facade.
 * @param {object} target - A reactive target
 * @param {object} owner - The owning Object, or null to detach
 * @param {Set<string>} [exposes] - Property names published on the owner
 */
export function setOwner(target, owner, exposes = null) {
    const record = recordOf(target);
    record.owner = owner;
    record.exposes = exposes;
}

/**
 * Internal wiring: install the facade resolver used by Object.
 * @param {object} target - A reactive target
 * @param {Function} resolver - (prop) => providing component or null
 */
export function setFacadeResolver(target, resolver) {
    recordOf(target).resolveFacade = resolver;
}

function recordOf(target) {
    const record = target?.[RECORD];
    if (!record) throw new TypeError('Expected a reactive target');
    return record;
}

function notify(record, change) {
    record.emitter.emit(change.prop, change);
    record.emitter.emit(ANY, change);

    // A component property published on its Object is observable from the Object too,
    // so a view can watch `object.x` without knowing that Transform provides it.
    if (record.owner && record.exposes?.has(change.prop)) {
        const ownerRecord = record.owner[RECORD];
        ownerRecord.emitter.emit(change.prop, change);
        ownerRecord.emitter.emit(ANY, change);
    }
}

function sameValue(a, b) {
    // Object.is, except that writing NaN over NaN is also a no-op.
    return a === b || (globalThis.Number.isNaN(a) && globalThis.Number.isNaN(b));
}
