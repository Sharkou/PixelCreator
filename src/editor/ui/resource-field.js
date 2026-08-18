// <px-resource> — the control a `resource` property is actually edited with.
//
// WHAT IT REPLACES, AND WHY THAT WAS A DEAD END. `resource` mapped to `FieldKind.READONLY`,
// and `inspector/schema.js` said so honestly: "a `resource` holds a ResourceId, and picking
// one needs a resource browser — the Project window is where that will live, and inventing
// a text field for an opaque identifier would invite a creator to type over it and break
// the reference."
//
// The Project window now exists, resources have icons and previews, and the drag & drop
// rules already know that `resource-to-property` means "assign this". So the missing piece
// was never a text field: it was a control that shows WHAT the reference points at and
// offers the three gestures that make sense on it — pick, drop, clear. A `Sprite` whose
// `source` reads `res_a7f3` is not an Inspector, it is a debugger.
//
// IT NARROWS BY DECLARATION, NEVER BY GUESS. A property may say `kind: 'asset'` and
// `mime: 'image/'` (ADR-0007), and both the picker's list and the drop rule read the same
// two fields — `rules.acceptsResource()` is the authority, and this control asks it rather
// than reimplementing the question. So a property that takes an image offers images, and
// refuses a scene with a visible reason instead of storing an identifier that will never
// resolve.
//
// IT HOLDS NO PROJECT OF ITS OWN. The project is handed in by the panel that binds it, the
// same way the writer is: this element is a control, and which project it is looking at is
// a fact about the panel (ADR-0006).

import { observe } from '../../core/mod.js';
import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { icon, iconForResource } from './icons.js';
import { openMenu } from './menu.js';
import { pickFile, readAsDataUrl } from './file.js';
import { DropZone, filesPayload } from '../dnd/payload.js';
import { performDrop } from '../dnd/rules.js';
import { ResourceKind, isFolder } from '../../project/mod.js';

/** The picker entry that opens a file dialog rather than choosing something that exists. */
const IMPORT = '\u0000import';

export class ResourceField extends Element {

    static styles = sheet(`
        :host { display: block; min-width: 0; }

        .control {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            min-width: 0;
            width: 100%;
            height: var(--px-control);
            padding: 0 var(--px-space-0) 0 var(--px-space-1);
            background: var(--px-surface-input);
            border: 1px solid var(--px-border-subtle);
            border-radius: var(--px-radius-sm);
            color: var(--px-text);
            font: inherit;
            font-size: var(--px-text-xs);
            text-align: left;
            cursor: pointer;
            transition: border-color var(--px-duration-fast) var(--px-ease);
        }

        .control:hover { border-color: var(--px-accent-border); }
        .control:focus-visible { outline: 2px solid var(--px-accent); outline-offset: -1px; }

        :host([disabled]) .control { cursor: default; color: var(--px-text-dim); }
        :host([disabled]) .control:hover { border-color: var(--px-border-subtle); }

        /* The thumbnail: a real preview when the payload is one, the kind's glyph
           otherwise. The checkerboard is the Project panel's, for the same reason — it is
           the only place in the Editor that draws transparency. */
        .thumb {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            width: 16px;
            height: 16px;
            border-radius: 2px;
            overflow: hidden;
            color: var(--px-text-dim);
            background-color: var(--px-surface-sunken);
            background-image:
                linear-gradient(45deg, var(--px-surface-raised) 25%, transparent 25%, transparent 75%, var(--px-surface-raised) 75%),
                linear-gradient(45deg, var(--px-surface-raised) 25%, transparent 25%, transparent 75%, var(--px-surface-raised) 75%);
            background-size: 6px 6px;
            background-position: 0 0, 3px 3px;
        }

        .thumb img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }

        .name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* An empty reference reads as empty, and does not pretend to hold a value. */
        .name.empty { color: var(--px-text-dim); font-style: italic; }

        /* A reference whose resource has been deleted. Never blank: a dangling reference
           is a fact the creator has to be able to see (ADR-0027 draws the same line for a
           node pointing at a property that no longer exists). */
        .name.missing { color: var(--px-danger); }

        .clear {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            width: 18px;
            height: 18px;
            padding: 0;
            border: 0;
            border-radius: var(--px-radius-sm);
            background: none;
            color: var(--px-text-dim);
            cursor: pointer;
            opacity: 0;
        }

        :host(:hover) .clear, .clear:focus-visible { opacity: 1; }
        .clear:hover { background: var(--px-surface-hover); color: var(--px-text-strong); }
    `);

