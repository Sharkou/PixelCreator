// What a drop MEANS, as a table of rules (ADR-0026).
//
// THE POINT OF THIS FILE IS THAT THERE IS ONLY ONE OF IT. The alternative — and what every
// editor grows without it — is `handleDropImage()` in the viewport, `handleDropFile()` in
// the Project panel, `handleDropResource()` in the Inspector, each with its own idea of
// what an image dropped somewhere ought to do. Here a drop is `(payload, target)`, and a
// rule says whether it applies and what it performs.
//
// A RULE IS PURE OF THE DOM. It receives a context — the project, the scene, the
// workspace, the registry — and calls the same model APIs a menu item would. That is what
// lets every rule below be tested under Node, which is where the interesting cases are:
// the refusals.
//
// A RULE MAY REFUSE, AND SAYING WHY IS PART OF THE CONTRACT. `describe()` returns the
// sentence a panel shows and a test asserts, because "nothing happened" is the worst
// possible answer to a drag a creator spent a gesture on.
//
// ORDER MATTERS: the first rule that accepts wins, so the specific ones come before the
// general ones. Adding a kind of drop is adding a row.

import { Object as SceneObject, Transform, PropertyType, componentSchema } from '../../core/mod.js';
import { ResourceKind, isFolder, canMove } from '../../project/mod.js';
import { Sprite } from '../../runtime/mod.js';
import { DragKind, DropZone } from './payload.js';
import { createResourceOfKind } from '../project/commands.js';
import { uniqueName } from '../commands.js';

/**
 * What an image becomes when it is dropped into a scene.
 *
 * ONE PLACE SAYS "AN IMAGE IS A SPRITE". A second kind of asset — a sound, a tilemap —
 * adds a row here and changes nothing else, which is the extension point ADR-0026 asks
 * for. A kind with no row is not instantiable, and the rules below refuse it by name.
 */
const INSTANTIABLE = [
    {
        /** @param {object} resource - The manifest entry */
        accepts: resource => resource.kind === ResourceKind.ASSET
            && (resource.mime ?? '').startsWith('image/'),
        label: 'Image',
        /**
         * Build the object an image becomes.
         * @param {object} resource - The image resource
         * @param {object} context - `{ scene }`
         * @returns {object} A detached object, ready to be added
         */
        build: (resource, { scene }) => {
            const object = new SceneObject(uniqueName(scene, baseName(resource.name)));
            object.addComponent(new Transform());
            // `source` is the ResourceId, never the bytes: a scene references its images
            // and never carries them (ADR-0020).
            object.addComponent(new Sprite(resource.id, 64, 64));
            return object;
        }
    }
];

/**
 * Why each kind of drag is refused on the graph canvas, in its own words.
 *
 * ONE SENTENCE PER KIND, because the reasons are genuinely different and a creator carrying
 * a Component has not made the same mistake as one carrying a PNG. They are the reasons
 * ADR-0034 §3.7 and ADR-0027 §11 already state; this is where they become something a
 * creator reads rather than something an ADR records.
 *
 * NONE OF THEM IS "NOT YET IMPLEMENTED". Each names what would have to be decided first —
 * which is what makes them true a year from now, and what tells a creator whether they are
 * doing something wrong or something the product has not designed.
 */
const REFUSED_ON_GRAPH = {
    // ADR-0034 §3.7: a fallback on the name would write a freely editable display name into
    // a type of PROJECT scope, and tagging the object instead would make one gesture write
    // into two resources with two undo stacks (ADR-0010, ADR-0024).
    [DragKind.OBJECT]: 'An Object belongs to one scene and a graph to the whole project — '
        + 'reach it with a Scene node, or an Object property on this Component.',
    // ADR-0027 §11, which refused the same gesture for a property: dropping it could mean
    // Get or Set, and choosing between them for the creator is the magic this Editor avoids.
    [DragKind.COMPONENT]: 'A Component dropped here could mean reading it or writing it, '
        + 'and that is not a choice to make for you — add the node you want from the menu.',
    [DragKind.RESOURCE]: 'A resource is not a node. Add one from the canvas menu instead.',
    [DragKind.FILES]: 'Files are imported into the Project panel, never onto a graph.'
};

