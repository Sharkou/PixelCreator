// What a node IS — the catalogue every layer reads (ADR-0027).
//
// ONE TABLE, NOT TWO. A node type answers two questions that look like they belong to
// different layers: "what ports does it have" (the Editor draws them, the validator checks
// them) and "what does it do" (the interpreter runs it). Splitting them would put the
// shape here and the behaviour in `runtime/`, which is two tables to keep in step — the
// exact failure mode every ADR in this repository is written against. So a definition
// carries both, and it stays in the Core because both are pure: a node's `evaluate` reads
// its inputs and writes through the Property System, and nothing else.
//
// WHAT STAYS IN THE RUNTIME. Control flow, per-instance execution state, the loop budget
// and error reporting belong to `runtime/scripting/interpreter.js` (ADR-0009, ADR-0015).
// This file says what a node is; the interpreter says when and in what order nodes run.
// A definition never reaches for a clock, a random source, the DOM or storage — which is
// what lets the same graph produce the same result on a client and on a server.
//
// PORTS ARE ADDRESSED BY IDENTITY, NEVER BY INDEX. A connection names `{ node, port }`
// with the port's own id, so inserting a port into a node type does not silently rewire
// every graph that used it — the failure Legacy's `outputs[i + 1]` arithmetic guaranteed.
//
// PORTS MAY DEPEND ON THE NODE. `Set Property` accepts whatever the referenced property
// holds, so `inputs` may be a function of the node and of the context it lives in. That is
// why nothing may cache a port list across a param change.

import { PropertyType } from '../properties/types.js';

/** What travels along a connection. */
export const PortKind = {
    /** Execution order. A flow output reaches at most one flow input. */
    FLOW: 'flow',
    /** A value. A data input is fed by at most one data output; an output may feed many. */
    DATA: 'data'
};

/** Which side of a node a port sits on. */
export const PortDirection = {
    INPUT: 'in',
    OUTPUT: 'out'
};

/**
 * The data type that accepts, and is accepted by, every other.
 *
 * Deliberately not a `PropertyType`: it is not a shape a value can have, it is the absence
 * of a constraint — the same distinction ADR-0023 draws for `range` and `readonly`.
 */
export const ANY_TYPE = 'any';

/**
 * A live Object of the running scene (ADR-0034 §3.2).
 *
 * Deliberately not a `PropertyType`, and for the opposite reason to `ANY_TYPE`: this is a
 * shape a value can have, but not one a value can be SAVED as. What travels a wire of this
 * type is the reactive Proxy the Scene holds — a handle — and a handle is never serialized,
 * never written into a node, and never turned back into an identifier by the graph. A
 * reference that persists is a Component property, which is a different question and a
 * different type.
 *
 * It is compatible with itself and with `ANY_TYPE`, and with nothing else. That falls out of
 * `typesCompatible()` as it already stands — a string cannot be read as an object because
 * the two names differ and neither is numeric — so no rule is added for it.
 */
export const OBJECT_TYPE = 'object';

/** Groups the node menu shows, in the order it shows them. */
export const NODE_CATEGORIES = ['Events', 'Properties', 'Scene', 'Flow', 'Values', 'Math', 'Compare', 'Logic', 'Debug'];

/**
 * A node type, as data.
 *
 * @typedef {object} NodeDefinition
 * @property {string} type - Stable identity, written into every graph that uses it
 * @property {string} label - What a creator reads
 * @property {string} [category] - Menu group; `Other` when absent
 * @property {string[]} [keywords] - What else a creator might type when looking for it
 * @property {string} [icon] - Glyph name, honoured by the Editor over its category's
 * @property {Array|Function} [inputs] - Input ports, or (node, context) => ports
 * @property {Array|Function} [outputs] - Output ports, or (node, context) => ports
 * @property {object} [params] - Param descriptors, in the ADR-0007 property shape
 * @property {Function} [evaluate] - (io) => { [outputPortId]: value }; data outputs
 * @property {Function} [execute] - (io) => next flow port id, or null; flow nodes only
 */

/**
 * A port.
 *
 * @typedef {object} Port
 * @property {string} id - Stable within its node type and direction
 * @property {string} kind - One of PortKind
 * @property {string} [type] - One of PropertyType, or ANY_TYPE; data ports only
 * @property {string} [label] - What a creator reads; the id humanised when absent
 * @property {any} [default] - What an unconnected data input yields
 * @property {string} [placeholder] - What an EMPTY control reads, when empty means something
 *   a creator has to know. Presentation, like `label`: the interpreter never sees it, and a
 *   port that leaves it out simply shows an empty box.
 */

