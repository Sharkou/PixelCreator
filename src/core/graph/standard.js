// The standard node library — small on purpose, and real (ADR-0027).
//
// WHAT "MINIMAL BUT FUNCTIONAL" MEANS HERE: a creator can react to the two events the
// runtime actually raises, read and write the properties their own Component declares,
// branch, sequence, and do arithmetic on the way. That is a complete loop — an input, a
// decision, a mutation, an output — and everything beyond it is a row in this file.
//
// NOTHING HERE REACHES FOR AN ENVIRONMENT. No clock, no random source, no DOM, no storage,
// no global. A node reads its inputs and its params, and writes through the component it
// was handed. That is what lets a server and a client run the same graph and reach the
// same state, which is the constraint the whole product is built on (ADR-0011).
//
// A GRAPH WRITES THE WAY A COMPONENT WRITES. `Set Property` performs a PLAIN write on the
// reactive component, never `setProperty()`: a behaviour running inside `update()` is a
// simulation output, not an authored intent, and ADR-0003 is explicit that a Component
// never calls `setProperty()`. The write is still observable — same Change, same Inspector
// update, same replication of state — because the component is the reactive Proxy the
// Object holds (ADR-0015 §5).
//
// A PROPERTY IS REFERENCED BY IDENTITY, NEVER BY NAME. `property.get` and `property.set`
// store the property's stable id in their params, so renaming `speed` to `walkSpeed` in
// the Inspector leaves every node that reads it wired to the same property. The name is
// resolved at run time, which is also what lets a deleted property produce a structured
// error instead of a silent `undefined`.

import { PropertyType, defaultForProperty, elementOf } from '../properties/types.js';
import { ANY_TYPE, OBJECT_TYPE, PortKind, nodes as defaultNodes, portTypeOf } from './nodes.js';
import { declaredProperties } from '../definition.js';
import { OBJECT_COMPONENT, objectProperties } from '../object.js';
import { GraphError, GraphIssueCode } from './errors.js';
import { worldPosition } from '../components/transform.js';
import { duplicateObject } from '../duplicate.js';
import { instantiatePrefab } from '../prefab.js';

/**
 * The param that names a property, so the Editor knows to offer a picker.
 *
 * ONE KIND, WHATEVER THE PROPERTY BELONGS TO. There were two — this one for the properties
 * of the Component being edited, `COMPONENT_PROPERTY_REFERENCE` for the properties of a
 * type a sibling param named — because there were two nodes to declare them on. There is
 * one node now (ADR-0040 §2), and a creator picking `Transform ▸ Rotation` out of a
 * grouped list is doing what a creator picking `speed` does: naming a property. Which
 * Component declares it is the answer's shape, not a second question.
 */
export const PROPERTY_REFERENCE = 'property';

/**
 * The param that names a Component TYPE (ADR-0034 §3.3).
 *
 * A type is a `ResourceId` for a `.px` and a class name for a shipped component — either
 * way it is of PROJECT scope, which is what makes it safe to store in a graph. Nothing
 * belonging to a scene is named here.
 */
export const COMPONENT_REFERENCE = 'component';

/**
 * The param that names a KEY of the machine a player is sitting at (ADR-0014 §2).
 *
 * THE CORE STILL HOLDS NO LIST, AND THIS IS WHAT LETS IT NOT HAVE TO. A key name is opaque
 * here on purpose — a server replaying names off the network never sees a keyboard event to
 * read one from — but "opaque" was being paid for by the creator, who had to type
 * `ArrowLeft` correctly into a text box and got a node that answered false for ever if they
 * did not. Naming the KIND of thing the param holds costs the Core nothing and lets whoever
 * does have a keyboard offer the list: the Editor resolves it beside the adapter that
 * produces the very same names (`editor/keys.js`).
 *
 * It is the same mechanism `COMPONENT_REFERENCE` uses — the Core says what is named, the
 * Editor says what exists — so it is a row in a table and not a second vocabulary.
 */
export const KEY_REFERENCE = 'key';

/**
 * The param that names WHICH Object a property node acts on — one of this `.px`'s own
 * `objectref` sockets, or the wire.
 *
 * WHY A PARAM AND NOT ONLY A PORT. A target a creator can point at is *known*, and a known
 * thing belongs in the node rather than at the end of a wire: `Set Player.Transform.rotation`
 * is one card that says what it does, where the same statement used to be two nodes, three
 * dropdowns and a connection the creator had to draw. The port has not gone — a target the
 * graph COMPUTES (`Find By Tag`, `Parent`) can only arrive on a wire — it is what this param
 * answers when nothing is connected.
 *
 * IT NAMES A SOCKET, NEVER AN OBJECT. What is stored is the id of a property this `.px`
 * declares, which is of project scope like everything else in the file (ADR-0027 §4). The
 * ObjectId stays where ADR-0034 §3.5 puts it: in the value each attached Object carries.
 * A `.px` with a static target is still reusable in fifty scenes, and says so in the
 * Inspector — one row per socket, one value per instance.
 *
 * IT IS ABSENT FROM EVERY GRAPH WRITTEN BEFORE IT, and that is the migration: no param
 * means nothing is pointed at, and the socket answers — which is exactly what those
 * graphs already do.
 */
export const OBJECT_SOCKET_REFERENCE = 'object-socket';

/**
 * The Object a node is pointed at, or null when it is pointed at none.
 *
 * THERE IS NO MODE, AND THAT IS THE POINT. A node does not ask a creator whether its target
 * is "static" or "from a wire" — those are words about the implementation, not about the
 * game. It has an Object socket that is always there to connect to, and a picker beside it:
 * connect something and the connection is the target, leave it empty and the picker is. The
 * creator states an intention with a gesture, and the node reads it (ADR-0039 §0.1).
 *
 * DECLARED, NEVER GUESSED. The param must name a property this `.px` actually declares AND
 * that property must be an `objectref`: anything else is not somewhere an Object can come
 * from, so it answers null rather than resolving something it was not pointed at.
 *
 * @param {object} node - The node
 * @param {object} [context] - `{ properties }`
 * @returns {object|null} The socket's descriptor, or null
 */
export function targetSocket(node, context = {}) {
    const id = node?.params?.target ?? null;
    if (!id) return null;

    return (context.properties ?? [])
        .find(property => property.id === id && property.type === PropertyType.OBJECTREF) ?? null;
}

/**
 * The property a node refers to, resolved from the context it runs in.
 *
 * @param {object} node - The node
 * @param {object} [context] - `{ properties }`
 * @returns {object|null} The descriptor, or null when it names nothing that exists
 */
export function referencedProperty(node, context = {}) {
    const id = node?.params?.property ?? null;
    if (!id) return null;
    return (context.properties ?? []).find(property => property.id === id) ?? null;
}

/**
 * The Component type a node refers to, resolved from the catalogue it runs against.
 *
 * `context.components` is what the Editor knows about the project's Component types; a
 * headless check has none, and then this answers null rather than pretending.
 *
 * @param {object} node - The node
 * @param {object} [context] - `{ components }`
 * @returns {object|null} `{ type, label, properties }`, or null
 */
export function referencedComponent(node, context = {}) {
    const type = node?.params?.component ?? null;
    if (!type) return null;
    return (context.components ?? []).find(entry => entry.type === type) ?? null;
}

/**
 * The property of that Component type a node refers to.
 *
 * @param {object} node - The node
 * @param {object} [context] - `{ components }`
 * @returns {object|null} The descriptor, or null
 */
export function referencedComponentProperty(node, context = {}) {
    const id = node?.params?.property ?? null;
    if (!id) return null;
    return (referencedComponent(node, context)?.properties ?? [])
        .find(property => property.id === id) ?? null;
}

/**
 * The property a Get/Set node reads or writes — from whichever Component declares it.
 *
 * ONE NODE, TWO SOURCES, AND THE CREATOR SEES NEITHER. `component` absent means "the
 * Component this graph belongs to", whose properties are the fields a creator declared on
 * the `.px` itself; present, it names another type and the property is one of that type's.
 * They used to be two node types — `Get Property` and `Get Property On` — which is the Core's
 * distinction wearing a creator's clothes: to someone who does not program they are one act,
 * "read a property", differing only in whose (ADR-0040 §1).
 *
 * @param {object} node - The node
 * @param {object} [context] - `{ properties, components }`
 * @returns {object|null} The descriptor, or null when it names nothing that exists
 */
export function resolvedProperty(node, context = {}) {
    const id = node?.params?.property ?? null;
    if (!id) return null;

    const declared = node?.params?.component
        ? referencedComponent(node, context)?.properties ?? []
        : context.properties ?? [];

    return declared.find(property => property.id === id) ?? null;
}

const flow = (id, label, tooltip) => ({ id, kind: PortKind.FLOW, label: label ?? '', tooltip: tooltip ?? null });
const data = (id, type, label, fallback, placeholder, tooltip) => ({
    id,
    kind: PortKind.DATA,
    type,
    label: label ?? null,
    default: fallback ?? null,
    placeholder: placeholder ?? null,
    tooltip: tooltip ?? null
});

/**
 * The key a `Key` node reads before a creator has typed one into it.
 *
 * DECLARED ONCE, READ TWICE. It is the param's `default` — which is what the field SHOWS on
 * a node nobody has touched — and it is what `evaluate` falls back to when the node carries
 * no `key` at all. A node added and left alone stores `params: {}`, so stating the fallback
 * separately is how a node comes to read as `Space` and answer as if it read nothing.
 */
const DEFAULT_KEY = 'Space';

/**
 * The pointer buttons a creator can name, in the order a mouse presents them.
 *
 * A NAME IS STORED, AN INDEX IS READ, and the two are the same list read from both ends.
 * `InputState` indexes buttons by number because that is what every platform reports
 * (`isButtonDown(0)`), but a `.px` is a file that outlives the platform that wrote it — so
 * it carries `"right"` the way `input.key` carries `"Space"`, and for the same reason
 * ADR-0014 §2 gives: what is saved must not depend on how a device happens to number its
 * buttons. The position in this list IS the index, so there is one list and not two.
 */
const BUTTON_NAMES = ['left', 'middle', 'right'];
const BUTTON_LABELS = ['Left', 'Middle', 'Right'];

/** The button a `Pointer Button` node watches before a creator has chosen one. */
const DEFAULT_BUTTON = 'left';

/**
 * WHICH PROPERTY, AS TWO QUESTIONS — because one of them was answered by a list of eighty.
 *
 * ADR-0040 §2 merged them into one grouped picker, and it was right about the reason: a
 * creator wants "the Player's rotation" and should not have to know that rotation lives in
 * a Component before they can reach it. What it could not know is what the merged list
 * becomes on a real project — ADR-0040 §8 wrote the risk down itself: "la liste de
 * propriétés est plus longue : elle contient tous les Components du projet". Measured, it
 * is: six shipped types plus every `.px`, in one scroll, to reach `x`.
 *
 * So the Component is a question again — but a question with an ANSWER ALREADY GIVEN. It
 * defaults to this Component, it is never empty, and picking one narrows the list below it
 * from eighty rows to four. That is the difference from what ADR-0040 removed: the old
 * control demanded an answer before it would show anything, and this one is already
 * answered and merely refines (ADR-0045 §1).
 *
 * `component` ABSENT STILL MEANS THIS COMPONENT, so nothing on disk changes and no graph
 * needs migrating — the storage ADR-0040 §2 settled is untouched.
 */
const propertyPathParam = {
    // STORED, AND NEVER ASKED (ADR-0047 §1). The Core needs to know WHOSE property this is —
    // `resolvedProperty()` reads it — but a creator does not think in two questions. They
    // think "this object's rotation", which is one answer with two halves, so one picker
    // writes both. `hidden` is ADR-0007's word for a param that is model and not interface,
    // and `paramFields()` has honoured it all along.
    //
    // TWO PARAMS AND NOT ONE COMPOSITE STRING: the format is untouched, `resolvedProperty()`
    // is untouched, and every graph written since ADR-0040 still reads. What changed is the
    // number of controls, which was never the number of identities.
    component: {
        type: PropertyType.STRING,
        default: null,
        label: 'Component',
        reference: COMPONENT_REFERENCE,
        hidden: true,
        tooltip: 'Which Component the property belongs to. Empty means this one'
    },
    property: {
        type: PropertyType.STRING,
        default: null,
        label: 'Property',
        reference: PROPERTY_REFERENCE,
        tooltip: 'Which property this node reads or writes'
    }
};

/**
 * The param naming WHICH Object the node acts on (ADR-0040 §3, amending ADR-0034 §7).
 *
 * ADR-0034 §7 rejected "un mode de ciblage en paramètre" because it was *incomposable*: with
 * only a param, "the parent of my parent" could not be said. That objection is answered
 * rather than ignored — the port is ALWAYS there, so "the parent of my parent" stays exactly
 * as expressible as it was. What the param adds is a way to answer the same question without
 * drawing a wire, for the case that has nothing to compute: a target a creator can point at.
 * The two never compete: a connection wins, and the picker says so by greying out.
 */
const targetParam = {
    target: {
        type: PropertyType.STRING,
        default: null,
        label: 'Object',
        reference: OBJECT_SOCKET_REFERENCE,
        // WHAT AN EMPTY ONE MEANS, SAID BY THE PARAM THAT MEANS IT. `targetObject()` falls
        // back to the Object this Component is attached to, so the picker shows `Self` and
        // is telling the truth — a default is constated, not chosen (ADR-0040 §3). The word
        // belongs here rather than on the reference KIND, because `Get Object` uses the same
        // kind and has no such fallback: with no socket named it hands on nothing.
        unset: 'Self',
        // IT IS EDITED ON THE PORT'S OWN ROW. The socket and the picker are two ways to say
        // one thing — which Object — so they share a line: connect something and the picker
        // greys out, disconnect and it comes back. Two rows would be two questions.
        port: 'object',
        tooltip: 'Which Object this node acts on. Empty means this one; drag an Object here to change it'
    }
};

