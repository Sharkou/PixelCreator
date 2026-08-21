// A `.px` while it is being edited — the live model of a Component definition (ADR-0027).
//
// WHAT THIS IS THE COUNTERPART OF. `Scene` is the live model of a scene payload; this is
// the live model of a `.px` payload. Both are Core, both own an `Operations` pipeline, and
// both serialize into exactly the data their resource stores — so a headless build can
// open, edit and check a Component without an Editor, which is what ADR-0011 requires of a
// server and what ADR-0020 requires of the Project layer.
//
// IT IS NOT A `Document` (ADR-0020). It holds no selection, no view state, no scroll
// position and no idea of being "open": identity is the `Resource`, persistence is the
// `ResourceStore`, and the undo stack is the Editor's. What is left is the model, and the
// model is what this is.
//
// ONE RESOURCE, ONE PIPELINE, ONE UNDO STACK (ADR-0026, ADR-0024). A Component and its
// graph are one `.px`, so declaring a property and wiring two nodes travel the same
// pipeline and land on the same stack. `Ctrl Z` in the Graph window and `Ctrl Z` in the
// Inspector take back the last thing the creator did to THIS resource, in order, because
// there is only one order.
//
// A PROPERTY HAS AN IDENTITY, AND THE NAME IS NOT IT. The schema a Component declares is a
// map keyed by name — that is what `defineComponent()` reads and what the Inspector shows —
// but a graph node that referenced a name would break the moment a creator renamed it. So
// each descriptor carries a stable `id`, minted once, and nodes reference that. Renaming is
// then an ordinary `SET_PROPERTY` on a reactive record, which replicates and inverts with
// no code written for it:
//
//   properties: { speed: { id: 'p_7', type: 'number', default: 120 } }
//                   │        └── what a node stores
//                   └── what a creator reads, and may change freely
//
// THE ORDER OF PROPERTIES IS DATA. A schema is a map, and JavaScript maps keep insertion
// order, so the Inspector shows properties in the order they were declared and undoing a
// deletion puts one back where it was — which is why REMOVE_PROPERTY carries an index.

import { createId } from '../id.js';
import { Origin } from '../properties/origin.js';
import { makeReactive } from '../properties/reactive.js';
import { Operations } from '../operations/operations.js';
import { OperationType, setPropertyOperation } from '../operations/operation.js';
import { addPropertyOperation, removePropertyOperation } from '../operations/graph-operations.js';
import { PropertyType, defaultForProperty, isPropertyType } from '../properties/types.js';
import { Graph } from './graph.js';
import { nodes as defaultNodes } from './nodes.js';
import { validateGraph } from './validate.js';

/** What a property a creator adds starts as, when they say nothing else. */
export const DEFAULT_PROPERTY_TYPE = PropertyType.NUMBER;

export class ComponentDefinition {

    #type;
    #meta;
    #graph;
    #operations;
    #registry;
    #components;

    /** Property id -> the reactive descriptor, in declaration order. */
    #properties = new Map();

    /**
     * Create the live model of a `.px`.
     *
     * @param {object} [payload] - The definition, as a `.px` stores it
     * @param {object} [options] - Options
     * @param {object} [options.registry] - The NodeRegistry the graph's ports are read from
     * @param {object} [options.authority] - Object exposing check(operation) => decision
     * @param {Function} [options.components] - () => the project's Component types, for the
     *   nodes that name one (ADR-0034 §3.3). Absent headlessly, and then such a node's port
     *   falls back to `any` and the validator says nothing rather than guessing.
     */
    constructor(payload = {}, { registry = defaultNodes, authority, components = null } = {}) {
        this.#type = payload.type ?? createId();
        this.#registry = registry;
        this.#components = components;

        // ONE `resolve` FOR THREE KINDS OF TARGET, because there is one pipeline. A node, a
        // property descriptor and the definition's own record are all reactive records with
        // distinct identifiers, so a lookup is a lookup — there is no dispatch on type and
        // no ambiguity to resolve.
        this.#operations = new Operations({
            authority,
            resolve: target => {
                const id = target.object;
                if (id === this.#type) return this.#meta;
                return this.#properties.get(id) ?? this.#graph?.node(id) ?? null;
            }
        });

