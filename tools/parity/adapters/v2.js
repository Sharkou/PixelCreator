// v2 adapter — deliberately not implemented.
//
// The v2 Core does not exist yet, and MUST NOT be started before this harness captures
// Legacy's behaviour (MIGRATION.md §5, step 1). This file exists so the shape of the
// contract is visible now, and so `run.js --target=v2` fails with a clear message
// instead of a stack trace.
//
// When core/ lands, implement exactly the same neutral API as adapters/legacy.js, with
// this mapping (ADR-0003):
//
//   writeDirect(t, p, v)      →  t[p] = v                    // Change, no Operation
//   writeControlled(t, p, v)  →  t.setProperty(p, v)         // Change + Operation
//   applyRemote(t, p, v)      →  applyOperation({ op: 'SET_PROPERTY', …, origin: 'network' })
//
// There is NO v2 equivalent for probe.dollarWrite or probe.legacySetProperty:
// `$x` and `syncProperty()` are removed, and Legacy's `setProperty()` semantics are gone.
// Set `probe.available = false` and leave those entries out.

export const name = 'v2';

export async function createTarget() {
    throw new Error(
        'v2 adapter not implemented.\n' +
        'The v2 Core migration has not started — this is intentional.\n' +
        'See docs/MIGRATION.md §5: the parity baseline must be captured first.'
    );
}
