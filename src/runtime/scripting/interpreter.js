// The graph interpreter — what makes a `.px` run (ADR-0009 Q7, ADR-0015, ADR-0027).
//
// INTERPRETED, NEVER COMPILED. No `eval`, no `new Function`, no generated source. ADR-0009
// settled this: a gameplay graph runs a few dozen nodes per step, and step-by-step
// debuggability plus the absence of arbitrary code execution are worth more than raw speed
// — it is what makes `.px` the format that is safe to share.
//
// THIS IS THE OTHER HALF OF THE CATALOGUE. `core/graph/standard.js` says what a node IS;
// this file says WHEN nodes run and in what order. It owns exactly the five things that
// are not a property of any single node:
//
//   flow          which node runs next, and depth-first when one node continues twice
//   data          pulling a value from upstream, memoised inside one step
//   suspension    an execution that outlives its step, counted down and resumed (ADR-0058)
//   protection    a budget, and a cycle guard, so a bad graph cannot hang a frame
//   failure       a structured GraphError, thrown, for the runtime to isolate and report
//
// TWO LEVELS, BECAUSE TWO DIFFERENT THINGS ARE SHARED (ADR-0015 §3). Reading a graph
// depends on the graph alone, so it happens once and every component of that type shares
// it. Running one depends on the instance, so each component gets its own execution state.
// A hundred Controllers share one reading and never share a state — which is why the seam
// `Behaviors` defines is a factory and not an object.
//
// HEADLESS BY CONSTRUCTION. Nothing here touches the DOM, a clock, a random source or
// storage: time comes from the step context, values come from the component, and the one
// node that talks to the outside — `Log` — is handed its sink. The same graph therefore
// reaches the same state on a client and on a server, which is what ADR-0011 requires of
// an authoritative server and what the whole product rests on.
//
// A GRAPH IS READ ONCE AND NEVER MUTATED (ADR-0016 §7). What arrives here is the plain
// payload a `.px` carries, not the Editor's live model: editing a Component means writing
// a new payload and binding it, and `Behaviors` swaps the running behaviour on the next
// step.

import {
    GRAPH_VERSION,
    GraphError,
    GraphIssueCode,
    PortDirection,
    PortKind,
    carriesObjects,
    declaredProperties,
    migrateNode,
    nodes as defaultNodes,
    portOf,
    portsOf
} from '../../core/mod.js';

/**
 * How many nodes one event may run before the interpreter refuses to continue.
 *
 * A FLOW MAY LOOP — that is how a creator writes a loop, and forbidding it would be
 * forbidding the feature (ADR-0027). What must not happen is a frame that never ends, so a
 * budget bounds one event's execution and a graph that exceeds it fails loudly, with the
 * node it was on. Four thousand is far past any honest gameplay graph and far below a
 * hang a creator would notice as one.
 */
export const DEFAULT_BUDGET = 4096;

/**
 * How many executions of one component may be suspended at once (ADR-0058).
 *
 * THE BUDGET BOUNDS ONE WALK; THIS BOUNDS HOW MANY THERE ARE. A `Delay` or an `Every` wired
 * to `On Update` suspends once per step and the pile never shrinks — `waiting` reached 600
 * after ten seconds at sixty steps, each one counted down and resumed every step with a full
 * budget of its own. Nothing bounded it, so a bad graph hung the frame by a route the budget
 * could not see, and it did so gradually, which is the hardest kind to diagnose.
 *
 * IT IS NOT A COLLAPSE INTO ONE. ADR-0058 §3 is explicit that two passes through one `Delay`
 * wait independently, so the list stays a list; what is added is a ceiling, and reaching it
 * is a stated failure — the same answer the budget gives, one scope up. Two hundred and fifty
 * six is far past any honest graph: a shooter's bullets are Objects with their own component
 * each, not two hundred waits on one.
 */
export const MAX_PENDING = 256;

/**
 * Build the interpreter `Behaviors` is constructed with.
 *
 * @param {object} [options] - Options
 * @param {object} [options.registry] - The NodeRegistry node types are resolved in
 * @param {number} [options.budget] - Nodes one event may run
 * @param {Function} [options.log] - Sink for the `Log` node; the node is inert without one
 * @returns {Function} (graph) => (component) => Behavior
 */
export function createGraphInterpreter({ registry = defaultNodes, budget = DEFAULT_BUDGET, log = null } = {}) {
    return graph => interpretGraph(graph, { registry, budget, log });
}

/**
 * Read a graph, once, into a factory of behaviours.
 *
 * @param {object} graph - The graph payload a `.px` carries
 * @param {object} [options] - Options
 * @param {object} [options.registry] - The NodeRegistry node types are resolved in
 * @param {number} [options.budget] - Nodes one event may run
 * @param {Function} [options.log] - Sink for the `Log` node
 * @returns {Function} (component) => Behavior
 */