/**
 * The param naming WHICH Object `Spawn` copies (ADR-0056 §3).
 *
 * THE SAME PARAM NAME, AND THAT IS WHAT MAKES IT ONE MECHANISM AND NOT TWO. `targetSocket()`
 * reads `params.target`, the Editor's `OBJECT_SOCKET_REFERENCE` picker writes it, and the
 * drop of an Object onto a node declares the socket it points at — none of which learns a
 * second name. What differs is the two things a param is allowed to differ in: what it is
 * CALLED, and what an empty one MEANS.
 *
 * NO `unset`, SO NO `Self` ROW, SO NO FALLBACK. This is the mechanism `Get Object` already
 * uses for the same reason (ADR-0043 §7): the picker offers `Self` only where a `Self`
 * fallback exists, and a `Spawn` with no model chosen must copy nothing rather than copy the
 * Object it is attached to — which would double that Object on every step.
 */
const modelParam = {
    target: {
        type: PropertyType.STRING,
        default: null,
        label: 'Model',
        reference: OBJECT_SOCKET_REFERENCE,
        port: 'object',
        tooltip: 'Which Object to copy. Drag an Object from the Hierarchy onto this node, '
            + 'or wire one in'
    }
};


/**
 * The value a stored property becomes on the port that carries it.
 *
 * THE TWIN OF `portTypeOf()`, AND IT HAD BEEN MISSING. That one translates the TYPE at the
 * boundary ADR-0034 §3.5 draws — `objectref` is an identity when it is stored and a HANDLE
 * when it travels — and every port that carries a property already goes through it. The
 * translation of the VALUE was never written, so a port typed `object` was handed the raw
 * `ObjectId`: `Is Valid` answered `true` on a reference whose target had been deleted, and
 * `Parent` read `"obj_7f3a".parent` and answered nothing. The type said handle and the
 * value was a string.
 *
 * IT IS NOT THE STRING RESOLUTION §3.6 REFUSES, and the difference is the provenance rather
 * than the operation. §3.6 forbids a node turning a GRAPH VALUE into an Object, because a
 * `.px` is of project scope and a forged record in `node.inputs` is indistinguishable from a
 * handle to a node that duck-types — which is why `defaultOf()` refuses that path outright
 * and inspects nothing. What is resolved here is an INSTANCE VALUE whose type is DECLARED
 * `objectref` in the Component's own schema: the declaration is the authorisation, it lives
 * in the scene where the identity is already legal, and nothing in a graph payload can forge
 * it. The two rules are the same rule seen from each side of the same boundary.
 *
 * ANYTHING THAT DOES NOT RESOLVE BECOMES `null`, never itself. A deleted target, an empty
 * reference and a value of the wrong shape all answer nothing — which is what a port typed
 * `object` promises, and what lets `Is Valid` mean something.
 *
 * @param {object|null} property - The declared property descriptor
 * @param {any} value - What the Component holds
 * @param {object} [scene] - The scene the reference is resolved in
 * @returns {any} The value the port carries
 */
export function portValueOf(property, value, scene) {
    // `Map.get` on anything that is not a stored identity answers nothing, which is the
    // honest reading of a reference that points at no object of this scene.
    if (property?.type === PropertyType.OBJECTREF) return scene?.get?.(value) ?? null;

    // A LIST OF REFERENCES CROSSES THE SAME BOUNDARY, ELEMENT BY ELEMENT. `portTypeOf()`
    // types the port `array<object>` for exactly this declaration, and a port typed with
    // handles handed a list of ObjectIds is the defect this function was written for, one
    // level down: `Is Valid` would answer on a string and `Parent` would read nothing.
    //
    // A value that is not a list reads as an empty one, never as itself: `[]` is what a
    // list's absence looks like (ADR-0031 §3), and letting a stray value through would put a
    // shape on the port that its type does not describe.
    if (elementOf(property)?.type === PropertyType.OBJECTREF) {
        return globalThis.Array.isArray(value) ? value.map(item => scene?.get?.(item) ?? null) : [];
    }

    return value;
}

/**
 * The value a port's value becomes when it is stored in a property.
 *
 * THE IDENTITY IS WHAT IS STORED (ADR-0034 §3.5), and without this the handle itself was:
 * `Self` wired into a `Set Property` naming an `objectref` property wrote the reactive Proxy
 * into an instance value, and `serializeScene()` then wrote the whole Object record — name,
 * tag, layer, owner — into the scene payload. That is invariant 3 ("un handle n'est jamais
 * persisté, ni sérialisé") broken by a wire the type system allowed, because the port and
 * the property agreed on the type and disagreed on the shape.
 *
 * A VALUE THAT IS NOT A HANDLE STORES NOTHING. `value?.id` reads the identity off an Object
 * and answers `undefined` for a string — so nothing here can promote an arbitrary string
 * into a stored reference, which is the other half of §3.6.
 *
 * @param {object|null} property - The declared property descriptor
 * @param {any} value - What arrived on the port
 * @returns {any} The value to store
 */
export function storedValueOf(property, value) {
    if (property?.type === PropertyType.OBJECTREF) return value?.id ?? null;

    // The same translation the other way, element by element — so a list of handles arriving
    // on a `Set Property` is stored as a list of ObjectIds and `serializeScene()` never
    // writes an Object record into a scene payload (ADR-0034 §3.5, invariant 3).
    if (elementOf(property)?.type === PropertyType.OBJECTREF) {
        return globalThis.Array.isArray(value) ? value.map(item => item?.id ?? null) : [];
    }

    return value;
}

/**
 * The Object a property node acts on: the socket it names, or whatever the wire brought.
 *
 * THE STATIC TARGET IS NOT A NEW WAY TO RESOLVE AN IDENTITY — it is exactly the one ADR-0036
 * §2 authorises. That section draws the line at PROVENANCE: a graph value is refused without
 * inspection, while "une valeur d'instance dont le schéma déclare le type `objectref`" is
 * resolved, because only the Component's own schema can declare one. A socket IS such a
 * property, so reading it goes through `portValueOf()` — the same pair `property.get` has
 * always used — and nothing here turns a string into an Object that was not declared to be
 * one.
 *
 * WHAT AN UNPOINTED NODE FALLS BACK TO IS THE NODE'S OWN BUSINESS, and that is the second
 * argument. Almost every node here means `Self` when nothing is named — the picker says so
 * in words — but `Spawn` means NOTHING: a copy node that quietly copied the Object it is
 * attached to would double that Object on every step, and would do it to a creator who
 * simply had not chosen a model yet. So the fallback is a parameter of this one function
 * rather than a second copy of the three-source rule above (ADR-0056 §3).
 *
 * @param {object} io - What the node was handed
 * @param {object|null} [fallback] - What an unpointed node acts on; `Self` by default
 * @returns {object|null} The Object, or null
 */
function targetObject(io, fallback = io.self ?? null) {
    // A CONNECTION WINS, AND IT WINS BY EXISTING. Not by producing a non-null Object: a
    // `Find By Tag` that finds nobody must write to nobody, not fall through to whatever the
    // picker happens to name. The three sources are ordered, never merged.
    if (io.wired?.('object')) return io.input('object');

    const socket = targetSocket(io.node, { properties: io.properties });
    if (socket) return portValueOf(socket, io.component?.[socket.name], io.ctx?.scene);

    // SELF, AND IT IS THE DEFAULT BECAUSE IT IS THE COMMON CASE. ADR-0034 §7 refused "un port
    // `object` non connecté valant Self" as implicit magic, and it was right about a bare
    // port: nothing on the node said so. The picker beside it says `Self` in words, so the
    // creator reads the answer instead of having to know it.
    return fallback;
}

/**
 * The Component instance a node reads or writes on.
 *
 * `component` ABSENT MEANS "THIS ONE". On the node's own Object that is the very instance the
 * graph is running as, which is what `Get Property` always did; pointed elsewhere it is that
 * Object's instance of the same type, which is what a creator means by "the other Player's
 * speed".
 */
function targetComponent(io) {
    const named = io.node?.params?.component ?? null;

    // THE OBJECT ANSWERS FOR ITSELF. `Object ▸ Name` names no component and never will:
    // what holds `name` is the Object, so what is handed back IS the Object — the same
    // reactive Proxy the Scene keeps, so a write from a graph is the ordinary observable
    // write every other property gets (ADR-0043). Placed before the shortcut below because
    // the shortcut answers `io.component`, and this node is not asking about a component.
    if (named === OBJECT_COMPONENT) return targetObject(io);

    const pointed = io.wired?.('object') || Boolean(targetSocket(io.node, { properties: io.properties }));

    // NOTHING NAMED AND NOTHING POINTED AT: this Component, on its own Object. It is already
    // in hand — asking the scene would answer the same thing more slowly, and would need a
    // `self` that a headless caller is not obliged to supply. This is the case `Get Property`
    // has always served, and it stays the shortest path through the node.
    if (!named && !pointed) return io.component ?? null;

    return targetObject(io)?.getComponent?.(named ?? ownType(io)) ?? null;
}

/**
 * What a running graph knows about the Component type a node names.
 *
 * THE DECLARATION COMES FROM THE REGISTRY, THE VALUE FROM THE INSTANCE. Reading the schema off
 * whatever component happens to be attached would leave the node with nothing to say when the
 * target does not carry one — and `.px` types live in the Scene's own registry, which is
 * where a type is looked up everywhere else (core/scene.js).
 *
 * @param {object} io - What the node was handed
 * @returns {object[]|null} A one-entry catalogue for the type this node names
 */
function catalogueOf(io) {
    const type = io.node?.params?.component ?? null;
    if (!type) return null;

    // THE OBJECT'S OWN FOUR, DECLARED BY THE CORE AND NOT BY A REGISTRY (ADR-0043). Asking
    // the registry for `Object` answers nothing, because nothing registers it — so a node
    // reading `Object ▸ Name` would raise MISSING_PROPERTY on a property that is right
    // there. One declaration, and this is the reader the interpreter uses.
    if (type === OBJECT_COMPONENT) return [{ type, properties: objectProperties() }];

    const Component = io.ctx.scene.registry.get?.(type) ?? null;
    return Component ? [{ type, properties: declaredProperties(Component) }] : [];
}

/** The type of the Component this graph is the behaviour of. */
function ownType(io) {
    return io.component?.constructor?.type ?? null;
}

/**
 * Resolve a referenced property or refuse, with the reason in the code.
 *
 * NEVER A SILENT DANGLING REFERENCE. A node pointing at a property that was deleted is a
 * structured failure the runtime reports and the validator lists — not an `undefined` that
 * spreads through the graph and shows up as a component that quietly stopped moving.
 */
function requireProperty(io) {
    const property = resolvedProperty(io.node, {
        properties: io.properties,
        components: io.ctx?.scene?.registry ? catalogueOf(io) : null
    });
    if (property) return property;

    const id = io.node?.params?.property ?? null;
    throw new GraphError(
        id ? GraphIssueCode.MISSING_PROPERTY : GraphIssueCode.MISSING_REFERENCE,
        id
            ? `This node reads a property the Component no longer declares.`
            : 'This node has no property selected.',
        { node: io.node?.id, property: id }
    );
}

/**
 * Which button a `Pointer Button` node watches.
 *
 * `??`, not `||`: a node nobody has touched carries no `button` and watches the default,
 * while `0` is the primary button a creator chose — the same distinction `input.key` draws
 * between an untouched field and an emptied one, and the reason `0` may not be read as
 * absent here.
 *
 * @param {object} node - The node
 * @returns {number} The button index
 */
function buttonOf(node) {
    const named = node?.params?.button ?? DEFAULT_BUTTON;
    const at = BUTTON_NAMES.indexOf(named);
    return at === -1 ? 0 : at;
}

