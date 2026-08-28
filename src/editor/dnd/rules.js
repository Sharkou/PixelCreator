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

import {
    PROPERTY_REFERENCE,
    OBJECT_SOCKET_REFERENCE,
    Object as SceneObject,
    PropertyType,
    Transform,
    componentSchema,
    createId
} from '../../core/mod.js';
import { ResourceKind, isFolder, canMove } from '../../project/mod.js';
import { Sprite } from '../../runtime/mod.js';
import { DragKind, DropZone } from './payload.js';
import { createResourceOfKind } from '../project/commands.js';
import { uniqueName } from '../commands.js';

/**
 * WHICH COMPONENT CONSUMES WHICH KIND OF RESOURCE — the one relation, stated once.
 *
 * ONE PLACE SAYS "AN IMAGE IS A SPRITE". A second kind of asset — a sound, a tilemap —
 * adds a row here and changes nothing else, which is the extension point ADR-0026 asks
 * for. A kind with no row is not instantiable, and the rules below refuse it by name.
 *
 * IT ANSWERS TWO GESTURES RATHER THAN ONE, AND THAT IS WHY `consumes` REPLACED A `build`
 * PER ROW. Dropping an image on the SCENE makes a whole object — a Transform and something
 * that draws; dropping it on an object's Inspector attaches only the second half, to the
 * object that is already there. Those are two readings of the same sentence, so writing the
 * sentence twice is how the two would come to disagree about what an image is: the tile a
 * creator dropped in the scene would be 64 units and the one they dropped on an object
 * would be nothing at all, and neither place would look wrong on its own.
 *
 * The row names the class AND its registered type because the two gestures reach a
 * Component by different roads: the scene builds a detached object, so it needs the
 * constructor; attaching goes through the Editor's own ADD_COMPONENT command, which names a
 * type and asks the registry (ADR-0021). `Component.type` is that name, so the row states
 * the class and reads the name off it rather than carrying a second spelling.
 *
 * `values` IS WHAT A FRESH ONE NEEDS BEFORE IT SHOWS ANYTHING. A `Sprite` starts 0 by 0 and
 * draws nothing at that size, so attaching one and stopping would answer a gesture with a
 * component a creator cannot see — which ADR-0026 §6 names the worst possible answer.
 */
const INSTANTIABLE = [
    {
        /** @param {object} resource - The manifest entry */
        accepts: resource => resource.kind === ResourceKind.ASSET
            && (resource.mime ?? '').startsWith('image/'),
        label: 'Image',
        consumes: {
            Component: Sprite,
            /** Where the reference goes. The ResourceId, never the bytes (ADR-0020). */
            property: 'source',
            values: { width: 64, height: 64 }
        }
    }
];

/**
 * A Component that consumes a resource, built and pointed at it.
 *
 * Detached: what it is added TO is the caller's business, and only the scene path builds a
 * component this way — attaching to an object that already exists goes through the Editor's
 * command so it is one Operation and undoes like any other (ADR-0019).
 *
 * @param {object} consumes - The `consumes` record of an INSTANTIABLE row
 * @param {object} resource - The manifest entry it is pointed at
 * @returns {object} The component
 */
function consumer({ Component, property, values }, resource) {
    const component = new Component();
    component[property] = resource.id;
    for (const [name, value] of globalThis.Object.entries(values ?? {})) component[name] = value;
    return component;
}

/**
 * The object a resource becomes: a place in the world, and the thing that shows it.
 *
 * ONE BUILDER FOR EVERY ROW, because the shape is the same for all of them — what differs
 * is which Component consumes the resource, and that is what the row says.
 *
 * @param {object} rule - An INSTANTIABLE row
 * @param {object} resource - The manifest entry
 * @param {object} context - `{ scene }`
 * @returns {object} A detached object, ready to be added
 */