/** The rules, first match wins. */
export const RULES = [
    // --- files from outside the browser -------------------------------------------

    {
        id: 'files-to-project',
        accepts: (payload, target) => payload.kind === DragKind.FILES && target.zone === DropZone.PROJECT,
        describe: payload => `Import ${countFiles(payload)} into this folder`,
        perform: (payload, target, context) => {
            const created = importFiles(payload, target.parent ?? null, context);
            if (created.length > 0) context.workspace?.select(created.at(-1).id);
            return { imported: created };
        }
    },

    {
        id: 'files-to-scene',
        accepts: (payload, target) => payload.kind === DragKind.FILES && target.zone === DropZone.SCENE,
        describe: payload => `Import ${countFiles(payload)} and place it in the scene`,
        perform: (payload, target, context) => {
            // Imported first, instantiated second: what lands in the scene is a reference
            // to a resource the project now declares, never a loose blob (ADR-0020).
            const created = importFiles(payload, context.folder ?? null, context);
            const objects = created
                .map(resource => instantiate(resource, target, context))
                .filter(Boolean);

            return { imported: created, objects };
        }
    },

    {
        id: 'files-to-hierarchy',
        accepts: (payload, target) => payload.kind === DragKind.FILES && target.zone === DropZone.HIERARCHY,
        describe: payload => `Import ${countFiles(payload)} and add it to the scene`,
        perform: (payload, target, context) => {
            const created = importFiles(payload, context.folder ?? null, context);
            const objects = created
                .map(resource => instantiate(resource, { ...target, x: 0, y: 0 }, context))
                .filter(Boolean);

            return { imported: created, objects };
        }
    },

    {
        id: 'files-to-content',
        accepts: (payload, target) => payload.kind === DragKind.FILES && target.zone === DropZone.CONTENT,
        describe: () => 'Replace this content',
        perform: (payload, target, context) => {
            const entry = payload.entries[0];
            if (!entry || !target.resource) return null;

            // THE SAME PATH AS THE `Replace…` BUTTON: one way to replace content, whichever
            // gesture asked for it.
            return { replaced: replaceContent(target.resource, entry, context) };
        }
    },

    // --- a resource being dragged out of the Project panel --------------------------

    {
        id: 'resource-to-property',
        accepts: (payload, target) => payload.kind === DragKind.RESOURCE
            && target.zone === DropZone.PROPERTY
            && acceptsResource(target, payload.resource),
        describe: (payload, target) => `Assign to ${target.label ?? target.prop}`,
        perform: (payload, target) => {
            assignReference(target, payload.resource.id);
            return { assigned: payload.resource.id };
        }
    },

    {
        // A FILE FROM THE DESKTOP, STRAIGHT ONTO A REFERENCE. Importing and then assigning
        // is what a creator means by dropping a PNG on a `source` field, and doing it in
        // two gestures is the kind of thing an asset browser exists to avoid. Both halves
        // are the ones already written: the import is `importFiles()`, the assignment is
        // the rule above.
        id: 'files-to-property',
        accepts: (payload, target) => payload.kind === DragKind.FILES
            && target.zone === DropZone.PROPERTY
            && Boolean(target.accepts ?? true)
            && acceptsFiles(target, payload),
        describe: (payload, target) => `Import ${countFiles(payload)} and assign it to ${target.label ?? target.prop}`,
        perform: (payload, target, context) => {
            // ONE FILE, BECAUSE ONE PROPERTY HOLDS ONE REFERENCE. The rest would be
            // imported and then silently dropped, which is worse than not taking them.
            const entry = payload.entries[0];
            if (!entry) return null;

            const created = importFiles({ ...payload, entries: [entry] }, context.folder ?? null, context);
            const resource = created[0];
            if (!resource) return null;

            assignReference(target, resource.id);
            return { imported: created, assigned: resource.id };
        }
    },

    {
        // AN OBJECT DROPPED ON A REFERENCE IS THE GESTURE `objectref` EXISTS FOR (ADR-0034
        // §3.5). Both sides of it are of SCENE scope — the Object being carried and the
        // Component holding the property — so there is no scope to cross and nothing to
        // decide beyond what the schema already declares. It is `resource-to-property` one
        // scope down, and it writes through the same `setProperty()`, so it is one
        // Operation and one undo like every other property change (ADR-0024).
        //
        // WHAT IS STORED IS THE IDENTITY, and it is the only thing the payload carries: a
        // rule here has no Object to write even if it wanted to (dnd/payload.js). That is
        // the same contract ADR-0036 closed at the graph boundary, met from the other side.
        //
        // A PAYLOAD WITH NO IDENTITY MATCHES NO RULE, rather than matching and then doing
        // nothing: "allowed" followed by silence is the one answer worse than a refusal.
        id: 'object-to-property',
        accepts: (payload, target) => payload.kind === DragKind.OBJECT
            && Boolean(payload.id)
            && target.zone === DropZone.PROPERTY,
        // A REFUSAL WITH ITS REASON, rather than a rule that quietly does not match: a
        // creator carrying an Object over a `width` field has aimed at something, and
        // "nothing happened" is the worst possible answer (ADR-0026 §6).
        refuses: (payload, target) => (acceptsObject(target)
            ? null
            : `${target.label ?? target.prop} does not hold an Object reference.`),
        describe: (payload, target) =>
            `Assign ${payload.name || 'this Object'} to ${target.label ?? target.prop}`,
        // A TARGET THAT HAS SINCE BEEN DELETED IS NOT CHECKED, deliberately. A reference to
        // an Object that is gone is a state of the scene and not a malformed value: it is
        // kept, it resolves to nothing, and it is shown in red where a human sees it
        // (ADR-0034 §3.4). Refusing it here would be a second opinion about that.
        perform: (payload, target) => {
            assignReference(target, payload.id);
            return { assigned: payload.id };
        }
    },

    {
        id: 'resource-to-scene',
        accepts: (payload, target) => payload.kind === DragKind.RESOURCE
            && target.zone === DropZone.SCENE
            && Boolean(instantiator(payload.resource)),
        describe: payload => `Place ${payload.resource.name || 'this resource'} in the scene`,
        perform: (payload, target, context) => ({
            objects: [instantiate(payload.resource, target, context)].filter(Boolean)
        })
    },

    {
        id: 'resource-to-hierarchy',
        accepts: (payload, target) => payload.kind === DragKind.RESOURCE
            && target.zone === DropZone.HIERARCHY
            && Boolean(instantiator(payload.resource)),
        describe: payload => `Add ${payload.resource.name || 'this resource'} to the scene`,
        // No world point: the Hierarchy is a list of what exists, not a place. The origin
        // is the honest default, and the creator moves it in the viewport.
        perform: (payload, target, context) => ({
            objects: [instantiate(payload.resource, { ...target, x: 0, y: 0 }, context)].filter(Boolean)
        })
    },

    {
        id: 'resource-to-project',
        accepts: (payload, target) => payload.kind === DragKind.RESOURCE
            && target.zone === DropZone.PROJECT
            && canMove(target.project ?? null, payload.resource.id, target.parent ?? null),
        describe: (payload, target) => (target.parent ? 'Move into this folder' : 'Move to the top level'),
        perform: (payload, target, context) => ({
            moved: context.project.move(payload.resource.id, target.parent ?? null, { index: target.index ?? null })
        })
    },

    {
        // A `.px` IS A COMPONENT (ADR-0026 §1), so dropping one on an object is the same
        // intent as picking it from Add Component — and it produces the same operation.
        // What it needs first is for the definition to be a registered TYPE, which is the
        // Project layer's job and which `context.install` performs (project/graphs.js).
        id: 'component-to-object',
        accepts: (payload, target) => payload.kind === DragKind.RESOURCE
            && target.zone === DropZone.COMPONENTS
            && payload.resource?.kind === ResourceKind.COMPONENT
            && Boolean(target.object),
        refuses: (payload, target) => (target.object.hasComponent(payload.resource.id)
            ? `${payload.resource.name || 'This Component'} is already on ${target.object.name}.`
            : null),
        describe: (payload, target) => `Add ${payload.resource.name || 'this Component'} to ${target.object.name}`,
        perform: async (payload, target, context) => {
            // A DEFINITION IS DATA UNTIL SOMETHING REGISTERS IT. The identity of the type
            // is the `.px`'s own ResourceId (ADR-0021), so installing twice is idempotent.
            const type = await context.install?.(payload.resource.id);
            if (!type) return null;

            return { component: context.addComponent?.(target.object, type) ?? null, type };
        }
    },

    // --- refusals that are worth stating -------------------------------------------

    {
        // THE FLOOR OF THE CANVAS. It matches the ZONE and not any particular kind of drag,
        // so it answers for everything that reaches a graph — which is the whole point, a
        // target no rule mentions being answered by silence. Nothing is accepted on a canvas
        // yet; the day one gesture is, it is declared ABOVE this one and this goes on
        // answering for the rest. That is what first-match-wins is for.
        //
        // It sits among the refusals rather than at the very end because order against the
        // rules below it cannot matter: none of them mentions this zone.
        id: 'drop-on-graph',
        accepts: (payload, target) => target.zone === DropZone.GRAPH,
        // No `describe`: this rule never allows anything, and `canDrop()` reads the refusal
        // instead. A sentence for a branch that cannot be reached is a sentence that drifts.
        refuses: payload => REFUSED_ON_GRAPH[payload.kind] ?? 'This cannot be dropped on a graph.'
    },

    {
        id: 'object-to-project',
        accepts: (payload, target) => payload.kind === DragKind.OBJECT && target.zone === DropZone.PROJECT,
        // A PREFAB IS NOT A FILE FORMAT, IT IS A DECISION (ADR-0026): what a prefab is, how
        // an instance stays connected to it, and what an override means. None of that is
        // decided, so the drop is refused with the reason rather than half-built.
        refuses: () => 'Prefabs are not designed yet — an object cannot be saved as a resource.',
        describe: () => 'Prefabs are not designed yet'
    }
];