/** The node types the engine ships. */
export const STANDARD_NODES = [

    // --- events: where a flow begins ------------------------------------------------
    //
    // An event node has no flow input and is never "run": the interpreter starts a flow AT
    // its output. `event` names which runtime moment raises it, so adding one is a row here
    // and a line in the interpreter, and never a branch in a window.

    {
        type: 'event.start',
        label: 'On Start',
        category: 'Events',
        keywords: ['event', 'begin', 'awake', 'init'],
        event: 'start',
        outputs: [flow('out')],
        tooltip: 'Runs once, on this component\'s first simulation step'
    },

    {
        type: 'event.update',
        label: 'On Update',
        category: 'Events',
        keywords: ['event', 'tick', 'frame', 'loop', 'delta'],
        event: 'update',
        outputs: [
            flow('out'),
            data('deltaTime', PropertyType.NUMBER, 'Delta Time'),
            data('time', PropertyType.NUMBER, 'Time')
        ],
        evaluate: io => ({ deltaTime: io.ctx?.deltaTime ?? 0, time: io.ctx?.time ?? 0 }),
        tooltip: 'Runs every simulation step, at the fixed rate the clock sets'
    },

    // --- what the player is doing ------------------------------------------------------
    //
    // THE INPUT ARRIVES ON THE STEP CONTEXT, EXACTLY LIKE THE TIME DOES. This node reads
    // `io.ctx.input`, which the Runtime hands over because it was handed it — it never goes
    // looking for a keyboard, and there is no keyboard here to look for. `KeyboardEvent`,
    // `window` and `document` are unknown words in this file, and that is what lets the same
    // graph run in a browser, on a server replaying what a player sent, and in a headless
    // test that presses keys by hand (ADR-0014).
    //
    // INDEXED BY OWNER, SO IT IS THE RIGHT PLAYER'S KEYBOARD. `Object.owner` names the
    // player an object belongs to (ADR-0001), so the state is `input.of(self.owner)` and
    // never a global one. The `local` owner always exists, which is what makes an object
    // with no owner playable offline with no special case (ADR-0014 §3).
    //
    // THREE OUTPUTS, NOT THREE NODES AND NOT ONE MODE PARAM. They are the three questions
    // `InputState` answers about a key, and a creator wiring a jump wants `Pressed` next to
    // the `Held` they were about to use by mistake. Each is statically a boolean, so nothing
    // here is polymorphic — the shape of this node does not depend on what it is pointed at.

    // --- the world reaching in ---------------------------------------------------------
    //
    // AN EVENT AND A STATE ARE TWO DIFFERENT THINGS, AND THEY USED TO BE ONE NODE. `Key`
    // answered three booleans — held, pressed, released — so the commonest sentence a
    // beginner writes, "when I press Space, jump", could not be written at all. It came out
    // as `On Update -> Branch -> Jump`: three nodes and two wires to say one thing, and the
    // creator had to know that a keypress is a value you test every frame rather than a
    // moment that happens (ADR-0041 3).
    //
    // SO THE PAIR IS SPLIT ALONG THE LINE THAT WAS ALWAYS THERE:
    //
    //   On Key            a MOMENT. It starts a flow, on the step the key went down or up.
    //   Key Is Down       a STATE. It answers a question, for as long as the key is held.
    //
    // Each node has exactly one execution semantic, which is what makes the catalogue
    // teachable: a node with a flow output starts something, a node with a data output
    // answers something, and no node does both.
    //
    // "WHILE HELD" IS STILL A CONDITION, and deliberately still costs a Branch. Holding a
    // key is not an event — it is true on every step until it is not — and dressing it as
    // one would put a node in the catalogue that fires sixty times a second while looking
    // exactly like the one that fires once.

    {
        type: 'input.onKey',
        label: 'On Key',
        // AN EVENT, AND SHELVED WITH THE EVENTS (ADR-0046 §6). `Input` now holds the nodes
        // that ANSWER a question — is this key down, where is the pointer — and `Events`
        // holds the ones that START a flow. A creator looking for "when the player presses
        // jump" looks under Events, which is where every other "when" already lives.
        category: 'Events',
        // THE NAMES A CREATOR TYPES ARE THE NAMES OTHER ENGINES GAVE THE THREE SEPARATE
        // NODES THIS ONE REPLACED. Someone looking for `On Key Down` or `On Key Up` must land
        // here and read the three ports, rather than conclude the engine has no such thing
        // (ADR-0046 §6).
        keywords: ['input', 'keyboard', 'key', 'press', 'pressed', 'released', 'hold', 'held',
            'while', 'down', 'when', 'event', 'on key down', 'on key up', 'keydown', 'keyup',
            'keypress', 'jump', 'shoot'],
        event: 'update',
        params: {
            key: {
                type: PropertyType.STRING,
                default: DEFAULT_KEY,
                label: 'Key',
                reference: KEY_REFERENCE,
                tooltip: 'The key this node watches'
            }
        },
        // THREE MOMENTS, THREE OUTPUTS, ONE CARD (ADR-0046 §6). They were three node types
        // — `On Key`, `Key Down`, `Key Is Down` — and the first two were the same question
        // asked of the same key, which meant a creator had to KNOW the difference before
        // they could pick the card that would tell them. Three ports on one card put the
        // difference where it is read: side by side, in the node they already placed.
        //
        // AND IT SETTLES ADR-0041 §3.2 PROPERLY. That section refused a continuous event
        // because it "would look identical to the one-shot"; two cards that look alike is a
        // problem one card does not have.
        //
        // NONE OF THEM IS BEHIND A DROPDOWN. Pressing, releasing and holding are all things
        // a game reacts to — a jump on the way down, a charged shot on the way up, a walk
        // while held — and a mode param would hide two of them behind a choice made before
        // the creator knows they want them.
        outputs: [
            flow('pressed', 'Pressed', 'The moment the key goes down — runs once per press'),
            flow('released', 'Released', 'The moment the key comes back up — runs once per release'),
            flow('down', 'Down', 'Runs on EVERY step the key is held — sixty times a second, not once')
        ],
        // WHICH FLOWS FIRED THIS STEP, answered through the contract every flow node uses
        // (`interpreter.js`, `continuationsOf`). More than one can be true on one step — the
        // step a key goes down is both `Pressed` and `Down` — and each then runs, in declared
        // order. That is not a quirk to hide: "on the press, and every step after" is what
        // holding a key IS.
        //
        // THE THREE SEMANTICS ARE THE RUNTIME'S, NOT THIS NODE'S. `InputState` already
        // answers all three, and `commit()` bounds the two transitions to exactly one step
        // whatever the frame rate — so a server replaying inputs computes the same three
        // answers (ADR-0011, ADR-0014 §5). Nothing here is a boolean wearing an event's name.
        execute: io => {
            const key = io.param('key') ?? DEFAULT_KEY;
            const state = key ? io.ctx?.input?.of?.(io.self?.owner ?? null) : null;
            if (!state) return [];

            const fired = [];
            if (state.pressed(key)) fired.push('pressed');
            if (state.released(key)) fired.push('released');
            if (state.isDown(key)) fired.push('down');
            return fired;
        },
        tooltip: 'Runs when this key goes down, when it comes back up, and while it is held'
    },

    {
        type: 'input.key',
        label: 'Key Is Down',
        category: 'Input',
        keywords: ['input', 'keyboard', 'key', 'held', 'down', 'holding', 'while', 'state'],
        params: {
            key: {
                type: PropertyType.STRING,
                default: DEFAULT_KEY,
                label: 'Key',
                // STILL AN OPAQUE STRING IN THE MODEL, AND A PICKED ONE IN THE EDITOR.
                // What is stored is a `KeyboardEvent.code` exactly as before, so every graph
                // written until now reads unchanged; what the param gained is a statement of
                // WHAT KIND of name it holds, which is all the Editor needs to offer the
                // list instead of a text box (`KEY_REFERENCE` above).
                reference: KEY_REFERENCE,
                tooltip: 'The key this node watches'
            }
        },
        // THE PORT ID IS UNCHANGED, and that is the migration. This node kept the type name
        // `input.key`, so every graph that read `held` off it still reads `held` off it —
        // only the label and the two ports that were really events have gone.
        outputs: [data('held', PropertyType.BOOLEAN, 'Is Down', null, null,
            'True for as long as the key is held — ask it every step, with On Update')],
        // A KEY IS A LITERAL, NOT A REFERENCE, so an empty one answers false rather than
        // refusing. `property.get` throws because it NAMES something that must exist and no
        // longer does — a design-time fault. A key nobody typed is an empty `Number` node,
        // and the catalogue has never made those an error (ADR-0034 3.4).
        evaluate: io => {
            // `??`, not `||`: a node nobody has touched carries no `key` and reads the
            // declared default, while a field a creator has EMPTIED is an empty key and
            // reads nothing. The two are different answers to different acts.
            const key = io.param('key') ?? DEFAULT_KEY;
            const state = key ? io.ctx?.input?.of?.(io.self?.owner ?? null) : null;
            return { held: state ? state.isDown(key) : false };
        },
        tooltip: 'Whether this key is being held right now'
    },

    {
        type: 'input.pointer',
        label: 'Pointer',
        category: 'Input',
        // THE CATEGORY'S GLYPH IS A KEYCAP, which is right for `Key` and wrong for the two
        // nodes that read a mouse: all three drew one picture, so the family was legible in
        // the menu and its members were not (editor/ui/icons.js).
        icon: 'node-pointer',
        keywords: ['input', 'mouse', 'cursor', 'touch', 'position', 'aim', 'x', 'y'],
        // IN WORLD COORDINATES, AND THAT IS THE WHOLE POINT (ADR-0038). A graph has no
        // camera, no viewport and no zoom, and must not be given any: what it is handed is
        // the place in the scene the pointer is over, already resolved by whoever owns the
        // mapping. Screen pixels would be unusable here — the graph could not convert them,
        // and a node that took a camera would drag the whole view into the simulation.
        outputs: [
            data('x', PropertyType.NUMBER, 'X'),
            data('y', PropertyType.NUMBER, 'Y')
        ],
        evaluate: io => {
            const state = io.ctx?.input?.of?.(io.self?.owner ?? null);
            if (!state) return { x: 0, y: 0 };
            return { x: state.pointerWorldX, y: state.pointerWorldY };
        },
        tooltip: 'Where the pointer is in the scene, in world coordinates'
    },

    {
        type: 'input.onPointerButton',
        label: 'On Pointer Button',
        category: 'Events',
        icon: 'node-pointer',
        keywords: ['input', 'mouse', 'click', 'clicked', 'press', 'released', 'tap', 'hold',
            'held', 'drag', 'while', 'down', 'when', 'event'],
        event: 'update',
        params: {
            button: {
                type: PropertyType.ENUM,
                values: BUTTON_NAMES,
                labels: BUTTON_LABELS,
                default: DEFAULT_BUTTON,
                label: 'Button',
                tooltip: 'Which pointer button this node watches'
            }
        },
        // THE SAME THREE MOMENTS A KEY HAS, and deliberately the same three words:
        // `InputState` draws the same distinctions for a button as for a key, bounded to a
        // single step by the same `commit()` (ADR-0014 §5). A second vocabulary for one idea
        // would be a second thing to learn.
        outputs: [
            flow('pressed', 'Pressed', 'The moment the button goes down — runs once per press'),
            flow('released', 'Released', 'The moment the button comes back up — runs once per release'),
            flow('down', 'Down', 'Runs on EVERY step the button is held — a drag, not a click')
        ],
        execute: io => {
            const button = buttonOf(io.node);
            const state = io.ctx?.input?.of?.(io.self?.owner ?? null);
            if (!state) return [];

            const fired = [];
            if (state.buttonPressed(button)) fired.push('pressed');
            if (state.buttonReleased(button)) fired.push('released');
            if (state.isButtonDown(button)) fired.push('down');
            return fired;
        },
        tooltip: 'Runs when this pointer button goes down, when it comes back up, and while it is held'
    },

    {
        type: 'input.pointerButton',
        label: 'Pointer Button Is Down',
        category: 'Input',
        icon: 'node-pointer',
        keywords: ['input', 'mouse', 'held', 'down', 'holding', 'while', 'drag', 'state'],
        params: {
            button: {
                type: PropertyType.ENUM,
                values: BUTTON_NAMES,
                labels: BUTTON_LABELS,
                default: DEFAULT_BUTTON,
                label: 'Button',
                tooltip: 'Which pointer button this node watches'
            }
        },
        // THE PORT ID IS UNCHANGED, like `Key Is Down` above and for the same reason: a
        // graph that read `held` goes on reading `held`.
        outputs: [data('held', PropertyType.BOOLEAN, 'Is Down', null, null,
            'True for as long as the button is held — ask it every step, with On Update')],
        evaluate: io => {
            const button = buttonOf(io.node);
            const state = io.ctx?.input?.of?.(io.self?.owner ?? null);
            return { held: state ? state.isButtonDown(button) : false };
        },
        tooltip: 'Whether this pointer button is being held right now'
    },

    // --- the component's own properties ---------------------------------------------

    {
        type: 'property.get',
        label: 'Get Property',
        category: 'Properties',
        keywords: ['read', 'variable', 'field', 'get', 'property', 'component', 'other'],
        tooltip: 'Reads a property of an Object',
        // ONE NODE WHERE THERE WERE TWO. `Get Property On` was the same act aimed elsewhere,
        // and the difference between them was the Core's — a property of this Component
        // versus a property of another one. A creator reading a value does not experience
        // those as two things, and having to know which node to reach for was a question
        // about the engine rather than about their game (ADR-0040 §1).
        params: { ...targetParam, ...propertyPathParam },
        inputs: [data('object', OBJECT_TYPE, 'Object')],
        // `Property`, NOT THE PROPERTY'S NAME. The picker two rows above already says which
        // property this is, and repeating `Position X` on the socket said it twice on a
        // 176 px card while telling a beginner nothing about what the port IS. The name and
        // the type are still one hover away (ADR-0045 §2).
        outputs: (node, context) => {
            const property = resolvedProperty(node, context);
            return [data('value', portTypeOf(property), 'Property', null, null,
                property ? `The value of ${property.name}` : 'Choose a property above')];
        },
        // THE VALUE CROSSES THE SAME BOUNDARY ITS TYPE DOES. The port was typed by
        // `portTypeOf()`, so an `objectref` property leaves this node as a HANDLE and not as
        // the identity it is stored as (ADR-0034 §3.5).
        evaluate: io => {
            const property = requireProperty(io);
            const component = targetComponent(io);

            // A TARGET THAT IS GONE IS A STATE OF THE SCENE, NOT A FAULT (ADR-0034 §3.4): the
            // node answers what a fresh instance would hold, so a graph reading the health of
            // an enemy that just died reads its declared value rather than failing per frame.
            return {
                value: component
                    ? portValueOf(property, component[property.name], io.ctx?.scene)
                    : defaultForProperty(property)
            };
        }
    },

    {
        type: 'property.set',
        label: 'Set Property',
        category: 'Properties',
        keywords: ['write', 'assign', 'variable', 'field', 'set', 'property', 'component'],
        tooltip: 'Changes a property of an Object',
        params: { ...targetParam, ...propertyPathParam },
        inputs: (node, context) => {
            const property = resolvedProperty(node, context);
            return [
                flow('in'),
                data('object', OBJECT_TYPE, 'Object'),
                // THE VALUE IS TYPED FROM THE PROPERTY, which lives in this node — so it is
                // exact however the Object arrives, and never a function of what is wired.
                //
                // AND IT IS CALLED `Value`, NOT THE PROPERTY'S NAME (ADR-0047 §1, the same
                // reasoning ADR-0045 §2 applied to `Get Property`'s output). The picker one
                // row above already says which property this is; repeating it on the port
                // said it twice on a 176 px card — and said it in the MODEL's spelling,
                // `rotationX`, beside a picker reading `Rotation X`.
                data('value', portTypeOf(property), 'Value', property?.default,
                    null, property ? `The value to write into ${property.label ?? property.name}` : null)
            ];
        },
        outputs: [flow('out')],
        execute: io => {
            const property = requireProperty(io);
            const component = targetComponent(io);

            // A PLAIN WRITE: a behaviour running inside `update()` is a simulation output and
            // not an authored intent, so it produces a Change and no Operation (ADR-0003,
            // ADR-0027 §6). Writing on a target that is gone does nothing, and says nothing —
            // §3.4 again. And what is written is the IDENTITY, never the handle (§3.5).
            if (component) component[property.name] = storedValueOf(property, io.input('value'));
            return 'out';
        }
    },

    // --- what a creator MEANT, where four nodes said how ---------------------------------
    //
    // ONE NODE PER INTENTION, AND "MOVE" IS AN INTENTION (ADR-0040). Nudging an object along
    // X cost `Get Property ▸ x` + `Add` + `Set Property ▸ x` — three nodes, two wires and two
    // trips through the property picker — and doing it in both axes cost six. None of those
    // nodes is about moving; they are about how moving is computed, which is the engine's
    // business and not the creator's.
    //
    // IT IS NOT `Set Position`, AND THE DIFFERENCE IS THE WHOLE POINT. `Set Property ▸ x`
    // states where the object IS; this states how far it MOVES. Both stay: the low-level one
    // is what an absolute placement needs, and putting a creator through a Get and an Add to
    // express "a bit further right" was making them write the subtraction themselves.
    //
    // TWO NUMBERS, NOT A VECTOR. The Core has no vector type and ADR-0023 §2 removed the idea
    // deliberately; `x` and `y` are two numbers everywhere else in this engine — in Transform,
    // in the Inspector's paired row, in `Pointer` — and inventing a type for one node would be
    // the abstraction this catalogue exists without.
    //
    // LOCAL, LIKE THE TRANSFORM IT WRITES. `Transform.x` is a position in the parent's space
    // (ADR-0002), so moving by 10 moves 10 in that same space. A world-space move would need
    // the inverse of the parent's matrix and would quietly disagree with the number the
    // Inspector shows for the very same object.
    {
        type: 'transform.translate',
        label: 'Translate',
        // ITS OWN FAMILY, BECAUSE OF THE QUESTION A BEGINNER ASKS. "I want to move my
        // object — where do I look?" is not answered by `Properties`, which is where you
        // look to READ one; and `Rotate` and `Scale` will be looking for the same shelf
        // (ADR-0045 §3). It keeps the property HUE — it is a different family, not a
        // different idea, and an eighth colour would be the carnival the palette avoids.
        category: 'Transform',
        keywords: ['move', 'translate', 'position', 'nudge', 'offset', 'walk', 'shift', 'x', 'y'],
        tooltip: 'Moves an Object, relative to where it already is',
        params: { ...targetParam },
        inputs: [
            flow('in'),
            data('object', OBJECT_TYPE, 'Object'),
            data('x', PropertyType.NUMBER, 'X', 0),
            data('y', PropertyType.NUMBER, 'Y', 0)
        ],
        outputs: [flow('out')],
        execute: io => {
            // A TARGET WITH NO TRANSFORM IS A STATE OF THE SCENE, NOT A FAULT (ADR-0034 §3.4):
            // an Object that carries no Transform has no position to move, and a graph asking
            // it to move is not an authoring error the way a deleted property is. It does
            // nothing, says nothing, and the next node still runs.
            const transform = targetObject(io)?.getComponent?.('Transform') ?? null;
            if (transform) {
                transform.x += io.input('x') ?? 0;
                transform.y += io.input('y') ?? 0;
            }
            return 'out';
        }
    },

    // ROTATE AND SCALE COMPLETE THE FAMILY, and the family is why they are here at all. A
    // shelf holding one node is a category a creator learns nothing from; `Translate` alone
    // also said, wrongly, that moving was the one thing the engine had an opinion about.
    // Both are RELATIVE, like `Translate` and for the same reason: the absolute form is
    // `Set Property`, which already exists and reads correctly (ADR-0045 §11).

    {
        type: 'transform.rotate',
        label: 'Rotate',
        category: 'Transform',
        keywords: ['turn', 'spin', 'rotation', 'angle', 'degrees', 'orient'],
        tooltip: 'Turns an Object, relative to the way it is already facing',
        params: { ...targetParam },
        inputs: [
            flow('in'),
            data('object', OBJECT_TYPE, 'Object'),
            // THE PORT IS NAMED FOR ITS UNIT, WHICH IS THE WHOLE ANSWER TO A REAL TRAP.
            // `Transform.rotationX` is stored in radians (components/transform.js) and the
            // Inspector shows it in degrees, so a port called `Angle` would be a question
            // with two answers and no way to tell which one this node wants. Calling it
            // `Degrees` costs one word and removes the question — the same technique
            // `Pressed` / `Released` / `Is Down` already use (ADR-0041 §3).
            //
            // WHY DEGREES AND NOT RADIANS. Degrees are what a creator reads on this very
            // property one panel away, and 90 is a quarter turn to everyone. The conversion
            // lives in this node and nowhere else: the Core still STORES radians, so nothing
            // about the property model moves. `Get Property > Rotation` still answers
            // radians, which is a seam this catalogue does not close today — closing it
            // means ports declaring a unit and the Editor converting at the port, and that
            // is a decision worth its own ADR rather than a side effect of adding a node.
            data('degrees', PropertyType.NUMBER, 'Degrees', 0,
                null, 'How far to turn, in degrees. 90 is a quarter turn clockwise')
        ],
        outputs: [flow('out')],
        execute: io => {
            // A TARGET WITH NO TRANSFORM IS A STATE OF THE SCENE, NOT A FAULT (ADR-0034
            // §3.4), exactly as in `Translate`.
            const transform = targetObject(io)?.getComponent?.('Transform') ?? null;
            if (transform) transform.rotationX += (io.input('degrees') ?? 0) * Math.PI / 180;
            return 'out';
        }
    },

    {
        type: 'transform.scale',
        label: 'Scale',
        category: 'Transform',
        keywords: ['size', 'grow', 'shrink', 'bigger', 'smaller', 'zoom', 'stretch'],
        tooltip: 'Grows or shrinks an Object, relative to the size it already is',
        params: { ...targetParam },
        inputs: [
            flow('in'),
            data('object', OBJECT_TYPE, 'Object'),
            // ONE IS THE IDENTITY, AND THAT IS WHY IT IS THE DEFAULT. Scaling MULTIPLIES —
            // it is the only reading of "scale" that composes — so a fresh card that did
            // nothing has to read `1`, not `0`. A creator seeing `X 1 Y 1` also reads the
            // relative meaning off the card without being told it.
            data('x', PropertyType.NUMBER, 'X', 1, null, 'Multiplies the horizontal scale'),
            data('y', PropertyType.NUMBER, 'Y', 1, null, 'Multiplies the vertical scale')
        ],
        outputs: [flow('out')],
        execute: io => {
            const transform = targetObject(io)?.getComponent?.('Transform') ?? null;
            if (transform) {
                transform.scaleX *= io.input('x') ?? 1;
                transform.scaleY *= io.input('y') ?? 1;
            }
            return 'out';
        }
    },

    // THE ABSOLUTE ONE, AND IT EARNS ITS PLACE BY BEING TWO NODES OTHERWISE. Putting an
    // object somewhere — a spawn point, a snap, a reset — is one intention and cost a
    // `Set Property > X` and a `Set Property > Y`, which is two trips through the property
    // picker to say one thing. It sits beside `Translate` because "where is it" and "how far
    // does it move" are the same shelf of the same question (ADR-0045 §11).
    {
        type: 'transform.setPosition',
        label: 'Set Position',
        category: 'Transform',
        keywords: ['position', 'place', 'teleport', 'move to', 'put', 'snap', 'x', 'y'],
        tooltip: 'Puts an Object at a position, whatever it was before',
        params: { ...targetParam },
        inputs: [
            flow('in'),
            data('object', OBJECT_TYPE, 'Object'),
            // LOCAL, LIKE THE TRANSFORM IT WRITES (ADR-0002) and like `Translate` above:
            // this is the number the Inspector shows for the same object, not a world
            // position that would quietly disagree with it.
            data('x', PropertyType.NUMBER, 'X', 0),
            data('y', PropertyType.NUMBER, 'Y', 0)
        ],
        outputs: [flow('out')],
        execute: io => {
            const transform = targetObject(io)?.getComponent?.('Transform') ?? null;
            if (transform) {
                transform.x = io.input('x') ?? 0;
                transform.y = io.input('y') ?? 0;
            }
            return 'out';
        }
    },

    // --- what the simulation knows about its own clock ----------------------------------

    {
        type: 'time.delta',
        label: 'Delta Time',
        category: 'Time',
        keywords: ['dt', 'delta', 'frame', 'step', 'seconds', 'per second', 'speed', 'smooth'],
        // THE NODE THAT MAKES A MOVEMENT FRAME-RATE INDEPENDENT, and until it existed the
        // only way to reach `deltaTime` was to wire it off an `On Update` card — so a graph
        // that moved something from an `On Key ▸ Down` had no honest way to scale the step,
        // and a creator wrote `Translate X 5`, which is five pixels per FRAME.
        //
        // IT READS THE STEP AND NOTHING ELSE. Not a wall clock, not a frame counter: the
        // fixed simulation step, the same on a server and on every client (ADR-0011).
        outputs: [data('seconds', PropertyType.NUMBER, 'Seconds')],
        evaluate: io => ({ seconds: io.ctx?.deltaTime ?? 0 }),
        tooltip: 'How long one step of the game lasts, in seconds'
    },

    {
        type: 'time.now',
        label: 'Time',
        category: 'Time',
        keywords: ['elapsed', 'since', 'clock', 'seconds', 'age', 'timer'],
        // SIMULATED TIME, NEVER THE MACHINE'S. `Clock.time` advances in whole fixed steps
        // and is reset by the transport, so two clients that ran the same steps read the
        // same number — which a `Date.now()` in disguise could never promise.
        outputs: [data('seconds', PropertyType.NUMBER, 'Seconds')],
        evaluate: io => ({ seconds: io.ctx?.time ?? 0 }),
        tooltip: 'How long this game has been running, in seconds'
    },

    {
        type: 'scene.self',
        label: 'Self',
        category: 'Object',
        keywords: ['this', 'me', 'owner', 'object'],
        outputs: [data('object', OBJECT_TYPE, 'Object')],
        evaluate: io => ({ object: io.self ?? null }),
        // STILL WORTH A NODE, THOUGH THE PROPERTY NODES NO LONGER NEED ONE. Their Object
        // picker reads `Self` by default, so reading your own rotation costs no node at all
        // — but `Self` still has to be passable to everything else a graph does with an
        // Object: its parent, whether it is still there, another Component's socket.
        tooltip: 'The Object this Component is attached to'
    },

    {
        type: 'reference.object',
        label: 'Get Object',
        category: 'Object',
        keywords: ['object', 'reference', 'target', 'player', 'entity', 'get'],
        params: {
            object: {
                type: PropertyType.STRING,
                default: null,
                label: 'Object',
                reference: OBJECT_SOCKET_REFERENCE,
                // NO FALLBACK, SO NO `Self` \u2014 and it declares that rather than inheriting a
                // word meant for another param. With nothing named this node answers null;
                // reading `Self` there described a node that already exists (`Self`) and not
                // this one, so a creator who dropped no Object saw a card that looked
                // configured and handed out nothing.
                tooltip: 'Which of this Component\u2019s Objects this node hands on. '
                    + 'Drag an Object from the Hierarchy onto the canvas to declare one'
            }
        },
        outputs: [data('object', OBJECT_TYPE, 'Object')],
        evaluate: io => {
            const socket = (io.properties ?? []).find(property => property.id === io.param('object'));
            return {
                object: socket ? portValueOf(socket, io.component?.[socket.name], io.ctx?.scene) : null
            };
        },
        tooltip: 'Hands on one of the Objects this Component was given'
    },

    {
        type: 'scene.parent',
        label: 'Parent',
        category: 'Object',
        keywords: ['above', 'hierarchy', 'owner', 'object'],
        inputs: [data('object', OBJECT_TYPE)],
        outputs: [data('parent', OBJECT_TYPE)],
        // A ROOT HAS NO PARENT, AND THAT IS AN ANSWER. An unconnected input is null too
        // (ADR-0034 §3.2), so both cases reach the same place and neither is a failure: what
        // only the running scene can answer is not a fault when it answers nothing (§3.4).
        evaluate: io => ({ parent: io.input('object')?.parent ?? null }),
        tooltip: 'The Object above this one in the hierarchy, or nothing'
    },

    {
        type: 'scene.findByTag',
        label: 'Find By Tag',
        category: 'Object',
        keywords: ['search', 'lookup', 'find', 'tag', 'object'],
        // THE EMPTY BOX SAYS SO, because what it means is not what a creator would guess.
        // An empty tag finds NOTHING rather than anything, for the reason stated below the
        // evaluator, and a blank field that reads as "not filled in yet" would hide it.
        inputs: [data('tag', PropertyType.STRING, 'Tag', '', 'None')],
        outputs: [data('object', OBJECT_TYPE)],
        // THE FIRST IN CANONICAL ORDER, which is what `findByTag` now answers in: an order
        // that is a function of the scene's state rather than of the order its objects
        // happened to join (ADR-0034 §3.1). Reading insertion order would make one graph
        // find a different object on two machines holding the very same scene.
        //
        // AN EMPTY TAG FINDS NOTHING, deliberately. `Object.tag` is an empty string by
        // default, so matching on one would answer with the first object of the scene,
        // whichever it happens to be — a silent wrong answer rather than an absent one.
        evaluate: io => {
            const tag = io.input('tag');
            if (typeof tag !== 'string' || tag === '') return { object: null };
            return { object: io.ctx?.scene?.findByTag(tag)[0] ?? null };
        },
        tooltip: 'The first Object carrying this tag, in hierarchy order'
    },

    {
        type: 'scene.onCollision',
        label: 'On Collision',
        category: 'Events',
        keywords: ['hit', 'touch', 'overlap', 'contact', 'bump', 'trigger', 'damage',
            'enter', 'stay', 'exit', 'collide'],
        event: 'update',
        // THREE MOMENTS, THREE OUTPUTS, ONE CARD — the shape `On Key` already has, and for
        // the same reason: a creator has to tell "it just hit" from "it is still touching"
        // before their first damage tick works, and three near-identical cards is the
        // problem one card does not have (ADR-0046 §6).
        //
        // `Enter` AND `Stay` ARE DISJOINT (ADR-0059 §5). The step a pair starts touching
        // fires `Enter` and nothing else; every step after fires `Stay`. Firing both on the
        // first step would make "damage once" and "damage while touching" the same wire, and
        // a creator would have to subtract one from the other.
        outputs: [
            flow('enter', 'Enter', 'The moment they start touching — runs once per contact'),
            flow('stay', 'Stay', 'Runs on every step AFTER the first, while they still touch'),
            flow('exit', 'Exit', 'The moment they stop touching'),
            data('other', OBJECT_TYPE, 'Other')
        ],
        // ONE FIRING PER COLLISION, NOT ONE PER STEP (ADR-0059 §5.1). Touching two enemies at
        // once is two events with two different `Other`s, which a single firing could not
        // carry — so the node answers a LIST of firings and the interpreter runs each with
        // its own pushed value.
        //
        // IT READS THE STEP'S SNAPSHOT AND MEASURES NOTHING. The transitions were decided
        // before any graph ran, so two graphs reacting to one hit cannot disagree about it,
        // and a `Destroy` in the first cannot delete the second's event (ADR-0059 §4).
        execute: io => (io.ctx?.collisions?.transitions?.(io.self) ?? [])
            .map(({ other, phase }) => ({ next: phase, values: { other } })),
        tooltip: 'Runs when this Object starts touching another, while it does, and when it stops'
    },

    {
        type: 'object.isOverlapping',
        label: 'Is Overlapping',
        category: 'Object',
        keywords: ['touching', 'collide', 'hit', 'overlap', 'inside', 'contact', 'check'],
        inputs: [data('a', OBJECT_TYPE, 'A'), data('b', OBJECT_TYPE, 'B')],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        // THE SAME SNAPSHOT `On Collision` READS, asked as a question instead of waited for
        // (ADR-0059 §6). Measuring geometry here would be a second opinion about what
        // touching means, and it would answer a different question from the event firing
        // beside it in the same step.
        //
        // NOTHING TO ASK ABOUT IS `false`: an Object with no collider, one that has been
        // destroyed, an empty port. All three are states of the running game rather than
        // faults (ADR-0034 §3.4).
        evaluate: io => ({
            result: io.ctx?.collisions?.overlapping?.(io.input('a'), io.input('b')) === true
        }),
        tooltip: 'Whether two Objects are touching right now'
    },

    {
        type: 'object.isValid',
        label: 'Is Valid',
        category: 'Object',
        keywords: ['exists', 'null', 'empty', 'check', 'object'],
        inputs: [data('object', OBJECT_TYPE)],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        // WHAT A CREATOR HAS TO DEFEND THEMSELVES WITH. A target that is gone resolves to
        // nothing rather than failing (ADR-0034 §3.4), so a graph needs a way to ASK —
        // without it, a dead reference is indistinguishable from a graph that never worked.
        //
        // AND IT ASKS THE SCENE, NOT THE WIRE (ADR-0056 §5). "Is there a handle here" and
        // "is that Object still in the scene" were the same question for as long as the only
        // thing that could remove an object was the Editor, between two frames. `Destroy`
        // makes them different: a handle held by the flow that destroyed its target is not
        // null, and answering `true` for it would make this node say the opposite of what it
        // is asked at the exact moment it is asked. With no scene in hand — a headless call
        // with nothing to ask — a handle still reads as valid, which is the honest answer
        // rather than a guess at absence.
        evaluate: io => {
            const object = io.input('object') ?? null;
            if (object === null) return { result: false };

            const scene = io.ctx?.scene ?? null;
            return { result: typeof scene?.has === 'function' ? scene.has(object) : true };
        },
        tooltip: 'Whether there is an Object here at all'
    },

    // --- creating and destroying an Object -----------------------------------------------
    //
    // A GRAPH CHANGES THE SHAPE OF THE SCENE, AND IT DOES IT THROUGH THE SCENE'S OWN
    // PRIMITIVES. ADR-0034 invariant 5 says a node produces no Operation and strikes no
    // identity, and both hold here: `duplicateObject()` and `Scene.remove()` write straight
    // to the scene the way a script's `addChild()` does — a Change, an event, no Operation
    // and nothing to replicate back (ADR-0019). A spawn is a simulation OUTPUT, not an
    // authored intent, which is the same reading ADR-0003 gives a graph's property write.
    //
    // AND THE NODE IS HANDED A HANDLE, NEVER AN IDENTITY. Both take their Object the way
    // every other node in this family takes one — a wire, or a socket this `.px` declares —
    // so nothing belonging to a scene enters the payload, and invariant 1 is untouched.

    {
        type: 'scene.spawn',
        label: 'Spawn',
        category: 'Object',
        keywords: ['create', 'instantiate', 'clone', 'copy', 'duplicate', 'new', 'bullet',
            'enemy', 'particle', 'add'],
        // WHAT IS INSTANTIATED HERE IS AN OBJECT OF THE SCENE, AND IT STAYS THAT WAY. A live
        // Object already describes an instance completely — its components, its values, its
        // children — so the model is an Object and no second description of what an Object is
        // has to be invented (ADR-0056 §2).
        //
        // THE OTHER KIND OF MODEL IS `Spawn Prefab`, AND IT IS A SEPARATE NODE (ADR-0061
        // §10). A prefab is a `ResourceId` and an Object is a handle; one port holding both
        // would have to be typed `any` and then GUESS which it had been given. What made a
        // prefab impossible in the first place — a Resource is resolved through asynchronous
        // storage a step may not wait for — is answered by resolving them BEFORE the
        // simulation rather than by making this node asynchronous (ADR-0061 §4).
        tooltip: 'Creates a copy of an Object in the scene, beside the one it copies',
        params: { ...modelParam },
        inputs: [
            flow('in'),
            data('object', OBJECT_TYPE, 'Model', null, null,
                'The Object to copy. It stays where it is; the copy is what is new')
        ],
        // THE INSTANCE COMES OUT, because a spawn a creator cannot then point at is a spawn
        // they cannot place, colour or aim. It is the one thing only this node can answer,
        // and it costs no new vocabulary: an `object` port, like every other (ADR-0056 §4).
        //
        // WHAT IT DELIBERATELY HAS NO PORT FOR IS A POSITION. `Set Position` already says
        // "put this Object here" and says it correctly (ADR-0045 §11.2); an X and a Y here
        // would be that node a second time, and worse — a port's default is a VALUE, so an
        // untouched Spawn would read `X 0  Y 0` and teleport every copy to the origin
        // instead of leaving it where its model stands.
        outputs: [flow('out'), data('spawned', OBJECT_TYPE, 'Spawned')],
        execute: io => {
            // NO MODEL, NO COPY, AND NO COMPLAINT (ADR-0034 §3.4). A socket nobody filled in
            // and a `Find By Tag` that found nobody are both states of the running game, not
            // authoring errors — the flow continues and the output reads as nothing, which
            // is exactly what a creator's `Is Valid` is there to catch.
            const model = targetObject(io, null);
            const scene = io.ctx?.scene ?? null;

            // THE IDENTITIES COME FROM THE SIMULATION, NOT FROM THE MACHINE (ADR-0057 §3).
            // A spawn is a consequence of a step, so a server and every client running that
            // step must agree on what was created — and they can only agree on an identity
            // they both derive from the seed they share. Absent — a headless call with no
            // Runtime — `duplicateObject()` falls back to the ordinary generator.
            const spawn = () => duplicateObject(scene, model, { createId: io.ctx?.createObjectId });

            return { next: 'out', values: { spawned: model && scene ? spawn() : null } };
        }
    },

    {
        // TWO NODES, BECAUSE THERE ARE TWO KINDS OF MODEL AND NO HONEST WAY TO MAKE ONE PORT
        // HOLD BOTH (ADR-0061 §10). A live Object travels a wire as a HANDLE; a prefab is a
        // `ResourceId`, which is a string. A single `Model` port would have to be typed `any`
        // and the node would then have to GUESS, at run time, whether the string it was handed
        // names an Object of this scene or a Resource of this project — the one thing this
        // repository refuses to make a Runtime do (ADR-0034 §3.5, ADR-0039).
        //
        // AND IT COSTS NO MIGRATION. `Spawn` is untouched: every graph written before this
        // goes on meaning exactly what it meant, and a creator who never makes a prefab never
        // meets this node. A union socket, or a `Spawn` that changed shape, would have bought
        // one row in the menu for a migration of every existing `.px`.
        //
        // THE TWO ARE THE SAME MACHINERY (core/instantiate.js): fresh identities for the whole
        // subtree, internal `objectref`s remapped through the same table, the same
        // `restoreSubtree()`. What differs is where the description comes from.
        type: 'scene.spawnPrefab',
        label: 'Spawn Prefab',
        category: 'Object',
        keywords: ['create', 'instantiate', 'prefab', 'model', 'new', 'bullet', 'enemy',
            'spawn', 'template', 'resource', 'add'],
        tooltip: 'Creates an instance of a Prefab, without the Prefab existing in the scene',
        params: {
            prefab: {
                type: PropertyType.RESOURCE,
                kind: 'prefab',
                default: null,
                label: 'Prefab',
                tooltip: 'The model to build from, by identity'
            }
        },
        inputs: [
            flow('in'),
            data('prefab', PropertyType.RESOURCE, 'Prefab', null, null,
                'A Prefab, when the graph works out which one')
        ],
        // THE INSTANCE COMES OUT, exactly as it does from `Spawn`, so `Set Position`,
        // `Set Property` and `Destroy` all take it immediately (ADR-0056 §4). That is also
        // why there is no X and no Y here: `Set Position` already says "put this Object
        // here", and a port's default is a VALUE — an untouched `Spawn Prefab` would read
        // `X 0  Y 0` and teleport every instance to the origin.
        outputs: [flow('out'), data('spawned', OBJECT_TYPE, 'Spawned')],
        execute: io => {
            const id = io.wired('prefab') ? io.input('prefab') : io.param('prefab') ?? null;
            const scene = io.ctx?.scene ?? null;
            // RESOLVED FROM A MAP THAT IS ALREADY IN MEMORY (ADR-0061 §4). No storage, no
            // await, no promise: the Project layer read every prefab before the first step
            // and handed the result over on the context, beside the input and the clock.
            const definition = io.ctx?.prefabs?.get?.(id) ?? null;

            // A PREFAB NOBODY RESOLVED IS NOT A FAULT. An empty picker, a resource that was
            // deleted, a headless call with no registry: all three are states of the running
            // game, so the flow continues and the output reads as nothing — which is exactly
            // what a creator's `Is Valid` is there to catch (ADR-0034 §3.4).
            const spawned = definition && scene
                ? instantiatePrefab(scene, definition, { createId: io.ctx?.createObjectId })
                : null;

            return { next: 'out', values: { spawned } };
        }
    },

    {
        type: 'scene.destroy',
        label: 'Destroy',
        category: 'Object',
        keywords: ['remove', 'delete', 'kill', 'despawn', 'die', 'disappear'],
        tooltip: 'Removes an Object from the scene, along with everything under it',
        // `Self` IS THE DEFAULT, AND IT IS THE COMMON CASE. "The enemy dies when it is hit"
        // is written on the enemy, so the Object being removed is the one the graph is
        // running as — the same reading `Translate` and `Set Position` already give an empty
        // picker (ADR-0040 §3).
        params: { ...targetParam },
        inputs: [flow('in'), data('object', OBJECT_TYPE, 'Object')],
        outputs: [flow('out')],
        execute: io => {
            // A TARGET THAT IS ALREADY GONE IS NOT A FAULT. `Scene.remove()` answers `false`
            // for an Object it does not hold and for nothing at all, so two Destroys on one
            // enemy is a state of the game rather than an error to report (ADR-0034 §3.4).
            //
            // THE FLOW CONTINUES, INCLUDING AFTER DESTROYING `Self`. A node that swallowed
            // the rest of the graph would be a second kind of control flow, invisible on the
            // canvas; what happens instead is what already happens to any dead reference —
            // the nodes after it act on an Object the scene no longer holds, and do nothing
            // (ADR-0056 §5).
            io.ctx?.scene?.remove?.(targetObject(io));
            return 'out';
        }
    },

    // --- the properties of ANOTHER Object's Component ------------------------------------
    //
    // THE SAME SEMANTICS AS `Get Property` AND `Set Property`, AIMED SOMEWHERE ELSE
    // (ADR-0034 §3.3). A property is named by identity, a write is a plain write, and
    // nothing here produces an Operation. What is added is an Object port saying WHOSE
    // component to look at, and a param saying WHICH component — a type, which is of project
    // scope, so nothing belonging to a scene enters the graph.
    //
    // THE TWO PARAMS SIT ON ONE NODE RATHER THAN ON TWO. A `Get Component` handing a handle
    // to a `Get Property` would not know what TYPE of component it was holding: its output
    // port would fall back to `any` and its property picker would have nothing to offer.
    // Carrying both, the node resolves the declaration itself, so the port is typed exactly
    // and a bad wire is refused at the moment of the gesture rather than at run time.

    // --- sound ---------------------------------------------------------------------------
    //
    // ONE NODE, BECAUSE THERE IS ONLY ONE THING A GRAPH CAN SAY ABOUT A SOUND THAT A
    // PROPERTY CANNOT (ADR-0060 §6). A gunshot is a MOMENT: it has no state, nothing can be
    // changed about it afterwards, and it is fired from a flow. A soundtrack is a STATE — on
    // or off, at a volume a fade changes — and a state is a Component property, written with
    // the `Set Property` a creator already knows. So `AudioSource.playing` is the whole of
    // "play" and "stop" for a sustained sound, and this node is the whole of a one-shot.
    //
    // A `Stop Sound` WOULD HAVE NOTHING TO POINT AT. A one-shot has no handle in the graph —
    // giving it one would put a value that cannot be serialized on a wire — and a sustained
    // sound stops with `playing = false`. A node for it would be a second way to write a
    // value, and the two would disagree the first time one was used inside a `Delay`.
    //
    // NOTHING IS RESOLVED HERE. The clip is a ResourceId and the Core never reaches storage
    // (ADR-0020): the output the Runtime was built with turns it into something a speaker
    // can use, the same way `Sprite.source` is resolved by whoever draws.

    {
        type: 'audio.play',
        label: 'Play Sound',
        category: 'Audio',
        keywords: ['sound', 'audio', 'sfx', 'effect', 'noise', 'shoot', 'hit', 'explosion',
            'bang', 'music', 'clip', 'sample', 'one shot'],
        tooltip: 'Plays a sound once. For music that keeps going, use an Audio Source',
        params: {
            clip: {
                type: PropertyType.RESOURCE,
                kind: 'asset',
                mime: 'audio/',
                default: null,
                label: 'Clip',
                tooltip: 'The sound to play, by identity'
            }
        },
        // A PICKER AND A PORT, THE SAME PAIR `Spawn` AND `Translate` OFFER (ADR-0039 §0.1).
        // A sound a creator CHOOSES belongs on the card; a sound the graph COMPUTES — one of
        // three footsteps, a note picked by pitch — can only arrive on a wire. There is no
        // mode to set: connect something and the connection is it, leave it empty and the
        // picker is.
        inputs: [
            flow('in'),
            data('clip', PropertyType.RESOURCE, 'Clip', null, null,
                'A sound, when the graph works out which one'),
            data('volume', PropertyType.NUMBER, 'Volume', 1, null,
                'From 0 to 1. Anything outside is brought back inside')
        ],
        outputs: [flow('out')],
        execute: io => {
            // WIRED BEATS PICKED, AND "WIRED" IS A STRUCTURAL QUESTION (ADR-0039 §0.3). A
            // `Get Property` that answered null is not the same as an unconnected port, and
            // falling back to the picker for the first would play the wrong sound silently.
            const clip = io.wired('clip') ? io.input('clip') : io.param('clip') ?? null;

            // NO CLIP, NO SOUND, AND NO COMPLAINT. An empty picker and a lookup that found
            // nothing are states of the running game, not authoring errors (ADR-0034 §3.4).
            // NO OUTPUT EITHER, on a server: the flow continues and the step is identical,
            // which is what makes sound an output of the simulation and never an input.
            if (clip) io.ctx?.audio?.play?.(clip, { volume: number(io.input('volume')) });
            return 'out';
        }
    },

    // --- flow control ----------------------------------------------------------------

    {
        type: 'flow.branch',
        label: 'Branch',
        category: 'Flow',
        keywords: ['if', 'else', 'condition', 'test'],
        inputs: [flow('in'), data('condition', PropertyType.BOOLEAN, 'Condition', false)],
        outputs: [flow('true', 'True'), flow('false', 'False')],
        execute: io => (io.input('condition') ? 'true' : 'false')
    },

    {
        type: 'flow.delay',
        label: 'Delay',
        category: 'Flow',
        keywords: ['wait', 'pause', 'timer', 'after', 'seconds', 'hold', 'later', 'cooldown'],
        tooltip: 'Waits, then carries on down Then',
        inputs: [
            flow('in'),
            // ONE SECOND, BECAUSE A CARD NOBODY HAS TOUCHED HAS TO DO SOMETHING A CREATOR CAN
            // SEE. A default of `0` would read as a Delay and behave as a wire.
            data('duration', PropertyType.NUMBER, 'Duration', 1, null, 'How long to wait, in seconds')
        ],
        outputs: [flow('then', 'Then')],
        // IT SAYS WHEN, NOT WHETHER (ADR-0058 §3). The answer names the same flow port every
        // other node names; what it adds is `wait`, and the interpreter parks the rest of this
        // execution rather than walking into it. Nothing here holds a timer, mutates the node
        // or touches the component: a node stays a pure reading of its inputs, and the state
        // that outlives the step belongs to the instance running the graph.
        //
        // THE DURATION IS READ ONCE, HERE, AND CAPTURED. Re-reading it while waiting would
        // make a `Delay` fed by a property change length halfway through — a wait whose end
        // moves is not a wait, and nothing on the canvas would say so.
        //
        // A DURATION THAT IS NOT A POSITIVE FINITE NUMBER IS NO WAIT AT ALL, and that is the
        // catalogue's own numeric convention rather than a rule invented for this node:
        // `number()` turns `NaN`, `Infinity` and anything unreadable into `0` everywhere else,
        // and `0` seconds of waiting is the flow carrying straight on. It also keeps this node
        // bounded by the ordinary budget — a `Delay(0)` inside a loop is an ordinary loop,
        // reported like any other, rather than a way to run for ever one step at a time.
        execute: io => ({ wait: number(io.input('duration')), next: 'then' })
    },

    {
        type: 'flow.waitUntil',
        label: 'Wait Until',
        category: 'Flow',
        keywords: ['wait', 'until', 'when', 'hold', 'pause', 'condition', 'gate'],
        tooltip: 'Holds here until something becomes true, then carries on',
        inputs: [flow('in'), data('condition', PropertyType.BOOLEAN, 'Condition', false)],
        outputs: [flow('then', 'Then')],
        // THE OPPOSITE READING OF A `Delay`, AND THE ONE WORD THAT SAYS SO. `Delay` captures
        // its duration on the way in, because a wait whose end moves is not a wait; this one
        // must NOT capture anything, because what it is waiting for is precisely something
        // that changes. `again` parks it at itself, so every step re-runs this line and reads
        // the condition afresh — no stored value, no polling, no timer (ADR-0058 §5).
        //
        // TRUE ON ARRIVAL MEANS NO WAIT AT ALL, which is the same shape `Delay(0)` has: a
        // condition that already holds is not something to wait for.
        execute: io => (io.input('condition') ? 'then' : { again: true })
    },

    {
        type: 'flow.every',
        label: 'Every',
        category: 'Flow',
        keywords: ['timer', 'repeat', 'tick', 'interval', 'loop', 'pulse', 'seconds', 'again'],
        tooltip: 'Sends a pulse down Then, over and over, on a fixed interval',
        inputs: [
            flow('in'),
            data('interval', PropertyType.NUMBER, 'Interval', 1, null,
                'How long between pulses, in seconds')
        ],
        outputs: [flow('then', 'Then')],
        // IT IS A FLOW NODE AND NOT AN `On Timer` EVENT, and the reason is the event contract
        // rather than a preference. An entry node is run by the interpreter on EVERY update
        // (`runEvent`), so a repeating event would have to remember when it last fired — and
        // the only place to keep that is per-node-per-instance state, a second kind of state
        // ADR-0058 deliberately does not have. `On Start → Every` says the same sentence with
        // the pieces that already exist, and reads as one too (ADR-0058 §5.2).
        //
        // TWO PASSES, ONE NODE. Arriving down the wire starts the clock and fires nothing —
        // "every second" means the first pulse comes after a second, not at once. Coming back
        // fires `Then` and starts the clock again, and the interpreter carries the overshoot
        // so the cadence does not drift.
        //
        // AN INTERVAL OF ZERO IS EVERY STEP, not a frozen frame: `again: 0` is parked, and a
        // parked continuation is never due in the step that parked it. So the worst a bad
        // interval can do is what `On Update` already does, which is the bound this node needs
        // rather than an error message.
        execute: io => {
            const interval = Math.max(number(io.input('interval')), 0);
            return io.resumed ? { next: 'then', again: interval } : { again: interval };
        }
    },

    {
        type: 'flow.tween',
        label: 'Tween Number',
        category: 'Flow',
        keywords: ['animate', 'interpolate', 'lerp', 'ease', 'over time', 'fade', 'slide',
            'smooth', 'transition', 'grow'],
        tooltip: 'Carries a number from one value to another, over a length of time',
        inputs: [
            flow('in'),
            data('from', PropertyType.NUMBER, 'From', 0),
            data('to', PropertyType.NUMBER, 'To', 1),
            data('duration', PropertyType.NUMBER, 'Duration', 1, null,
                'How long the whole journey takes, in seconds')
        ],
        // TWO MOMENTS AND A VALUE, ON ONE CARD. `Update` is every step of the journey and
        // `Done` is its end — disjoint, like `Enter` and `Stay`, so a creator wires the
        // movement to one and what follows it to the other without a Branch. `Value` is
        // pushed rather than pulled, for the reason every flow node's output is: reading it
        // must not be able to advance the animation (ADR-0056 §4).
        outputs: [flow('update', 'Update'), flow('done', 'Done'), data('value', PropertyType.NUMBER, 'Value')],
        // WHAT IT KEEPS, AND WHY IT HAS TO (ADR-0058 §6.3). How far along it is belongs to
        // THIS journey: two presses of a button start two tweens through one card, and a
        // number stored on the node would make the second overwrite the first. It rides the
        // continuation, so the two never meet.
        //
        // FROM, TO AND DURATION ARE CAPTURED ON THE WAY IN, like `Delay`'s duration and for
        // the same reason: a journey whose destination moves halfway is not a journey, and
        // nothing on the canvas would say the end had shifted.
        //
        // THE LAST STEP LANDS EXACTLY ON `To`, never on `To` minus a rounding error — a
        // tween that ends at 99.98 is a door that never quite closes. It is assigned, not
        // interpolated.
        execute: io => {
            const kept = io.kept;
            const from = kept ? kept.from : number(io.input('from'));
            const to = kept ? kept.to : number(io.input('to'));
            const span = kept ? kept.span : number(io.input('duration'));
            const elapsed = kept ? kept.elapsed + (io.ctx?.deltaTime ?? 0) : 0;

            // A JOURNEY OF NO LENGTH IS OVER WHERE IT STARTED, in this very step. It is the
            // same reading `Delay(0)` and `Every(0)` give a duration that is not one, and it
            // keeps this node inside the ordinary budget rather than giving it a way to run
            // one step at a time for ever.
            // A RELATIVE TOLERANCE, THE ONE `Clock.advance()` AND `resumeDue()` ALREADY USE.
            // Adding a step of 1/60 sixty times lands a few ulp SHORT of one second, so a
            // bare `>=` makes a one-second tween take one step longer than it says — the
            // same defect, met a third time, answered the same way.
            if (!(span > 0) || elapsed >= span - span * 1e-9) {
                return { next: ['update', 'done'], values: { value: to } };
            }

            return {
                next: 'update',
                values: { value: from + (to - from) * (elapsed / span) },
                again: 0,
                keep: { from, to, span, elapsed }
            };
        }
    },

    {
        type: 'flow.sequence',
        label: 'Sequence',
        category: 'Flow',
        keywords: ['then', 'order', 'chain'],
        inputs: [flow('in')],
        outputs: [flow('first', 'First'), flow('second', 'Second')],
        // Two flows, in the order they are declared. Determinism is not a property the
        // interpreter adds later: it is this list.
        execute: () => ['first', 'second']
    },

    // --- literals ---------------------------------------------------------------------
    //
    // A LITERAL WEARS ITS TYPE'S GLYPH, not the category's. ADR-0033 §4 already made these
    // three the one place where a node takes the COLOUR of what it holds rather than of the
    // family it belongs to — because for a literal, what it is IS its type. The drawing had
    // been left behind: all three showed the generic `Values` brackets, so a `Number` node
    // and a `Text` node were one picture in the picker, and neither matched the badge the
    // same type wears on a property. Declared per node, through the mechanism the catalogue
    // already has for it (`NodeDefinition.icon`, editor/ui/icons.js).

    {
        type: 'value.number',
        label: 'Number',
        category: 'Values',
        icon: 'type-number',
        keywords: ['float', 'int', 'literal', 'constant'],
        params: { value: { type: PropertyType.NUMBER, default: 0, label: 'Value' } },
        outputs: [data('value', PropertyType.NUMBER)],
        evaluate: io => ({ value: io.param('value') ?? 0 })
    },

    {
        type: 'value.boolean',
        label: 'Boolean',
        category: 'Values',
        icon: 'type-boolean',
        keywords: ['bool', 'true', 'false', 'flag', 'literal'],
        params: { value: { type: PropertyType.BOOLEAN, default: false, label: 'Value' } },
        outputs: [data('value', PropertyType.BOOLEAN)],
        evaluate: io => ({ value: Boolean(io.param('value')) })
    },

    {
        type: 'value.string',
        label: 'Text',
        category: 'Values',
        icon: 'type-text',
        keywords: ['string', 'literal', 'constant'],
        params: { value: { type: PropertyType.STRING, default: '', label: 'Value' } },
        outputs: [data('value', PropertyType.STRING)],
        evaluate: io => ({ value: globalThis.String(io.param('value') ?? '') })
    },

    {
        // A RESOURCE IS A LITERAL A `.px` MAY HOLD, and that is the whole argument for this
        // node. ADR-0034 forbids an ObjectId in a `.px` because an ObjectId belongs to ONE
        // SCENE and a `.px` serves many; a ResourceId belongs to the PROJECT, which is the
        // very scope a `.px` already has (ADR-0020). The two identities are not the same
        // kind of thing, and the rule that governs one was being applied to the other —
        // which is why dropping an image on a canvas was refused with "a resource is not a
        // node" while a `Text` node holding an arbitrary string was fine.
        //
        // WHAT IT UNLOCKS. `Sprite.source` is a `resource` property, so `Set Property On`
        // types its value port `resource` (portTypeOf) — and a creator can now swap a
        // sprite from a graph: pick up a powerup, set the texture. That was JavaScript-only
        // before, and no node produced a value the port could take.
        //
        // NOTHING RESOLVES IT HERE. The Core never reaches storage (ADR-0020): what travels
        // is the identity, and whoever draws or loads it does the resolving — exactly as
        // `Sprite.source` has always worked.
        type: 'value.resource',
        label: 'Resource',
        category: 'Values',
        icon: 'type-resource',
        keywords: ['asset', 'image', 'texture', 'sound', 'file', 'literal', 'reference'],
        params: {
            value: {
                type: PropertyType.RESOURCE,
                default: null,
                label: 'Resource',
                tooltip: 'The resource this node hands on, by identity'
            }
        },
        outputs: [data('value', PropertyType.RESOURCE)],
        evaluate: io => ({ value: io.param('value') ?? null }),
        tooltip: 'A resource of this project, as a value a property can take'
    },

    // --- text ----------------------------------------------------------------------------
    //
    // A GAME KNOWS NUMBERS AND SHOWS WORDS, AND THESE TWO NODES ARE THE WHOLE BRIDGE.
    // `TextRenderer.text` is an ordinary `string` property, so `Set Property` already writes
    // it; what no node could do was produce the string in the first place — `typesCompatible`
    // refuses a number on a text port, deliberately and correctly (ADR-0023: the type is what
    // a value MEANS), so a score had no way of reaching a label.
    //
    // TWO NODES, NOT A FORMATTER. `"Score: {0}"` with placeholders would be a small language
    // with its own syntax, its own errors and its own escape rules, and a creator would have
    // to learn it before their first label worked. Converting and joining are the two acts
    // that language would be made of, and they are already graph-shaped.

    {
        type: 'text.toText',
        label: 'To Text',
        category: 'Text',
        icon: 'type-text',
        keywords: ['string', 'convert', 'cast', 'number', 'boolean', 'stringify', 'show',
            'display', 'score', 'label', 'hud', 'print'],
        // ONE POLYMORPHIC PORT, AND THE TYPE SYSTEM ALREADY HAD IT. `ANY_TYPE` is the
        // absence of a constraint rather than a union of shapes (graph/nodes.js), so this
        // costs no new rule in `typesCompatible()` and no second kind of socket — which is
        // what a `Number To Text` plus a `Boolean To Text` plus a `Text To Text` would have
        // been: three nodes for one act, and a creator asked to know which of them their
        // wire needs.
        inputs: [data('value', ANY_TYPE, 'Value', null, null,
            'Anything a wire carries: a number, a true/false, a word')],
        outputs: [data('text', PropertyType.STRING, 'Text')],
        evaluate: io => ({ text: asText(io.input('value')) }),
        tooltip: 'Turns a value into text, so a Text Renderer can show it'
    },

    {
        type: 'text.join',
        label: 'Join Text',
        category: 'Text',
        icon: 'type-text',
        keywords: ['concat', 'concatenate', 'append', 'combine', 'plus', 'add', 'merge',
            'string', 'label', 'score', 'prefix', 'suffix'],
        // BOTH PORTS ARE TEXT, AND THAT IS ON PURPOSE. Accepting `any` here would make
        // `To Text` decorative — and would quietly re-admit the very conversion the type
        // system refuses on every other port, so a number would read as text in one place
        // and not in the next. The wire a creator has to draw is the statement that they
        // meant it (ADR-0054).
        inputs: [
            data('a', PropertyType.STRING, 'A', '', 'Score: '),
            data('b', PropertyType.STRING, 'B', '')
        ],
        outputs: [data('text', PropertyType.STRING, 'Text')],
        // TWO PORTS, NOT N. Three pieces is two `Join Text` nodes, which reads left to right
        // exactly as the sentence does; a variable port count would be the first node in the
        // catalogue whose SHAPE a creator has to configure before they can wire it.
        evaluate: io => ({ text: `${asText(io.input('a'))}${asText(io.input('b'))}` }),
        tooltip: 'Puts two pieces of text end to end'
    },

    // --- arithmetic --------------------------------------------------------------------

    arithmetic('math.add', 'Add', (a, b) => a + b),
    arithmetic('math.subtract', 'Subtract', (a, b) => a - b),
    arithmetic('math.multiply', 'Multiply', (a, b) => a * b),
    // DIVIDING BY ZERO YIELDS ZERO, and it is a decision rather than an oversight: an
    // Infinity or a NaN entering a Transform spreads silently through every frame after it,
    // and a creator has no way to see where it started. Zero is wrong in the same place and
    // stops there.
    arithmetic('math.divide', 'Divide', (a, b) => (b === 0 ? 0 : a / b)),
    // THE SAME REASONING AS DIVIDE, FOR THE SAME OPERATOR: `x % 0` is NaN, and a NaN
    // entering a Transform spreads silently through every frame after it.
    arithmetic('math.modulo', 'Modulo', (a, b) => (b === 0 ? 0 : a % b),
        ['remainder', 'rest', 'wrap', 'cycle', 'mod', '%']),
    arithmetic('math.min', 'Min', (a, b) => Math.min(a, b), ['smallest', 'lower', 'floor', 'least']),
    arithmetic('math.max', 'Max', (a, b) => Math.max(a, b), ['largest', 'higher', 'ceiling', 'greatest']),

    // TRIGONOMETRY, IN THE UNIT THE EDITOR SPEAKS. `Sin` and `Cos` are what an oscillation is
    // written with — a coin bobbing, a platform swinging, an enemy weaving — and a creator
    // who has typed `90` into a Rotation field expects to type `90` here (ADR-0049 §2). The
    // conversion lives in the node, exactly as it does in `Rotate`; the Core still thinks in
    // radians and nothing about the property model moves.
    unary('math.sin', 'Sin', degrees => Math.sin(degrees * Math.PI / 180),
        ['sine', 'wave', 'oscillate', 'trigonometry', 'circle'],
        'The sine of an angle, between -1 and 1 — how a wave is written', 'Degrees'),
    unary('math.cos', 'Cos', degrees => Math.cos(degrees * Math.PI / 180),
        ['cosine', 'wave', 'oscillate', 'trigonometry', 'circle'],
        'The cosine of an angle, between -1 and 1', 'Degrees'),

    // HOW FAR APART TWO OBJECTS ARE, and it takes Objects rather than four numbers because
    // that is the question a creator asks: "is the enemy close enough". Four coordinate ports
    // would make them assemble the question before they could ask it.
    {
        type: 'math.distance',
        label: 'Distance',
        category: 'Math',
        keywords: ['far', 'near', 'apart', 'between', 'range', 'proximity', 'length'],
        tooltip: 'How far apart two Objects are, in world units',
        inputs: [
            data('a', OBJECT_TYPE, 'From'),
            data('b', OBJECT_TYPE, 'To')
        ],
        outputs: [data('result', PropertyType.NUMBER, 'Distance')],
        // AN OBJECT WITH NO TRANSFORM IS A STATE OF THE SCENE, NOT A FAULT (ADR-0034 §3.4) —
        // the rule every Transform node already follows. It has no position, so there is no
        // distance to give and the answer is zero rather than an error.
        evaluate: io => {
            const from = io.input('a');
            const to = io.input('b');
            if (!from?.getComponent?.('Transform') || !to?.getComponent?.('Transform')) {
                return { result: 0 };
            }
            const here = worldPosition(from);
            const there = worldPosition(to);
            return { result: Math.hypot(there.x - here.x, there.y - here.y) };
        }
    },

    // --- aiming and moving, as pairs of numbers -------------------------------------------
    //
    // THERE IS NO VECTOR TYPE, AND THESE DO NOT INVENT ONE. ADR-0023 §2 removed it
    // deliberately and ADR-0043 restates why: `x` and `y` are two numbers in the Transform,
    // in the Inspector's paired row and on every existing node. A `Vector2` declared for five
    // nodes would be a second way to say a position, and the first thing a creator would ask
    // is which of the two the engine really uses. So a direction comes out as two ports, and
    // composes with everything that already takes two.

    {
        type: 'math.direction',
        label: 'Direction',
        category: 'Math',
        keywords: ['towards', 'aim', 'unit', 'heading', 'normalise', 'normalize', 'vector'],
        tooltip: 'Which way one Object lies from another, as a step of length 1',
        inputs: [data('a', OBJECT_TYPE, 'From'), data('b', OBJECT_TYPE, 'To')],
        outputs: [
            data('x', PropertyType.NUMBER, 'X'),
            data('y', PropertyType.NUMBER, 'Y')
        ],
        // THE TWIN OF `Distance`, READ FROM THE SAME TWO OBJECTS. Multiply these two by a
        // speed and a `Velocity` chases anything; that is the whole sentence, and it is two
        // nodes rather than eight.
        //
        // TWO OBJECTS IN THE SAME PLACE HAVE NO DIRECTION BETWEEN THEM, so the answer is
        // `0, 0` — a step of no length, which is what "it is already there" means and what
        // every consumer of these two numbers does the right thing with.
        evaluate: io => {
            const from = io.input('a');
            const to = io.input('b');
            if (!from?.getComponent?.('Transform') || !to?.getComponent?.('Transform')) {
                return { x: 0, y: 0 };
            }

            const here = worldPosition(from);
            const there = worldPosition(to);
            const length = Math.hypot(there.x - here.x, there.y - here.y);
            if (length === 0) return { x: 0, y: 0 };

            return { x: (there.x - here.x) / length, y: (there.y - here.y) / length };
        }
    },

    {
        type: 'math.length',
        label: 'Length',
        category: 'Math',
        keywords: ['magnitude', 'size', 'hypotenuse', 'speed', 'norm', 'distance'],
        tooltip: 'How long a pair of numbers is, taken as a step',
        inputs: [
            data('x', PropertyType.NUMBER, 'X', 0),
            data('y', PropertyType.NUMBER, 'Y', 0)
        ],
        outputs: [data('result', PropertyType.NUMBER, 'Result')],
        evaluate: io => ({ result: Math.hypot(number(io.input('x')), number(io.input('y'))) })
    },

    {
        type: 'math.normalize',
        label: 'Normalize',
        category: 'Math',
        keywords: ['unit', 'direction', 'one', 'scale', 'diagonal', 'speed'],
        // THE NODE THAT FIXES DIAGONAL MOVEMENT, which is the first bug every creator writes
        // and cannot see: two keys held at once give `1, 1`, a step of length 1.41, and the
        // player is half again as fast on the diagonal.
        tooltip: 'Shortens or lengthens a pair of numbers to a step of length 1',
        inputs: [
            data('x', PropertyType.NUMBER, 'X', 0),
            data('y', PropertyType.NUMBER, 'Y', 0)
        ],
        outputs: [
            data('x', PropertyType.NUMBER, 'X'),
            data('y', PropertyType.NUMBER, 'Y')
        ],
        evaluate: io => {
            const x = number(io.input('x'));
            const y = number(io.input('y'));
            const length = Math.hypot(x, y);
            // A STEP OF NO LENGTH HAS NO DIRECTION TO KEEP, so it stays where it is rather
            // than becoming a division by zero.
            return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
        }
    },

    {
        type: 'math.moveTowards',
        label: 'Move Towards',
        category: 'Math',
        keywords: ['approach', 'step', 'chase', 'follow', 'ease', 'close', 'reach'],
        // ONE NUMBER, LIKE EVERY OTHER NODE HERE. Called twice — once for X, once for Y — it
        // moves a point towards another without ever overshooting it, which is the behaviour
        // a `Lerp` does not give and a creator discovers by watching something jitter.
        tooltip: 'Steps a number towards another without ever passing it',
        inputs: [
            data('value', PropertyType.NUMBER, 'From', 0),
            data('target', PropertyType.NUMBER, 'To', 0),
            data('step', PropertyType.NUMBER, 'Max Step', 1,
                null, 'The furthest it may move this time')
        ],
        outputs: [data('result', PropertyType.NUMBER, 'Result')],
        evaluate: io => {
            const from = number(io.input('value'));
            const to = number(io.input('target'));
            const step = Math.abs(number(io.input('step')));
            const gap = to - from;
            return { result: Math.abs(gap) <= step ? to : from + Math.sign(gap) * step };
        }
    },

    {
        type: 'math.angle',
        label: 'Angle',
        category: 'Math',
        keywords: ['direction', 'heading', 'atan', 'rotation', 'degrees', 'face', 'look at'],
        // DEGREES, LIKE `Rotate` AND FOR THE SAME REASON (ADR-0045 §11.3): the Core stores
        // radians and the Inspector shows degrees, so a port named for the unit is a question
        // with one answer. Wire this into a `Set Property ▸ Rotation`… no — into a `Rotate`,
        // or through the Inspector's own degrees, and a thing faces what it is aimed at.
        tooltip: 'Which way a pair of numbers points, in degrees',
        inputs: [
            data('x', PropertyType.NUMBER, 'X', 0),
            data('y', PropertyType.NUMBER, 'Y', 0)
        ],
        outputs: [data('degrees', PropertyType.NUMBER, 'Degrees')],
        evaluate: io => ({
            degrees: Math.atan2(number(io.input('y')), number(io.input('x'))) * 180 / Math.PI
        })
    },

    // ONE NUMBER IN, ONE OUT. `arithmetic()` takes two and these take one, which is the
    // whole of the difference — so they are the same shape with one port fewer rather than
    // a second idea (ADR-0048 §4).
    unary('math.absolute', 'Absolute', value => Math.abs(value),
        ['abs', 'positive', 'magnitude', 'size', 'unsigned'],
        'The number without its sign'),
    unary('math.round', 'Round', value => Math.round(value),
        ['nearest', 'whole', 'integer', 'snap'],
        'The nearest whole number'),
    // THE TWO DIRECTIONS `Round` DOES NOT LET YOU CHOOSE. Snapping to a grid, counting whole
    // items and clamping to a tile all want one of them specifically, and writing either from
    // `Round` needs an offset a creator should not have to derive.
    unary('math.floor', 'Floor', value => Math.floor(value),
        ['down', 'lower', 'truncate', 'whole', 'integer'],
        'The whole number at or below this one'),
    unary('math.ceil', 'Ceil', value => Math.ceil(value),
        ['up', 'higher', 'ceiling', 'whole', 'integer'],
        'The whole number at or above this one'),

    // WHICH WAY, AND HOW FAR — the two readings of a number the other six do not give, and
    // both are one line through the helper the rest of this shelf already goes through.
    //
    // `Sign` ANSWERS -1, 0 OR 1, which is `Math.sign` and is also what a creator means by
    // "which way is it going": multiply a speed by the sign of a difference and a thing
    // chases another without a Branch.
    unary('math.sign', 'Sign', value => Math.sign(value),
        ['direction', 'positive', 'negative', 'which way', 'towards', 'polarity'],
        'Which way a number points: -1, 0 or 1'),

    // `Sqrt` OF A NEGATIVE IS `0`, NOT `NaN`, and that is the catalogue's numeric convention
    // rather than a decision taken here: `number()` turns every non-finite reading into `0`
    // in `Clamp`, `Lerp`, `Delay` and `Every`, and a `NaN` loose in a graph is a value that
    // poisons everything downstream of it without ever saying where it came from.
    unary('math.squareRoot', 'Square Root', value => (value > 0 ? Math.sqrt(value) : 0),
        ['sqrt', 'root', 'hypotenuse', 'length', 'distance', 'magnitude'],
        'The number that, multiplied by itself, gives this one'),

    // TWO NODES THAT ARE NOT ARITHMETIC BUT ARE ASKED FOR IN THE SAME BREATH. Both are one
    // line of maths a creator should never have to assemble: `Clamp` is a Greater Than, a
    // Less Than and two Branches, and `Lerp` is a Subtract, a Multiply and an Add. Neither
    // needs a runtime decision, which is what separates them from `Random` and `Delay`
    // (ADR-0045 §11).

    {
        type: 'math.clamp',
        label: 'Clamp',
        category: 'Math',
        keywords: ['limit', 'bound', 'range', 'constrain', 'min', 'max', 'between'],
        tooltip: 'Keeps a number between two bounds',
        inputs: [
            data('value', PropertyType.NUMBER, 'Value', 0),
            data('min', PropertyType.NUMBER, 'Min', 0),
            data('max', PropertyType.NUMBER, 'Max', 1)
        ],
        outputs: [data('result', PropertyType.NUMBER, 'Result')],
        evaluate: io => {
            const low = number(io.input('min'));
            const high = number(io.input('max'));
            // BOUNDS THE WRONG WAY ROUND ARE NOT A FAULT, they are two wires a creator
            // crossed. Sorting them answers what they meant; throwing would stop a frame
            // over a mistake with an obvious reading.
            const [lower, upper] = low <= high ? [low, high] : [high, low];
            return { result: Math.min(Math.max(number(io.input('value')), lower), upper) };
        }
    },

    {
        type: 'math.lerp',
        label: 'Lerp',
        category: 'Math',
        keywords: ['interpolate', 'blend', 'mix', 'between', 'smooth', 'ease', 'fade'],
        tooltip: 'A number part way between two others',
        inputs: [
            data('a', PropertyType.NUMBER, 'From', 0),
            data('b', PropertyType.NUMBER, 'To', 1),
            // NOT CLAMPED, AND THAT IS DELIBERATE: an amount above 1 overshoots, which is
            // how a spring or a bounce is written. `Clamp` is one node away for anyone who
            // wants the other behaviour, and a node that silently refused to overshoot
            // would be impossible to work around.
            data('t', PropertyType.NUMBER, 'Amount', 0,
                null, '0 is From, 1 is To, and halfway is 0.5')
        ],
        outputs: [data('result', PropertyType.NUMBER, 'Result')],
        evaluate: io => {
            const from = number(io.input('a'));
            const to = number(io.input('b'));
            return { result: from + (to - from) * number(io.input('t')) };
        }
    },

    {
        type: 'math.random',
        label: 'Random',
        category: 'Math',
        keywords: ['chance', 'dice', 'roll', 'luck', 'vary', 'shuffle', 'noise', 'pick'],
        tooltip: 'A different number every time, between two bounds',
        inputs: [
            data('min', PropertyType.NUMBER, 'Min', 0),
            // EXCLUSIVE, AND THE TOOLTIP SAYS SO because the alternative is a bug a creator
            // cannot see: `Random 0..3` floored is a fair choice of three, and a `Max` that
            // could come out would make the last one half as likely as the others.
            data('max', PropertyType.NUMBER, 'Max', 1, null, 'The number it stops just short of')
        ],
        outputs: [data('value', PropertyType.NUMBER, 'Value')],
        // IT DRAWS FROM THE SIMULATION, WHICH IS THE WHOLE REASON THIS NODE COULD NOT SHIP
        // BEFORE (ADR-0045 §11.5, decided by ADR-0057). `Math.random()` would desynchronise a
        // replicated game on its first draw; what it reads instead is the stream the Runtime
        // derived from its seed, so the same seed and the same steps roll the same numbers on
        // every machine. The purity guard in `nodes.test.js` is what keeps it that way.
        //
        // A SIMULATION WITH NO STREAM ANSWERS `Min`, and does not pretend. A graph run
        // headlessly is handed no source of chance; answering the low bound is the honest
        // reading of "nothing varies here", and it is the same family of non-answer a dead
        // Object reference gets (ADR-0034 §3.4).
        evaluate: io => {
            const low = number(io.input('min'));
            const high = number(io.input('max'));
            const stream = io.ctx?.random ?? null;
            return { value: stream ? stream.between(low, high) : low };
        }
    },

    // --- comparison ---------------------------------------------------------------------

    comparison('compare.greater', 'Greater Than', (a, b) => a > b),
    comparison('compare.greaterOrEqual', 'Greater Or Equal', (a, b) => a >= b),
    comparison('compare.less', 'Less Than', (a, b) => a < b),
    comparison('compare.lessOrEqual', 'Less Or Equal', (a, b) => a <= b),
    {
        type: 'compare.notEqual',
        label: 'Not Equal',
        category: 'Compare',
        keywords: ['different', '!=', 'differs', 'unequal', 'comparison'],
        inputs: [data('a', ANY_TYPE, 'A'), data('b', ANY_TYPE, 'B')],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        // THE EXACT NEGATION OF `Equal`, AND IT READS THE SAME COMPARISON. Writing it as
        // `!==` beside a node written as `===` is how the two drift apart the day one of
        // them learns about a new type.
        evaluate: io => ({ result: !sameValue(io.input('a'), io.input('b')) }),
        tooltip: 'Whether two values are different'
    },

    {
        type: 'compare.equal',
        label: 'Equal',
        category: 'Compare',
        keywords: ['equals', '==', 'same', 'comparison'],
        inputs: [data('a', ANY_TYPE, 'A'), data('b', ANY_TYPE, 'B')],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        evaluate: io => ({ result: sameValue(io.input('a'), io.input('b')) })
    },

    // --- logic ---------------------------------------------------------------------------

    {
        type: 'logic.not',
        label: 'Not',
        category: 'Logic',
        keywords: ['invert', 'negate', 'boolean'],
        inputs: [data('value', PropertyType.BOOLEAN, 'Value', false)],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        evaluate: io => ({ result: !io.input('value') })
    },

    logical('logic.and', 'And', (a, b) => a && b),
    logical('logic.or', 'Or', (a, b) => a || b),

    // --- reporting -------------------------------------------------------------------------

    {
        type: 'debug.log',
        label: 'Log',
        category: 'Debug',
        keywords: ['print', 'console', 'trace', 'debug'],
        inputs: [flow('in'), data('value', ANY_TYPE, 'Value')],
        outputs: [flow('out')],
        // THE ONLY ENVIRONMENT-SPECIFIC NODE, and it takes its sink from the host instead of
        // reaching for one. A headless runtime is given no `log` and this node does nothing,
        // which is the honest behaviour: writing to a console a server does not have would
        // be the DOM dependency this whole file exists to avoid.
        execute: io => {
            io.log?.(io.input('value'));
            return 'out';
        }
    }
];

