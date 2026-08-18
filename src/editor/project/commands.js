// Creating resources, from the Project panel's `+` (ADR-0025).
//
// ONE TABLE, NOT A CHAIN OF BRANCHES. Every kind the panel can create declares how it is
// made — a label, an icon, and a `create` that returns the manifest entry. Adding a kind
// is a row here; nothing in the window, the menu or the Inspector has to learn about it.
// That is the same shape `editor/commands.js` uses for object kinds, for the same reason.
//
// CREATION IS A MODEL MUTATION, NEVER A ROW IN A LIST. Each `create` goes through the
// Project's pipeline, so a new resource is arbitrated, replicated and undoable like any
// other intent — and a panel that never mutates cannot drift from the manifest.
//
// A kind that needs more than the model can honestly do today is simply absent. There is
// no "Image" entry, because importing one needs a file the browser has to hand over, and
// a menu entry that opens nothing is the one thing this Editor keeps refusing to ship.
// The point of extension is here, and it is one row wide.

import { Scene, createId } from '../../core/mod.js';
import { iconForResource } from '../ui/icons.js';
import {
    KIND_LABELS,
    ResourceKind,
    addScene,
    uniqueResourceName,
    withExtension
} from '../../project/mod.js';

/**
 * What the Project panel's `+` offers, in the order it offers it.
 *
 * @type {Array<{id: string, label: string, icon: string, create: Function}>}
 */
export const RESOURCE_KINDS = [
    {
        id: ResourceKind.FOLDER,
        label: 'Folder',
        category: 'General',
        create: (project, { parent, actor }) => project.addFolder({ parent, actor })
    },
    {
        id: ResourceKind.SCENE,
        label: 'Scene',
        category: 'Scenes',
        create: (project, { parent, actor }) => {
            const name = uniqueResourceName(
                project,
                withExtension(KIND_LABELS[ResourceKind.SCENE], { kind: ResourceKind.SCENE }),
                parent
            );
            // A real, empty Scene — serialized by the same writer that saves the open one,
            // so a scene created here and a scene saved there are the same payload.
            return addScene(project, new Scene(name), { name, parent, actor });
        }
    },
    {
        id: ResourceKind.COMPONENT,
        label: 'Component',
        category: 'Components',
        create: (project, { parent, actor }) => createComponent(project, { parent, actor })
    },
    {
        id: ResourceKind.ASSET,
        label: 'Image…',
        category: 'Graphics',
        // A KIND MAY DECLARE THAT IT NEEDS A FILE FIRST. The panel reads this flag, not the
        // kind: it asks for a file, reads it, and hands both to `create`. That keeps the
        // window free of "if this is an image…" while letting a browser do the one thing
        // only it can — hand over a file the page was not given.
        pick: { accept: 'image/*' },
        create: (project, { parent, actor, file, payload }) => {
            if (!payload) return null;

            const base = (file?.name ?? 'Image').replace(/\.[^.]+$/, '');
            return project.add(
                {
                    kind: ResourceKind.ASSET,
                    name: uniqueResourceName(project, file?.name ?? base, parent),
                    parent,
                    mime: file?.type || 'application/octet-stream'
                },
                payload,
                { actor }
            );
        }
    }
];

/**
 * The order the `+` menu's groups are drawn in.
 *
 * The same shape the Add Object and Add Component menus use — headings, then entries —
 * because it is the same dropdown primitive and a creator who has learned one has learned
 * all three (ADR-0026 §4). A category a kind invents lands before `Other` rather than
 * being flattened into it: somebody named it for a reason.
 */
export const RESOURCE_CATEGORIES = ['General', 'Scenes', 'Graphics', 'Audio', 'Components', 'Other'];

/**
 * The `+` menu's entries, grouped, ready for openMenu().
 * @returns {object[]} `{ heading }` and `{ id, label, icon }` entries
 */
