// <px-list> — the control a list of values is edited with.
//
// THE THING ADR-0023 NAMED AND DID NOT BUILD. `array` has been a real type at the Core
// since then — a starting value, a validation, a serialization — and read-only in the
// Inspector, "because editing one needs a list control that does not exist yet". This is
// that control. It is deliberately generic: it is told what shape an element has and asks
// the same `fieldFor()` every other value in this Editor goes through, so a list of
// numbers gets steppers and a list of colours gets swatches without a line written for
// either (inspector/list.js).
//
// IT OWNS NO ARITHMETIC. What adding, removing, moving and writing produce lives next
// door, pure and tested — including every case that is easy to get wrong: a move that
// lands where it started, a removal of the last element, two elements holding one value.
// What is left here is the DOM.
//
// A ROW IS A POSITION, NOT A VALUE. Two elements holding `"idle"` are two rows, and every
// button acts on an index. Nothing looks a value up to decide what to touch.
//
// EVERY EDIT IS ONE WRITE OF THE WHOLE LIST, and that is what makes undo work without a
// second mechanism: the Property System announces a value when the property is ASSIGNED,
// so a new array through the one controlled path is a Change, an Operation and a history
// entry (ADR-0008, ADR-0024). Adding, removing and moving are each one entry; typing into
// an element is one entry for the whole session, because `px-field` mints the batch and
// this hands it straight on.

import { makeReactive, observe } from '../../core/mod.js';
import { Element, el, fill } from './element.js';
import { sheet } from './styles.js';
import { icon } from './icons.js';
import { FieldKind } from '../inspector/schema.js';
import { ITEM_KEY, addItem, itemFieldFor, listOf, moveItem, removeItem, setItem } from '../inspector/list.js';
import './field.js';
import './object-field.js';

export class ListField extends Element {

    static styles = sheet(`
        :host { display: block; min-width: 0; }

        .items {
            display: flex;
            flex-direction: column;
            gap: var(--px-space-0);
        }

        /* A row is the element's control and the two things a creator can do to it. The
           handles are quiet until the row is under the pointer: a list of eight values
           should read as eight values, not as twenty-four buttons. */
        .item {
            display: flex;
            align-items: center;
            gap: var(--px-space-0);
            min-width: 0;
        }

        .item px-field,
        .item px-object { flex: 1; min-width: 0; }

        .item .handles {
            display: flex;
            flex: 0 0 auto;
            opacity: 0;
            transition: opacity var(--px-duration-fast) var(--px-ease);
        }

        .item:hover .handles,
        .item:focus-within .handles { opacity: 1; }

        /* A read-only list has nothing to hand: buttons that appear on hover and then
           refuse the click are worse than no buttons. */
        :host([disabled]) .handles { display: none; }

        /* SMALLER BUTTONS, BY REBINDING THE TOKEN THEY ARE MEASURED FROM. Three handles at
           the full control size would outweigh the value beside them on a row this dense.
           Setting the --px-control token here rather than overriding width and height keeps
           the shared button coherent: its hit target is inset by half the difference between
           --px-control and --px-hit, so a hard-coded box would have left the 28 px target
           measured against a size the button no longer had (ui/styles.js). */
        .item .handles { --px-control: 18px; }

        .item .ghost[disabled] { opacity: 0.3; cursor: default; }
        .item .remove:hover { color: var(--px-danger); }

        /* ONE GLYPH, TURNED. The set has a chevron and it points right; up and down are the
           same drawing rotated, which is what the folding twisty already does with it
           (ui/styles.js). A second and third arrow would be two drawings for one idea. */
        .item .up .icon { transform: rotate(-90deg); }
        .item .down .icon { transform: rotate(90deg); }

        /* An empty list says it is empty. A blank strip and a list whose values are all
           empty look the same, and only one of them is a list a creator has to fill. */
        .none {
            color: var(--px-text-dim);
            font-size: var(--px-text-xs);
            font-style: italic;
            padding: 2px 0;
        }

        .add {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            width: 100%;
            margin-top: var(--px-space-0);
            padding: 0 var(--px-space-1);
            height: var(--px-control);
            border: 1px dashed var(--px-border);
            border-radius: var(--px-radius-sm);
            background: none;
            color: var(--px-text-dim);
            font: inherit;
            font-size: var(--px-text-xs);
            cursor: pointer;
        }

        .add:hover { border-color: var(--px-accent-border); color: var(--px-text); }
        .add:focus-visible { outline: 2px solid var(--px-accent); outline-offset: -1px; }
        :host([disabled]) .add { display: none; }
    `);