/**
 * The rule that would handle a drop, or null.
 *
 * @param {object} payload - What is being dragged
 * @param {object} target - Where it would land
 * @returns {object|null} The rule
 */
export function ruleFor(payload, target) {
    if (!payload || !target) return null;
    return RULES.find(rule => rule.accepts(payload, target)) ?? null;
}

/**
 * Whether a drop is legal, and what to say about it.
 *
 * @param {object} payload - What is being dragged
 * @param {object} target - Where it would land
 * @returns {{allowed: boolean, reason: string|null, rule: object|null}} The verdict
 */
export function canDrop(payload, target) {
    const rule = ruleFor(payload, target);
    if (!rule) return { allowed: false, reason: null, rule: null };

    const refusal = rule.refuses?.(payload, target) ?? null;
    if (refusal) return { allowed: false, reason: refusal, rule };

    return { allowed: true, reason: rule.describe?.(payload, target) ?? null, rule };
}

/**
 * Perform a drop.
 *
 * @param {object} payload - What is being dragged
 * @param {object} target - Where it lands
 * @param {object} context - `{ project, scene, workspace, folder }`
 * @returns {object|null} What the rule did, or null when the drop was refused
 */
export function performDrop(payload, target, context = {}) {
    const verdict = canDrop(payload, target);
    if (!verdict.allowed) return null;

    return verdict.rule.perform(payload, target, context) ?? null;
}

