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

import { DEFAULT_TILE, Scene, createId } from '../../core/mod.js';
import { iconForResource } from '../ui/icons.js';
import {
    KIND_LABELS,
    ResourceKind,
    addAnimation,
    addScene,
    addTileset,
    baseNameOf,
    uniqueResourceName,
    withExtension
} from '../../project/mod.js';
import { imageSize } from '../../project/image.js';

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
    // TWO ROWS, ONE `create`. An image and a sound are the same KIND of Resource (ADR-0020
    // §2) — same identity, same store, same reference in a property — and what differs is
    // what a browser should offer in its picker. So the row carries the `accept` and the
    // label, and the import itself is written once.
    importer('image', 'Image…', 'Graphics', 'image/*', 'Image'),
    importer('sound', 'Sound…', 'Audio', 'audio/*', 'Sound'),
    // AN ANIMATION IS BORN FROM A SHEET, because there is nothing else it could be born
    // from. A clip with no picture names no frames, and a creator asked to make one and
    // then to find a way to point it at an image would be holding a resource that does
    // nothing — the "menu entry that opens nothing" the note above refuses. So this row
    // picks an image, imports it like the row above, and reads the grid off the file.
    {
        id: 'animation',
        kind: ResourceKind.ANIMATION,
        label: 'Animation…',
        category: 'Graphics',
        pick: { accept: 'image/*' },
        create: (project, { parent, actor, file, payload }) => {
            if (!payload) return null;

            const base = (file?.name ?? 'Animation').replace(/\.[^.]+$/, '');
            const sheet = project.add(
                {
                    kind: ResourceKind.ASSET,
                    name: uniqueResourceName(project, file?.name ?? base, parent),
                    parent,
                    mime: file?.type || 'image/png'
                },
                payload,
                { actor }
            );

            return addAnimation(project, sheetGrid(sheet.id, imageSize(payload)), {
                name: uniqueResourceName(
                    project,
                    withExtension(base, { kind: ResourceKind.ANIMATION }),
                    parent
                ),
                parent,
                actor
            });
        }
    },
    // A TILESET IS BORN FROM A SHEET TOO, and for the same reason (ADR-0070 §3): the cutting
    // is the whole of what it holds, so a tileset with no picture is a resource that could
    // never answer a single rectangle. One gesture — choose the sheet — and the grid is read
    // off the file, exactly as a clip's is.
    {
        id: 'tileset',
        kind: ResourceKind.TILESET,
        label: 'Tileset…',
        category: 'Graphics',
        pick: { accept: 'image/*' },
        create: (project, { parent, actor, file, payload }) => {
            if (!payload) return null;

            const base = (file?.name ?? 'Tileset').replace(/\.[^.]+$/, '');
            const sheet = project.add(
                {
                    kind: ResourceKind.ASSET,
                    name: uniqueResourceName(project, file?.name ?? base, parent),
                    parent,
                    mime: file?.type || 'image/png'
                },
                payload,
                { actor }
            );

            return addTileset(project, sheetTiles(sheet.id, imageSize(payload)), {
                name: uniqueResourceName(
                    project,
                    withExtension(base, { kind: ResourceKind.TILESET }),
                    parent
                ),
                parent,
                actor
            });
        }
    }
];

/**
 * Cut a picture the project ALREADY holds, without importing a second copy of it.
 *
 * THE GESTURE A CREATOR ACTUALLY HAS (ADR-0070 §4). The menu row imports a sheet and cuts it
 * in one step, which is right the first time; the second time the picture is already in the
 * panel, and asking them to find it on disk again — or to copy a ResourceId — is asking them
 * to do the Editor's bookkeeping. Right-clicking the picture is the whole of it.
 *
 * ASYNC, BECAUSE A STORE IS (ADR-0020 §4). A project kept in memory answers a payload at
 * once and one kept in IndexedDB answers a promise; a caller that read the first and ignored
 * the second would work in every test and refuse every real project.
 *
 * @param {object} project - The project the picture is in
 * @param {string} id - The image asset's ResourceId
 * @param {object} [options] - Options
 * @param {string} [options.actor] - Who authored the intent
 * @returns {Promise<object|null>} The manifest entry, or null when that is not a picture
 */
export async function cutIntoTileset(project, id, { actor } = {}) {
    const asset = project.get(id);
    if (!asset || asset.kind !== ResourceKind.ASSET) return null;

    const payload = await project.read(id);
    if (typeof payload !== 'string' || !payload.startsWith('data:image/')) return null;

    const base = baseNameOf(asset) || 'Tileset';
    return addTileset(project, sheetTiles(id, imageSize(payload)), {
        name: uniqueResourceName(project, withExtension(base, { kind: ResourceKind.TILESET }), asset.parent ?? null),
        parent: asset.parent ?? null,
        actor
    });
}

