// Records what a target emits during a scenario, in a target-neutral vocabulary.
//
// Two streams are kept separate, because the whole point of the v2 Property System is
// that they are NOT the same thing (ADR-0003):
//
//   notifications — the model changed; views must react
//   operations    — a controlled mutation was produced; replicable, undoable, authored
//
// A third stream, `network`, records the payloads a target would actually put on the
// wire. For Legacy those are the real arguments to Network.send().
//
// Entries are stored RAW and normalized only in result(). Object construction emits
// events before the object can be labelled, so eager normalization would bake random
// ids into the baseline and make every run differ.

export class Recorder {

    constructor() {
        this.notifications = [];
        this.operations = [];
        this.network = [];
        this.labels = new Map();   // runtime id -> stable label
        this.counters = new Map();
    }

    /**
     * Give an object a stable label so results do not depend on random ids.
     * @param {string} id - The runtime identifier
     * @param {string} hint - Human-readable base name
     */
    register(id, hint = 'obj') {
        if (this.labels.has(id)) return this.labels.get(id);
        const n = (this.counters.get(hint) ?? 0) + 1;
        this.counters.set(hint, n);
        const label = n === 1 ? hint : `${hint}#${n}`;
        this.labels.set(id, label);
        return label;
    }

    label(id) {
        return this.labels.get(id) ?? id;
    }

    /**
     * Label an id seen in an event, if the harness has not named it already.
     * Legacy creates objects internally (Scene.instantiate does `new Object()`),
     * and those ids would otherwise leak into the baseline and differ every run.
     * @param {string} id - The runtime identifier
     */
    ensure(id) {
        if (id && !this.labels.has(id)) this.register(id, 'internal');
        return id;
    }

    /**
     * Rename an id the harness now knows better.
     * Legacy emits a setProperty per property from inside the constructor, so an object
     * is already labelled `internal` by the time the scenario can name it.
     * @param {string} id - The runtime identifier
     * @param {string} hint - The intended base name
     */
    rename(id, hint) {
        if (!id) return id;
        const current = this.labels.get(id);
        if (current && !current.startsWith('internal')) return current;
        this.labels.delete(id);
        return this.register(id, hint);
    }

    notify(entry) {
        this.notifications.push(entry);
    }

    operation(entry) {
        this.operations.push(entry);
    }

    wire(id, payload) {
        this.network.push({ id, payload });
    }

    clear() {
        this.notifications.length = 0;
        this.operations.length = 0;
        this.network.length = 0;
    }

    /** Everything recorded, with runtime ids replaced by stable labels. */
    result() {
        return {
            notifications: this.normalize(this.notifications),
            operations: this.normalize(this.operations),
            network: this.normalize(this.network)
        };
    }

    /**
     * Deep-replace known runtime ids with stable labels.
     * @param {any} value - Any JSON-compatible value
     */
    normalize(value) {
        if (typeof value === 'string') {
            const exact = this.labels.get(value);
            if (exact) return exact;
            // Ids also travel *inside* strings: Legacy sends `add` as obj.stringify(),
            // a JSON blob. Substitute there too — ids are 9 random chars, so a
            // false positive is not a practical concern.
            let out = value;
            for (const [id, label] of this.labels) {
                if (out.includes(id)) out = out.split(id).join(label);
            }
            return out;
        }
        if (Array.isArray(value)) {
            return value.map(v => this.normalize(v));
        }
        if (value && typeof value === 'object') {
            const out = {};
            for (const key of Object.keys(value)) {
                out[this.normalize(key)] = this.normalize(value[key]);
            }
            return out;
        }
        return value;
    }
}