export function resourceMenuItems() {
    const order = [...RESOURCE_CATEGORIES];
    for (const kind of RESOURCE_KINDS) {
        const category = kind.category ?? 'Other';
        if (!order.includes(category)) order.splice(order.length - 1, 0, category);
    }

    const items = [];
    for (const category of order) {
        const group = RESOURCE_KINDS.filter(kind => (kind.category ?? 'Other') === category);
        if (group.length === 0) continue;

        items.push({ heading: category });
        // THE GLYPH IS NOT DECLARED HERE, it is derived. A kind's icon is a fact about
        // the kind (ui/icons.js), so the menu that creates one and the tile that shows it
        // afterwards read the same table — they used to carry two literals each, and the
        // Scene entry had drifted from the one the Project panel drew.
        for (const { id, label } of group) items.push({ id, label, icon: iconForResource(id) });
    }

    return items;
}

/**
 * Create a resource of a kind, in a folder.
 *
 * @param {object} project - The project to create in
 * @param {string} kind - One of RESOURCE_KINDS' ids
 * @param {object} [options] - Options
 * @param {string|null} [options.parent] - The folder it goes in
 * @param {string} [options.actor] - Who authored the intent
 * @param {object} [options.file] - The chosen file, for a kind that declares `pick`
 * @param {any} [options.payload] - Its content, already read
 * @returns {object|null} The manifest entry, or null when the kind is unknown or refused
 */
export function createResourceOfKind(project, kind, { parent = null, actor, file, payload } = {}) {
    const entry = resourceKind(kind);
    if (!entry) return null;

    return entry.create(project, { parent, actor, file, payload });
}

/**
 * The creation entry for a kind, or null.
 * @param {string} kind - One of RESOURCE_KINDS' ids
 * @returns {object|null} The entry
 */
export function resourceKind(kind) {
    return RESOURCE_KINDS.find(candidate => candidate.id === kind) ?? null;
}

/**
 * A Component: ONE `.px` resource carrying its identity, its properties and its graph.
 *
 * ONE RESOURCE, NOT TWO (ADR-0026). A creator thinks "I made a Component", not "I made a
 * Component and its graph file", and the model now says the same thing: the payload holds
 * the definition, and the definition holds the graph.
 *
 * The definition's `type` IS its own ResourceId (ADR-0021), so it is minted before the
 * payload can name it — which is why the resource is declared first and written second,
 * both under one `batch` so `Ctrl Z` takes the whole gesture back (ADR-0024).
 *
 * The graph is declared empty. What runs it is the interpreter, which does not exist yet
 * (ADR-0009, ADR-0015) — this creates the resource that step needs, and claims nothing
 * more.
 *
 * @param {object} project - The project
 * @param {object} options - Options
 * @param {string|null} options.parent - The folder it goes in
 * @param {string} [options.actor] - Who authored the intent
 * @returns {object|null} The component's manifest entry
 */
function createComponent(project, { parent, actor }) {
    // `New Component.px` — one file, extension included, because that is what a creator
    // sees in the panel and what a rename must preserve (ADR-0026).
    const name = uniqueResourceName(
        project,
        withExtension(KIND_LABELS[ResourceKind.COMPONENT], { kind: ResourceKind.COMPONENT }),
        parent
    );
    const batch = createId();

    const component = project.add(
        { kind: ResourceKind.COMPONENT, name, parent },
        null,
        { actor, batch }
    );
    if (!component) return null;

    project.save(component.id, {
        type: component.id,
        label: name,
        properties: {},
        graph: emptyGraph()
    }, { actor, batch });

    return component;
}

/**
 * The graph a new `.px` starts from.
 *
 * Versioned from the first day, because the format will change and a payload that cannot
 * say which shape it is in is a migration nobody can write.
 *
 * @returns {object} An empty graph
 */
export function emptyGraph() {
    return { version: 1, nodes: [], connections: [] };
}