/**
 * The cutting a tile sheet most probably describes.
 *
 * SQUARE CELLS OF THE SHEET'S OWN HEIGHT WOULD BE WRONG HERE, and that is the difference
 * from a clip: an animation sheet is a strip one row tall, a tile sheet is a page several
 * rows deep. So the guess is the one every tutorial tileset makes — SIXTEEN-PIXEL cells —
 * and the columns and the count follow from the picture's size. A creator whose tiles are
 * 32 has two numbers to correct in the Inspector, which is a visible, editable default
 * rather than a detection that is right four times out of five and inexplicable the fifth.
 *
 * @param {string} source - The sheet's ResourceId
 * @param {{width: number, height: number}|null} size - What the header said
 * @returns {object} A spec for `addTileset()`
 */
function sheetTiles(source, size) {
    const tile = DEFAULT_TILE;
    const columns = size?.width > 0 ? globalThis.Math.max(1, globalThis.Math.floor(size.width / tile)) : 1;
    const rows = size?.height > 0 ? globalThis.Math.max(1, globalThis.Math.floor(size.height / tile)) : 1;

    return { source, tileWidth: tile, tileHeight: tile, columns, count: columns * rows };
}

/**
 * The clip a sprite sheet most probably describes.
 *
 * A HORIZONTAL STRIP OF SQUARES, and that guess is the one worth making: it is what a
 * sheet exported by Aseprite, Piskel or a tutorial looks like, and the creator who meant
 * something else has a wrong number to correct rather than an empty form to fill. A file
 * whose header says nothing gets 32 x 32 and one frame — honest, and visibly wrong the
 * moment it is played, which is better than a clip that silently shows a quarter of a
 * picture.
 *
 * @param {string} source - The sheet's ResourceId
 * @param {{width: number, height: number}|null} size - What the header said
 * @returns {object} A spec for `addAnimation()`
 */
function sheetGrid(source, size) {
    const height = size?.height > 0 ? size.height : 32;
    const width = size?.width > 0 ? size.width : height;
    const count = globalThis.Math.max(1, globalThis.Math.round(width / height));

    return {
        source,
        frameWidth: globalThis.Math.round(width / count),
        frameHeight: height,
        count,
        columns: count,
        first: 0,
        fps: 12,
        loop: true
    };
}

/**
 * A row that imports a file of some family as an asset.
 *
 * @param {string} id - What the menu item is called; not a ResourceKind
 * @param {string} label - What the menu reads
 * @param {string} category - Which group it sits in
 * @param {string} accept - An accept attribute for the picker
 * @param {string} fallback - What an unnamed file is called
 * @returns {object} The RESOURCE_KINDS row
 */
function importer(id, label, category, accept, fallback) {
    return {
        // A ROW'S ID IS NOT A ResourceKind, AND FROM HERE ON IT CANNOT BE. Two rows create
        // the same kind — an image and a sound are both `asset` (ADR-0020 §2) — so the id
        // says which GESTURE this is and `kind` says what it makes.
        id,
        kind: ResourceKind.ASSET,
        label,
        category,
        // A KIND MAY DECLARE THAT IT NEEDS A FILE FIRST. The panel reads this flag, not the
        // kind: it asks for a file, reads it, and hands both to `create`. That keeps the
        // window free of "if this is an image…" while letting a browser do the one thing
        // only it can — hand over a file the page was not given.
        pick: { accept },
        create: (project, { parent, actor, file, payload }) => {
            if (!payload) return null;

            const base = (file?.name ?? fallback).replace(/\.[^.]+$/, '');
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
    };
}

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
        for (const { id, kind, label } of group) {
            items.push({ id, label, icon: iconForResource(kind ?? id) });
        }
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
 * The creation entry for a row id, or failing that for a ResourceKind.
 *
 * TWO LOOKUPS, IN THAT ORDER, BECAUSE A KIND IS NO LONGER A ROW. `asset` names two rows —
 * Image and Sound — so asking for a kind gets the first row that makes one, which is what a
 * caller naming a kind rather than a gesture is asking for. Asking for a row by its own id
 * is exact.
 *
 * @param {string} id - A row's id, or a ResourceKind
 * @returns {object|null} The entry
 */
export function resourceKind(id) {
    return RESOURCE_KINDS.find(candidate => candidate.id === id)
        ?? RESOURCE_KINDS.find(candidate => (candidate.kind ?? candidate.id) === id)
        ?? null;
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
export function createComponent(project, { parent = null, actor } = {}) {
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

    // NO `label`, AND THAT IS THE POINT. `label` is what a creator CHOSE to call the type,
    // and a fresh `.px` has been called nothing — writing the file name in would mint a copy
    // that stops being true the moment the file is renamed, which is exactly what it did:
    // `Counter.px` in the Project panel and `New Component.px` in Add Component, one thing
    // with two names. What a `.px` with no label of its own is called is its resource's name,
    // resolved where it is shown and never stored (editor/registry.js, ADR-0016, ADR-0021).
    project.save(component.id, {
        type: component.id,
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