export class NodeRegistry {

    #types = new Map();

    /**
     * Declare a node type.
     *
     * Refuses a second, different definition of the same type for the reason
     * `ComponentRegistry` does: two unrelated things claiming one name is the bug a
     * registry exists to catch. Re-registering the same catalogue is not that, so
     * `replace` says so out loud.
     *
     * @param {NodeDefinition} definition - The node type
     * @param {object} [options] - Options
     * @param {boolean} [options.replace] - Allow an existing type to be redefined
     * @returns {NodeDefinition} The definition, as registered
     */
    register(definition, { replace = false } = {}) {
        const type = definition?.type;
        if (typeof type !== 'string' || type === '') {
            throw new TypeError('NodeRegistry.register: a node definition needs a type');
        }
        if (typeof definition.label !== 'string' || definition.label === '') {
            throw new TypeError(`NodeRegistry.register: "${type}" needs a label`);
        }

        const existing = this.#types.get(type);
        if (existing && existing !== definition && !replace) {
            throw new Error(`NodeRegistry.register: "${type}" is already registered`);
        }

        this.#types.set(type, definition);
        return definition;
    }

    /**
     * Look a node type up.
     * @param {string} type - The node type
     * @returns {NodeDefinition|null} The definition, or null
     */
    get(type) {
        return this.#types.get(type) ?? null;
    }

    /**
     * Tell whether a node type is known.
     * @param {string} type - The node type
     * @returns {boolean} True when registered
     */
    has(type) {
        return this.#types.has(type);
    }