    #target = null;
    #descriptor = null;
    #project = null;
    #write = null;
    /** What a rule needs to import: the project, the workspace, the open folder. */
    #context = null;

    /**
     * Point the control at a property holding a ResourceId.
     *
     * @param {object} target - The reactive target holding the property
     * @param {object} descriptor - A descriptor from inspector/schema.js
     * @param {object} [options] - Options
     * @param {object} [options.project] - The project its resources are looked up in
     * @param {Function} [options.write] - (value) => void; `setProperty` by default
     * @param {object} [options.context] - What a rule needs to import: project, workspace, folder
     * @returns {ResourceField} This control
     */
    bind(target, descriptor, { project = null, write = null, context = null } = {}) {
        this.#target = target;
        this.#descriptor = descriptor;
        this.#project = project;
        this.#write = write;
        this.#context = context;
        this.toggleAttribute('disabled', Boolean(descriptor?.readonly));
        if (descriptor?.tooltip) this.title = descriptor.tooltip;
        if (this.isConnected) this.#render();
        return this;
    }

    connectedCallback() {
        if (this.#descriptor) this.#render();
    }

    /** The resource the property currently points at, or null. */
    get resource() {
        const id = this.#target?.[this.#descriptor?.name] ?? null;
        return id && this.#project ? this.#project.get(id) ?? null : null;
    }

    #render() {
        this.release('binding');

        const descriptor = this.#descriptor;
        const id = this.#target[descriptor.name] ?? null;
        const resource = this.resource;

        const button = el('button', {
            class: 'control',
            type: 'button',
            disabled: Boolean(descriptor.readonly),
            onclick: event => {
                event.stopPropagation();
                this.#openPicker(button);
            }
        },
            this.#thumbnail(resource),
            el('span', {
                class: `name${id ? (resource ? '' : ' missing') : ' empty'}`,
                textContent: id
                    ? resource?.name || 'Missing resource'
                    : 'None'
            })
        );

        const clear = id && !descriptor.readonly
            ? el('button', {
                class: 'clear',
                type: 'button',
                title: `Clear ${descriptor.label}`,
                'aria-label': `Clear ${descriptor.label}`,
                onclick: event => {
                    event.stopPropagation();
                    this.#assign(null);
                }
            }, icon('close', 16))
            : null;

        fill(this.shadowRoot, el('div', { style: 'display:flex;align-items:center;gap:2px;min-width:0' },
            button, clear));

        // The reference itself, and the resource's own name: renaming `walk.png` in the
        // Project panel retitles this control on the keystroke, without a redraw.
        this.track(observe(this.#target, descriptor.name, () => this.#render()), 'binding');
        if (resource) {
            this.track(observe(resource, 'name', () => this.#render()), 'binding');
            this.track(observe(resource, 'revision', () => this.#render()), 'binding');
        }
    }

    #thumbnail(resource) {
        const payload = resource && this.#project?.read
            ? this.#project.read(resource.id)
            : null;
        const drawable = typeof payload === 'string' && payload.startsWith('data:image/');

        return el('span', { class: 'thumb' }, drawable
            ? el('img', { src: payload, alt: '', draggable: false })
            : icon(resource ? iconForResource(resource) : 'folder', 16));
    }

    /**
     * The list of resources this property would accept.
     *
     * IT READS `accepts`, AND THAT WAS THE BUG. This used to destructure `kind` straight
     * off the descriptor — but `descriptor.kind` is the FIELD KIND, the word that says
     * which control to draw, and for every reference in the Editor it is the string
     * `'resource'`. So the filter asked for resources whose kind was `'resource'`, no
     * manifest entry has ever been one, and every picker in the Editor offered exactly
     * one entry: None. The declaration lives in `descriptor.accepts` (ADR-0030 §1), which
     * is also what `rules.acceptsResource()` reads — so what the menu offers and what a
     * drop will take are once again one answer.
     */
    #candidates() {
        if (!this.#project) return [];
        const { kind = null, mime = null } = this.#descriptor?.accepts ?? {};

        return this.#project.resources().filter(resource => {
            if (isFolder(resource)) return false;
            if (kind && resource.kind !== kind) return false;
            if (mime && !(resource.mime ?? '').startsWith(mime)) return false;
            return true;
        });
    }

    /**
     * Whether this reference could be filled from a file the creator picks.
     *
     * Only when the declaration says the reference takes an ASSET — importing produces one
     * and nothing else, so offering "Import…" on a field that wants a scene would be an
     * entry that cannot work.
     *
     * @returns {string|null} The accept filter for the file dialog, or null
     */
    #importable() {
        const { kind = null, mime = null } = this.#descriptor?.accepts ?? {};
        if (kind && kind !== ResourceKind.ASSET) return null;
        return mime ? `${mime}*` : 'image/*';
    }

    /**
     * Import a file and point this reference at it.
     *
     * THE SAME RULE A DROP USES. `files-to-property` imports and assigns in one step
     * (dnd/rules.js); the only thing a menu entry adds is the dialog, which is the one
     * part of this a browser has to do. Writing the import a second time here is exactly
     * the divergence ADR-0026 §6 exists to prevent.
     */
    async #import() {
        const accept = this.#importable();
        if (!accept) return;

        const file = await pickFile({ accept });
        if (!file) return;

        const payload = await readAsDataUrl(file);
        if (!payload) return;

        performDrop(
            filesPayload([{ name: file.name, mime: file.type, payload }]),
            this.#dropTarget(),
            this.#context ?? {}
        );
    }

    /**
     * The target the rules see for this control.
     *
     * The panel stamps one on the element for the shell to find (`pxDropZone`); when it
     * has, that is the authority. A control used outside the Inspector states its own from
     * the descriptor, so it still knows what it takes.
     *
     * @returns {object} A PROPERTY target
     */
    #dropTarget() {
        return this.pxDropZone ?? {
            zone: DropZone.PROPERTY,
            label: this.#descriptor?.label,
            accepts: this.#descriptor?.accepts ?? { kind: null, mime: null },
            assign: id => this.#assign(id)
        };
    }

