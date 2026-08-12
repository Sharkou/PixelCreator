// Layer-dependency rules, per profile.
//
// A profile describes a source tree, the layers within it, and which cross-layer
// imports are forbidden. Layers are matched on paths relative to the profile root, so
// the same rule shape works for Legacy's absolute specifiers and for v2's relative ones.
//
// Only genuinely architectural boundaries are declared. An edge that is merely unusual
// is left alone: the point is to protect the layering, not to freeze the dependency
// graph into a shape nobody asked for.
//
// A forbidden edge already present in the source and impossible to fix in place — for
// instance in legacy/, which is read-only — is listed under `knownViolations`. It is
// still reported on every run; it just does not fail the check.

export const profiles = [
    {
        name: 'v2',
        root: 'src',
        layers: [
            { name: 'core', test: path => path.startsWith('core/') },
            { name: 'runtime', test: path => path.startsWith('runtime/') },
            { name: 'editor', test: path => path.startsWith('editor/') },
            { name: 'network', test: path => path.startsWith('network/') }
        ],
        // core is the shared foundation: client, server and Editor all build on it, so
        // it must never reach back up. runtime and network must not depend on the
        // Editor, or a game could not run without an IDE — which is precisely what
        // Legacy's `renderer.js -> editor/system/dnd.js` did.
        //
        // Deliberately NOT forbidden: editor -> network (the Editor talks to the
        // server), runtime -> network, network -> runtime. None of those is an
        // architectural inversion, and forbidding them would be inventing a rule.
        forbidden: [
            { from: 'core', to: 'runtime' },
            { from: 'core', to: 'editor' },
            { from: 'core', to: 'network' },
            { from: 'runtime', to: 'editor' },
            { from: 'network', to: 'editor' }
        ],
        knownViolations: []
    },
    {
        name: 'legacy',
        // legacy/ is served from its own root, so every static import is an absolute
        // path such as '/src/core/object.js' or '/editor/system/dnd.js'.
        root: 'legacy',
        layers: [
            { name: 'engine', test: path => path.startsWith('src/') },
            { name: 'editor', test: path => path.startsWith('editor/') },
            { name: 'plugins', test: path => path.startsWith('plugins/') }
        ],
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
                    'picking and resize-handle detection. legacy/ is read-only ' +
                    '(docs/PROJECT.md §7), so this cannot be fixed in place — it is fixed by ' +
                    'not reproducing it in the v2 runtime, where picking belongs to the Editor.',
                ref: 'docs/architecture/CORE.md; docs/architecture/RUNTIME.md; docs/migration/LEGACY_ANALYSIS.md §6.2'
            }
        ]
    }
];
