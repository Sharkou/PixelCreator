// How a graph reports that it is wrong, or that it cannot be run (ADR-0027, ADR-0012).
//
// STRUCTURED, NEVER A STRING. A consumer reads fields — which node, which port, which
// code — it never parses a message. That is what lets the Graph window mark the offending
// node, a test assert on a code rather than on prose, and a future Console group failures
// by cause. It is the same contract `runtime/errors.js` sets for a component failure, for
// the same reason.
//
// TWO SHAPES, ONE VOCABULARY. `GraphIssue` is a finding — validation produces a list of
// them and nothing is thrown. `GraphError` is a refusal — the interpreter throws it, the
// runtime isolates it and reports it, and the model is left exactly as it was (ADR-0012).
// Both carry the same `code`, so "the validator warned about this" and "this is what broke
// at run time" are the same word.

/** What can be wrong with a graph. */
export const GraphIssueCode = {
    /** The payload declares a version this build does not know how to read. */
    UNKNOWN_VERSION: 'UNKNOWN_VERSION',
    /** A node names a type no catalogue declares. */
    UNKNOWN_NODE_TYPE: 'UNKNOWN_NODE_TYPE',
    /** Two nodes claim one identifier. */
    DUPLICATE_NODE_ID: 'DUPLICATE_NODE_ID',
    /** A connection names a node the graph does not hold. */
    UNKNOWN_NODE: 'UNKNOWN_NODE',
    /** A connection names a port the node does not have. */
    UNKNOWN_PORT: 'UNKNOWN_PORT',
    /** A connection joins a flow port to a data port. */
    PORT_KIND_MISMATCH: 'PORT_KIND_MISMATCH',
    /** A connection leaves an input, or arrives at an output. */
    PORT_DIRECTION_MISMATCH: 'PORT_DIRECTION_MISMATCH',
    /** A data connection carries a value the target port cannot hold. */
    TYPE_MISMATCH: 'TYPE_MISMATCH',
    /** A data input, or a flow output, is fed twice. */
    PORT_ALREADY_CONNECTED: 'PORT_ALREADY_CONNECTED',
    /** A node references a property the component no longer declares. */
    MISSING_PROPERTY: 'MISSING_PROPERTY',
    /** A node references nothing at all where a reference is required. */
    MISSING_REFERENCE: 'MISSING_REFERENCE',
    /** Values feeding values in a circle: there is no order to evaluate them in. */
    DATA_CYCLE: 'DATA_CYCLE',
    /** A flow loops back on itself with nothing to stop it. */
    FLOW_CYCLE: 'FLOW_CYCLE',
    /** One event ran more steps than any honest graph needs. */
    BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
    /** A node connects to itself. */
    SELF_CONNECTION: 'SELF_CONNECTION'
};

/** How much an issue matters. A graph with errors does not run; one with warnings does. */
export const GraphSeverity = {
    ERROR: 'error',
    WARNING: 'warning'
};

/**
 * Build a finding.
 *
 * @param {object} issue - The finding
 * @param {string} issue.code - One of GraphIssueCode
 * @param {string} issue.message - A sentence a panel may show
 * @param {string} [issue.severity] - One of GraphSeverity; ERROR by default
 * @param {string} [issue.node] - The node it is about
 * @param {string} [issue.port] - The port it is about
 * @param {string} [issue.connection] - The connection it is about
 * @param {string} [issue.property] - The property it is about
 * @returns {object} A frozen issue
 */
export function graphIssue({ code, message, severity = GraphSeverity.ERROR, node, port, connection, property }) {
    return globalThis.Object.freeze({
        code,
        severity,
        message,
        node: node ?? null,
        port: port ?? null,
        connection: connection ?? null,
        property: property ?? null
    });
}

/**
 * A graph that cannot be run.
 *
 * Thrown, never returned: the runtime already isolates a throw during `update()` and
 * reports it without touching the model, so a graph failure travels the path a component
 * failure travels and needs no second mechanism (ADR-0012, ADR-0015 §7).
 */
export class GraphError extends Error {

    /**
     * @param {string} code - One of GraphIssueCode
     * @param {string} message - What went wrong
     * @param {object} [details] - `{ node, port, connection, property, cause }`
     */
    constructor(code, message, details = {}) {
        super(message, details.cause ? { cause: details.cause } : undefined);
        this.name = 'GraphError';
        this.code = code;
        this.node = details.node ?? null;
        this.port = details.port ?? null;
        this.connection = details.connection ?? null;
        this.property = details.property ?? null;
    }
}

/**
 * The first finding that stops a graph from running, or null.
 * @param {object[]} issues - Findings, as validateGraph() produces them
 * @returns {object|null} The first error-severity finding
 */
export function firstError(issues) {
    return issues.find(issue => issue.severity === GraphSeverity.ERROR) ?? null;
}
