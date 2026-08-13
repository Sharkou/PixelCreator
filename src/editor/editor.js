// The Editor, assembled.
//
// This file is the composition root and nothing else: it builds the model, the camera
// and the selection, hands them to the panels, and binds the few shortcuts that belong
// to no single panel. There is no application object holding state, because the state is
// the Scene — the Editor orchestrates, the Core is the truth (docs/ARCHITECTURE.md §5).
//
//   Editor UI  ->  Core (Scene / Object / Component)  ->  Runtime  ->  Renderer  ->  Viewport
//
// and never a parallel model beside it.

import { Object, Scene, Transform, components } from '../core/mod.js';
import { Camera } from '../runtime/mod.js';
import { Selection } from './selection.js';
import { registerBuiltIns } from './registry.js';
import { deleteObject } from './commands.js';
import { fillStarterScene } from './project/starter.js';
import { installDocumentStyles } from './ui/styles.js';
import { el } from './ui/element.js';

import './ui/panel.js';
import './ui/menu.js';
import './ui/field.js';
import './viewport/viewport.js';
import './windows/hierarchy.js';
import './windows/inspector.js';

/**
 * Build and mount the Editor.
 * @param {HTMLElement} [mount] - Where the shell goes
 * @returns {object} The editor context: { scene, camera, selection, viewport }
 */
export function start(mount = document.body) {
    installDocumentStyles();
    registerBuiltIns(components);

    const scene = fillStarterScene(new Scene('Untitled Scene'));
    const selection = new Selection();
    const camera = createEditorCamera();

    const viewport = document.createElement('px-viewport');
    viewport.bind({ scene, camera, selection, onError: reportFailure });

    const hierarchy = document.createElement('px-hierarchy');
    hierarchy.bind({ scene, selection });

    const inspector = document.createElement('px-inspector');
    inspector.bind({ scene, selection, registry: components });

    mount.append(el('div', { class: 'shell' },
        titlebar(scene),
        el('div', { class: 'workspace' }, hierarchy, viewport, inspector)
    ));

    // A deleted object must not stay selected: the Inspector would be editing something
    // the scene no longer holds.
    scene.on('removed', object => {
        if (selection.has(object)) selection.clear();
    });

    bindShortcuts({ scene, selection, viewport });

    return { scene, camera, selection, viewport };
}

/**
 * The Object the editor viewport looks through.
 *
 * An ordinary Object with a Transform and a Camera (ADR-0013), deliberately never added
 * to the scene: a point of view is not part of the project, so it must not show up in
 * the Hierarchy, be serialized, or be deletable.
 *
 * @returns {object} The camera object
 */
export function createEditorCamera() {
    const camera = new Object('Editor Camera');
    camera.addComponent(new Transform());
    camera.addComponent(new Camera());
    return camera;
}

function titlebar(scene) {
    return el('div', { class: 'titlebar' },
        el('div', { class: 'mark' }),
        el('span', { class: 'product', textContent: 'Pixel Creator' }),
        el('span', { class: 'scene', textContent: scene.name }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'hint', textContent: 'Edit mode' })
    );
}

function bindShortcuts({ scene, selection, viewport }) {
    globalThis.addEventListener('keydown', event => {
        if (isEditing()) return;

        if (event.key === 'Delete' || event.key === 'Backspace') {
            const object = selection.object;
            if (!object) return;
            event.preventDefault();
            selection.clear();
            deleteObject(scene, object);
            return;
        }

        if (event.key === 'f' || event.key === 'F') {
            if (selection.object) viewport.focusOn(selection.object);
            return;
        }

        if (event.key === 'Escape') selection.clear();
    });
}

/**
 * Whether the creator is typing, in which case shortcuts must keep out of the way.
 *
 * Walks into shadow roots: the field being typed into is inside one, so
 * `document.activeElement` alone only ever reports the panel.
 *
 * @returns {boolean} True when a text control has focus
 */
function isEditing() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;

    if (!element) return false;
    if (element.isContentEditable) return true;
    return element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA';
}

function reportFailure(report) {
    // The Console window is a later step; until it exists a failure goes where a
    // developer will see it, structured rather than stringified (ADR-0012).
    console.error(
        `[runtime] ${report.phase}() failed on ${report.type} of "${report.object?.name}"`,
        report.error
    );
}