/**
 * The instantiation rule for a resource, or null when it is not instantiable.
 * @param {object} resource - The manifest entry
 * @returns {object|null} The rule
 */
export function instantiator(resource) {
    if (!resource || isFolder(resource)) return null;
    return INSTANTIABLE.find(entry => entry.accepts(resource)) ?? null;
}

/**
 * Whether a property would accept a resource.
 *
 * Declared, never guessed: a property says `type: 'resource'` in its schema (ADR-0007), and
 * anything else refuses. That is what makes dropping an image on a number a visible refusal
 * rather than a silent corruption.
 *
 * @param {object} target - A PROPERTY target: `{ component, prop }`
 * @param {object} resource - The resource being dropped
 * @returns {boolean} True when the property takes it
 */
export function acceptsResource(target, resource) {
    if (!target || !resource) return false;

    const clause = target.accepts ?? componentClause(target);
    if (!clause) return false;

    // A property may narrow what it takes: `kind: 'asset'`, `mime: 'image/'`. Absent, it
    // takes any resource — the declaration said `resource`, and that is a statement.
    if (clause.kind && clause.kind !== resource.kind) return false;
    if (clause.mime && !(resource.mime ?? '').startsWith(clause.mime)) return false;

    return true;
}

/**
 * Whether a property would accept an Object reference.
 *
 * DECLARED, NEVER GUESSED, exactly as `acceptsResource()` is: the one type that holds an
 * Object identity is `objectref` (ADR-0034 §3.5). A `string` that happens to hold one is
 * not a reference, and taking it would be the Editor deciding what a schema meant — the
 * failure `acceptsResource()` was written against, one scope down.
 *
 * There is no `target.accepts` clause to honour here, and that is not an omission: a
 * `resource` narrows itself by kind and mime, while an Object reference has nothing to
 * narrow — ADR-0034 §3.2 refused a constraint like "this one carries a Transform" because
 * it cannot be checked at the moment of the gesture.
 *
 * @param {object} target - A PROPERTY target: `{ component, prop }`
 * @returns {boolean} True when the property holds an Object reference
 */
