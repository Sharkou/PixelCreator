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
    COMPONENT_REFERENCE,
    KEY_REFERENCE,
    OBJECT_SOCKET_REFERENCE,
    OBJECT_TYPE,
    PROPERTY_REFERENCE,
    PortKind,
    PropertyType,
    baseTypeOf,
    portsOf,
    referencedComponent
} from '../../core/mod.js';
import { keyOptions } from '../keys.js';
import { fieldFor, humanize } from './schema.js';

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
        // THE TYPE'S LABEL, AND NOTHING ELSE. A node used to be able to rename itself once
        // it named something — `Get Ground`, `Set Sprite.height`, `Middle Button` — which
        // read well in the one graph it was written in and nowhere else: the same node type
        // had a different name in every project, so no tutorial, no menu entry and no search
        // could say what to look for. A name says what a node IS; what it has been pointed
        // at is drawn inside it, where a creator can also change it (ADR-0039 §5).
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
        // A PARAM THE CREATOR NEVER MEETS IS NOT DRAWN. `hidden` is ADR-0007's word for it,
        // and a Component named by the property picker is exactly that: stored, because the
        // Core needs it, and never asked, because asking it was the abstraction leaking
        // (ADR-0040 §2). The Inspector's own schema pass has honoured it all along.
        if (descriptor?.hidden) continue;

        const field = referenceChoice(name, descriptor, node, context) ?? fieldFor(name, descriptor);

        // A PARAM MAY ASK TO BE DRAWN ON A PORT'S ROW. The Object picker and the Object
        // socket are two ways to say one thing, so they share a line rather than asking the
        // same question twice — and `param` is what tells the canvas that this control still
        // writes a param, not the port's value (windows/graph.js).
        fields.push(descriptor.port ? { ...field, port: descriptor.port, param: true } : field);
    }

    return fields;
}

/** What an unset reference reads, when there is something to choose and nothing chosen. */
export const NOTHING_SELECTED = 'None';

/**
 * What a target picker reads when nothing has been chosen.
 *
 * `None` WAS A LIE, AND IT WAS THE COMMONEST STATE ON THE CANVAS. A property node with no
 * Object named and nothing wired acts on the Object its Component is attached to — the
 * default a beginner writes without knowing they wrote it (ADR-0040 §3). Reading `None`
 * there said the node had nothing to work on, which is the opposite of the truth.
 *
 * IT IS SHOWN RATHER THAN IMPLIED, so nothing hides behind the empty state: the picker says
 * `Self`, and choosing an Object replaces it. A creator never has to know a convention to
 * read what a node does.
 */
export const SELF_TARGET = 'Self';

/** What a property picker with nothing chosen reads as, standing in for its own label. */
export const CHOOSE_PROPERTY = 'Choose a property';