/**
 * Fill a registry with the node types the engine ships.
 *
 * Explicit, like `registerBuiltIns()` for components: a module with a registration side
 * effect cannot be imported without accepting it, and a headless test may want a catalogue
 * of its own (editor/registry.js).
 *
 * @param {object} [registry] - The NodeRegistry to fill
 * @returns {object} The registry
 */
export function registerStandardNodes(registry = defaultNodes) {
    for (const definition of STANDARD_NODES) registry.register(definition, { replace: true });
    return registry;
}

/**
 * Whether two graph values are the same value.
 *
 * ONE COMPARISON, READ FROM ONE PLACE. `Equal` and `Not Equal` are exact negations, and
 * writing the second as `!==` beside a first written as `===` is how two rules that were
 * one start to disagree the day either learns about a new type.
 *
 * @param {any} a - The first value
 * @param {any} b - The second
 * @returns {boolean} True when they are the same
 */
function sameValue(a, b) {
    return a === b;
}

/**
 * A node that takes one number and answers one.
 *
 * @param {string} type - The node type
 * @param {string} label - What it is called
 * @param {Function} apply - The operation
 * @param {string[]} keywords - What else a creator might type
 * @param {string} tooltip - What it answers
 * @param {string} [port] - What the input is called, when `Value` would not say enough
 * @returns {object} The definition
 */