    /** Every registered definition, in registration order. */
    definitions() {
        return [...this.#types.values()];
    }

    /** Every registered type name, in registration order. */
    types() {
        return [...this.#types.keys()];
    }
}

/**
 * The registry the Editor and the interpreter read when no other is named.
 *
 * Empty on import, like `components` (core/component.js): a module with a registration
 * side effect cannot be imported without accepting it, and a headless test may want a
 * catalogue of its own. `registerStandardNodes()` fills it.
 */
export const nodes = new NodeRegistry();

/**
 * Build a port descriptor, filling in what a definition left out.
 *
 * @param {object} port - The declared port
 * @returns {Port} The port, complete
 */
export function createPort(port) {
    const kind = port.kind ?? PortKind.DATA;
    return globalThis.Object.freeze({
        id: port.id,
        kind,
        type: kind === PortKind.FLOW ? null : port.type ?? ANY_TYPE,
        label: port.label ?? humanisePort(port.id),
        default: port.default ?? null,
        placeholder: port.placeholder ?? null
    });
}

/**
 * The ports a node has right now.
 *
 * `context` is whatever a dynamic port list needs — for the property nodes, the component's
 * declared properties. It is passed rather than reached for, so this stays pure and the
 * Core keeps knowing nothing about where a definition is stored.
 *
 * @param {NodeDefinition|null} definition - The node type
 * @param {object} node - The node instance
 * @param {object} [context] - What dynamic ports depend on
 * @returns {{inputs: Port[], outputs: Port[]}} Its ports
 */
export function portsOf(definition, node, context = {}) {
    if (!definition) return { inputs: [], outputs: [] };

    return {
        inputs: resolvePorts(definition.inputs, node, context),
        outputs: resolvePorts(definition.outputs, node, context)
    };
}

/**
 * One port of a node, by direction and id.
 *
 * @param {NodeDefinition|null} definition - The node type
 * @param {object} node - The node instance
 * @param {string} direction - One of PortDirection
 * @param {string} portId - The port's id
 * @param {object} [context] - What dynamic ports depend on
 * @returns {Port|null} The port, or null when the node has no such port
 */
export function portOf(definition, node, direction, portId, context = {}) {
    const ports = portsOf(definition, node, context);
    const side = direction === PortDirection.INPUT ? ports.inputs : ports.outputs;
    return side.find(port => port.id === portId) ?? null;
}

/**
 * Tell whether a value of one data type may travel into a port of another.
 *
 * `int` and `number` are compatible in both directions on purpose: they are the same
 * shape with a different promise about decimals, and refusing the pair would make a
 * creator insert a conversion node to add 1 to a counter. Everything else must match.
 *
 * @param {string} source - The output port's type
 * @param {string} target - The input port's type
 * @returns {boolean} True when the connection carries a usable value
 */
export function typesCompatible(source, target) {
    if (source === ANY_TYPE || target === ANY_TYPE) return true;
    if (source === target) return true;

    const numeric = new Set([PropertyType.NUMBER, PropertyType.INT]);
    return numeric.has(source) && numeric.has(target);
}

/**
 * The port type a declared property is read and written through.
 *
 * ONE TRANSLATION, IN ONE PLACE (ADR-0034 §3.5). A property's declared type is very nearly
 * the type of the port that carries it — except for `objectref`, which is an identity when
 * it is stored and a HANDLE when it travels. A port typed `objectref` would be a fourth
 * name for the same idea and, worse, would not be compatible with the `object` a `Self`
 * node produces: `typesCompatible()` compares names, so the two would refuse to be wired.
 *
 * So no port is ever typed `objectref`, and `typesCompatible()` needs no rule about it.
 * Every node that builds a port out of a property calls this, rather than repeating an
 * expression that would drift the day a fifth caller appears.
 *
 * @param {object|null} property - The declared property descriptor, or null
 * @returns {string} The port type; ANY_TYPE when nothing is declared
 */
export function portTypeOf(property) {
    if (property?.type === PropertyType.OBJECTREF) return OBJECT_TYPE;
    return property?.type ?? ANY_TYPE;
}

/**
 * Group node types for a menu, in category order.
 *
 * The same shape `groupTypes()` produces for components (editor/registry.js), so the node
 * menu and the Add Component menu are the same dropdown fed the same way.
 *
 * @param {NodeRegistry} [registry] - The catalogue to read
 * @returns {Array<{category: string, entries: NodeDefinition[]}>} Non-empty groups, in order
 */
export function groupNodes(registry = nodes) {
    const all = registry.definitions();
    const order = [...NODE_CATEGORIES];

    for (const definition of all) {
        const category = definition.category ?? 'Other';
        if (!order.includes(category)) order.push(category);
    }
    if (!order.includes('Other')) order.push('Other');

    return order
        .map(category => ({
            category,
            entries: all.filter(definition => (definition.category ?? 'Other') === category)
        }))
        .filter(group => group.entries.length > 0);
}

function resolvePorts(declared, node, context) {
    const list = typeof declared === 'function' ? declared(node, context) : declared;
    return (list ?? []).map(createPort);
}

function humanisePort(id) {
    return globalThis.String(id ?? '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, first => first.toUpperCase());
}

/**
 * The node types that could take a connection from one port.
 *
 * WHY IT LIVES IN THE CORE. "Which node types have a port this one may reach" is the same
 * question `typesCompatible()` answers for a single pair, asked of a whole catalogue — the
 * rule is the model's, and an Editor that reimplemented it would be a second opinion about
 * what may be wired to what. The picker that opens when a wire is let go over empty space
 * asks this (windows/graph.js).
 *
 * PORTS MAY DEPEND ON THE NODE, and here there is no node yet: a type is offered when ANY
 * of its statically declared ports would take the connection. A type whose ports are a
 * function of an instance — `Set Property` takes the shape of whatever it names — is
 * offered on the strength of its `ANY_TYPE` fallback, which is the honest answer before a
 * property has been chosen.
 *
 * @param {NodeRegistry} registry - The catalogue to search
 * @param {Port} port - The port the connection would start from
 * @param {string} direction - Which side that port is: one of PortDirection
 * @returns {Set<string>} The type names that could accept it
 */
export function compatibleTargets(registry, port, direction) {
    const found = new Set();
    if (!port) return found;

    // A wire from an output looks for inputs, and the other way round.
    const wanted = direction === PortDirection.OUTPUT ? 'inputs' : 'outputs';

    for (const definition of registry.definitions()) {
        const declared = definition[wanted === 'inputs' ? 'inputs' : 'outputs'];
        // A dynamic port list needs an instance to resolve; asked with a bare record it
        // answers with the shape it falls back to, which is what a creator would get.
        const ports = typeof declared === 'function'
            ? declared({ id: '', type: definition.type, params: {} }, {})
            : declared;

        for (const candidate of ports ?? []) {
            const kind = candidate.kind ?? PortKind.DATA;
            if (kind !== (port.kind ?? PortKind.DATA)) continue;
            if (kind === PortKind.FLOW) {
                found.add(definition.type);
                break;
            }

            const from = direction === PortDirection.OUTPUT ? port.type : candidate.type ?? ANY_TYPE;
            const to = direction === PortDirection.OUTPUT ? candidate.type ?? ANY_TYPE : port.type;
            if (typesCompatible(from ?? ANY_TYPE, to ?? ANY_TYPE)) {
                found.add(definition.type);
                break;
            }
        }
    }

    return found;
}
