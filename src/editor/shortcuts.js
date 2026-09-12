// Which keystroke means what, as a function nobody needs a browser to ask (ADR-0069 §3).
//
// THE KEYBOARD ASKS; IT NEVER OWNS. `shortcutFor()` turns an event into a WORD — `undo`,
// `redo`, `save`, `duplicate` — and knows nothing about stacks, workspaces or projects. What
// that word is aimed at is decided when it is ACTED on, by asking for what is being edited
// right now. A shortcut that captured a History at boot would go on undoing into a project the
// creator had closed, which is precisely the family of defect ADR-0069 is about.
//
// AND IT IS A FUNCTION, so the rule is testable without a DOM, a shell or a canvas. The
// handler in `editor.js` is then three lines that cannot disagree with the table below.

import { duplicateObject } from './commands.js';

/** What a keystroke asked for. */
export const Shortcut = {
    UNDO: 'undo',
    REDO: 'redo',
    SAVE: 'save',
    DUPLICATE: 'duplicate'
};

/**
 * What this keystroke means, or null when it means nothing to the Editor.
 *
 * CTRL AND CMD BOTH, because a creator on macOS presses Cmd and one on Windows presses
 * Ctrl, and neither should have to learn the other's keyboard. `Ctrl Shift Z` and `Ctrl Y`
 * are both redo: the first is what this Editor documents, the second is what half of the
 * creators coming from other tools will try first, and they cannot conflict — nothing else
 * is bound to either.
 *
 * @param {object} event - A keydown event
 * @returns {string|null} One of Shortcut, or null
 */
export function shortcutFor(event) {
    if (!event || !(event.metaKey || event.ctrlKey)) return null;

    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (key === 's') return Shortcut.SAVE;
    if (key === 'y') return Shortcut.REDO;
    if (key === 'z') return event.shiftKey ? Shortcut.REDO : Shortcut.UNDO;
    // `Ctrl D` IS DUPLICATE EVERYWHERE A CREATOR HAS BEEN BEFORE, and the browser's own
    // meaning for it — bookmark this page — is one nobody presses on purpose inside an editor.
    if (key === 'd' && !event.shiftKey) return Shortcut.DUPLICATE;

    return null;
}

/**
 * Act on a shortcut, against whatever the Workspace says is being edited.
 *
 * IT ANSWERS WHETHER IT ACTED, and that is the whole of the text-field rule: a creator
 * typing a name has a stack of their own edits, so `Ctrl Z` takes back the rename — but
 * when there is nothing of ours to take back, this refuses, the event is not prevented, and
 * the browser's own text undo happens instead. Stealing the keystroke either way would make
 * editing a name the one place in the Editor where undo lies.
 *
 * `Ctrl S` AND `Ctrl D` ARE THE EXCEPTIONS, AND THEY ARE ONE EXCEPTION. They always claim
 * the key, whether or not there was anything to do with it: what a browser does with an
 * unclaimed `Ctrl S` is offer to save the PAGE, and with an unclaimed `Ctrl D` it opens the
 * bookmark dialog over the creator's scene. Neither is a thing anybody presses on purpose
 * inside an editor.
 *
 * A FIELD BEING TYPED IN IS STILL A FIELD. `Ctrl D` is forward-delete in a text field on
 * macOS, so claiming it there — to then do nothing with it — would break the one keystroke
 * the creator actually meant. Inside a field it is not ours.
 *
 * @param {string|null} action - One of Shortcut
 * @param {object} context - `{ workspace, scene, selection, subject, editing }`
 * @returns {boolean} True when the event should be prevented
 */
export function applyShortcut(action, {
    workspace = null,
    scene = null,
    selection = null,
    subject = null,
    editing = false
} = {}) {
    if (!action) return false;

    if (action === Shortcut.DUPLICATE) {
        // A NAME BEING TYPED IS NOT A SELECTION TO COPY, and the field keeps its keystroke.
        if (editing) return false;

        const object = selection?.object ?? null;
        if (!scene || !object) return true;

        const copy = duplicateObject(scene, object);
        if (!copy) return true;

        // Announced, so the Inspector follows the copy — which is what a creator wants to
        // edit next (ADR-0032).
        if (subject) subject.object(copy);
        else selection.set(copy);
        return true;
    }

    if (!workspace) return false;

    if (action === Shortcut.SAVE) {
        workspace.save();
        return true;
    }

    // ASKED, NEVER CAPTURED. `activeHistory` is the stack of the document being worked in,
    // and it is read at the moment the key is pressed — so opening another project, closing
    // an editor or switching tabs needs nothing here to be rewired.
    const stack = workspace.activeHistory ?? null;
    if (action === Shortcut.UNDO) return stack?.canUndo ? stack.undo() : false;
    if (action === Shortcut.REDO) return stack?.canRedo ? stack.redo() : false;

    return false;
}
