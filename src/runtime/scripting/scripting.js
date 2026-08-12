// Scripting — how user code becomes something the simulation runs.
//
// WHAT THIS IS NOT. It is not a language, not an interpreter, not a VM and not a
// sandbox. None of those is decided yet, and building one now would decide it by
// accident. What is decided here is the seam: a *script kind* turns a source into a
// *behavior*, and a behavior is run by the ordinary component pipeline.
//
//   source  ──(kind compiler)──►  behavior  ──(Script component)──►  update(self, ctx)
//
// THERE IS NO ScriptSystem. A script runs because a component runs it, exactly like
// every other piece of gameplay logic (ADR-0005). That is not a stylistic preference:
// it means scripts inherit error isolation (ADR-0012), the fixed step, the update/draw
// separation and headless execution for free, with no second code path to keep in sync
// between client and server.
//
// TWO KINDS ARE PLANNED, NEITHER IS BUILT HERE (ADR-0009):
//   'px' — a graph resource, interpreted. Needs the graph model and its interpreter.
//   'js' — a real ES module. Needs resource loading, and `import()` of a specifier the
//          host resolves; evaluating source text is deliberately not on the table.
// Both arrive as their own steps. A Scripting host therefore ships with no kind
// registered, and that is the correct empty state: it is a registry, not a language.

/**
 * What a compiled script exposes.
 *
 * Duck-typed, like components (ADR-0004): any object with these methods will do, and
 * both are optional.
 *
 * @typedef {object} Behavior
 * @property {(self: object, ctx: object) => void} [update] - Simulation, client and server
 */

export class Scripting {

    #kinds = new Map();

    /**
     * Register a script kind.
     * @param {string} kind - Kind name, such as 'px' or 'js'
     * @param {(source: any) => Behavior} compile - Turns a source into a behavior
     * @returns {Scripting} This host, so registrations can chain
     */
    define(kind, compile) {
        if (typeof kind !== 'string' || kind === '') {
            throw new TypeError('Scripting.define: expected a kind name');
        }
        if (typeof compile !== 'function') {
            throw new TypeError(`Scripting.define: "${kind}" needs a compile function`);
        }
        if (this.#kinds.has(kind)) {
            throw new Error(`Scripting: kind "${kind}" is already defined`);
        }
        this.#kinds.set(kind, compile);
        return this;
    }

    /**
     * Tell whether a kind is registered.
     * @param {string} kind - Kind name
     * @returns {boolean} True when known
     */
    has(kind) {
        return this.#kinds.has(kind);
    }

    /** The registered kind names, sorted. */
    kinds() {
        return [...this.#kinds.keys()].sort();
    }

    /**
     * Compile a script into a behavior.
     *
     * Throws rather than returning null on an unknown kind or a bad compiler result.
     * A script that cannot be compiled is a failure the author has to see, and the
     * runtime already knows how to surface a throw without touching the model
     * (ADR-0012) — swallowing it here would recreate the Legacy silence.
     *
     * @param {object} script - The script to compile
     * @param {string} script.kind - Kind name
     * @param {any} script.source - Source, in whatever shape the kind expects
     * @returns {Behavior} The compiled behavior
     */
    compile({ kind, source }) {
        const compile = this.#kinds.get(kind);
        if (!compile) {
            const known = this.kinds();
            const list = known.length > 0 ? known.join(', ') : 'none';
            throw new Error(`Scripting: no compiler for script kind "${kind}" (registered: ${list})`);
        }

        const behavior = compile(source);
        if (!behavior || typeof behavior !== 'object') {
            throw new TypeError(`Scripting: the "${kind}" compiler did not return a behavior`);
        }
        return behavior;
    }
}
