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
// PORTS ARE SHOWN, NOT EDITED. A creator wires ports on the canvas; the panel reports them
// so that "what does this node take, what does it give" is answerable without squinting at
// the graph — and so a dynamic port list (Set Property's value takes the property's shape)
// is legible.

import {
    COMPONENT_PROPERTY_REFERENCE,
    COMPONENT_REFERENCE,
    PROPERTY_REFERENCE,
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
        title: definition.label,
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

/**
 * Where each kind of reference finds the things a creator may pick.
 *
 * ONE TABLE, AND ADDING A KIND IS A ROW. The rule is `descriptor.reference` and never the
 * node's type, which is what kept this file free of `if (node.type === …)` when the second
 * and third kinds arrived (ADR-0034 §3.3).
 *
 * The third one reads a SIBLING param: which properties may be picked depends on which
 * Component type the node names, so it is resolved through the model's own resolver rather
 * than by reaching into `node.params` here.
 */
const OPTIONS = {
    [PROPERTY_REFERENCE]: (node, context) =>
        (context.properties ?? []).map(property => ({ value: property.id, label: property.name })),
    [COMPONENT_REFERENCE]: (node, context) =>
        (context.components ?? []).map(entry => ({ value: entry.type, label: entry.label ?? entry.type })),
    [COMPONENT_PROPERTY_REFERENCE]: (node, context) =>
        (referencedComponent(node, context)?.properties ?? [])
            .map(property => ({ value: property.id, label: property.name }))
};

/**
 * A param that names something, as a choice whose values are identities.
 *
 * The values are IDENTITIES and the labels are names — which is what lets a creator pick
 * `speed` while the graph stores something a rename cannot invalidate. A choice with
 * nothing in it stays read-only rather than becoming an empty dropdown (ADR-0031 §2).
 *
 * @returns {object|null} The descriptor, or null when this param names nothing
 */
function referenceChoice(name, descriptor, node, context) {
    const options = OPTIONS[descriptor?.reference]?.(node, context);
    if (!options) return null;

    return fieldFor(name, {
        ...descriptor,
        type: PropertyType.ENUM,
        values: options.map(option => option.value),
        labels: options.map(option => option.label)
    });
}
