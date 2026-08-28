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
import { GraphError, GraphIssueCode } from './errors.js';

/** The param that names a Component property, so the Editor knows to offer a picker. */
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
 * The param that names a property OF the Component type a sibling param names.
 *
 * It is not `PROPERTY_REFERENCE`: that one resolves against the properties of the Component
 * the graph belongs to, and this one against the properties of the type being reached.
 */
export const COMPONENT_PROPERTY_REFERENCE = 'component-property';

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
 * creator states an intention with a gesture, and the node reads it (ADR-0039 §0.3).
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

const flow = (id, label) => ({ id, kind: PortKind.FLOW, label: label ?? '' });
const data = (id, type, label, fallback, placeholder) => ({
    id,
    kind: PortKind.DATA,
    type,
    label: label ?? null,
    default: fallback ?? null,
    placeholder: placeholder ?? null
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

/** The reference param every property node carries. */
const propertyParam = {
    property: {
        type: PropertyType.STRING,
        default: null,
        label: 'Property',
        /** Read by the Editor to offer the component's own properties (editor/inspector/node.js). */
        reference: PROPERTY_REFERENCE,
        tooltip: 'The Component property this node reads or writes, by identity'
    }
};

/** The param naming the Component type a node reaches for. */
const componentParam = {
    component: {
        type: PropertyType.STRING,
        default: null,
        label: 'Component',
        reference: COMPONENT_REFERENCE,
        tooltip: 'The Component type this node reads or writes, by identity'
    }
};

/**
 * The param naming WHICH Object the node acts on (ADR-0039 §3, amending ADR-0034 §7).
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
        // IT IS EDITED ON THE PORT'S OWN ROW. The socket and the picker are two ways to say
        // one thing — which Object — so they share a line: connect something and the picker
        // greys out, disconnect and it comes back. Two rows would be two questions.
        port: 'object',
        tooltip: 'Which Object this node acts on'
    }
};

/** The param naming a property of that type, kept apart from the one above (ADR-0027 §4). */
const componentPropertyParam = {
    property: {
        type: PropertyType.STRING,
        default: null,
        label: 'Property',
        reference: COMPONENT_PROPERTY_REFERENCE,
        tooltip: 'The property of that Component this node reads or writes, by identity'
    }
};

/**
 * The property a node aims at on another Object, read off the TYPE it names.
 *
 * THE DECLARATION COMES FROM THE REGISTRY, THE VALUE FROM THE INSTANCE. Reading the schema
 * off whatever component happens to be attached would leave the node with nothing to say
 * when the target does not carry one — and `.px` types live in the Scene's own registry,
 * which is exactly where a type is looked up everywhere else (core/scene.js).
 *
 * A reference that cannot be resolved AT ALL is a design-time fault and refuses loudly; a
 * target that simply is not there is a state of the running scene and does not (ADR-0034
 * §3.4). That is the whole of the asymmetry, and it lives here.
 */
function requireTargetProperty(io) {
    const type = io.node?.params?.component ?? null;
    const id = io.node?.params?.property ?? null;

    if (!type || !id) {
        throw new GraphError(
            GraphIssueCode.MISSING_REFERENCE,
            'This node has no Component and property selected.',
            { node: io.node?.id, property: id }
        );
    }

    const Component = io.ctx?.scene?.registry?.get?.(type) ?? null;
    if (!Component) {
        throw new GraphError(
            GraphIssueCode.MISSING_PROPERTY,
            'This node names a Component type this project does not declare.',
            { node: io.node?.id }
        );
    }

    const property = declaredProperties(Component).find(entry => entry.id === id) ?? null;
    if (!property) {
        throw new GraphError(
            GraphIssueCode.MISSING_PROPERTY,
            'This node names a property that Component no longer declares.',
            { node: io.node?.id, property: id }
        );
    }

    return property;
}

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
 * @param {object} io - What the node was handed
 * @returns {object|null} The Object, or null
 */
function targetObject(io) {
    // A CONNECTION WINS, AND IT WINS BY EXISTING. Not by producing a non-null Object: a
    // `Find By Tag` that finds nobody must write to nobody, not fall through to whatever the
    // picker happens to name. The two sources are ordered, never merged.
    if (io.wired?.('object')) return io.input('object');

    const socket = targetSocket(io.node, { properties: io.properties });
    return socket ? portValueOf(socket, io.component?.[socket.name], io.ctx?.scene) : null;
}

/** The Component on the Object a node acts on, or null when there is neither. */
function targetComponent(io) {
    return targetObject(io)?.getComponent?.(io.node?.params?.component) ?? null;
}

/**
 * Resolve a referenced property or refuse, with the reason in the code.
 *
 * NEVER A SILENT DANGLING REFERENCE. A node pointing at a property that was deleted is a
 * structured failure the runtime reports and the validator lists — not an `undefined` that
 * spreads through the graph and shows up as a component that quietly stopped moving.
 */
function requireProperty(io) {
    const property = referencedProperty(io.node, { properties: io.properties });
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

    {
        type: 'input.key',
        label: 'Key',
        category: 'Input',
        keywords: ['input', 'keyboard', 'keys', 'press', 'held', 'down', 'released', 'control'],
        params: {
            key: {
                type: PropertyType.STRING,
                default: DEFAULT_KEY,
                label: 'Key',
                // STILL AN OPAQUE STRING IN THE MODEL, AND NOW A PICKED ONE IN THE EDITOR.
                // What is stored is a `KeyboardEvent.code` exactly as before, so every graph
                // written until now reads unchanged; what the param gained is a statement of
                // WHAT KIND of name it holds, which is all the Editor needs to offer the
                // list instead of a text box (`KEY_REFERENCE` above).
                reference: KEY_REFERENCE,
                tooltip: 'The key this node watches, as the browser names it'
            }
        },
        // THREE OUTPUTS, AND THE NAMES ARE THE WHOLE DIFFICULTY. `Held`, `Pressed` and
        // `Released` are three words for three real states of `InputState`, and two of them
        // read as the same thing in English: a creator asking "is the key pressed" wants
        // `Held` and reaches for `Pressed`, which is true for exactly one step and then
        // never again. So the labels say WHEN each one is true rather than what it is
        // called, which is the only thing that tells them apart at a glance.
        //
        // THE IDS ARE UNTOUCHED. A label is presentation and the interpreter never sees one
        // (core/graph/nodes.js), so every wire in every graph written until now still lands
        // where it did.
        outputs: [
            data('held', PropertyType.BOOLEAN, 'Is Down'),
            data('pressed', PropertyType.BOOLEAN, 'Just Pressed'),
            data('released', PropertyType.BOOLEAN, 'Just Released')
        ],
        // A KEY IS A LITERAL, NOT A REFERENCE, so an empty one answers false rather than
        // refusing. `property.get` throws because it NAMES something that must exist and no
        // longer does — a design-time fault. A key nobody typed is an empty `Number` node,
        // and the catalogue has never made those an error (ADR-0034 §3.4).
        evaluate: io => {
            // `??`, not `||`: a node nobody has touched carries no `key` and reads the
            // declared default, while a field a creator has EMPTIED is an empty key and
            // reads nothing. The two are different answers to different acts.
            const key = io.param('key') ?? DEFAULT_KEY;
            const state = key ? io.ctx?.input?.of?.(io.self?.owner ?? null) : null;
            if (!state) return { held: false, pressed: false, released: false };

            return {
                held: state.isDown(key),
                pressed: state.pressed(key),
                released: state.released(key)
            };
        },
        tooltip: 'Whether a key is held, went down this step, or came up this step'
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
        type: 'input.pointerButton',
        label: 'Pointer Button',
        category: 'Input',
        icon: 'node-pointer',
        keywords: ['input', 'mouse', 'click', 'press', 'held', 'released', 'touch', 'tap'],
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
        // THE SAME THREE QUESTIONS A KEY ANSWERS, and deliberately the same three words:
        // `InputState` already distinguishes a button held from one that went down and one
        // that came up, bounded to a single step by the same `commit()` (ADR-0014 §5). A
        // second vocabulary for the same idea would be a second thing to learn.
        outputs: [
            data('held', PropertyType.BOOLEAN, 'Is Down'),
            data('pressed', PropertyType.BOOLEAN, 'Just Pressed'),
            data('released', PropertyType.BOOLEAN, 'Just Released')
        ],
        evaluate: io => {
            const button = buttonOf(io.node);
            const state = io.ctx?.input?.of?.(io.self?.owner ?? null);
            if (!state) return { held: false, pressed: false, released: false };

            return {
                held: state.isButtonDown(button),
                pressed: state.buttonPressed(button),
                released: state.buttonReleased(button)
            };
        },
        tooltip: 'Whether a pointer button is held, went down this step, or came up this step'
    },

    // --- the component's own properties ---------------------------------------------

    {
        type: 'property.get',
        label: 'Get Property',
        category: 'Properties',
        keywords: ['read', 'variable', 'field'],
        params: propertyParam,
        outputs: (node, context) => {
            const property = referencedProperty(node, context);
            return [data('value', portTypeOf(property), property?.name ?? 'Value')];
        },
        // THE VALUE CROSSES THE SAME BOUNDARY ITS TYPE DOES. The port was typed by
        // `portTypeOf()`, so an `objectref` property leaves this node as a HANDLE and not as
        // the identity it is stored as (ADR-0034 §3.5).
        evaluate: io => {
            const property = requireProperty(io);
            return { value: portValueOf(property, io.component?.[property.name], io.ctx?.scene) };
        }
    },

    {
        type: 'property.set',
        label: 'Set Property',
        category: 'Properties',
        keywords: ['write', 'assign', 'variable', 'field'],
        params: propertyParam,
        inputs: (node, context) => {
            const property = referencedProperty(node, context);
            return [
                flow('in'),
                data('value', portTypeOf(property), property?.name ?? 'Value', property?.default)
            ];
        },
        outputs: [flow('out')],
        execute: io => {
            const property = requireProperty(io);
            // A PLAIN WRITE, deliberately: this is a simulation output, not an authored
            // intent, so it produces a Change and no Operation (ADR-0003, CONVENTIONS.md).
            // What is written is the IDENTITY, never the handle that arrived (§3.5).
            if (io.component) {
                io.component[property.name] = storedValueOf(property, io.input('value'));
            }
            return 'out';
        }
    },

    // --- the scene around this component ----------------------------------------------
    //
    // WHAT TRAVELS THESE PORTS IS A HANDLE, NEVER AN IDENTIFIER (ADR-0034 §3.2). A node here
    // reads `io.self` and `io.ctx.scene`, both of which the interpreter already hands over,
    // and yields the reactive Proxy the Scene holds. Nothing stores it, nothing serializes
    // it, and nothing turns it back into an ObjectId — which is what keeps a `.px` free of
    // any identity belonging to a scene, and therefore usable in more than one of them.

    {
        type: 'scene.self',
        label: 'Self',
        category: 'References',
        keywords: ['this', 'me', 'owner', 'object'],
        outputs: [data('object', OBJECT_TYPE)],
        evaluate: io => ({ object: io.self ?? null }),
        tooltip: 'The Object this Component is attached to'
    },

    {
        // WHAT A CREATOR GETS WHEN THEY DRAG AN OBJECT ONTO THE CANVAS, and it says what it
        // is rather than what it happens to hold: `Get Object`, with `Player` in a field.
        // The drop used to make a `Get Property` reading an `objectref` input — true, and
        // unreadable: a card headed `Get Property` handing out an Object explains nothing,
        // and titling it `Get Player` traded the node's name for one of its values.
        //
        // IT IS NOT A SECOND MECHANISM. It reads the very same socket `Get Property` would,
        // through the very same boundary (`portValueOf`, ADR-0036) — what it adds is a name
        // and a shape a beginner can recognise.
        type: 'reference.object',
        label: 'Get Object',
        category: 'References',
        keywords: ['object', 'reference', 'target', 'player', 'entity', 'get'],
        params: {
            object: {
                type: PropertyType.STRING,
                default: null,
                label: 'Object',
                reference: OBJECT_SOCKET_REFERENCE,
                tooltip: 'Which of this Component\u2019s Objects this node hands on'
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
        category: 'References',
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
        category: 'References',
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
        type: 'object.isValid',
        label: 'Is Valid',
        category: 'References',
        keywords: ['exists', 'null', 'empty', 'check', 'object'],
        inputs: [data('object', OBJECT_TYPE)],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        // WHAT A CREATOR HAS TO DEFEND THEMSELVES WITH. A target that is gone resolves to
        // nothing rather than failing (ADR-0034 §3.4), so a graph needs a way to ASK —
        // without it, a dead reference is indistinguishable from a graph that never worked.
        evaluate: io => ({ result: (io.input('object') ?? null) !== null }),
        tooltip: 'Whether there is an Object here at all'
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

    {
        type: 'property.getOn',
        label: 'Get Property On',
        category: 'Properties',
        keywords: ['read', 'other', 'remote', 'foreign', 'component', 'field'],
        tooltip: 'Reads a property of a Component on another Object',
        params: { ...targetParam, ...componentParam, ...componentPropertyParam },
        // THE PORT IS WHAT THE PARAM DOES NOT COVER. A target the creator can point at lives
        // in the node; a target the graph COMPUTES arrives here. Only one of the two is ever
        // drawn, so a card never asks the same question twice (ADR-0039 §3).
        //
        // THE LABEL, NEVER THE ID. `object` remains the port's identity, so no graph that
        // names it changes and no wire moves (core/graph/nodes.js): a label is presentation,
        // and the interpreter never sees one.
        // ALWAYS DRAWN, because a socket a creator cannot see is a socket they cannot
        // connect to — and connecting is how the other half of the target is stated.
        inputs: [data('object', OBJECT_TYPE, 'Object')],
        outputs: (node, context) => {
            const property = referencedComponentProperty(node, context);
            return [data('value', portTypeOf(property), property?.name ?? 'Value')];
        },
        evaluate: io => {
            const property = requireTargetProperty(io);
            const component = targetComponent(io);
            // A TARGET THAT IS GONE IS A STATE OF THE SCENE, NOT A FAULT (ADR-0034 §3.4).
            // The node answers with what a fresh instance of that Component would hold, so a
            // graph reading the health of an enemy that just died reads its declared value
            // rather than failing every frame for the rest of the game. That default is
            // already `null` for an `objectref`, which is what a handle's absence looks like.
            return {
                value: component
                    ? portValueOf(property, component[property.name], io.ctx?.scene)
                    : defaultForProperty(property)
            };
        }
    },

    {
        type: 'property.setOn',
        label: 'Set Property On',
        category: 'Properties',
        keywords: ['write', 'assign', 'other', 'remote', 'foreign', 'component'],
        tooltip: 'Writes a property of a Component on another Object',
        params: { ...targetParam, ...componentParam, ...componentPropertyParam },
        inputs: (node, context) => {
            const property = referencedComponentProperty(node, context);
            const value = data('value', portTypeOf(property), property?.name ?? 'Value', property?.default);

            // THE VALUE IS TYPED FROM `(component, property)`, which live in the node — so it
            // is exact however the Object arrives, and never a function of what is wired.
            return [flow('in'), data('object', OBJECT_TYPE, 'Object'), value];
        },
        outputs: [flow('out')],
        execute: io => {
            const property = requireTargetProperty(io);
            const component = targetComponent(io);
            // A PLAIN WRITE, exactly as `Set Property` does: a behaviour running inside
            // `update()` is a simulation output and not an authored intent, so it produces a
            // Change and no Operation (ADR-0003, ADR-0027 §6). Writing on a target that is
            // gone does nothing, and says nothing — §3.4 again. And what is written is the
            // IDENTITY, never the handle that arrived (§3.5).
            if (component) component[property.name] = storedValueOf(property, io.input('value'));
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

    // --- arithmetic --------------------------------------------------------------------

    arithmetic('math.add', 'Add', (a, b) => a + b),
    arithmetic('math.subtract', 'Subtract', (a, b) => a - b),
    arithmetic('math.multiply', 'Multiply', (a, b) => a * b),
    // DIVIDING BY ZERO YIELDS ZERO, and it is a decision rather than an oversight: an
    // Infinity or a NaN entering a Transform spreads silently through every frame after it,
    // and a creator has no way to see where it started. Zero is wrong in the same place and
    // stops there.
    arithmetic('math.divide', 'Divide', (a, b) => (b === 0 ? 0 : a / b)),

    // --- comparison ---------------------------------------------------------------------

    comparison('compare.greater', 'Greater Than', (a, b) => a > b),
    comparison('compare.less', 'Less Than', (a, b) => a < b),
    {
        type: 'compare.equal',
        label: 'Equal',
        category: 'Compare',
        keywords: ['equals', '==', 'same', 'comparison'],
        inputs: [data('a', ANY_TYPE, 'A'), data('b', ANY_TYPE, 'B')],
        outputs: [data('result', PropertyType.BOOLEAN, 'Result')],
        evaluate: io => ({ result: io.input('a') === io.input('b') })
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

function arithmetic(type, label, apply) {
    return {
        type,
        label,
        category: 'Math',
        // WHAT ELSE A CREATOR MIGHT TYPE. The picker scores a query against the name, the
        // type, the category AND these (editor/ui/relevance.js), which is what lets `times`
        // find Multiply and `arithmetic` find all four. A node with none is still findable
        // by its name; these only widen the door.
        keywords: ['arithmetic', 'maths', 'operator', label.toLowerCase()],
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
