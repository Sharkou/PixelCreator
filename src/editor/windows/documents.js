// Which documents the upper area holds, and which one it shows.
//
// ONE TAB BAR, AND THAT IS THE WHOLE MODEL. The Scene and every open `.px` are documents:
// they sit side by side in one strip above one body, one of them showing at a time. There
// is no second place a document can be, so there is no `location` to store, nothing to drag
// between zones, and no drop target anywhere — a tab is selected, reordered, or closed.
//
// THE TIMELINE IS NOT IN HERE, deliberately. It is not a document: it has no resource, no
// model, no undo stack and nothing to close, and it wants a band across the bottom rather
// than the document body. It keeps the zone and the titlebar toggle it has always had
// (layout.js, design/README.md D8), and this module never hears about it.
//
// WHAT A TAB DESIGNATES: an `OpenEditor` — the resource, its live model, its pipeline and
// its undo stack, which the `Workspace` already owns and never serializes (ADR-0020,
// ADR-0024). There is no document model here and there must not be one; this file only says
// which of the open editors have a surface to draw on, and in what order.

import { ResourceKind } from '../../project/mod.js';
import { iconForResource } from '../ui/icons.js';

/**
 * Resource kind -> the surface that draws it.
 *
 * A kind absent from this table has no tab. The day Files become documents it is one row
 * plus the element that draws one — the strip, the close, the unsaved mark, the reordering
 * and the activation are already written and know no kind.
 */
export const DOCUMENT_SURFACES = globalThis.Object.freeze({
    [ResourceKind.SCENE]: 'scene',
    [ResourceKind.COMPONENT]: 'graph'
});

/**
 * The documents that are open, in the order the strip shows them.
 *
 * THE STRIP IS `opened()`, RANK FOR RANK. Only kinds that have a surface can be opened at
 * all (`Workspace`'s own EDITORS table), so nothing is ever dropped on the way through and a
 * rank read off the strip is a rank the Workspace understands. That is what lets reordering
 * be `Workspace.reorder(id, rank)` and nothing else — there is no second order to keep in
 * step, and the test below pins the correspondence rather than trusting it.
 *
 * @param {object[]} opened - `Workspace.opened()`
 * @returns {object[]} `{ id, surface, label, icon, resource, closable }`
 */
export function documentViews(opened = []) {
    const views = [];

    for (const resource of opened) {
        const surface = DOCUMENT_SURFACES[resource?.kind];
        if (!surface) continue;

        views.push({
            id: resource.id,
            surface,
            // The resource's own name, so a tab says which scene or which `.px` rather than
            // repeating the word.
            label: resource.name || 'Untitled',
            icon: iconForResource(resource),
            resource,
            // THE SCENE IS PERMANENT. Everything else can be closed, which releases its
            // model and its undo stack and lets the resource be deleted (ADR-0027 §10).
            // Closing the scene would leave every window in the Editor bound to a model the
            // project no longer presents.
            closable: resource.kind !== ResourceKind.SCENE
        });
    }

    return views;
}

/**
 * Which document the area shows.
 *
 * THE ACTIVE EDITOR DECIDES, so the strip can never disagree with the Workspace about what
 * is being edited. It falls back rather than showing nothing: `activeId` also names a
 * resource that is merely ATTACHED — a `.px` selected in the Project panel has a live model
 * without any window presenting it (ADR-0027 §10) — and such a resource has no tab here.
 *
 * @param {object[]} views - What `documentViews()` answered
 * @param {string|null} activeId - `Workspace.activeId`
 * @param {string|null} [previous] - The document the area was showing
 * @returns {string|null} The document to show, or null when nothing is open
 */
export function activeDocument(views, activeId, previous = null) {
    if (views.some(view => view.id === activeId)) return activeId;
    if (views.some(view => view.id === previous)) return previous;
    return views[0]?.id ?? null;
}
