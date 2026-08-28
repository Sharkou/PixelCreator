// Opening the game in its own window (ADR-0042).
//
// THREE STEPS, AND THE MIDDLE ONE IS THE WHOLE ARCHITECTURE: bundle the project, put it
// where an identifier can find it, open a page that asks for that identifier. The Editor
// never hands the game a live object — what crosses is JSON under a name, which is what
// makes the same gesture work later against a server without this file changing shape.
//
// A WINDOW PER PREVIEW, NOT A WINDOW REUSED. Several previews open at once is not an
// accident here: two windows on one bundle are already two clients of one game, which is
// the whole of what this tranche prepares for multiplayer (ADR-0042 §6).

import { bundleProject } from '../preview/bundle.js';
import { createPreviewId, previewUrl, putPreview } from '../preview/store.js';

/**
 * Bundle what is being edited and open it in a game window.
 *
 * @param {object} workspace - The Workspace holding the project and its store
 * @param {object} [options] - Options
 * @param {Function} [options.open] - How to open a window; `window.open` by default
 * @param {Function} [options.report] - Where to say what went wrong
 * @returns {{id: string, url: string}|null} What was opened, or null
 */
export function openPreview(workspace, { open = defaultOpen, report = null } = {}) {
    const project = workspace?.project ?? null;
    if (!project) return fail(report, 'There is no project to preview.');

    // SAVED FIRST, ALL OF IT. A creator presses Preview to see what is ON SCREEN, and what
    // is on screen is the live model — not the payload it was last written from. Without
    // this the window plays the project as it was at the last save, which is exactly the
    // surprise a preview exists to remove. Every OPEN editor is written, not just the
    // active one: a `.px` edited in another tab is part of this game too.
    for (const resource of workspace.opened?.() ?? []) workspace.save({ id: resource.id });

    const scene = (workspace.opened?.() ?? []).find(resource => resource.kind === 'scene') ?? null;
    const bundle = bundleProject(project, project.store, { scene: scene?.id ?? null });
    const id = createPreviewId();

    if (!putPreview(id, bundle)) {
        return fail(report, 'This browser would not store the preview. '
            + 'A private window or a full storage quota will do that.');
    }

    const url = previewUrl(id);
    const opened = open(url);
    // A BLOCKED POP-UP IS NOT A FAILED PREVIEW, and saying "it did not work" would be
    // wrong: the bundle is stored and the link is good. What is missing is permission.
    if (!opened) {
        return fail(report, 'The browser blocked the preview window. Allow pop-ups for this '
            + 'page, or open the link it printed to the console.', { id, url });
    }

    return { id, url };
}

function defaultOpen(url) {
    return globalThis.open?.(url, '_blank', 'noopener') ?? null;
}

function fail(report, message, result = null) {
    report?.(message);
    if (result) console.info('[preview]', message, result.url);
    return result;
}
