// Layer-dependency rules, per profile.
//
// A "profile" describes a source tree, the layers within it, and which layers are
// allowed to import which. Any cross-layer import not covered by an `allowed` edge is
// forbidden. A forbidden edge that is currently present in the source and cannot be
// fixed in place (e.g. legacy/ is read-only) is listed under `knownViolations`: the
// checker still reports it on every run, but does not fail because of it. Any
// forbidden edge NOT in that list fails the run.
//
// This file is data, not logic — add a profile (e.g. a v2 one, once core/, runtime/,
// editor/, network/ exist) instead of branching the checker itself.

export const profiles = [
    {
        name: 'legacy',
        // legacy/ is served from its own root (see tools/dev-server.sh); every static
        // import is an absolute path such as '/src/core/object.js' or
        // '/editor/system/dnd.js'.
        root: 'legacy',
        layers: [
            { name: 'engine', test: specifier => specifier.startsWith('/src/') },
            { name: 'editor', test: specifier => specifier.startsWith('/editor/') },
            { name: 'plugins', test: specifier => specifier.startsWith('/plugins/') }
        ],
        // editor/ and plugins/ may depend on engine/ — that is the point of an IDE and
        // of user-authored components. engine/ must never depend on editor/ or
        // plugins/. This mirrors the v2 rule in docs/CONVENTIONS.md:
        //   editor/ -> runtime/ -> core/
        //   core/   -> (nothing)
        forbidden: [
            { from: 'engine', to: 'editor' },
            { from: 'engine', to: 'plugins' }
        ],
        knownViolations: [
            {
                file: 'src/core/renderer.js',
                specifier: '/editor/system/dnd.js',
                from: 'engine',
                to: 'editor',
                reason:
                    'Renderer.render() reads Dnd.hovering / Dnd.resize for editor-only mouse ' +
                    'picking and resize-handle detection. Fixing it means moving that picking ' +
                    'logic out of the engine renderer and into editor/viewport/ (see ' +
                    'docs/architecture/RUNTIME.md, "Ce qui sort du renderer"). legacy/ is ' +
                    'read-only (docs/PROJECT.md §7), so this cannot be fixed in place — it is ' +
                    'fixed by not reproducing it in the v2 runtime.',
                ref: 'docs/architecture/CORE.md; docs/architecture/RUNTIME.md; docs/migration/LEGACY_ANALYSIS.md §6.2'
            }
        ]
    }
];