function unary(type, label, apply, keywords, tooltip, port = 'Value') {
    return {
        type,
        label,
        category: 'Math',
        keywords: ['maths', 'number', label.toLowerCase(), ...keywords],
        // THE PORT IS NAMED FOR ITS UNIT WHERE THE UNIT IS A QUESTION, which is the technique
        // `Rotate` already uses: `Angle` would have two answers, `Degrees` has one.
        inputs: [data('value', PropertyType.NUMBER, port, 0)],
        outputs: [data('result', PropertyType.NUMBER, 'Result')],
        evaluate: io => ({ result: apply(number(io.input('value'))) }),
        tooltip
    };
}

function arithmetic(type, label, apply, keywords = []) {
    return {
        type,
        label,
        category: 'Math',
        // WHAT ELSE A CREATOR MIGHT TYPE. The picker scores a query against the name, the
        // type, the category AND these (editor/ui/relevance.js), which is what lets `times`
        // find Multiply and `arithmetic` find all four. A node with none is still findable
        // by its name; these only widen the door.
        keywords: ['arithmetic', 'maths', 'operator', label.toLowerCase(), ...keywords],
        inputs: [data('a', PropertyType.NUMBER, 'A', 0), data('b', PropertyType.NUMBER, 'B', 0)],
        outputs: [data('result', PropertyType.NUMBER, 'Result')],
        evaluate: io => ({ result: apply(number(io.input('a')), number(io.input('b'))) })
    };
}

