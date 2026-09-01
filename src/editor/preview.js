// Opening the game in its own window (ADR-0042).
//
// THREE STEPS, AND THE MIDDLE ONE IS THE WHOLE ARCHITECTURE: bundle the project, put it
// where an identifier can find it, open a page that asks for that identifier. The Editor
// never hands the game a live object — what crosses is JSON under a name, which is what
// makes the same gesture work later against a server without this file changing shape.
//
// A WINDOW PER PREVIEW, NOT A WINDOW REUSED. Several previews open at once is not an
// accident here: two windows on one bundle are already two clients of one game, which is
// the whole of what this tranche prepares for multiplayer (ADR-0042 §6). They now share an
// identity as well as a bundle — the project's — so they are two clients of ONE game
// rather than two games that happen to look alike (ADR-0044 §2).

import { bundleProject } from '../preview/bundle.js';
import { previewUrl, putPreview } from '../preview/store.js';

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
    // THE PROJECT IS THE IDENTITY (ADR-0044 §2). A fresh id per press made two windows on
    // one game two strangers: they could not share a channel, they could not share a URL,
    // and the store gathered one dead bundle per press. What a Preview shows is this
    // project, so what names it is this project — the same id Publish will later durably
    // mint, which is why nothing downstream has to learn a second kind of name.
    const id = project.id;

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
    // `noopener` MAKES THE RETURN VALUE MEANINGLESS, and that is its specified behaviour:
    // a window opened with it hands NO handle back, so `null` is what success looks like.
    // Reading that null as "blocked" announced a failure on every single press while the
    // Preview sat there open — the notice had fired 144 times in the console by the time
    // it was measured, once per preview ever opened, and every one of them was wrong.
    //
    // SO WHAT IS ANSWERED IS WHETHER THE CALL WAS MADE, never whether a window appeared.
    // Nothing here can tell: the opener is deliberately unreachable (ADR-0042 §5) and the
    // only way to get proof back would be to hand `window.opener` to the game, which is
    // exactly the coupling that seam exists to refuse. A creator whose pop-ups really are
    // blocked still has the URL — it is in the result either way.
    if (typeof globalThis.open !== 'function') return false;
    globalThis.open(url, '_blank', 'noopener');
    return true;
}

function fail(report, message, result = null) {
    report?.(message);
    if (result) console.info('[preview]', message, result.url);
    return result;
}