    #target = null;
    #descriptor = null;
    #write = null;

    /** One reactive record per row, in row order: what each element's control is bound to. */
    #views = [];

    /** The scene a reference element resolves in; null when this list holds no references. */
    #scene = null;

    /**
     * Point the control at a property holding a list.
     *
     * THE ELEMENT'S SHAPE IS READ OFF THE PROPERTY, like everything else about it. The
     * descriptor carries `element` — a property declaration one level down (ADR-0007's own
     * shape, inspector/schema.js) — so this control is told nothing a schema has not said.
     * A list whose elements are not declared has no shape to edit and stays read-only,
     * which is what it already was.
     *
     * A LIST OF REFERENCES IS THE ONE THAT NEEDS MORE THAN THE PROPERTY. An Object is
     * resolved against the scene, so a row that draws one is handed the scene the panel
     * already hands `<px-object>` — nothing else about this control knows what a reference
     * is (ADR-0034 §3.5). A list given no scene simply has no Object to show, exactly as a
     * lone reference field does.
     *
     * @param {object} target - The reactive record holding the list
     * @param {object} descriptor - A descriptor from inspector/schema.js, carrying `element`
     * @param {object} [options] - Options
     * @param {Function} [options.write] - (value, { batch }) => void; `setProperty` by default
     * @param {object} [options.scene] - The scene a reference element is resolved in
     * @returns {ListField} This element
     */
    bind(target, descriptor, { write = null, scene = null } = {}) {
        this.#target = target;
        this.#descriptor = descriptor;
        this.#write = write;
        this.#scene = scene;

        this.toggleAttribute('disabled', Boolean(descriptor?.readonly) || !descriptor?.element);
        if (this.isConnected) this.#render();
        return this;
    }

