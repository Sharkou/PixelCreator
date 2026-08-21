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

import { PropertyType } from '../properties/types.js';
import { ANY_TYPE, OBJECT_TYPE, PortKind, nodes as defaultNodes } from './nodes.js';
import { GraphError, GraphIssueCode } from './errors.js';

/** The param that names a Component property, so the Editor knows to offer a picker. */
export const PROPERTY_REFERENCE = 'property';

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

const flow = (id, label) => ({ id, kind: PortKind.FLOW, label: label ?? '' });
const data = (id, type, label, fallback) => ({
    id,
    kind: PortKind.DATA,
    type,
    label: label ?? null,
    default: fallback ?? null
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
        // The output takes the SHAPE OF THE PROPERTY, so wiring a `string` into a number
        // input is refused at the moment of the gesture rather than discovered at run time.
        outputs: (node, context) => {
            const property = referencedProperty(node, context);
            return [data('value', property?.type ?? ANY_TYPE, property?.name ?? 'Value')];
        },
        evaluate: io => ({ value: io.component?.[requireProperty(io).name] })
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
                data('value', property?.type ?? ANY_TYPE, property?.name ?? 'Value', property?.default)
            ];
        },
        outputs: [flow('out')],
        execute: io => {
            const property = requireProperty(io);
            // A PLAIN WRITE, deliberately: this is a simulation output, not an authored
            // intent, so it produces a Change and no Operation (ADR-0003, CONVENTIONS.md).
            if (io.component) io.component[property.name] = io.input('value');
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
        inputs: [data('tag', PropertyType.STRING, 'Tag', '')],
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

    {
        type: 'value.number',
        label: 'Number',
        category: 'Values',
        keywords: ['float', 'int', 'literal', 'constant'],
        params: { value: { type: PropertyType.NUMBER, default: 0, label: 'Value' } },
        outputs: [data('value', PropertyType.NUMBER)],
        evaluate: io => ({ value: io.param('value') ?? 0 })
    },

    {
        type: 'value.boolean',
        label: 'Boolean',
        category: 'Values',
        keywords: ['bool', 'true', 'false', 'flag', 'literal'],
        params: { value: { type: PropertyType.BOOLEAN, default: false, label: 'Value' } },
        outputs: [data('value', PropertyType.BOOLEAN)],
        evaluate: io => ({ value: Boolean(io.param('value')) })
    },

    {
        type: 'value.string',
        label: 'Text',
        category: 'Values',
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