export function interpretGraph(graph, { registry = defaultNodes, budget = DEFAULT_BUDGET, log = null } = {}) {
    const compiled = compile(graph, registry);

    return function create(component) {
        // ONE EXECUTION STATE PER COMPONENT (ADR-0015 §3), and it is now two things.
        let started = false;

        // THE EXECUTIONS THAT OUTLIVED THE STEP THAT STARTED THEM (ADR-0058). A `Delay`
        // parks the rest of its flow here and the flow ENDS; the next steps count it down
        // and the one that reaches zero picks it up where it stopped.
        //
        // A LIST, NOT A MAP KEYED BY NODE. Two `On Update` firings reaching one `Delay` are
        // two executions of it, and a map would let the second overwrite the first — a graph
        // that silently stopped being re-entrant, and every later timing node inheriting the
        // defect. Appending keeps them independent and keeps the resume order the order they
        // were suspended in, which is already canonical (ADR-0058 §4).
        //
        // AND IT LIVES HERE RATHER THAN ON THE RUNTIME, which is what makes the whole
        // lifecycle free: this closure is reachable only from the `Behaviors` WeakMap keyed
        // by the component. Destroy the Object, remove the Component, replace the Scene, drop
        // the Runtime — the component goes, the closure goes, and the suspended executions go
        // with it. There is no cancellation pass because there is nothing to cancel.
        const pending = [];

        return {
            /** How many executions of this instance are suspended right now. */
            get waiting() {
                return pending.length;
            },

            /**
             * Advance this component's graph by one simulation step.
             * @param {object} self - The Object the component is attached to
             * @param {object} ctx - The step context: time, deltaTime, scene, input
             */
            update(self, ctx) {
                const state = {
                    self,
                    ctx,
                    component,
                    properties: declaredProperties(component),
                    log,
                    pending
                };

                // WHAT WAS SUSPENDED BELONGS TO AN EARLIER MOMENT THAN ANYTHING THIS STEP
                // RAISES, SO IT GOES FIRST (ADR-0058 §4). And it has to go first for a second,
                // sharper reason: the step that REACHES a `Delay` must not also count its own
                // `deltaTime` against it. A wait of one second reached at t = 0 ends at t = 1,
                // not at t = 1 - dt — so a continuation parked by the `start` or `update`
                // below is untouched until the next step, by construction rather than by a
                // flag saying which step it was born in.
                // AND A WAIT THAT FAILS DOES NOT CANCEL THE STEP. `resumeDue` isolates one
                // suspended execution from the next; raising its failure HERE rather than
                // there is the same sentence one level up — `On Update` is not work that a
                // `Delay` which went wrong has anything to do with. The failure still reaches
                // the Runtime, once the step has done what it could (ADR-0012).
                let failure = null;
                try {
                    resumeDue(compiled, state, budget);
                } catch (error) {
                    failure = error;
                }

                // `start` before `update`, on the first step and only there: a graph that
                // initialises a property must have done so before anything reads it.
                if (!started) {
                    started = true;
                    runEvent(compiled, 'start', state, budget);
                }

                runEvent(compiled, 'update', state, budget);
                if (failure) throw failure;
            }
        };
    };
}

/**
 * Count down the suspended executions of one instance, and finish the ones that are due.
 *
 * TIME IS `deltaTime` AND NOTHING ELSE. Not a wall clock, not a frame count: the step is
 * fixed and identical on a server and on every client (`Clock`), so counting it down is what
 * makes two machines resume the same executions on the same steps (ADR-0011, ADR-0057).
 * Counting FRAMES would tie a game's timing to how often a screen refreshes, which is the
 * Legacy defect `Clock` exists to prevent.
 *
 * AN INSTANCE THAT DOES NOT RUN DOES NOT COUNT DOWN. `Runtime.step()` skips an inactive
 * Object and an inactive Component entirely, so this is never called for them and their
 * timers hold rather than run on in the dark (ADR-0004). That is not a decision taken here:
 * it is what the step already does to everything else, read off rather than re-invented.
 *
 * THE DUE ONES ARE TAKEN BEFORE ANY OF THEM RUNS. A resumed flow may suspend again — the
 * same node, or another — and an entry appended while this loop was still walking would be
 * counted down twice in one step. Snapshotting first is what makes "one step, one decrement"
 * true whatever a graph does with its continuation.
 *
 * @param {object} compiled - The compiled graph
 * @param {object} state - The running state, carrying `pending` and the step context
 * @param {number} budget - Nodes one execution may run
 */
