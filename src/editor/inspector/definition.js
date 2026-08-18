// What the Inspector shows for a `.px` being edited — its user-declared properties
// (ADR-0027, ADR-0007's shape).
//
// THE SAME ANSWER SHAPE AS describeComponent() AND describeResource(). Those two answer
// "what fields, of what kind, shown how" for a component instance and for a manifest entry;
// this answers it for a Component being DECLARED. One row primitive, one field element, and
// no third idea of what a row is (ADR-0025).
//
// THE DIFFERENCE IS THE SUBJECT, AND IT IS THE WHOLE DIFFERENCE. Inspecting a Transform
// edits a value; inspecting a `.px` edits the SCHEMA — the name of a property, its shape,
// what a fresh instance starts it at. So each declared property yields three fields rather
// than one, and each is bound to the reactive descriptor the definition holds, so a change
// travels the pipeline and lands in that resource's undo stack like everything else.
//
// NO SECOND TYPE SYSTEM. The list a creator picks from is `propertyTypes()` — the Core's
// own eight (ADR-0023) — and the control the default value is edited with is derived from
// the chosen type by exactly the mapping every other field goes through. Adding a type is
// still one line in the Core and one in `FieldKind`, and nothing here changes.

import { PropertyType, propertyTypes } from '../../core/mod.js';
import { iconForPropertyType } from '../ui/icons.js';
import { FieldKind, fieldFor } from './schema.js';

/**
 * How each Core property type is named for a creator, since a raw enum value is not a word.
 *
 * AMERICAN SPELLING, because that is what the API uses. `PropertyType.COLOR` is the
 * identifier a creator will meet in a `.px` payload, in a schema and eventually in a
 * script; showing them `Colour` in the one place they choose it teaches a word the rest of
 * the product does not answer to.
 */
export const PROPERTY_TYPE_LABELS = {
    [PropertyType.NUMBER]: 'Number',
    [PropertyType.INT]: 'Integer',
    [PropertyType.BOOLEAN]: 'Boolean',
    [PropertyType.STRING]: 'Text',
    [PropertyType.COLOR]: 'Color',
    [PropertyType.ENUM]: 'Choice',
    [PropertyType.RESOURCE]: 'Resource',
    [PropertyType.ARRAY]: 'List'
};

/**
 * The types a creator may declare a property AS.
 *
 * NOT THE SAME LIST AS THE CORE'S, AND DELIBERATELY. `int` stays a real Core type: the
 * Object's own `layer` is one, `typesCompatible()` pairs it with `number` so a graph can
 * add 1 to a counter (ADR-0027), and a component shipped in JavaScript may declare one.
 * What it is not is a CHOICE worth offering: `Number` and `Integer` differ by a promise
 * about decimals that a creator declaring `speed` has no way to act on, and the picker
 * asking them to make that call is the picker inventing a decision.
 *
 * Removing it from the Core instead would have been the destructive version of this: a
 * stored `int` would stop validating, `layer` would lose its stepper, and the graph's
 * numeric compatibility rule would lose the pair it is written about. This is a UI list,
 * and it says so.
 *
 * @returns {string[]} The types the Type dropdown offers, in the order it offers them
 */
export function authorableTypes() {
    return propertyTypes().filter(type => type !== PropertyType.INT);
}

/**
 * Describe a `.px` for the Inspector.
 *
 * Pure, like its two counterparts: a live definition goes in, descriptors come out, and no
 * DOM is touched — which is what makes the hard part of this panel testable under Node.
 *
 * @param {object} definition - The live ComponentDefinition
 * @returns {{title: string, type: string, properties: object[]}|null} What to show
 */
export function describeDefinition(definition) {
    if (!definition) return null;

    return {
        title: definition.label || 'Component',
        type: definition.type,
        properties: definition.properties().map(property => describeProperty(property))
    };
}

/**
 * The three fields one declared property is edited through.
 *
 * @param {object} property - The reactive descriptor the definition holds
 * @returns {{id: string, name: string, fields: object[]}} Its row
 */
export function describeProperty(property) {
    return {
        id: property.id,
        name: property.name,
        fields: [
            fieldFor('name', {
                type: PropertyType.STRING,
                label: 'Name',
                tooltip: 'What a creator reads. Nodes reference this property by identity, so renaming it breaks nothing'
            }),
            fieldFor('type', {
                type: PropertyType.ENUM,
                label: 'Type',
                values: authorableTypes(),
                labels: authorableTypes().map(type => PROPERTY_TYPE_LABELS[type] ?? type),
                // The Type dropdown is the control a creator meets first, on every property
                // they declare, so it shows the shape rather than only naming it — and the
                // same glyph appears on the property's badge and beside a node's ports.
                icons: authorableTypes().map(type => iconForPropertyType(type)),
                tooltip: 'The shape of the value. Changing it resets the default'
            }),
            defaultField(property)
        ]
    };
}

/**
 * The control a property's DEFAULT value is edited with.
 *
 * Derived from the declared type by the ordinary mapping, so a `colour` default gets a
 * swatch and a `number` default gets a stepper — the Inspector a creator will meet when
 * they attach the Component, shown while they are declaring it.
 *
 * `resource` is a real control here too, for the same reason it is one everywhere else:
 * a reference is picked or dropped, never typed. `array` is still read-only, because what
 * it lacks is a list control (ADR-0023) — and a text box for it would be an invitation to
 * corrupt a value nobody can see.
 *
 * @param {object} property - The reactive descriptor
 * @returns {object} A field descriptor for `default`
 */
export function defaultField(property) {
    const descriptor = fieldFor('default', {
        ...property,
        label: 'Default',
        tooltip: 'What a fresh instance of this Component starts at'
    });

    // WHATEVER FALLS BACK TO READ-ONLY IS ALSO DISABLED. `fieldKindFor()` answers with a
    // control, not with a permission, so a `resource`, a list, or a choice with nothing
    // declared to choose from arrives here as READONLY with the flag still unset — and a
    // field that renders as text but reports itself editable is the kind of half-state this
    // panel keeps refusing to ship.
    if (descriptor.kind === FieldKind.READONLY) return { ...descriptor, readonly: true };

    return descriptor;
}