    connectedCallback() {
        if (this.#descriptor) this.#render();
    }

    /** The elements the property currently holds, as a list nothing else can write through. */
    get items() {
        return listOf(this.#target?.[this.#descriptor?.name]);
    }

    #render() {
        this.release('binding');

        const items = this.items;
        // NOTHING DECLARED IS NOTHING TO EDIT. A list with no element shape shows what it
        // holds and refuses to be written, exactly as it did before this control existed.
        const readonly = Boolean(this.#descriptor.readonly) || !this.#descriptor.element;
        this.#views = [];

        fill(this.shadowRoot,
            items.length === 0
                ? el('div', { class: 'none', textContent: 'Empty' })
                : el('div', { class: 'items' }, items.map((item, index) =>
                    this.#renderItem(item, index, items.length, readonly))),
            readonly ? null : el('button', {
                class: 'add',
                type: 'button',
                onclick: () => this.#commit(addItem(this.items, this.#blank()))
            }, icon('plus', 16), el('span', { textContent: 'Add' }))
        );

        // ONE SUBSCRIPTION, ON THE LIST ITSELF. Every edit replaces the whole array, so the
        // property announcing itself is the whole of the reactivity here — an undo, a
        // collaborator and this control's own buttons all arrive the same way.
        this.track(observe(this.#target, this.#descriptor.name, change => this.#pull(change.value)), 'binding');
    }

    /**
     * Bring a new list into the rows, rebuilding them only when the rows themselves changed.
     *
     * A VALUE TYPED INTO A ROW CHANGES NO STRUCTURE, and rebuilding on it would destroy the
     * very box being typed into and take the caret with it — one character per click, the
     * defect this Editor has now met three times (windows/graph.js, windows/project.js).
     * The number of rows is what the DOM depends on; everything else is a value, and a value
     * is pushed into the record its control already watches, which guards its own focus
     * (ui/field.js).
     *
     * A MOVE KEEPS THE ROWS AND CHANGES WHAT THEY HOLD, so it takes this path too: row 0 is
     * row 0 whatever sits in it, and its buttons still act on position 0.
     *
     * @param {any} value - The list as the model now holds it
     */
    #pull(value) {
        const items = listOf(value);
        if (items.length !== this.#views.length) {
            this.#render();
            return;
        }

        this.#views.forEach((view, index) => {
            if (view[ITEM_KEY] !== items[index]) view[ITEM_KEY] = items[index];
        });
    }

    /**
     * One element: its control, and the two things a creator can do to it.
     *
     * @param {any} item - What the element holds
     * @param {number} index - Where it is; its identity for the whole of this row
     * @param {number} count - How many elements there are, for the ends of the list
     * @param {boolean} readonly - Whether the list may be edited at all
     * @returns {HTMLElement} The row
     */
    #renderItem(item, index, count, readonly) {
        const descriptor = { ...itemFieldFor(this.#descriptor.element), readonly };

        // A RECORD OF ITS OWN, because a control reads and writes a NAMED property and an
        // element of an array is not one. It holds this element and nothing else; what it
        // is written to becomes a new list, through the one writer below.
        const view = makeReactive({ [ITEM_KEY]: item });
        this.#views.push(view);

        // THE BATCH TRAVELS. `px-field` mints one for a typing session, so eleven keystrokes
        // on one element are eleven writes of the list and ONE undo entry — the mechanism the
        // panel already uses, not a second one (ADR-0026 §3).
        const write = (value, options) => this.#commit(setItem(this.items, index, value), options);

        // THE SAME RULE THE PANEL USES, AND FOR THE SAME REASON (windows/inspector.js): the
        // value is an identity, and a text field over one is a debugger. Which kinds may be a
        // row at all is decided once, where the list's own control is (inspector/schema.js).
        const field = descriptor.kind === FieldKind.OBJECT
            ? el('px-object').bind(view, descriptor, { scene: this.#scene, write })
            : el('px-field').bind(view, descriptor, { write });

        const step = (to, glyph, title) => el('button', {
            class: `ghost ${title.toLowerCase()}`,
            type: 'button',
            title,
            'aria-label': `${title} item ${index + 1}`,
            disabled: readonly || to < 0 || to >= count,
            onclick: () => this.#commit(moveItem(this.items, index, to))
        }, icon(glyph, 16));

        return el('div', { class: 'item' },
            field,
            el('div', { class: 'handles' },
                step(index - 1, 'chevron', 'Up'),
                step(index + 1, 'chevron', 'Down'),
                el('button', {
                    class: 'ghost remove',
                    type: 'button',
                    title: 'Remove',
                    'aria-label': `Remove item ${index + 1}`,
                    disabled: readonly,
                    onclick: () => this.#commit(removeItem(this.items, index))
                }, icon('close', 16))
            )
        );
    }

    /**
     * Send a new list to the model.
     *
     * @param {any[]} next - The list as it should now be
     * @param {object} [options] - `{ batch }`, when the write belongs to a session
     */
    #commit(next, options = {}) {
        if (this.#write) this.#write(next, options);
        else this.#target.setProperty(this.#descriptor.name, next, options);
    }

    /** What a freshly added element starts at: what a fresh property of that shape would. */
    #blank() {
        return itemFieldFor(this.#descriptor.element).default;
    }
}

customElements.define('px-list', ListField);