function resumeDue(compiled, state, budget) {
    const pending = state.pending;
    if (!pending || pending.length === 0) return;

    const elapsed = state.ctx?.deltaTime ?? 0;

    // A RELATIVE TOLERANCE, AND IT IS THE ONE `Clock` ALREADY USES. Subtracting a step such
    // as 1/60 sixty times leaves a remainder of a few ulp rather than exactly zero, so a bare
    // `<= 0` makes a one-second wait end one step late — the same defect `Clock.advance()`
    // documents for its accumulator, met again one layer up and answered the same way.
    const tolerance = elapsed * 1e-9;
    const due = [];
    let kept = 0;

    for (const entry of pending) {
        entry.remaining -= elapsed;
        if (entry.remaining <= tolerance) due.push(entry);
        else pending[kept++] = entry;
    }
    pending.length = kept;

    // A FRESH BUDGET EACH, BECAUSE A RESUMED EXECUTION IS AN ORDINARY ONE. It walks the same
    // stack, through the same nodes, with the same bound on how far it may run in one step —
    // what it does not get is a way to run further than an event would (ADR-0058 §6).
    //
    // AND ONE THAT FAILS DOES NOT TAKE THE OTHERS WITH IT. The due entries were removed from
    // `pending` before any of them ran — they have to be, or a re-suspension would be counted
    // down twice — so a throw part-way through this loop used to delete every execution after
    // it, permanently: two branches of a `Sequence` behind a `Delay`, one node failing, and
    // the other branch never resumed again. The FIRST failure still reaches the Runtime,
    // which is what ADR-0012 asks — a step reports one error, as it always has; what it no
    // longer does is cancel work it has nothing to do with.
    let failure = null;
    for (const entry of due) {
        try {
            walk(compiled, [entry.to], entry.produced, state, budget, entry);
        } catch (error) {
            failure ??= error;
        }
    }
    if (failure) throw failure;
}

/**
 * Park a continuation, or refuse when this instance is already holding too many.
 *
 * THE CEILING IS STATED, NEVER SILENT. Dropping the wait would make a graph stop working for
 * a reason nothing on screen mentions; refusing it raises the same structured failure the
 * budget raises, which the Runtime isolates and reports against the node that asked
 * (ADR-0012, ADR-0058).
 *
 * @param {object} state - The running state, carrying `pending`
 * @param {object} entry - The continuation to park
 * @param {object} node - The node that asked, for the report
 */
function suspend(state, entry, node) {
    const pending = state.pending;
    if (!pending) return;

    if (pending.length >= MAX_PENDING) {
        throw new GraphError(
            GraphIssueCode.BUDGET_EXCEEDED,
            `This Component is already waiting on ${MAX_PENDING} things at once; `
                + 'a timing node reached from On Update starts a new wait on every step.',
            { node: node?.id ?? null }
        );
    }

    pending.push(entry);
}

/**
 * Turn a payload into the indexes execution needs.
 *
 * STRUCTURAL CHECKS ONLY. What a node references — a property that may since have been
 * deleted — is checked when the node runs, because the properties belong to the component
 * and a graph is read before any component exists. The Editor runs the full
 * `validateGraph()` against both, and reports what this cannot see (ADR-0027).
 */
function compile(graph, registry) {
    if (!graph || typeof graph !== 'object') {
        throw new GraphError(GraphIssueCode.UNKNOWN_VERSION, 'This is not a graph.');
    }
    if (graph.version !== undefined && graph.version !== GRAPH_VERSION) {
        throw new GraphError(
            GraphIssueCode.UNKNOWN_VERSION,
            `This graph is version ${graph.version}; this build reads version ${GRAPH_VERSION}.`
        );
    }

    const byId = new Map();
    const definitions = new Map();
    const entries = new Map();

    for (const record of graph.nodes ?? []) {
        // BROUGHT UP TO THIS BUILD'S CATALOGUE FIRST. The Runtime compiles the payload a
        // `.px` carries, without ever building a Graph — so the rename the Editor applies on
        // load has to be applied here too, or a saved project would open and then refuse to
        // run (core/graph/graph.js).
        const node = migrateNode(record);
        const definition = registry.get(node.type);
        if (!definition) {
            throw new GraphError(
                GraphIssueCode.UNKNOWN_NODE_TYPE,
                `No node type called "${node.type}".`,
                { node: node.id }
            );
        }
        byId.set(node.id, node);
        definitions.set(node.id, definition);

        if (definition.event) {
            if (!entries.has(definition.event)) entries.set(definition.event, []);
            entries.get(definition.event).push(node.id);
        }
    }

    // Two indexes, because flow is pushed and data is pulled. Flow is keyed by the OUTPUT
    // it leaves — one target, so a lookup answers "what runs next". Data is keyed by the
    // INPUT it feeds — one source, so a lookup answers "where does this value come from".
    const flow = new Map();
    const data = new Map();

    for (const connection of graph.connections ?? []) {
        const source = byId.get(connection.from?.node);
        const target = byId.get(connection.to?.node);
        if (!source || !target) continue;

        const ports = portsOf(definitions.get(source.id), source, {});
        const output = ports.outputs.find(port => port.id === connection.from.port);
        // A port a node no longer declares is skipped rather than fatal: the validator
        // reports it, and a graph with one stale wire still runs the rest.
        if (!output) continue;

        const index = output.kind === PortKind.FLOW ? flow : data;
        const key = output.kind === PortKind.FLOW
            ? portKey(connection.from.node, connection.from.port)
            : portKey(connection.to.node, connection.to.port);

        if (!index.has(key)) index.set(key, connection);
    }

    return { byId, definitions, entries, flow, data };
}

