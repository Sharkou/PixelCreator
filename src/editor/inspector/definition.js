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

import { PropertyType, elementOf, propertyTypes } from '../../core/mod.js';
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
    // What a creator declaring one is actually pointing at. `objectref` is the shape the
    // Core stores; `Object` is the thing (ADR-0034 §3.5).
    [PropertyType.OBJECTREF]: 'Object',
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
 * The types a creator may declare the ELEMENTS of a List as.
 *
 * THE SAME LIST, ONE SHORT, AND THE MISSING ONE IS THE DECISION. ADR-0031 §3 admits every
 * `PropertyType` as an element except `array`: a list of lists is a structure, and a
 * structure is the question ADR-0023 leaves open rather than the one a list answers. The
 * Core refuses the declaration in `elementOf()`; this is the same refusal made where a
 * creator would otherwise be offered it, so the menu never contains a choice that would be
 * ignored.
 *
 * @returns {string[]} The types the element dropdown offers, in the order it offers them
 */
export function elementTypes() {
    return authorableTypes().filter(type => type !== PropertyType.ARRAY);
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
            ...configurationFields(property),
            defaultField(property)
        ]
    };
}

/**
 * The rows a type needs BEFORE its default means anything.
 *
 * TWO TYPES TAKE A PARAMETER, AND UNTIL IT IS DECLARED THEY HAVE NO CONTROL. A Choice with
 * no options is read-only and a List with no element type is read-only — both correctly, and
 * both were dead ends: the Type dropdown offered `Choice` and `List`, and nothing anywhere
 * let a creator say what a Choice may hold or what a List is a list OF. ADR-0031 §2 and §3
 * put both in the descriptor, beside the default, so declaring one is an ordinary
 * SET_PROPERTY on the same reactive record every other field writes to.
 *
 * A ROW PER PARAMETER, AND ONLY WHEN THE TYPE HAS ONE. A `number` gains nothing here; a
 * Choice gains its options, a List the shape of its elements. That is what keeps the card
 * three rows for the types that need three.
 *
 * @param {object} property - The reactive descriptor
 * @returns {object[]} Field descriptors, or nothing for a type that takes no parameter
 */
export function configurationFields(property) {
    if (property?.type === PropertyType.ENUM) {
        // THE OPTIONS ARE A LIST OF TEXT, AND THAT IS THE WHOLE CONTROL. ADR-0031 §2: an
        // option IS its value, has no identity of its own, and is a string in the payload —
        // so `<px-list>` over `string` elements is exactly the shape of the data, and adding,
        // removing and reordering are the three gestures it already has.
        return [fieldFor('values', {
            type: PropertyType.ARRAY,
            element: { type: PropertyType.STRING },
            label: 'Options',
            tooltip: 'What this Choice may hold. An option is its own value, so renaming one changes the value'
        })];
    }

    if (property?.type === PropertyType.ARRAY) {
        return [fieldFor('of', {
            type: PropertyType.ENUM,
            label: 'Of',
            values: elementTypes(),
            labels: elementTypes().map(type => PROPERTY_TYPE_LABELS[type] ?? type),
            icons: elementTypes().map(type => iconForPropertyType(type)),
            // A LIST THAT SAYS NOTHING IS A LIST OF ANYTHING, and read-only. The empty
            // dropdown has to say which of the two empties it is (ADR-0031 §2's rule, applied
            // to the other parameter): nothing chosen yet, not nothing to choose.
            placeholder: 'Anything — not editable',
            tooltip: 'What one element of this List is. Changing it empties the default'
        })];
    }

    return [];
}

/**
 * The control a property's DEFAULT value is edited with.
 *
 * Derived from the declared type by the ordinary mapping, so a `colour` default gets a
 * swatch and a `number` default gets a stepper — the Inspector a creator will meet when
 * they attach the Component, shown while they are declaring it.
 *
 * `resource` is a real control here too, for the same reason it is one everywhere else:
 * a reference is picked or dropped, never typed. `array` is one as well now that a list can
 * say what it holds: the Of row above declares the element type, and the default becomes the
 * same `<px-list>` a creator will meet on every instance. A list that still declares nothing
 * keeps the read-only row it had — not for want of a control, but because there is nothing
 * to draw one from.
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

    // AN OBJECT REFERENCE HAS NO DEFAULT TO AUTHOR, AND THIS IS WHERE THE SCOPES MEET.
    // A `.px` is of PROJECT scope; an ObjectId belongs to ONE scene (ADR-0034 §3.5). The
    // ordinary mapping gives `objectref` the Object picker — right on a Component attached
    // to an Object, and wrong here, where it would list the scene that happens to be open
    // and write that scene's identity into a file several scenes may use. §3.5 shows the
    // declaration with `"default": null` for exactly this reason, and `defaultForProperty()`
    // answers null whatever is stored, so nothing is lost by refusing to author it: the
    // reference is set on each Object the Component is attached to.
    //
    // A LIST OF THEM IS THE SAME LEAK, ONE LEVEL DOWN, and it is the one this section had to
    // learn: `List<Object>` is a perfectly good property on an instance — the Inspector edits
    // it against the open scene — but its DEFAULT lives in the `.px`, and a default holding
    // three ObjectIds is three scene identities written into a file of project scope. The
    // element type is part of the list's type (ADR-0031 §3), so the rule is read off it
    // rather than restated.
    if (property?.type === PropertyType.OBJECTREF || elementOf(property)?.type === PropertyType.OBJECTREF) {
        return {
            ...descriptor,
            kind: FieldKind.READONLY,
            readonly: true,
            placeholder: 'Set on each Object',
            tooltip: 'An Object reference belongs to a scene, so it starts empty on every Object this Component is attached to'
        };
    }

    // WHATEVER FALLS BACK TO READ-ONLY IS ALSO DISABLED. `fieldKindFor()` answers with a
    // control, not with a permission, so a `resource`, a list, or a choice with nothing
    // declared to choose from arrives here as READONLY with the flag still unset — and a
    // field that renders as text but reports itself editable is the kind of half-state this
    // panel keeps refusing to ship.
    if (descriptor.kind === FieldKind.READONLY) return { ...descriptor, readonly: true };

    return descriptor;
}