/** The group a `.px`'s own declared properties sit under. */
export const THIS_COMPONENT = 'This Component';

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
    // WHICH PROPERTY, AS ONE QUESTION. A creator wants "the Player's rotation"; they met two
    // dropdowns and had to know that rotation belongs to a Component before they could reach
    // it. `Component` is an abstraction of the engine, and standing between a creator and
    // their intention is not what it is for (ADR-0040 §2).
    //
    // ONE GROUPED LIST, and the groups ARE the Components — so the idea is still visible,
    // as structure rather than as a question. `Transform ▸ Rotation` is read in one glance,
    // and the dropdown has grouped and filtered since Add Component (ADR-0026 §10).
    //
    // THE VALUE CARRIES BOTH IDENTITIES, joined; `paramWrites()` splits them back into the
    // two params the Core stores, so nothing on disk changes.
    //
    // THERE IS NO SECOND ROW FOR A COMPONENT. There was one, offering the project's types
    // for a param of its own; the param is still stored and is no longer asked, so a table
    // row answering a question nobody puts is a row that would only drift.
    // WHICH COMPONENT, AS A QUESTION ALREADY ANSWERED (ADR-0045 §1). It leads the pair and
    // it is never empty: `This Component` is the first row and what an unset param means,
    // so a creator who picks nothing has still picked something true. What it buys is the
    // row below it — eighty properties become four.
    //
    // THE STORED VALUE OF `This Component` IS NOTHING AT ALL. `''` is the sentinel a field
    // already understands for "no choice", and `paramWrites()` turns it back into `null` on
    // the way to the model — which is the value every graph written until now carries for
    // "my own" (ADR-0040 §2). Nothing on disk changes.
    [COMPONENT_REFERENCE]: {
        options: (node, context) => [
            { value: '', label: THIS_COMPONENT },
            ...(context.components ?? []).map(entry => ({
                value: entry.type,
                label: entry.label ?? entry.type
            }))
        ],
        // Unreachable: `This Component` is always offered, so the list is never empty.
        empty: () => THIS_COMPONENT,
        unset: () => THIS_COMPONENT
    },
    // WHICH PROPERTY, OF THE COMPONENT NAMED ABOVE. A short list, because the question
    // before it has been answered — which is the whole of what ADR-0045 §1 changes.
    [PROPERTY_REFERENCE]: {
        // THE NAME A CREATOR READS, NOT THE ONE THE MODEL STORES. The Inspector shows
        // `Scale X` for the property this picker used to call `scaleX`, and a beginner
        // moving between the two panels had no reason to believe they were the same thing
        // (ADR-0045 §6). A property a creator declared themselves is humanised by the very
        // same rule one panel away, so the two still agree.
        options: (node, context) => propertiesOf(node, context)
            .map(property => ({
                value: property.id,
                label: property.label ?? humanize(property.name)
            })),
        // IT DEPENDS ON A SIBLING, AND SAYS SO. Picking a different Component leaves the
        // property naming something the new type does not declare, so `paramWrites()` drops
        // it in the same batch — repaired, not left dangling (ADR-0027).
        dependsOn: COMPONENT_REFERENCE,
        // TWO EMPTIES A CREATOR HAS TO TELL APART. A Component that declares nothing is not
        // the same as a Component nobody has named, and a blank strip says neither.
        empty: (node, context) => (node?.params?.component
            ? `${referencedComponent(node, context)?.label ?? node.params.component} declares no properties`
            : 'This Component declares no properties')
    },
    // THE FOURTH KIND, AND IT COST A ROW. A key is named by a string the Core refuses to
    // enumerate and the Editor can, because the Editor is the thing with a keyboard
    // attached (`editor/keys.js`, ADR-0014 §2). It resolves against nothing in the project,
    // so it takes no context and can never be empty — which is why it declares no
    // `dependsOn` and its `empty` is unreachable rather than absent.
    [KEY_REFERENCE]: {
        options: () => keyOptions(),
        empty: () => 'No keys'
    },
    // WHICH OBJECT A NODE ACTS ON — one of the Objects this Component has been given.
    //
    // THERE IS NO "FROM WIRE" ROW, AND THERE MUST NOT BE. Whether the target comes from the
    // picker or from the socket beside it is not a question to put to a creator: it is
    // answered by whether they connected something. A dropdown offering a mode would be the
    // node explaining its own implementation (ADR-0039 §0.1).
    //
    // ONLY `objectref` PROPERTIES ARE OFFERED. A socket is where an Object arrives; a number
    // is not, and offering one would let a creator point a node at something that can never
    // be an Object.
    [OBJECT_SOCKET_REFERENCE]: {
        options: (node, context, descriptor) => [
            // `Self` IS A ROW ON THE PARAM THAT HAS A FALLBACK (ADR-0045 §5). It was the
            // unset state
            // and nothing else, so a creator who picked `Player` by mistake had no way back:
            // an enum offers what it lists, and `Self` was not listed. It also makes this
            // picker read like the two below it — one question, one list, one answer already
            // given — which is the whole point of putting them in a column.
            //
            // ONLY WHERE THERE IS ACTUALLY A FALLBACK. `Get Object` uses this same kind and
            // has none: with no socket named it hands on nothing, so offering `Self` there
            // would describe a node that already exists and not this one (ADR-0043 §7). The
            // param says whether it has one, and the row follows.
            //
            // IT STORES NOTHING, exactly as `This Component` does: `''` is the sentinel the
            // control understands and `paramWrites()` writes `null`, which is what every
            // graph already carries for "the Object I am attached to" (ADR-0040 §3).
            ...(descriptor?.unset ? [{ value: '', label: descriptor.unset }] : []),
            ...(context.properties ?? [])
                .filter(property => property.type === PropertyType.OBJECTREF)
                .map(property => ({ value: property.id, label: property.name }))
        ],
        // Unreachable: `Self` is always offered, so the list is never empty.
        empty: (node, context, descriptor) => descriptor?.unset ?? NOTHING_SELECTED,
        unset: (node, context, descriptor) => descriptor?.unset ?? NOTHING_SELECTED
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
    // `This Component` IS STORED AS NOTHING, which is what every graph written until now
    // carries for "my own" (ADR-0040 §2). The control needs a value it can select — `''` is
    // the sentinel a field already understands — and the model needs `null`; this is the one
    // line between them, so the format is untouched (ADR-0045 §1).
    const writes = [{ name, value: value === '' ? null : value }];

    const changed = definition?.params?.[name]?.reference ?? null;
    if (!changed) return writes;

    // NOTHING TO CHECK AGAINST IS NOT THE SAME AS NOTHING THERE — the rule `validateGraph()`
    // already lives by. A headless caller, or an Editor opened before any Component type was
    // installed, offers an empty catalogue; dropping a sibling on the strength of that would
    // be destroying a reference because the question could not be asked.
    if (REFERENCES[changed]?.options(node, context, definition.params[name]).length === 0) return writes;

    const next = { ...node, params: { ...node?.params, [name]: writes[0].value } };

    for (const [other, descriptor] of globalThis.Object.entries(definition.params ?? {})) {
        if (other === name) continue;

        const reference = REFERENCES[descriptor?.reference];
        if (reference?.dependsOn !== changed) continue;

        const held = node?.params?.[other] ?? null;
        if (held === null) continue;
        if (reference.options(next, context, descriptor).some(option => option.value === held)) continue;

        writes.push({ name: other, value: null });
    }

    return writes;
}

