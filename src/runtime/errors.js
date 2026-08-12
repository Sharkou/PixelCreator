// How the runtime reports a failure in user code (ADR-0012).
//
// THE RULE THAT SHAPES THIS FILE:
// the runtime isolates an exception and reports it. It stops there. It never mutates
// the model in reaction to one.
//
// Isolation is a mechanism; deciding what a failure *means* is a policy. Showing it in
// the Editor, pausing the script, counting it, switching it off, applying something
// stricter on a server — all of that belongs to the layer above, which receives the
// report and acts on it.
//
// Legacy conflated the two, and an earlier draft of this runtime reproduced it: after a
// few consecutive throws the component was switched off by writing `component.active =
// false`. That write is a model mutation like any other — it travels the reactive write
// path and emits a Change — so an exception in a script silently rewrote the simulation
// state. For an authoritative multiplayer engine that is exactly backwards: the state a
// server arbitrates would depend on whether some client's script happened to throw, on
// that machine, on that frame.
//
// So `component.active` stays an ordinary reactive property (ADR-0004). The runtime and
// the scene renderer READ it to decide what to run. Only user code, a component or the
// Editor WRITES it, through the normal Property System.

import { componentType } from '../core/component.js';

/**
 * The report handed to `onError`.
 *
 * Structured on purpose: the consumer reads fields, it never parses a message. That is
 * what lets the Editor group failures by component, show the object that carries it, or
 * tell an update failure from a draw failure — none of which is recoverable from a
 * string.
 *
 * @typedef {object} ComponentFailure
 * @property {Error} error - The original error, exactly as thrown and never modified
 * @property {object|null} object - The Object whose component failed
 * @property {object|null} component - The component that failed
 * @property {string|null} type - The component's type name
 * @property {'update'|'draw'} phase - Which hook threw
 * @property {number|null} time - Simulation time of the failure, null when unknown
 */

/**
 * Build a failure report.
 * @param {object} failure - The failure being described
 * @param {Error} failure.error - The original error
 * @param {object} [failure.object] - The Object whose component failed
 * @param {object} [failure.component] - The component that failed
 * @param {'update'|'draw'} failure.phase - Which hook threw
 * @param {number|null} [failure.time] - Simulation time of the failure
 * @returns {ComponentFailure} The report
 */
export function componentFailure({ error, object, component, phase, time = null }) {
    return {
        error,
        object: object ?? null,
        component: component ?? null,
        type: safeType(component),
        phase,
        time
    };
}

/**
 * Default reporter, used when no `onError` is supplied.
 *
 * Deferred so the current frame finishes: the other components still run, and the
 * throw lands on the environment's uncaught-error path where it cannot be missed. An
 * unreported failure is the Legacy bug this exists to avoid — `Tilemap` threw on every
 * frame for as long as it was attached, and nothing ever said so.
 *
 * The original error is never touched. Context is carried by a wrapper instead, so
 * `thrown.cause` is the untouched error and the report's `error` is that same object.
 *
 * @param {ComponentFailure} report - The failure to report
 */
export function rethrowLater(report) {
    const { error, type, phase, object } = report;
    queueMicrotask(() => {
        throw new Error(
            `${phase}() failed on ${type ?? 'component'} of object ${object?.id}`,
            { cause: error }
        );
    });
}

/**
 * Resolve a component's type name without ever throwing.
 *
 * A reporting path that can itself fail would lose the failure it was reporting, so an
 * unnameable component is described as null rather than raising.
 *
 * @param {object} [component] - The component
 * @returns {string|null} The type name, or null when it cannot be determined
 */
function safeType(component) {
    if (!component) return null;
    try {
        return componentType(component);
    } catch {
        return null;
    }
}
