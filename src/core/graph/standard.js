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

/**
 * `Get Health.hp`, once a node naming another Object's property knows what it names.
 *
 * Null until BOTH halves are chosen: half a name is less readable than the node type's own,
 * because it says a thing is settled when it is not.
 *
 * @param {string} verb - `Get` or `Set`
 * @param {object} node - The node
 * @param {object} context - `{ components }`
 * @returns {string|null} What a creator reads, or null to keep the type's label
 */
function titleOfTarget(verb, node, context) {
    const component = referencedComponent(node, context);
    if (!component) return null;

    // A LADDER, SO WHAT IS MISSING IS WHAT IS ABSENT FROM THE TITLE. `Get Health.hp` is
    // settled; `Get Health` says the Component is chosen and the property is not — which a
    // creator reads without being told, because the half that would follow the dot is the
    // half that is not there. Nothing at all falls back to the type's own label.
    const property = referencedComponentProperty(node, context);
    const named = `${verb} ${component.label ?? component.type}`;

    return property ? `${named}.${property.name}` : named;
}

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

/** The Component on the Object a node was handed, or null when there is neither. */
function targetComponent(io) {
    const target = io.input('object');
    return target?.getComponent?.(io.node?.params?.component) ?? null;
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

    // --- the component's own properties ---------------------------------------------

    {
        type: 'property.get',
        label: 'Get Property',
        category: 'Properties',
        keywords: ['read', 'variable', 'field'],
        params: propertyParam,
        // WHAT A CREATOR READS ONCE IT NAMES SOMETHING. `Get Property` says what the node
        // type is; a node that has been pointed at `speed` should say what THIS one does.
        //
        // AN OBJECT REFERENCE IS TITLED BY ITS NAME ALONE, and that is not a flourish: a
        // property of any other shape is a value this node READS, so `Get speed` is what it
        // does — while an `objectref` property IS the reference (ADR-0037), so the node is
        // `Player` and reads as the thing itself.
        title: (node, context) => {
            const property = referencedProperty(node, context);
            if (!property) return null;
            return property.type === PropertyType.OBJECTREF ? property.name : `Get ${property.name}`;
        },
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
        title: (node, context) => {
            const property = referencedProperty(node, context);
            return property ? `Set ${property.name}` : null;
        },
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
        category: 'Scene',
        keywords: ['this', 'me', 'owner', 'object'],
        outputs: [data('object', OBJECT_TYPE)],
        evaluate: io => ({ object: io.self ?? null }),
        tooltip: 'The Object this Component is attached to'
    },

    {
        type: 'scene.parent',
        label: 'Parent',
        category: 'Scene',
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
        category: 'Scene',
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
        category: 'Scene',
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
        category: 'Scene',
        keywords: ['read', 'other', 'remote', 'foreign', 'component', 'field'],
        tooltip: 'Reads a property of a Component on another Object',
        title: (node, context) => titleOfTarget('Get', node, context),
        params: { ...componentParam, ...componentPropertyParam },
        inputs: [data('object', OBJECT_TYPE)],
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
        category: 'Scene',
        keywords: ['write', 'assign', 'other', 'remote', 'foreign', 'component'],
        tooltip: 'Writes a property of a Component on another Object',
        title: (node, context) => titleOfTarget('Set', node, context),
        params: { ...componentParam, ...componentPropertyParam },
        inputs: (node, context) => {
            const property = referencedComponentProperty(node, context);
            return [
                flow('in'),
                data('object', OBJECT_TYPE),
                data('value', portTypeOf(property), property?.name ?? 'Value', property?.default)
            ];
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
