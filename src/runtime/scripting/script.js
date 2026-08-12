// Script — the component that runs a compiled script.
//
// A script is not a new kind of thing the runtime has to know about. It is a component
// whose behaviour happens to come from a source rather than from a class someone wrote
// by hand. Everything the runtime does to a component, it does to this one.
//
// WHY THE BEHAVIOR IS NOT STORED ON THE COMPONENT.
// A component's own enumerable properties are its serialized state (core/serialize.js).
// A compiled behavior is a live object with methods — it is not state, it is derived
// from `kind` and `source`, and writing it onto the component would put functions into
// every snapshot and every replicated payload. It lives in a WeakMap keyed by the
// component instead, so what serializes is exactly what identifies the script: its kind
// and its source.
//
// COMPILED ON FIRST USE, RECOMPILED WHEN THE SOURCE CHANGES.
// There is no separate load phase to forget to call, and editing `source` in the
// Inspector takes effect on the next step. A compile failure surfaces as a throw from
// `update()`, which the runtime reports without touching the model (ADR-0012) — the
// author sees the error, and the simulation state is not quietly rewritten.
//
// ONE SCRIPT PER OBJECT, FOR NOW. An Object holds one component per type (ADR-0004), so
// it holds one `Script`. Running several scripts on one object is a real need and the
// answer is not to relax that rule: a compiled script should eventually become its own
// registered component type, which gives it a name, a schema and an Inspector entry.
// That belongs with resource loading, not here.
//
// NO `draw()`, DELIBERATELY.
// The scene renderer establishes an object's transform as soon as one of its components
// declares `draw` (rendering/scene-renderer.js). A `Script` that always declared one
// would make every scripted object — including objects that are pure logic — pay a
// save/setTransform/restore every frame and count as drawn. Scripts that produce pixels
// are worth having, but they need a component type that means it, not a hook on the
// generic runner.

/** Compiled behaviors, keyed by the component that owns them. */
const behaviors = new WeakMap();

export class Script {

    static type = 'Script';

    static schema = {
        kind: { type: 'string', default: 'js' },
        source: { type: 'string', default: '' }
    };

    /**
     * Create a script component.
     * @param {any} [source] - Source, in whatever shape the kind expects
     * @param {string} [kind] - Script kind, as registered on the Scripting host
     */
    constructor(source = '', kind = 'js') {
        this.kind = kind;
        this.source = source;
    }

    /**
     * Run the script for one simulation step.
     * @param {object} self - The owning object
     * @param {object} ctx - The update context, carrying the Scripting host
     */
    update(self, ctx) {
        behaviorOf(this, ctx.scripting).update?.(self, ctx);
    }
}

/**
 * The behavior for a script component, compiling it if needed.
 *
 * @param {object} script - The Script component, as the runtime sees it
 * @param {object} [scripting] - The Scripting host from the update context
 * @returns {object} The compiled behavior
 */
function behaviorOf(script, scripting) {
    const { kind, source } = script;

    const cached = behaviors.get(script);
    if (cached && cached.kind === kind && cached.source === source) return cached.behavior;

    if (!scripting) {
        throw new Error(
            'Script: the update context carries no Scripting host. ' +
            'Build the runtime with { scripting } to run scripts.'
        );
    }

    const behavior = scripting.compile({ kind, source });
    behaviors.set(script, { kind, source, behavior });
    return behavior;
}