/**
 * Run every entry node of one event, in graph order.
 *
 * Graph order, not an arbitrary one: two `On Update` nodes in one graph run in the order
 * the payload lists them, on every machine. Determinism is not something added later, it is
 * this line (ADR-0011).
 */
function runEvent(compiled, event, state, budget) {
    for (const id of compiled.entries.get(event) ?? []) {
        const node = compiled.byId.get(id);
        const definition = compiled.definitions.get(id);
        const outputs = portsOf(definition, node, {}).outputs;
        const flows = outputs.filter(port => port.kind === PortKind.FLOW).map(port => port.id);

        // AN ENTRY NODE MAY SAY WHICH OF ITS FLOWS FIRED, and it says it the way every
        // other flow node already does: `execute(io) -> portId | portId[] | null`, the
        // contract `Sequence` and `Branch` are written against (ADR-0041 §3).
        //
        // WHY THIS IS WHAT MAKES `On Key` POSSIBLE. `On Update` fires unconditionally, so
        // "run every flow output" was indistinguishable from "run the ones that happened".
        // The moment an event is CONDITIONAL — a key that went down this step and not the
        // one before — the node is the only thing that can answer, because only it knows
        // what it is watching. Asking it costs no new vocabulary: a definition that stays
        // silent still fires everything, which is exactly what `On Start` and `On Update`
        // want and why neither of them changed.
        // AN EVENT MAY HAPPEN MORE THAN ONCE IN A STEP, AND EACH TIME CARRIES ITS OWN VALUES
        // (ADR-0059 §5.1). A player touching two enemies in one step is two collisions, not
        // one collision with two `Other`s — and a single firing could only hand over one of
        // them. So an entry node may answer with a LIST OF FIRINGS, each its own `{ next,
        // values }`, and every one starts a flow of its own with its own pushed values.
        //
        // A LIST OF STRINGS IS STILL ONE FIRING DOWN SEVERAL PORTS, which is what `On Key`
        // answers when a key goes down and is held in the same step. The two are told apart
        // by what the list HOLDS, which is unambiguous and needs no flag.
        const frame = { values: new Map(), produced: new Map() };
        const answered = definition.execute
            ? definition.execute(io(compiled, node, state, frame, new Set()))
            : flows;

        for (const firing of firingsOf(answered)) {
            // ONE PUSHED-VALUE TABLE PER FIRING, so the second collision of a step cannot
            // read the `Other` of the first.
            const produced = new Map();
            for (const [port, value] of globalThis.Object.entries(producedValues(firing) ?? {})) {
                produced.set(portKey(id, port), value);
            }

            for (const portId of continuationsOf(firing)) {
                const start = compiled.flow.get(portKey(id, portId));
                if (start) walk(compiled, [start.to], produced, state, budget);
            }
        }
    }
}

/**
 * What an entry node answered, as a list of separate firings.
 *
 * @param {any} result - What `execute` answered, or the node's flow ports when it has none
 * @returns {Array<any>} One entry per firing, each readable by `continuationsOf()`
 */
function firingsOf(result) {
    const several = globalThis.Array.isArray(result)
        && result.length > 0
        && result.every(entry => Boolean(entry) && typeof entry === 'object');

    return several ? result : [result];
}

/**
 * What a node answered, as a list of flow ports to continue down.
 *
 * ONE SHAPE FOR FIVE ANSWERS: nothing, one port, several, a port AND the values the node
 * produced, or a port and a DELAY before it is taken. `Branch` returns a string, `Sequence`
 * an array, a node with nothing to do returns null, `Spawn` returns `{ next, values }` and
 * `Delay` returns `{ next, wait }` — and both callers of `execute` have to read them the same
 * way, or an entry node and a flow node would disagree about what returning `null` means.
 *
 * `next` IS READ THE SAME WAY IN ALL OF THEM, which is why a waiting node needs no vocabulary
 * of its own: what changes is not WHERE the flow goes, it is WHEN (`waitOf()`).
 *
 * @param {string|string[]|object|null|undefined} result - What `execute` answered
 * @returns {string[]} The flow ports to follow, in order
 */
function continuationsOf(result) {
    if (result === null || result === undefined) return [];
    if (globalThis.Array.isArray(result)) return result;
    if (typeof result === 'object') return continuationsOf(result.next);
    return [result];
}

