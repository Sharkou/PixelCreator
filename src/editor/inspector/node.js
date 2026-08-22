// What the Inspector shows for a selected graph node (ADR-0027, ADR-0007's shape).
//
// A NODE TYPE DESCRIBES ITS OWN INSPECTOR. `windows/inspector.js` must not grow a chain of
// `if (node.type === 'property.get')`: what a node exposes is its `params`, declared in the
// catalogue in the very same shape a Component declares a property (ADR-0007), so the panel
// renders them with the rows and the field element it already has. Adding a node type is a
// row in `core/graph/standard.js` and nothing here.
//
// ONE EXCEPTION, AND IT IS DECLARED RATHER THAN BRANCHED ON. A param may say it REFERENCES
// something — today, one of the Component's own properties. The stored value is the
// property's identity, so a rename cannot break the graph (ADR-0027), and an identity in a
// dropdown is unreadable; so the descriptor is turned into a choice whose values are the
// identities and whose labels are the names. The rule is `descriptor.reference`, not the
// node's type, so a future "references a resource" param is the same two lines.
//
// A PORT IS WIRED, AND SOME PORTS ARE ALSO TYPED INTO. Wiring is the canvas's gesture and
// nothing here has an opinion about it; what this file answers is which input ports carry a
// CONTROL as well as a socket, because an unconnected `number` input is a value a creator
// states and an `object` input is not (`inputFields`, ADR-0031 §1, ADR-0034 §3.2). The
// answer lives beside `describeNode()` rather than in the canvas for the reason the rest of
// this file exists: a renderer that decided it would be a second opinion about what a node
// type declares, and it would drift the day a fourth kind of port arrives.

import {
    ANY_TYPE,
    COMPONENT_PROPERTY_REFERENCE,
    COMPONENT_REFERENCE,
    OBJECT_TYPE,
    PROPERTY_REFERENCE,
    PortKind,
    PropertyType,
    portsOf,
    referencedComponent
} from '../../core/mod.js';
import { fieldFor } from './schema.js';

/**
 * Describe a graph node for the Inspector.
 *
 * Pure: a node record, the catalogue and the properties it runs against go in, descriptors
 * come out, and no DOM is touched.
 *
 * @param {object} node - The node record
 * @param {object} [context] - What the panel could resolve
 * @param {object} [context.registry] - The NodeRegistry the type is resolved in
 * @param {object[]} [context.properties] - The Component's declared properties
 * @param {object[]} [context.components] - The project's Component types, for a node naming one
 * @param {object[]} [context.issues] - Findings from validateGraph(), for this node
 * @returns {object|null} What to show
 */
export function describeNode(node, { registry, properties = [], components = [], issues = [] } = {}) {
    if (!node) return null;

    const definition = registry?.get(node.type) ?? null;
    const mine = issues.filter(issue => issue.node === node.id);

    // A NODE WHOSE TYPE IS GONE STILL INSPECTS. It reports what it is and why it cannot be
    // read, rather than showing an empty panel — the same refusal-with-a-reason the drag
    // rules live by (ADR-0026 §6).
    if (!definition) {
        return {
            title: node.type,
            type: node.type,
            category: 'Unknown',
            known: false,
            fields: [],
            ports: { inputs: [], outputs: [] },
            issues: mine,
            tooltip: 'This build has no node type by this name.'
        };
    }

    const context = { properties, components };

    return {
        // WHAT A CONFIGURED NODE READS AS. The type's label says what a node IS; once it
        // names something, what it DOES is more useful — and the node type is the only thing
        // that knows how to say it, so it declares it rather than being branched on here
        // (ADR-0037). Absent or unresolved, the label stands.
        title: definition.title?.(node, context) || definition.label,
        type: node.type,
        category: definition.category ?? 'Other',
        known: true,
        fields: paramFields(definition, node, context),
        ports: portsOf(definition, node, context),
        issues: mine,
        tooltip: definition.tooltip ?? null
    };
}

/**
 * The fields a node's params are edited through.
 *
 * @param {object} definition - The node type
 * @param {object} [node] - The node, for a reference that depends on a sibling param
 * @param {object} [context] - `{ properties, components }`
 * @returns {object[]} Field descriptors, in declaration order
 */
export function paramFields(definition, node = null, context = {}) {
    const fields = [];

    for (const [name, descriptor] of globalThis.Object.entries(definition.params ?? {})) {
        fields.push(referenceChoice(name, descriptor, node, context) ?? fieldFor(name, descriptor));
    }

    return fields;
}

/** What an unset reference reads, when there is something to choose and nothing chosen. */
export const NOTHING_SELECTED = 'None';

/**
 * Where each kind of reference finds the things a creator may pick, and what to say when
 * there are none.
 *
 * ONE TABLE, AND ADDING A KIND IS A ROW. The rule is `descriptor.reference` and never the
 * node's type, which is what kept this file free of `if (node.type === …)` when the second
 * and third kinds arrived (ADR-0034 §3.3).
 *
 * The third one reads a SIBLING param: which properties may be picked depends on which
 * Component type the node names, so it is resolved through the model's own resolver rather
 * than by reaching into `node.params` here. That dependency is DECLARED (`dependsOn`) rather
 * than known by whoever writes the param, because two things need it: the hint an empty
 * picker shows, and the sibling `paramWrites()` drops when a choice stops existing.
 *
 * `empty` IS NOT DECORATION. A dropdown with nothing in it renders read-only, so a creator
 * who has not yet picked a Component met a blank strip where the property picker will be —
 * a control that says neither what it is for nor what to do first (ADR-0031 §2). It is a
 * function because the third kind has TWO empties a creator has to tell apart: nothing has
 * been named yet, and what was named declares nothing.
 */