export function acceptsObject(target) {
    if (!target?.component || !target.prop) return false;
    return componentSchema(target.component)?.[target.prop]?.type === PropertyType.OBJECTREF;
}

/**
 * What a component's own schema says about one of its properties.
 *
 * TWO SHAPES OF TARGET, ONE QUESTION. A component instance carries its declaration in
 * `static schema`; a `.px` property being DECLARED carries it in the descriptor the
 * Inspector is editing, and there is no component to ask. So a target may state its clause
 * outright — `accepts: { kind, mime }` — and this is the fallback for the ones that do not.
 * Both go through `acceptsResource()`, so there is still one authority on what a reference
 * will take (ADR-0030 §1).
 *
 * @param {object} target - A PROPERTY target carrying a component and a prop
 * @returns {{kind: string|null, mime: string|null}|null} The clause, or null
 */
function componentClause(target) {
    if (!target.component || !target.prop) return null;

    const schema = componentSchema(target.component);
    const property = schema?.[target.prop];
    if (property?.type !== PropertyType.RESOURCE) return null;

    return { kind: property.kind ?? null, mime: property.mime ?? null };
}

/**
 * Write an identity into whatever the target points at.
 *
 * A component property is written through `setProperty()`; anything else hands in its own
 * `assign`, because the operation belongs to a pipeline this module must not have to know
 * about — a `.px` property's default travels the definition's, not a scene's (ADR-0027).
 *
 * NAMED FOR WHAT IT WRITES, which is an identity: a ResourceId of project scope, or an
 * ObjectId of scene scope. Both are opaque strings a property holds, both go through the
 * one controlled path, and a second writer for the second kind would be a second answer to
 * "how does the Editor change a value" (CONVENTIONS.md).
 *
 * @param {object} target - A PROPERTY target
 * @param {string|null} id - The identity to store
 */
function assignReference(target, id) {
    if (target.assign) target.assign(id);
    else target.component.setProperty(target.prop, id);
}

/**
 * Whether a property would take what these files will become.
 *
 * Files import as assets, so a property that narrows itself to another kind refuses them
 * outright, and one that narrows by mime is checked against the file's own. Asked BEFORE
 * anything is imported: a refusal that leaves a stray resource behind is not a refusal.
 *
 * @param {object} target - A PROPERTY target
 * @param {object} payload - The files being carried
 * @returns {boolean} True when the first file could be assigned
 */
function acceptsFiles(target, payload) {
    const entry = payload.entries?.[0];
    if (!entry) return false;

    return acceptsResource(target, {
        kind: ResourceKind.ASSET,
        mime: entry.mime ?? ''
    });
}

/**
 * Declare a resource for each dropped file.
 * @returns {object[]} The manifest entries that were created
 */
function importFiles(payload, parent, context) {
    const created = [];

    for (const entry of payload.entries) {
        const resource = createResourceOfKind(context.project, ResourceKind.ASSET, {
            parent,
            file: { name: entry.name, type: entry.mime },
            payload: entry.payload
        });
        if (resource) created.push(resource);
    }

    return created;
}

/** Write a new payload into a resource, the same way the Replace button does. */
function replaceContent(resource, entry, context) {
    if (entry.mime && entry.mime !== context.project.get(resource.id)?.mime) {
        context.project.setProperty(resource.id, 'mime', entry.mime);
    }
    context.project.save(resource.id, entry.payload);
    return resource.id;
}

/** Build the object a resource becomes, add it to the scene, and place it. */
function instantiate(resource, target, context) {
    const rule = instantiator(resource);
    if (!rule || !context.scene) return null;

    const object = rule.build(resource, context);
    const transform = object.getComponent('Transform');
    if (transform) {
        transform.x = Math.round(target.x ?? 0);
        transform.y = Math.round(target.y ?? 0);
    }

    // Through the Editor's own command, so what lands in the scene is one ADD_OBJECT and
    // undoes like anything else (ADR-0019). `addObject` is passed in rather than imported
    // to keep this module free of the window that owns the gesture.
    const added = context.addObject
        ? context.addObject(object, target)
        : context.scene.add(object);

    context.select?.(added);
    return added;
}

/** A file name without its extension, for naming an object after the image it shows. */
function baseName(name) {
    return (name ?? '').replace(/\.[^.]+$/, '') || 'Image';
}

function countFiles(payload) {
    const count = payload.entries.length;
    return count === 1 ? `“${payload.entries[0].name}”` : `${count} files`;
}