    #openPicker(anchor) {
        if (this.#descriptor.readonly) return;

        const candidates = this.#candidates();
        const items = [];

        if (this.#target[this.#descriptor.name]) {
            items.push({ id: '', label: 'None', icon: 'close' });
        }

        // BRINGING A FILE IN IS PART OF CHOOSING ONE. A creator pointing a Sprite at an
        // image they have not imported yet should not have to leave for the Project panel,
        // import, come back and pick — that is three windows for one intention.
        if (this.#importable()) {
            items.push({ id: IMPORT, label: 'Import…', icon: 'image' });
        }

        // Grouped by kind, like every other menu in the Editor, and searchable once the
        // list is long enough to need it (ADR-0026 §10).
        const kinds = [...new globalThis.Set(candidates.map(resource => resource.kind))];
        for (const kind of kinds) {
            items.push({ heading: kindHeading(kind) });
            for (const resource of candidates.filter(entry => entry.kind === kind)) {
                items.push({
                    id: resource.id,
                    label: resource.name || 'Untitled',
                    icon: iconForResource(resource)
                });
            }
        }

        openMenu(anchor, items, id => {
            if (id === IMPORT) return this.#import();
            return this.#assign(id || null);
        }, {
            search: candidates.length > 6,
            label: 'resources'
        });
    }

    #assign(id) {
        if (this.#write) this.#write(id);
        else this.#target.setProperty(this.#descriptor.name, id);
    }
}

/** A resource kind, as a menu heading. */
function kindHeading(kind) {
    return globalThis.String(kind ?? 'other').replace(/^./, first => first.toUpperCase()) + 's';
}

customElements.define('px-resource', ResourceField);
