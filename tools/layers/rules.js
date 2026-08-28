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
            { name: 'project', test: path => path.startsWith('project/') },
            { name: 'runtime', test: path => path.startsWith('runtime/') },
            { name: 'editor', test: path => path.startsWith('editor/') },
            { name: 'preview', test: path => path.startsWith('preview/') },
            { name: 'play', test: path => path.startsWith('play/') },
            { name: 'network', test: path => path.startsWith('network/') }
        ],
        // core is the shared foundation: client, server and Editor all build on it, so
        // it must never reach back up. runtime and network must not depend on the
        // Editor, or a game could not run without an IDE — which is precisely what
        // Legacy's `renderer.js -> editor/system/dnd.js` did.
        //
        // project owns identity, storage and loading (ADR-0020). It sits between the
        // Editor and the Core — `editor/ -> project/ -> core/` — and reaches neither the
        // Editor nor the Runtime, because a headless server has to load the same project
        // a browser does (ADR-0011). The rule the other way matters just as much:
        // `runtime -> project` would put storage behind a runtime API, which is exactly
        // what `behaviors.bind(type, graph)` taking a RESOLVED graph exists to prevent
        // (ADR-0016, ADR-0020).
        //
        // TWO APPLICATIONS, AND THE LINE BETWEEN THEM IS THE POINT (ADR-0042 §2). `editor/`
        // and `play/` are both tops of the graph: each may reach down into project, runtime
        // and core, and NEITHER may reach the other. A game client that could import the
        // Editor would be an editor with its panels hidden, and the day it shipped it would
        // ship the Editor with it.
        //
        // `preview/` is what passes between them — a bundle, and the seam that resolves an
        // identifier into one. It sits above project and below both applications, so it may
        // never reach either: a bundle a headless server opens cannot depend on a window.
        //
        // Deliberately NOT forbidden: editor -> network (the Editor talks to the
        // server), runtime -> network, network -> runtime, project -> network. None of
        // those is an architectural inversion, and forbidding them would be inventing a
        // rule.
        forbidden: [
            { from: 'core', to: 'project' },
            { from: 'core', to: 'runtime' },
            { from: 'core', to: 'editor' },
            { from: 'core', to: 'network' },
            { from: 'project', to: 'runtime' },
            { from: 'project', to: 'editor' },
            { from: 'runtime', to: 'project' },
            { from: 'runtime', to: 'editor' },
            { from: 'network', to: 'editor' },
            { from: 'core', to: 'preview' },
            { from: 'core', to: 'play' },
            { from: 'project', to: 'preview' },
            { from: 'project', to: 'play' },
            { from: 'runtime', to: 'preview' },
            { from: 'runtime', to: 'play' },
            { from: 'preview', to: 'editor' },
            { from: 'preview', to: 'play' },
            { from: 'preview', to: 'runtime' },
            { from: 'editor', to: 'play' },
            { from: 'play', to: 'editor' }
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
        // Two modules Legacy imports and the repository has never held. They are the
        // reason `Network` cannot be loaded from a clean checkout at all, and they are
        // declared here rather than fixed: legacy/ is read-only (docs/PROJECT.md §7).
        knownMissing: [
            {
                file: 'src/network/room.js',
                specifier: '/src/db/firebase.js',
                reason: 'Vendored Firebase wrapper, never committed. Loading room.js throws.',
                ref: 'docs/migration/LEGACY_ANALYSIS.md'
            },
            {
                file: 'src/network/socket.js',
                specifier: '/src/lib/simplepeer.js',
                reason: 'Vendored SimplePeer build, never committed. Loading socket.js throws.',
                ref: 'docs/migration/LEGACY_ANALYSIS.md'
            }
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