function comparison(type, label, apply) {
    return {
        type,
        label,
        category: 'Compare',
        keywords: ['comparison', 'compare', 'operator', label.toLowerCase()],
        inputs: [data('a', PropertyType.NUMBER, 'A', 0), data('b', PropertyType.NUMBER, 'B', 0)],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        evaluate: io => ({ result: apply(number(io.input('a')), number(io.input('b'))) })
    };
}

function logical(type, label, apply) {
    return {
        type,
        label,
        category: 'Logic',
        keywords: ['boolean', 'operator', label.toLowerCase()],
        inputs: [
            data('a', PropertyType.BOOLEAN, 'A', false),
            data('b', PropertyType.BOOLEAN, 'B', false)
        ],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        evaluate: io => ({ result: Boolean(apply(io.input('a'), io.input('b'))) })
    };
}

/** A value read as a number, with anything unusable read as zero rather than as NaN. */
function number(value) {
    const parsed = globalThis.Number(value);
    return globalThis.Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A value, as the text a label shows.
 *
 * FOUR ANSWERS, AND NONE OF THEM IS `[object Object]`:
 *
 *   null / undefined   the empty string — nothing reads as nothing, not as the word "null"
 *   a boolean          `true` / `false`, which is what a creator typed into the node
 *   a number           its shortest exact decimal, the same on every machine; `NaN` and the
 *                      infinities read as empty rather than leaking an arithmetic accident
 *                      onto the screen (the reading `Divide` already gives a zero divisor)
 *   anything else      `String()`, which covers text and a Choice — an option IS its value
 *                      (ADR-0031 §2), so a Choice reads as the word it holds
 *
 * AN OBJECT HANDLE IS NOT TEXT, and answering with its class name would be a promise this
 * cannot keep — there is no name a scene Object has that is stable enough to show. It reads
 * as empty, which is honest, and `Get Property Object ▸ Name` is the node that answers the
 * question that was really being asked.
 *
 * @param {any} value - What a wire carried
 * @returns {string} The text
 */
function asText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return globalThis.Number.isFinite(value) ? globalThis.String(value) : '';
    if (typeof value === 'object') return '';

    return globalThis.String(value);
}