/**
 * The values a flow node produced, or null when it produced none (ADR-0056 §4).
 *
 * A FLOW NODE MAY ALSO ANSWER WITH VALUES, and until `Spawn` there was no node that had to.
 * A data output is pulled — the interpreter calls `evaluate` whenever something downstream
 * reads it — and pulling is exactly what a node with an effect must not accept: `Spawn`
 * asked twice would create two objects, and asked never would create none. So the value is
 * PUSHED, once, at the moment the node runs, and whoever reads it later reads what that one
 * run produced.
 *
 * @param {string|string[]|object|null|undefined} result - What `execute` answered
 * @returns {object|null} `{ [portId]: value }`, or null
 */
function producedValues(result) {
    if (!result || typeof result !== 'object' || globalThis.Array.isArray(result)) return null;
    return result.values ?? null;
}

/**
 * Follow a flow from the connection an event fired down.
 *
 * @param {object} compiled - The compiled graph
 * @param {object|null} start - The connection to follow, or null when nothing is wired
 * @param {object} state - The running state
 * @param {number} budget - Nodes one execution may run
 */
function runFlow(compiled, start, state, budget) {
    if (!start) return;

    // WHAT THE FLOW HAS PRODUCED SO FAR, AND WHY IT OUTLIVES A FLOW STEP WHEN NOTHING ELSE
    // DOES. `Spawn` creates the Object and the node three cards later positions it, so the
    // handle has to survive from one flow step to the next — which the per-step value cache
    // below deliberately does not do. It is scoped to THIS execution and nothing wider: it
    // never reaches a component, a payload or a frame, and `producedFrom()` re-asks the Scene
    // before handing an Object back. So a handle is never memoised past the moment the Scene
    // still answers for it (ADR-0034 invariant 3, ADR-0056 §4) — which is also what lets it
    // travel across a `Delay` without becoming a stale reference (ADR-0058 §3).
    walk(compiled, [start.to], new Map(), state, budget);
}

/**
 * Walk a flow, depth-first, until it runs out, suspends, or runs over budget.
 *
 * DEPTH-FIRST IS NOT AN IMPLEMENTATION DETAIL. A `Sequence` continues twice, and a creator
 * means "everything the first branch does, then everything the second does" — not the two
 * interleaved. A stack fed in reverse gives exactly that, and gives it deterministically.
 *
 * IT TAKES THE STACK AND THE PRODUCED VALUES RATHER THAN BUILDING THEM, which is the whole
 * of what suspension needed from this function: resuming is walking again from one node, with
 * the values the execution had already produced (ADR-0058 §3).
 *
 * @param {object} compiled - The compiled graph
 * @param {Array<{node: string, port: string}>} stack - Where to continue, last popped first
 * @param {Map} produced - What this execution has pushed out of flow nodes so far
 * @param {object} state - The running state
 * @param {number} budget - Nodes this execution may run
 */