function buildInstance(rule, resource, { scene }) {
    const object = new SceneObject(uniqueName(scene, baseName(resource.name)));
    object.addComponent(new Transform());
    object.addComponent(consumer(rule.consumes, resource));
    return object;
}

/**
 * Why a drag that reached the canvas and found no meaning there is refused, in its own words.
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
/**
 * What a canvas with no Component open answers — the one refusal that is about the CANVAS
 * rather than about what is being carried. Every rule that would write into a `.px` asks
 * for `bound`, so an unbound canvas takes nothing and says why, instead of accepting a
 * gesture it cannot honour.
 */
const NOTHING_OPEN = 'There is no Component open on this canvas to declare anything in.';

const REFUSED_ON_GRAPH = {
    // Only reachable for a drop ONTO a node that works on no property: bare canvas takes a
    // Component now, and so does any node carrying a property picker (ADR-0041 §2).
    [DragKind.COMPONENT]: 'This node does not work on a property. Drop a Component on a Get '
        + 'or Set Property, or on bare canvas to add one.',
    [DragKind.PROPERTY]: 'This node does not name a property. Drop it on a Get or Set '
        + 'Property, or on bare canvas to add one.',
    // An Object with no identity at all — a drag that carried nothing.
    [DragKind.OBJECT]: 'There is no Object in this drag.',
    // Only reachable for a drop ONTO a node that holds no resource: bare canvas takes one
    // now (`resource-to-canvas`), and a node that declares a `resource` param takes it too.
    [DragKind.RESOURCE]: 'This node does not hold a resource. Drop it on bare canvas to add one.',
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

    {
        // A RESOURCE DROPPED ON AN OBJECT BECOMES THE COMPONENT THAT CONSUMES IT. Dropping
        // an image in the scene has always meant "an object that shows this picture"; the
        // same image let go on an object that already exists means the same thing minus the
        // object — attach what shows it, and point it at the resource. It is the row above
        // one scope down: that one attaches a `.px`, which IS a Component; this one attaches
        // the Component a plain asset needs in order to be anything at all.
        //
        // NOTHING HERE KNOWS WHAT AN IMAGE IS. Which Component consumes which resource is
        // the INSTANTIABLE table's single sentence, read by both gestures (see it above), so
        // a sound or a tilemap becomes droppable here on the day it becomes instantiable —
        // by the same row, and with no rule written.
        //
        // ONE GESTURE, ONE UNDO ENTRY. Attaching the Component and pointing it at the
        // resource are two Operations of one intent, so they travel under one batch and a
        // single `Ctrl Z` takes the whole drop back (ADR-0024 §4).
        id: 'resource-to-components',
        accepts: (payload, target) => payload.kind === DragKind.RESOURCE
            && target.zone === DropZone.COMPONENTS
            && Boolean(target.object)
            && Boolean(instantiator(payload.resource)),
        // ALREADY THERE IS A REFUSAL WITH SOMEWHERE TO GO. Attaching a second Sprite is
        // legal — several renderers on one Object all draw (editor/registry.js) — but it is
        // almost never what a creator dropping a picture on an object that already shows one
        // meant, and quietly making two is a state they have to notice before they can undo
        // it. The row that WOULD take it is named, because a refusal a creator cannot act on
        // is half a refusal (ADR-0026 §6).
        refuses: (payload, target) => {
            const consumes = instantiator(payload.resource)?.consumes;
            if (!target.object.hasComponent(consumes.Component.type)) return null;

            return `${target.object.name} already has a ${consumes.Component.type}. `
                + `Drop the ${payload.resource.name || 'resource'} on its `
                + `${humanise(consumes.property)} instead.`;
        },
        describe: (payload, target) => {
            const consumes = instantiator(payload.resource).consumes;
            return `Add a ${consumes.Component.type} showing `
                + `${payload.resource.name || 'this resource'} to ${target.object.name}`;
        },
        perform: (payload, target, context) => {
            const { Component, property, values } = instantiator(payload.resource).consumes;
            const batch = createId();

            const component = context.addComponent?.(target.object, Component.type, { batch });
            if (!component) return null;

            // Through `setProperty`, like every other value the Editor writes: one
            // controlled path, so the drop replicates and undoes like a typed value
            // (CONVENTIONS.md).
            component.setProperty(property, payload.resource.id, { batch });
            for (const [name, value] of globalThis.Object.entries(values ?? {})) {
                component.setProperty(name, value, { batch });
            }

            return { component, type: Component.type, assigned: payload.resource.id };
        }
    },

    // --- refusals that are worth stating -------------------------------------------

    {
        // THE DROP DECLARES A SOCKET, NOT A TARGET — and that sentence is the whole model
        // (ADR-0037).
        //
        // A `.px` is a Component TYPE, of PROJECT scope, and there is no instance to write
        // to while one is being edited: it may be attached to no Object of the open scene,
        // or to fifty. So the identity of the Object being dropped cannot go anywhere — not
        // into the graph, which ADR-0034 invariant 1 forbids, and not onto an instance,
        // which does not exist.
        //
        // What the gesture CAN mean is the thing ADR-0034 §3.5 already designed: the `.px`
        // gains an `objectref` PROPERTY named after the Object, and a node that reads it.
        // The creator sees `[Player]`; the file holds "a socket called Player"; each Object
        // carrying the Component says in the Inspector where its own socket points.
        //
        // NOTHING OUTSIDE THE `.px` IS TOUCHED, so the inter-resource undo question
        // ADR-0034 §3.7 parked does not arise — the property, the node and the wire travel
        // one pipeline and one stack (ADR-0027 §5), under one batch.
        id: 'object-to-graph',
        // BARE CANVAS MEANS NO NODE — the guard every other canvas rule carries. Without it
        // this shadowed `object-to-node`, so letting an Object go ON a node declared a second
        // socket and left the node untouched: first match wins, so "anywhere on the canvas"
        // is never what a rule beside a more specific one should say.
        accepts: (payload, target) => payload.kind === DragKind.OBJECT
            && target.zone === DropZone.GRAPH
            && target.bound === true
            && !target.node
            && Boolean(payload.id),
        describe: payload => `Declare ${payload.name || 'this Object'} as an input of this Component`,
        perform: (payload, target, context) => context.declareReference?.(payload, target) ?? null
    },

    {
        // AN OBJECT LET GO ON A NODE THAT ACTS ON ONE POINTS IT THERE. The same sentence as
        // every other drop onto a node: a drop CONFIGURES, it never creates (ADR-0037 §2.4).
        // What it configures here is the picker beside the Object socket — so a creator can
        // aim an existing node by dragging, exactly as they aimed it when they made it.
        //
        // The socket is declared or reused first, so what lands in the `.px` is a NAME and
        // the `ObjectId` stops at the gesture (ADR-0034 invariant 1).
        id: 'object-to-node',
        accepts: (payload, target) => payload.kind === DragKind.OBJECT
            && target.zone === DropZone.GRAPH
            && Boolean(payload.id)
            && Boolean(target.node)
            && target.params?.target?.reference === OBJECT_SOCKET_REFERENCE,
        describe: (payload, target) =>
            `Point ${target.label ?? 'this node'} at ${payload.name || 'this Object'}`,
        perform: (payload, target, context) => {
            const batch = createId();
            const socket = context.socketFor?.({ name: payload.name }, { batch });
            if (!socket) return null;

            context.setNodeParam?.(target.node, 'target', socket.id, { batch });
            return { node: target.node, socket };
        }
    },

    {
        // A PROPERTY IS TWO IDENTITIES OF PROJECT SCOPE, so it may be named inside a `.px`
        // outright (ADR-0027 §4, ADR-0034 §3.3). Dropped on a node that names one, it fills
        // both params at once — and the port takes its real type on the spot, because the
        // type comes from the pair and never from the Object (ADR-0036).
        id: 'property-to-node',
        accepts: (payload, target) => payload.kind === DragKind.PROPERTY
            && target.zone === DropZone.GRAPH
            && acceptsProperty(target),
        describe: (payload, target) =>
            `Point ${target.label ?? 'this node'} at ${payload.label || payload.property}`,
        perform: (payload, target, context) => context.setNodeParams?.(target.node, {
            component: payload.component,
            property: payload.property
        }) ?? null
    },

    {
        // A RESOURCE IS A LITERAL A `.px` MAY HOLD, and this is the gesture that says so.
        //
        // IT WAS REFUSED FOR A RULE THAT IS NOT ABOUT RESOURCES. ADR-0034 keeps identities
        // out of a `.px` because an ObjectId names something in ONE SCENE while a `.px`
        // serves many — the mismatch is SCOPE, not identity. A ResourceId is of PROJECT
        // scope, exactly like the `.px` that would hold it (ADR-0020), so none of that
        // reasoning reaches it. Applying it anyway is what left a creator unable to swap a
        // sprite from a graph without writing JavaScript.
        //
        // NO MENU, BECAUSE THERE IS NOTHING TO CHOOSE. A property drop asks Get or Set
        // because reading and writing are two intents (ADR-0037 §2.4); a resource has one
        // meaning — this value — so asking would be ceremony.
        id: 'resource-to-canvas',
        accepts: (payload, target) => payload.kind === DragKind.RESOURCE
            && target.zone === DropZone.GRAPH
            && target.bound === true
            && !target.node
            && !isFolder(payload.resource),
        describe: payload => `Add ${payload.resource.name || 'this resource'} as a value`,
        perform: (payload, target, context) => context.createNode?.(
            'value.resource', { value: payload.resource.id }, target.at
        ) ?? null
    },

    {
        // A resource let go ON a node that holds one configures it, exactly as a Component
        // dropped on a node naming one does. A drop configures; it never creates.
        id: 'resource-to-node',
        accepts: (payload, target) => payload.kind === DragKind.RESOURCE
            && target.zone === DropZone.GRAPH
            && Boolean(target.node)
            && !isFolder(payload.resource)
            && target.params?.value?.type === PropertyType.RESOURCE,
        describe: (payload, target) =>
            `Point ${target.label ?? 'this node'} at ${payload.resource.name || 'this resource'}`,
        perform: (payload, target, context) =>
            context.setNodeParam?.(target.node, 'value', payload.resource.id) ?? null
    },

    {
        // ON BARE CANVAS THE CREATOR CHOOSES, AT THE POINT OF THE DROP. ADR-0027 §11 refused
        // this gesture because reading and writing are two different intents and picking one
        // is magic — and it said the refusal would lift "le jour où un geste non ambigu sera
        // conçu". A menu opened where the pointer let go is that gesture: explicit, local,
        // and made by the creator rather than for them.
        //
        // `create` is what the menu answered. The window never performs without it, and
        // without it nothing happens here — no node, no guess.
        id: 'property-to-canvas',
        // BARE CANVAS MEANS NO NODE. Without this the rule would also match a drop ONTO
        // one and shadow the rule that configures it — first match wins, so "anywhere on
        // the canvas" is never what a rule beside a more specific one should say.
        accepts: (payload, target) => payload.kind === DragKind.PROPERTY
            && target.zone === DropZone.GRAPH
            && target.bound === true
            && !target.node,
        describe: (payload, target) => {
            const named = payload.label || payload.property;
            return payload.object?.name
                ? `Add a node for ${payload.object.name}.${named}`
                : `Add a node for ${named}`;
        },
        // ONE GESTURE PRODUCES A NODE THAT IS FINISHED, and that is the whole of D+. The
        // Inspector knew the Object, the Component and the property; the drop used to write
        // two of the three and leave the creator to drag the Object separately and pull a
        // wire to the Target port. It now declares (or reuses) the socket for that Object and
        // aims the node at it, so what lands on the canvas reads `Set Player.Transform.x` and
        // needs nothing further (ADR-0040 §3).
        //
        // ONE BATCH: the socket and the node are one thing the creator did (ADR-0024 §4).
        perform: (payload, target, context) => {
            if (!target.create) return null;

            const batch = createId();
            const socket = payload.object ? context.socketFor?.(payload.object, { batch }) : null;

            const node = context.createNode?.(target.create, {
                // ABSENT RATHER THAN `FROM_WIRE` WHEN THERE IS NO OBJECT: a param nobody set
                // is what every graph written before this already carries, and it means the
                // wire — so the two states stay one state.
                ...(socket ? { target: socket.id } : {}),
                component: payload.component,
                property: payload.property
            }, target.at, { batch }) ?? null;

            return node ? { node, socket } : null;
        }
    },

    {
        // A FILE FROM THE DESKTOP, STRAIGHT INTO A GRAPH. "I take my file and drop it, and
        // the node uses it" is the whole sentence, and it used to be four gestures: import
        // into Project, find the resource, add a `Resource` node, pick it in the field.
        //
        // THE THREE CASES ARE TOLD APART BY THE DRAG ITSELF, and no content is ever compared
        // to guess at duplicates. A resource ALREADY in the project arrives as a RESOURCE
        // drag and is only referenced (`resource-to-node` / `resource-to-canvas`); a file
        // from outside arrives as a FILES drag and has no project identity to reuse, so it
        // is imported. Nothing here can duplicate a resource, because nothing here can even
        // see one (ADR-0020).
        //
        // IMPORT THEN USE, IN ONE BATCH, so a creator who changes their mind takes both
        // halves back with one undo — the shape `files-to-property` already has.
        id: 'files-to-node',
        accepts: (payload, target) => payload.kind === DragKind.FILES
            && target.zone === DropZone.GRAPH
            && Boolean(target.node)
            && target.params?.value?.type === PropertyType.RESOURCE,
        describe: (payload, target) =>
            `Import ${countFiles(payload)} and point ${target.label ?? 'this node'} at it`,
        perform: (payload, target, context) => {
            // ONE FILE, BECAUSE ONE PARAM HOLDS ONE REFERENCE. The rest would be imported
            // and then silently dropped, which is worse than not taking them.
            const batch = createId();
            const [resource] = importFiles({ ...payload, entries: payload.entries.slice(0, 1) },
                context.folder ?? null, context);
            if (!resource) return null;

            context.setNodeParam?.(target.node, 'value', resource.id, { batch });
            return { imported: [resource], node: target.node };
        }
    },

    {
        // The same gesture on bare canvas: the file becomes a resource of the project, and
        // a node holding it lands where it was dropped.
        id: 'files-to-canvas',
        accepts: (payload, target) => payload.kind === DragKind.FILES
            && target.zone === DropZone.GRAPH
            && target.bound === true
            && !target.node,
        describe: payload => `Import ${countFiles(payload)} and add it as a value`,
        perform: (payload, target, context) => {
            const batch = createId();
            const [resource] = importFiles({ ...payload, entries: payload.entries.slice(0, 1) },
                context.folder ?? null, context);
            if (!resource) return null;

            const node = context.createNode?.('value.resource', { value: resource.id },
                target.at, { batch }) ?? null;
            return node ? { imported: [resource], node } : { imported: [resource] };
        }
    },

    {
        // A COMPONENT IS A CONTEXT, AND DROPPING ONE SETS IT. This was removed a tranche ago
        // and the reason was sound at the time: the Component half of a property was HIDDEN,
        // so the drop wrote a param nothing could show and the creator's next click
        // overwrote it. What changed is not the gesture but what a node can SAY — a picker
        // with its Component set now reads `Transform \u25b8 \u2026` (ADR-0041 \u00a72), so
        // the drop has a visible effect and one honest question left.
        //
        // IT DOES NOT FINISH THE NODE, AND IT CANNOT. Which property is the one thing
        // dragging a Component does not say; guessing would be the magic this Editor
        // refuses. What it does is answer two of the three questions.
        id: 'component-to-node',
        accepts: (payload, target) => payload.kind === DragKind.COMPONENT
            && target.zone === DropZone.GRAPH
            && acceptsProperty(target),
        describe: (payload, target) =>
            `Point ${target.label ?? 'this node'} at ${payload.label || payload.type}`,
        perform: (payload, target, context) => {
            if (!context.setNodeParams) return null;

            // THE PROPERTY GOES WITH THE OLD COMPONENT. An id picked out of `Sprite` names
            // nothing on `Transform`, and leaving it behind would be a reference to nothing.
            context.setNodeParams(target.node, { component: payload.type, property: null });
            return { node: target.node, component: payload.type };
        }
    },

    {
        // The same offer on bare canvas, through the menu every creation opens: reading and
        // writing are two intents and a drop cannot tell them apart (ADR-0037 \u00a72.4).
        id: 'component-to-canvas',
        accepts: (payload, target) => payload.kind === DragKind.COMPONENT
            && target.zone === DropZone.GRAPH
            && target.bound === true
            && !target.node,
        describe: (payload, target) => {
            const named = payload.label || payload.type;
            return payload.object?.name
                ? `Add a node for ${payload.object.name}'s ${named}`
                : `Add a node for ${named}`;
        },
        perform: (payload, target, context) => {
            if (!target.create) return null;

            // ONE BATCH: the socket and the node are one thing the creator did (ADR-0024 \u00a74).
            const batch = createId();
            const socket = payload.object ? context.socketFor?.(payload.object, { batch }) : null;

            const node = context.createNode?.(target.create, {
                ...(socket ? { target: socket.id } : {}),
                component: payload.type
            }, target.at, { batch }) ?? null;

            return node ? { node, socket } : null;
        }
    },

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
        refuses: (payload, target) => (target.bound === false
            ? NOTHING_OPEN
            : REFUSED_ON_GRAPH[payload.kind] ?? 'This cannot be dropped on a graph.')
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
 * Whether a node would take a property in one of its params.
 *
 * DECLARED, NEVER GUESSED. The declaration is the node type's own: a param says it
 * REFERENCES a property (ADR-0027 §4), and that is the only thing that makes a node a
 * target. A node with no such param is not "not yet supported", it is a node this means
 * nothing to.
 *
 * ONE PARAM, NOT A PAIR. It used to check two — a Component type AND a property of it —
 * because reaching another Object's property was a different node from reading your own.
 * One node asks one question now, and the answer carries both halves (ADR-0040 §2).
 *
 * @param {object} target - A GRAPH target carrying `node` and its type's `params`
 * @returns {boolean} True when the node names a property
 */
export function acceptsProperty(target) {
    if (!target?.node) return false;
    return target.params?.property?.reference === PROPERTY_REFERENCE;
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

    const object = buildInstance(rule, resource, context);
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

/**
 * A property name, as a creator reads it in the Inspector.
 *
 * The same transformation `inspector/schema.js` applies to a property with no declared
 * label. It is repeated here rather than imported for the reason this module has no other
 * import from the Inspector: a rule says what a drop MEANS and must not depend on the panel
 * that happens to be showing it. Two words, and they cannot drift apart in any way a creator
 * could notice.
 *
 * @param {string} name - The property's name
 * @returns {string} What the row is titled
 */
function humanise(name) {
    return globalThis.String(name ?? '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, first => first.toUpperCase());
}

/** A file name without its extension, for naming an object after the image it shows. */
function baseName(name) {
    return (name ?? '').replace(/\.[^.]+$/, '') || 'Image';
}

function countFiles(payload) {
    const count = payload.entries.length;
    return count === 1 ? `“${payload.entries[0].name}”` : `${count} files`;
}