/**
 * Whether a port can carry a control at all.
 *
 * THE THREE THAT CANNOT, AND THEY FAIL FOR THREE DIFFERENT REASONS. A FLOW port carries
 * execution, not a value — there is nothing to type. An `any` port has no shape, so there is
 * no control to draw. An OBJECT port carries a live handle, which is not a value a creator
 * types: a box there could never be filled in, and the Runtime ignores whatever a node holds
 * for such a port anyway (ADR-0034 §3.2, §3.6) — so the box would also be a lie.
 *
 * IT IS A PREDICATE RATHER THAN A LINE INSIDE `inputFields()` BECAUSE THE GEOMETRY ASKS IT
 * TOO. A port with no control has nothing else on its row to describe it, so its own label
 * is all it has and a row must not be given to something that would silence it
 * (`graph/view.js`). One fact, two readers, and they cannot drift.
 *
 * @param {object|null} port - The port
 * @returns {boolean} True when a creator can state a value for it
 */
export function carriesControl(port) {
    if (!port || port.kind === PortKind.FLOW) return false;
    return Boolean(port.type) && port.type !== ANY_TYPE && port.type !== OBJECT_TYPE;
}

/**
 * The input ports a creator can type a value into, as field descriptors.
 *
 * WHICH PORTS, AND WHY NOT ALL OF THEM: `carriesControl()`, just above. Everything it admits
 * gets a field, whether or not something is wired to it (ADR-0031 §1).
 *
 * THE DESCRIPTOR IS BUILT FROM THE BASE TYPE, because a port carries a type and not a
 * declaration. `array<number>` says a list of numbers travels here; what it does not carry
 * is the element's bounds or a Choice's options, which are what those two controls need —
 * they live on the property, and a port is not one. So a list and a choice reach `fieldFor()`
 * as an undeclared list and an optionless choice, and get the read-only row both already
 * had, by the rule ADR-0031 §2 and §3 state rather than by falling through an unknown name.
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
        if (!carriesControl(port)) continue;

        fields.push({
            ...fieldFor(port.id, {
                type: baseTypeOf(port.type),
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
 * The properties a node may pick from, which is the answer to the question above it.
 *
 * ONE RESOLVER, TWO SOURCES, AND THE CREATOR SEES ONE LIST. No Component named means the
 * `.px` being edited, whose properties are the fields a creator declared on it; a named one
 * means that type's. It is the Editor's mirror of `resolvedProperty()` in the Core, and the
 * two agree because both branch on the same absent param.
 *
 * @param {object} node - The node
 * @param {object} context - `{ properties, components }`
 * @returns {object[]} The descriptors on offer
 */
function propertiesOf(node, context) {
    if (!node?.params?.component) return context.properties ?? [];
    return referencedComponent(node, context)?.properties ?? [];
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

    const options = reference.options(node, context, descriptor);
    // NOTHING CHOSEN IS THE EMPTY STRING, which is the sentinel a field already understands
    // — and, for the Component picker, also the value of its first real row.
    const chosen = node?.params?.[name] ?? '';

    const field = fieldFor(name, {
        ...descriptor,
        type: PropertyType.ENUM,
        values: options.map(option => option.value),
        labels: options.map(option => option.label),
        // A LONG LIST IS A LIST WITH HEADINGS. Ninety-nine keys in one column is not
        // something a creator reads, and the Editor's dropdown has grouped and filtered
        // since Add Component (ADR-0026 §10) — so an option may say which group it belongs
        // to, and every reference that has no groups passes `null` and draws as it always
        // did.
        groups: options.some(option => option.group) ? options.map(option => option.group ?? '') : null,
        placeholder: options.length === 0
            ? reference.empty(node, context, descriptor)
            : (reference.unset?.(node, context, descriptor) ?? NOTHING_SELECTED)
    });

    // `fieldFor()` answers a fixed shape, so what it does not carry rides beside it: the
    // value the CONTROL shows, which is not always the value the model holds. `This
    // Component` is stored as `null` and offered as `''`, and the canvas binds to this
    // (`#drawControl`, windows/graph.js).
    return { ...field, value: chosen };
}