function walk(compiled, stack, produced, state, budget, resumed = null) {
    let steps = 0;

    // THE CONTINUATION THAT RE-ENTERED, AND IT APPLIES TO THE FIRST NODE ONLY. A node that
    // asked to be run again has to be able to tell that pass from the one that arrived down a
    // wire — `Every` starts its clock on the way in and fires on the way back — and it has to
    // be told how far PAST its deadline this step landed, or a repeating node drifts by half
    // a step every time round (ADR-0058 §5.1).
    //
    // ONLY A NODE THAT PARKED AT ITSELF IS RESUMING. A `wait` parks at the node AFTER the one
    // that waited (see below), so the first node of that walk never suspended anything — and
    // marking it resumed told the node a lie: an `Every` behind a `Delay` read `io.resumed`,
    // decided it was coming back from its own interval, and fired on arrival instead of after
    // it. An `again` parks at the node itself, and that one really is a return.
    let entered = resumed?.again ? resumed : null;

    while (stack.length > 0) {
        if (++steps > budget) {
            throw new GraphError(
                GraphIssueCode.BUDGET_EXCEEDED,
                `This graph ran more than ${budget} nodes in one event; it is probably looping.`,
                { node: stack.at(-1)?.node ?? null }
            );
        }

        const reached = stack.pop();
        const node = compiled.byId.get(reached.node);
        if (!node) continue;

        const definition = compiled.definitions.get(node.id);
        // A NEW VALUE CACHE PER FLOW STEP. Memoising across a whole event would let a
        // `Get Property` read before a `Set Property` and keep serving the old value after
        // it — the graph would then disagree with the model it just wrote.
        const frame = { values: new Map(), produced };
        // `<= 0` when the step overshot the deadline, `0` on the way in.
        const overshoot = entered ? globalThis.Math.min(entered.remaining, 0) : 0;
        const wasResumed = entered !== null;
        // WHAT THE NODE WAS IN THE MIDDLE OF (ADR-0058 §6.3). Opaque to the interpreter,
        // private to THIS execution, and handed back only to the node that parked it.
        const kept = entered?.kept ?? null;
        entered = null;

        const result = definition.execute
            ? definition.execute(io(compiled, node, state, frame, new Set(), wasResumed, kept))
            : null;

        const values = producedValues(result);
        if (values) {
            for (const [port, value] of globalThis.Object.entries(values)) {
                produced.set(portKey(node.id, port), value);
            }
        }

        const continuations = continuationsOf(result);

        // THE NODE SAID "NOT YET", AND THIS EXECUTION STOPS HERE (ADR-0058 §3). What would
        // have been pushed onto the stack is parked instead, carrying the one thing resuming
        // needs that the graph does not already hold: where it stopped, and what it had
        // produced. The walk then continues with whatever else is on the stack — a `Sequence`
        // whose first branch waits does not hold up its second.
        const waiting = waitOf(result);
        if (waiting !== null) {
            for (const portId of continuations) {
                const next = compiled.flow.get(portKey(node.id, portId));
                if (next) suspend(state, { remaining: waiting, to: next.to, produced }, node);
            }
            continue;
        }

        // THE NODE ASKED TO BE ASKED AGAIN (ADR-0058 §5). It is parked at ITSELF rather than
        // at what follows it, so resuming re-runs its `execute` — which is what lets a
        // condition be re-read (`Wait Until`) or a clock be restarted (`Every`) without any
        // node-local state existing anywhere. It does not stop the flow: a node may fire a
        // continuation AND come back, which is exactly what repeating means.
        //
        // THE OVERSHOOT IS CARRIED, AND CLAMPED TO ONE INTERVAL. Without it a repeating node
        // loses the fraction of a step it landed past its deadline, every time, and an
        // interval of 1 s at 0.3 s a step drifts into 1.2 s. Clamping stops an interval of
        // zero — which is "every step" — from accumulating a debt it can never repay.
        const back = againOf(result);
        if (back !== null) {
            const carried = globalThis.Math.max(overshoot, -back);
            suspend(state, {
                remaining: back + carried,
                to: { node: node.id, port: 'in' },
                produced,
                kept: keptBy(result),
                // PARKED AT ITSELF, so the pass that picks this up is a RETURN and says so.
                again: true
            }, node);
        }

        // Reversed, so the first declared continuation is the first one popped.
        for (let index = continuations.length - 1; index >= 0; index--) {
            const next = compiled.flow.get(portKey(node.id, continuations[index]));
            if (next) stack.push(next.to);
        }
    }
}

/**
 * How long a node asked to wait before being run AGAIN, or null when it asked for nothing.
 *
 * THE OTHER HALF OF THE SUSPENSION VOCABULARY, AND THE TWO ARE NOT THE SAME QUESTION:
 *
 *   `wait`   delay the flow this node names — the node is finished, `Delay`
 *   `again`  come back to THIS node — the node is not finished, `Wait Until`, `Every`
 *
 * A node that asks for `0` is asking for the next step, which is the shortest wait there is
 * and not the absence of one — that is the one place `again` reads differently from `wait`,
 * and it is why it is a separate word rather than a flag on the same one.
 *
 * @param {string|string[]|object|null|undefined} result - What `execute` answered
 * @returns {number|null} Seconds before the node is run again, or null
 */
/**
 * The private state a node asked its continuation to carry, or null.
 *
 * OPAQUE, AND THAT IS THE WHOLE CONTRACT. The interpreter never reads inside it, never
 * copies it, and never hands it to anything but the node that parked it — so it is not a
 * second kind of value, not a port, and nothing a graph or a payload can see. It exists
 * because `where to resume` is not enough for a node that is in the MIDDLE of something: a
 * `Tween` has to know how far along it is, and asking the graph would be asking a shared,
 * immutable reading for a per-execution fact (ADR-0058 §6.3).
 *
 * PER EXECUTION, NEVER PER NODE. It rides the continuation, so two passes through one
 * `Tween` carry two of these and neither can see the other — the same reason `pending` is a
 * list and not a table keyed by node (§4).
 *
 * @param {string|string[]|object|null|undefined} result - What `execute` answered
 * @returns {any} The value to hand back on the next pass, or null
 */
function keptBy(result) {
    if (!result || typeof result !== 'object' || globalThis.Array.isArray(result)) return null;
    return result.keep ?? null;
}

function againOf(result) {
    if (!result || typeof result !== 'object' || globalThis.Array.isArray(result)) return null;

    const again = result.again;
    if (again === true) return 0;
    return typeof again === 'number' && globalThis.Number.isFinite(again) && again >= 0 ? again : null;
}