const REFERENCES = {
    [PROPERTY_REFERENCE]: {
        options: (node, context) =>
            (context.properties ?? []).map(property => ({ value: property.id, label: property.name })),
        empty: () => 'This Component declares no properties'
    },
    [COMPONENT_REFERENCE]: {
        options: (node, context) =>
            (context.components ?? []).map(entry => ({ value: entry.type, label: entry.label ?? entry.type })),
        empty: () => 'No Component types'
    },
    [COMPONENT_PROPERTY_REFERENCE]: {
        options: (node, context) =>
            (referencedComponent(node, context)?.properties ?? [])
                .map(property => ({ value: property.id, label: property.name })),
        empty: (node, context) => (referencedComponent(node, context)
            ? 'This Component declares no properties'
            : 'Choose a Component first'),
        /** Resolved against whatever the param carrying THIS reference names. */
        dependsOn: COMPONENT_REFERENCE
    }
};

/**
 * The writes one param change amounts to.
 *
 * A REFERENCE THAT DEPENDS ON ANOTHER CANNOT SURVIVE IT CHANGING. `Get Property On` names a
 * Component type and a property OF that type; picking a different Component leaves the
 * property naming something the new type does not declare — a combination the validator
 * reports as an error and the picker can only show as an opaque identifier, produced by a
 * gesture the creator had every reason to think was safe.
 *
 * SO IT IS DROPPED, AND ONLY THEN. This is not the Editor rewriting a reference behind a
 * creator's back: nothing here reacts to a property being DELETED elsewhere — that stays a
 * dangling reference, reported rather than repaired (ADR-0027). What is repaired is the
 * sibling of a choice the creator has just made, in the same batch, so one `Ctrl Z` puts
 * both back. A property that still exists under the new Component is kept.
 *
 * @param {object|null} definition - The node type
 * @param {object} node - The node record, as it is before the change
 * @param {string} name - The param being written
 * @param {any} value - What it is being written to
 * @param {object} [context] - `{ properties, components }`
 * @returns {Array<{name: string, value: any}>} The writes, the asked-for one first
 */
export function paramWrites(definition, node, name, value, context = {}) {
    const writes = [{ name, value }];

    const changed = definition?.params?.[name]?.reference ?? null;
    if (!changed) return writes;

    // NOTHING TO CHECK AGAINST IS NOT THE SAME AS NOTHING THERE — the rule `validateGraph()`
    // already lives by. A headless caller, or an Editor opened before any Component type was
    // installed, offers an empty catalogue; dropping a sibling on the strength of that would
    // be destroying a reference because the question could not be asked.
    if (REFERENCES[changed]?.options(node, context).length === 0) return writes;

    const next = { ...node, params: { ...node?.params, [name]: value } };

    for (const [other, descriptor] of globalThis.Object.entries(definition.params ?? {})) {
        if (other === name) continue;

        const reference = REFERENCES[descriptor?.reference];
        if (reference?.dependsOn !== changed) continue;

        const held = node?.params?.[other] ?? null;
        if (held === null) continue;
        if (reference.options(next, context).some(option => option.value === held)) continue;

        writes.push({ name: other, value: null });
    }

    return writes;
}

/**
 * The input ports a creator can type a value into, as field descriptors.
 *
 * WHICH PORTS, AND WHY NOT ALL OF THEM. A FLOW port carries execution, not a value — there
 * is nothing to type. An `any` port has no shape, so there is no control to draw. An OBJECT
 * port carries a live handle, which is not a value a creator types: a control there would be
 * a box that can never be filled in, and the Runtime ignores whatever a node holds for such
 * a port anyway (ADR-0034 §3.2, §3.6) — so the box would also be a lie. Everything else gets
 * one, whether or not something is wired to it (ADR-0031 §1).
 *
 * The descriptor is built by the same `fieldFor()` every other value in the Editor goes
 * through, so the control, the parsing and the bounds are not decided here.
 *
 * @param {{inputs: object[]}} ports - The node's ports right now
 * @returns {object[]} Field descriptors, each carrying the id of the port it edits
 */
export function inputFields(ports) {
    const fields = [];

    for (const port of ports?.inputs ?? []) {
        if (port.kind === PortKind.FLOW) continue;
        if (!port.type || port.type === ANY_TYPE || port.type === OBJECT_TYPE) continue;

        fields.push({
            ...fieldFor(port.id, {
                type: port.type,
                label: port.label,
                default: port.default,
                placeholder: port.placeholder
            }),
            // Marked so the canvas writes through `setInput` rather than `setParam`, and so
            // the row model knows which port this belongs beside: two namespaces, two
            // writers (ADR-0031 §1).
            port: port.id
        });
    }

    return fields;
}

/**
 * A param that names something, as a choice whose values are identities.
 *
 * The values are IDENTITIES and the labels are names — which is what lets a creator pick
 * `speed` while the graph stores something a rename cannot invalidate. A choice with
 * nothing in it stays read-only rather than becoming an empty dropdown (ADR-0031 §2), and
 * says which of the two empties it is.
 *
 * @returns {object|null} The descriptor, or null when this param names nothing
 */
function referenceChoice(name, descriptor, node, context) {
    const reference = REFERENCES[descriptor?.reference];
    if (!reference) return null;

    const options = reference.options(node, context);

    return fieldFor(name, {
        ...descriptor,
        type: PropertyType.ENUM,
        values: options.map(option => option.value),
        labels: options.map(option => option.label),
        placeholder: options.length === 0 ? reference.empty(node, context) : NOTHING_SELECTED
    });
}