        this.#meta = makeReactive({ label: payload.label ?? '' });

        for (const [name, descriptor] of globalThis.Object.entries(payload.properties ?? {})) {
            this.#declare({ ...descriptor, name, id: descriptor?.id ?? createId() });
        }

        this.#graph = Graph.deserialize(payload.graph ?? null, {
            registry,
            operations: this.#operations,
            context: () => ({ properties: this.properties(), components: this.#components?.() ?? null })
        });

        this.#registerHandlers();
    }

    /** The definition's stable identity — the `.px`'s own ResourceId (ADR-0021). */
    get type() {
        return this.#type;
    }

    /** The displayed name of the Component this defines. */
    get label() {
        return this.#meta.label;
    }

    /** The reactive record carrying the fields that are the definition's own. */
    get meta() {
        return this.#meta;
    }

    /** The behaviour graph this `.px` carries. */
    get graph() {
        return this.#graph;
    }

    /** The pipeline every edit of this `.px` travels through. */
    get operations() {
        return this.#operations;
    }

    /** The catalogue the graph's node types are resolved in. */
    get registry() {
        return this.#registry;
    }

    /** The declared properties, in declaration order. */
    properties() {
        return [...this.#properties.values()];
    }

    /**
     * Look a property up by identity.
     * @param {string} id - The property's stable identifier
     * @returns {object|null} The reactive descriptor, or null
     */
    property(id) {
        return this.#properties.get(id) ?? null;
    }

    /**
     * Look a property up by the name it currently carries.
     * @param {string} name - The displayed name
     * @returns {object|null} The reactive descriptor, or null
     */
    propertyNamed(name) {
        return this.properties().find(property => property.name === name) ?? null;
    }

    /**
     * The rank a property holds in the schema.
     * @param {string} id - The property's identifier
     * @returns {number} The rank, or -1
     */
    indexOf(id) {
        return this.properties().findIndex(property => property.id === id);
    }

    /**
     * Declare a property, as one ADD_PROPERTY operation.
     *
     * The name is made unique because the schema is a map keyed by name: two properties
     * called `speed` would be one property, and the second would silently overwrite the
     * first on the next save.
     *
     * @param {object} [spec] - The property
     * @param {string} [spec.name] - Displayed name; "property" by default, made unique
     * @param {string} [spec.type] - One of PropertyType
     * @param {any} [spec.default] - Starting value; the type's own default when absent
     * @param {string} [spec.id] - Existing identifier, used when replaying
     * @param {object} [options] - Options
     * @param {number} [options.index] - Rank in the schema
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {object|null} The reactive descriptor, or null when refused
     */
    addProperty({ name, type = DEFAULT_PROPERTY_TYPE, id, ...rest } = {}, { index, actor, batch } = {}) {
        if (!isPropertyType(type)) {
            throw new TypeError(`ComponentDefinition.addProperty: unknown property type "${type}"`);
        }

        const property = {
            ...rest,
            id: id ?? createId(),
            name: this.uniquePropertyName(name ?? 'property'),
            type,
            default: rest.default === undefined ? defaultForProperty({ type, ...rest }) : rest.default
        };

        const result = this.#operations.submit(addPropertyOperation({
            property,
            index: index ?? null,
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied ? this.property(property.id) : null;
    }

    /**
     * Undeclare a property, as one REMOVE_PROPERTY operation.
     *
     * NODES THAT REFERENCED IT ARE LEFT ALONE, DELIBERATELY. Rewriting a graph as a side
     * effect of deleting a property would make one gesture edit two things a creator can
     * see, and an undo would have to guess which of them to put back. Instead the reference
     * becomes a reported one: `validateGraph()` returns MISSING_PROPERTY, the Graph window
     * marks the node, and the interpreter throws a structured GraphError rather than reading
     * `undefined`. Never a silent dangling reference (ADR-0027).
     *
     * @param {string} id - The property's identifier
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {boolean} True when the property was removed
     */
    removeProperty(id, { actor, batch } = {}) {
        const property = this.#properties.get(id);
        if (!property) return false;

        const result = this.#operations.submit(removePropertyOperation({
            property: snapshot(property),
            index: this.indexOf(id),
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied;
    }

    /**
     * Change a field of a property descriptor, as one SET_PROPERTY operation.
     *
     * Renaming is this, and so is changing a type or a default: they are fields of a
     * reactive record, so they replicate, invert and land in the history with no operation
     * of their own (ADR-0027).
     *
     * @param {string} id - The property's identifier
     * @param {string} field - `name`, `type`, `default`, or any descriptor field
     * @param {any} value - The new value
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {object} { applied, operation, decision }
     */
    setPropertyField(id, field, value, { actor, batch } = {}) {
        const property = this.#properties.get(id);
        if (!property) return { applied: false, operation: null, decision: null };
        if (field === 'id') throw new Error('ComponentDefinition: a property identity is immutable');
        if (property[field] === value) return { applied: false, operation: null, decision: null };

        return this.#operations.submit(setPropertyOperation({
            target: { object: id, component: null },
            prop: field,
            value,
            previous: property[field],
            origin: Origin.EDITOR,
            actor,
            batch
        }));
    }

    /**
     * Rename a property, keeping its identity and therefore every node that reads it.
     *
     * @param {string} id - The property's identifier
     * @param {string} name - The new displayed name
     * @param {object} [options] - Options, as setPropertyField() takes them
     * @returns {boolean} True when the name changed
     */
    renameProperty(id, name, options = {}) {
        const property = this.#properties.get(id);
        if (!property) return false;

        const wanted = globalThis.String(name ?? '').trim();
        if (wanted === '' || wanted === property.name) return false;
        // A name already taken would collapse two properties into one on the next save.
        if (this.propertyNamed(wanted)) return false;

        return this.setPropertyField(id, 'name', wanted, options).applied;
    }

    /**
     * Change a property's type, and bring its default with it.
     *
     * ONE BATCH, TWO WRITES. A `number` default of 120 is not a legal `boolean`, so leaving
     * it behind would put a value in the schema that `defineComponent()` would hand to every
     * new instance. The default is reset to the new type's own — and one `Ctrl Z` takes both
     * writes back, because they are one intent (ADR-0024 §4).
     *
     * @param {string} id - The property's identifier
     * @param {string} type - One of PropertyType
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups this into a larger history entry
     * @returns {boolean} True when the type changed
     */
    setPropertyType(id, type, { actor, batch } = {}) {
        const property = this.#properties.get(id);
        if (!property) return false;
        if (!isPropertyType(type)) {
            throw new TypeError(`ComponentDefinition.setPropertyType: unknown property type "${type}"`);
        }
        if (property.type === type) return false;

        const group = batch ?? createId();
        const changed = this.setPropertyField(id, 'type', type, { actor, batch: group }).applied;
        this.setPropertyField(id, 'default', defaultForProperty({ type }), { actor, batch: group });
        return changed;
    }

    /**
     * Move a property to another rank in the schema.
     *
     * NO `MOVE_PROPERTY` OPERATION, AND THAT IS THE DECISION. `REMOVE_PROPERTY` already
     * carries the descriptor and the rank it held, and `ADD_PROPERTY` already places one at
     * a rank — so a move is the two of them under one `batch`, which is one history entry
     * (ADR-0024 §4) and one thing to replicate. A third operation would need its own
     * inverse, its own handler and its own tests to say what those two already say.
     *
     * THE IDENTITY SURVIVES, which is what a graph depends on: the descriptor is re-added
     * with the same `id`, so every node that reads this property is still wired to it
     * (ADR-0027). What does not survive is the reactive record itself — the panel redraws
     * on a structural operation, which is exactly what this pair is.
     *
     * @param {string} id - The property's identifier
     * @param {number} index - The rank it should hold
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups this into a larger history entry
     * @returns {boolean} True when the property moved
     */
    moveProperty(id, index, { actor, batch } = {}) {
        const property = this.#properties.get(id);
        if (!property) return false;

        const from = this.indexOf(id);
        const to = Math.max(0, Math.min(this.#properties.size - 1, Math.trunc(index)));
        if (!globalThis.Number.isFinite(to) || from === to) return false;

        const descriptor = snapshot(property);
        const group = batch ?? createId();

        const removed = this.#operations.submit(removePropertyOperation({
            property: descriptor,
            index: from,
            origin: Origin.EDITOR,
            actor,
            batch: group
        }));
        if (!removed.applied) return false;

        return this.#operations.submit(addPropertyOperation({
            property: descriptor,
            index: to,
            origin: Origin.EDITOR,
            actor,
            batch: group
        })).applied;
    }

    /**
     * Change a property's default value.
     * @param {string} id - The property's identifier
     * @param {any} value - The new default
     * @param {object} [options] - Options, as setPropertyField() takes them
     * @returns {boolean} True when the default changed
     */
    setPropertyDefault(id, value, options = {}) {
        return this.setPropertyField(id, 'default', value, options).applied;
    }

    /**
     * Change the Component's displayed name.
     * @param {string} label - The new name
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {boolean} True when the label changed
     */
    setLabel(label, { actor, batch } = {}) {
        if (this.#meta.label === label) return false;

        const result = this.#operations.submit(setPropertyOperation({
            target: { object: this.#type, component: null },
            prop: 'label',
            value: label,
            previous: this.#meta.label,
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied;
    }

    /**
     * A property name nothing else in this schema already uses.
     * @param {string} wanted - The name a creator asked for
     * @returns {string} A name that is free
     */
    uniquePropertyName(wanted) {
        const base = globalThis.String(wanted ?? '').trim() || 'property';
        if (!this.propertyNamed(base)) return base;

        let counter = 2;
        while (this.propertyNamed(`${base} ${counter}`)) counter++;
        return `${base} ${counter}`;
    }

    /**
     * Check the graph against this definition's own properties.
     *
     * Here rather than only in the window, because a headless build has to be able to ask —
     * and because the interpreter asks the same question with the same function.
     *
     * @returns {object[]} Findings, as validateGraph() produces them
     */
    validate() {
        return validateGraph(this.#graph.serialize(), {
            registry: this.#registry,
            properties: this.properties(),
            components: this.#components?.() ?? null
        });
    }

    /**
     * The `.px` payload, as it is persisted.
     *
     * Exactly what `defineComponent()` reads: a schema keyed by name, with the graph carried
     * inside rather than referenced (ADR-0016 as amended by ADR-0026). The property's `id`
     * travels inside its descriptor, where the Core ignores it and a node resolves it.
     *
     * @returns {object} A plain, JSON-safe definition
     */
    serialize() {
        const properties = {};
        for (const property of this.properties()) {
            const { name, ...descriptor } = snapshot(property);
            properties[name] = descriptor;
        }

        return {
            type: this.#type,
            label: this.#meta.label,
            properties,
            graph: this.#graph.serialize()
        };
    }

    /**
     * Rebuild the live model from a `.px` payload.
     * @param {object} payload - The definition
     * @param {object} [options] - Options, as the constructor takes them
     * @returns {ComponentDefinition} The model
     */
    static deserialize(payload, options = {}) {
        return new ComponentDefinition(payload ?? {}, options);
    }

    #registerHandlers() {
        this.#operations.register(OperationType.ADD_PROPERTY, operation => {
            if (this.#properties.has(operation.property.id)) return false;

            this.#declare(operation.property, operation.index ?? undefined);
            return true;
        }, { resolveTarget: false });

        this.#operations.register(OperationType.REMOVE_PROPERTY, operation => {
            const id = operation.target.object;
            if (!this.#properties.has(id)) return false;

            this.#properties.delete(id);
            return true;
        }, { resolveTarget: false });
    }

    /**
     * Put a descriptor in the schema without submitting anything.
     * @param {object} property - The descriptor, as plain data
     * @param {number} [index] - Rank in the schema
     * @returns {object} The reactive descriptor
     */
    #declare(property, index) {
        const record = makeReactive({ ...property });

        if (index === null || index === undefined || index >= this.#properties.size) {
            this.#properties.set(record.id, record);
            return record;
        }

        const entries = [...this.#properties];
        entries.splice(Math.max(0, index), 0, [record.id, record]);
        this.#properties.clear();
        for (const [id, entry] of entries) this.#properties.set(id, entry);
        return record;
    }
}

/** A descriptor as plain data, with no reactive wrapper riding along. */
function snapshot(property) {
    return globalThis.Object.freeze({ ...property });
}