/**
 * How long a node asked to wait before its flow continues, or null when it asked for nothing.
 *
 * THE FIFTH SHAPE `execute` MAY ANSWER WITH, and the only one that does not continue now:
 * `{ wait, next }` says "continue down `next`, in `wait` seconds". Everything else about the
 * answer is read exactly as before — `next` by `continuationsOf()`, `values` by
 * `producedValues()` — so a node that waits AND produces needs no third rule.
 *
 * A WAIT MUST BE A FINITE POSITIVE NUMBER, and anything else is no wait at all rather than a
 * different kind of wait. `0`, a negative, `NaN` and `Infinity` all mean the flow continues
 * in this very step — which is the reading the catalogue's own `number()` already gives a
 * non-finite value everywhere else, and which keeps a waiting node bounded by the ordinary
 * budget instead of inventing a second way to run for ever (ADR-0058 §5).
 *
 * @param {string|string[]|object|null|undefined} result - What `execute` answered
 * @returns {number|null} Seconds to wait, or null
 */
function waitOf(result) {
    if (!result || typeof result !== 'object' || globalThis.Array.isArray(result)) return null;

    const wait = result.wait;
    return typeof wait === 'number' && globalThis.Number.isFinite(wait) && wait > 0 ? wait : null;
}

/**
 * What a node is handed when it runs.
 *
 * Deliberately small: its own params, its inputs, the component it belongs to, the object
 * carrying it, and the step context. Nothing global, nothing injected from an environment,
 * and no way to reach storage — which is the whole reason a graph is safe to share.
 */
function io(compiled, node, state, frame, visiting, resumed = false, kept = null) {
    return {
        node,
        // WHAT THIS NODE ASKED TO KEEP LAST TIME, or null on the way in (ADR-0058 §6.3).
        kept,
        // WHETHER THIS PASS CAME BACK OR CAME IN (ADR-0058 §5). The only thing a repeating
        // node needs to tell its two passes apart, and it is derived from the continuation
        // rather than stored anywhere: there is still no node-local state.
        resumed,
        self: state.self,
        ctx: state.ctx,
        component: state.component,
        properties: state.properties,
        log: state.log,
        param: name => node.params?.[name],
        input: portId => readInput(compiled, node, portId, state, frame, visiting),
        // WHETHER SOMETHING IS ACTUALLY CONNECTED, which is not the same question as whether
        // the value read is null. A node that can take its Object from a socket OR from a
        // connection has to tell "nothing is wired" from "a wire brought nothing": falling
        // back to the picker because a `Find By Tag` found no one would write to the wrong
        // Object, silently. This answers the structural question, so the fallback is a rule
        // rather than a guess (ADR-0039 §0.3).
        wired: portId => compiled.data.has(portKey(node.id, portId))
    };
}

/** The value feeding one of a node's data inputs, or that input's declared default. */
function readInput(compiled, node, portId, state, frame, visiting) {
    const connection = compiled.data.get(portKey(node.id, portId));
    if (!connection) return defaultOf(compiled, node, portId, state);

    return evaluate(compiled, connection.from.node, connection.from.port, state, frame, visiting);
}

/**
 * Pull a value out of an output port, reading whatever it depends on first.
 *
 * Memoised within one flow step, so a value feeding three inputs is computed once and all
 * three see the same number — which matters the moment a node stops being pure.
 */
function evaluate(compiled, nodeId, portId, state, frame, visiting) {
    const key = portKey(nodeId, portId);
    if (frame.values.has(key)) return frame.values.get(key);

    if (visiting.has(nodeId)) {
        throw new GraphError(
            GraphIssueCode.DATA_CYCLE,
            'These values depend on each other, so there is no order to evaluate them in.',
            { node: nodeId, port: portId }
        );
    }

    const node = compiled.byId.get(nodeId);
    if (!node) return null;

    const definition = compiled.definitions.get(nodeId);

    // A FLOW NODE IS READ, NEVER RE-RUN. It has no `evaluate` to call, and calling its
    // `execute` here would run its EFFECT to answer a question — a `Spawn` read by two
    // downstream nodes would create two Objects (ADR-0056 §4).
    if (!definition.evaluate && definition.execute) {
        return producedFrom(definition, node, portId, state, frame);
    }

    visiting.add(nodeId);
    let produced = {};
    try {
        produced = definition.evaluate ? definition.evaluate(io(compiled, node, state, frame, visiting)) ?? {} : {};
    } finally {
        visiting.delete(nodeId);
    }

    for (const [port, value] of globalThis.Object.entries(produced)) {
        frame.values.set(portKey(nodeId, port), value);
    }

    return frame.values.has(key) ? frame.values.get(key) : null;
}

/**
 * What a flow node handed out when it ran, earlier in this same flow (ADR-0056 §4).
 *
 * NOTHING BEFORE THE NODE RAN, AND NOTHING AFTER THE FLOW ENDED. A `Spawn` read by a branch
 * that reached the reader first answers `null`, which is the honest reading of "it has not
 * happened yet" — and the same `null` a disconnected port yields, so the consumer needs no
 * second rule.
 *
 * AN OBJECT IS RE-ASKED OF THE SCENE, EVERY READ. The store holds a handle, and a handle
 * that a later `Destroy` has invalidated must not be handed on as if it were live: an Object
 * that is no longer in the Scene reads as nothing, exactly as a dead `objectref` does
 * (`portValueOf`, ADR-0034 §3.4). That is what keeps a memo from outliving the thing it
 * memoises, which is the whole of invariant 3.
 *
 * @param {object} definition - The node type
 * @param {object} node - The node instance
 * @param {string} portId - The output port being read
 * @param {object} state - The running state
 * @param {object} frame - The current flow step's frame, carrying the flow's `produced` store
 * @returns {any} The value that node produced, or null
 */
function producedFrom(definition, node, portId, state, frame) {
    const key = portKey(node.id, portId);
    if (!frame.produced?.has(key)) return null;

    const value = frame.produced.get(key);
    const port = portOf(definition, node, PortDirection.OUTPUT, portId, { properties: state.properties });
    if (!carriesObjects(port?.type)) return value;

    const scene = state.ctx?.scene ?? null;
    if (typeof scene?.has !== 'function') return value;

    // A LIST OF HANDLES IS THE SAME SENTENCE, ELEMENT BY ELEMENT — and it is the shape
    // `portTypeOf()` gives a property declared `list<objectref>` (ADR-0034 §3.5). A dead
    // entry reads as nothing and KEEPS ITS SLOT, exactly as `portValueOf()` answers on the
    // way in; dropping it would renumber a list a graph may be indexing into.
    if (globalThis.Array.isArray(value)) return value.map(item => (scene.has(item) ? item : null));

    return scene.has(value) ? value : null;
}

/**
 * What an unconnected data input yields (ADR-0031 §1).
 *
 * THE ONE PLACE THE PRIORITY IS RESOLVED, and that is why it is worth stating here rather
 * than in the Editor:
 *
 *     connection  >  node.inputs[port]  >  the type's declared port default
 *
 * A connection never reaches this function — the caller has already followed it — so what
 * is left is the last two: what the creator typed into this particular node, and what the
 * catalogue promises a node nobody has touched.
 *
 * `in` rather than `??`, deliberately: `0`, `''` and `false` are values a creator may have
 * meant, and a nullish check would quietly hand back the type's default for all three.
 *
 * @param {object} compiled - The compiled graph
 * @param {object} node - The node whose input is being read
 * @param {string} portId - The input port
 * @param {object} state - The running state, carrying the component's properties
 * @returns {any} The value the port yields
 */
function defaultOf(compiled, node, portId, state) {
    const port = portOf(
        compiled.definitions.get(node.id),
        node,
        PortDirection.INPUT,
        portId,
        { properties: state.properties }
    );

    // A HANDLE IS NOT A VALUE A GRAPH CAN HOLD (ADR-0034 §3.6). `node.inputs` is data of the
    // `.px`, so anything sitting there for an `object` port would be an identity belonging
    // to a scene, stored inside a resource of PROJECT scope — the one thing ADR-0034 exists
    // to prevent, arriving through a payload nobody drew.
    //
    // THE VALUE IS REFUSED, NOT INSPECTED, and that is what makes it airtight: a forged
    // record carrying an `id` and a `name` is indistinguishable from a real handle to a node
    // that duck-types. There is nothing worth checking, so nothing is checked — an
    // unconnected `object` port yields nothing, always, whatever the payload says.
    // A LIST OF HANDLES IS THE SAME SENTENCE, and it was not asked: the guard compared the
    // type to `object` and an `array<object>` port is not that string, so a payload could
    // hand a list of forged records through and `storedValueOf()` would map them to stored
    // scene identities. `carriesObjects()` is the Core's own reading of the type
    // (core/graph/nodes.js), asked once rather than spelled out twice.
    if (carriesObjects(port?.type)) return null;

    if (node.inputs && portId in node.inputs) return node.inputs[portId];

    return port?.default ?? null;
}

/**
 * The key one port is indexed under, for the compiled flow and data maps.
 *
 * A NUL SEPARATES THE TWO HALVES because it is the one character an identifier cannot
 * hold, so no pair of ids can collide by containing the separator themselves.
 *
 * IT IS WRITTEN AS AN ESCAPE, AND MUST STAY ONE. Typed literally it is still a valid
 * template character and the same string at run time — but the file stops being text:
 * grep reports "Binary file … matches" instead of the line, `git diff` refuses to show
 * the hunk, and every tool that scans sources skips it silently. This module hid an
 * `import { migrateNode }` from a repository-wide search that way.
 */
function portKey(nodeId, portId) {
    return `${nodeId}\u0000${portId}`;
}
