// What the Inspector shows for a Resource, and how (ADR-0007's shape, ADR-0025's subject).
//
// THE SAME ANSWER SHAPE AS A COMPONENT'S. `describeComponent()` answers "what fields, of
// what kind, shown how" and builds no DOM; this answers the same question for a manifest
// entry, so `windows/inspector.js` renders both with one set of rows and one field
// element. That is what stops a Resource panel from becoming a second Inspector.
//
// NO CHAIN OF BRANCHES, EVER. A kind does not get a branch in the panel; it gets a row in
// the table below — extra fields, and optionally a way to show its content. Two lines add
// a kind, and nothing outside this file learns its name. The alternative, which this
// exists to prevent, is the `if (kind === 'image') … if (kind === 'scene') …` that every
// asset browser grows.
//
// WHAT IS EDITABLE, AND WHAT IS NOT. `name` is the only field a creator writes here: it
// is a display field that nothing references (ADR-0020), so writing it breaks nothing.
// `kind`, `id`, `created`, `modified`, `revision` are facts about the resource — shown
// read-only because a creator asking "what is this and when did it change" is a question
// the panel should answer, and because rewriting any of them would mean something else
// entirely (a new identity, a lie about history).
//
// THE PATH IS DERIVED, and shown as text: moving a resource is a drag in the Project
// panel, not a field to type a path into — the model has no path to type (ADR-0025).

import { ResourceKind, baseNameOf, folderPath, hasPayload } from '../../project/mod.js';
import { formatSize, imageSize } from '../../project/image.js';
import { FieldKind } from './schema.js';

/**
 * Extra fields and content, by kind.
 *
 * A kind absent from this table still inspects: it gets the identity fields every
 * resource has. That is the point — the table adds, it does not enable.
 */
const BY_KIND = {
    [ResourceKind.FOLDER]: {
        // A folder holds resources rather than bytes, so what it can honestly report is
        // how many. `size` and `revision` are meaningless for it and are left out.
        fields: (resource, { project }) => [
            readonly('contents', 'Contents', countOf(project, resource.id))
        ]
    },
    [ResourceKind.SCENE]: {
        fields: (resource, { payload }) => [
            readonly('objects', 'Objects', payload?.objects?.length ?? null)
        ]
    },
    // A `.px` IS the component and its graph (ADR-0026), so both are reported from one
    // payload — there is no second resource to look up, and none to show.
    [ResourceKind.COMPONENT]: {
        fields: (resource, { payload }) => [
            readonly('properties', 'Properties', countKeys(payload?.properties)),
            readonly('nodes', 'Graph nodes', payload?.graph?.nodes?.length ?? 0)
        ]
    },
    [ResourceKind.GRAPH]: {
        fields: (resource, { payload }) => [
            readonly('nodes', 'Nodes', payload?.nodes?.length ?? null)
        ]
    },
    [ResourceKind.ASSET]: {
        // THE SIZE IS READ FROM THE PICTURE, NEVER GUESSED. "How big is this?" is the
        // first question a creator asks of an image, and the header of every format the
        // Editor imports states it (project/image.js). An asset that is not an image, or
        // one whose bytes say nothing, reports a dash rather than a number nobody can
        // trust.
        fields: (resource, { payload }) => [
            readonly('mime', 'Format', resource.mime ?? null),
            readonly('dimensions', 'Dimensions', formatSize(imageSize(payload)))
        ],
        // The only kind with something to LOOK at. `content` says what the panel should
        // draw and what replacing it would mean; the panel decides how to draw it, and
        // says plainly when it cannot yet.
        content: (resource, { payload }) => ({
            preview: previewFor(resource, payload),
            replaceable: true,
            accept: resource.mime ?? 'image/*'
        })
    }
};

/** Displayed names of the kinds, so a panel never prints a raw enum value. */
export const KIND_NAMES = {
    [ResourceKind.FOLDER]: 'Folder',
    [ResourceKind.SCENE]: 'Scene',
    [ResourceKind.COMPONENT]: 'Component',
    [ResourceKind.GRAPH]: 'Graph',
    [ResourceKind.ASSET]: 'Asset'
};

/**
 * Describe a resource for the Inspector.
 *
 * Pure, like its component counterpart: a manifest entry and what the project knows about
 * it go in, descriptors come out, and no DOM is touched. That is what makes the hard part
 * of this panel testable under Node.
 *
 * @param {object} resource - The manifest entry
 * @param {object} [context] - What the panel could resolve
 * @param {object} [context.project] - The project, for the derived path and counts
 * @param {any} [context.payload] - The resource's content, when it was read
 * @param {number|null} [context.size] - Payload size in bytes, when the store knows
 * @returns {{title: string, kind: string, fields: object[], metadata: object[], content: object|null}}
 *   What to show
 */
export function describeResource(resource, { project = null, payload = null, size = null } = {}) {
    if (!resource) return null;

    const entry = BY_KIND[resource.kind] ?? {};
    const extra = entry.fields ? entry.fields(resource, { project, payload }) : [];

    return {
        // THE HEADER SHOWS THE NAME, NOT THE FILE NAME. `.png` is derived from the mime and
        // `.px` from the kind (ADR-0026 §4) — neither is something a creator typed, and
        // neither is something they can change here. Repeating a derived suffix in the one
        // line of the panel that is meant to say WHAT THIS IS makes the title read like a
        // path. The extension is drawn once, beside the Name field, where the rule about
        // what may be typed actually applies.
        title: baseNameOf(resource) || resource.name || 'Untitled',
        kind: resource.kind,
        kindName: KIND_NAMES[resource.kind] ?? resource.kind,

        // Editable, and it is deliberately the only one.
        fields: [
            {
                name: 'name',
                label: 'Name',
                kind: FieldKind.STRING,
                min: null,
                max: null,
                step: null,
                unit: null,
                scale: 1,
                values: null,
                readonly: false,
                tooltip: 'Displayed name. Nothing references it, so renaming breaks nothing'
            }
        ],

        // Facts, in the order a creator asks for them: what it is, where it lives, how big
        // it is, when it happened.
        metadata: [
            readonly('kind', 'Type', KIND_NAMES[resource.kind] ?? resource.kind),
            readonly('location', 'Location', project ? folderPath(project, resource) || 'Project' : null),
            ...extra,
            hasPayload(resource) ? readonly('size', 'Size', formatBytes(size)) : null,
            hasPayload(resource) ? readonly('revision', 'Revision', resource.revision ?? null) : null,
            readonly('created', 'Created', formatDate(resource.created)),
            readonly('modified', 'Modified', formatDate(resource.modified)),
            readonly('id', 'Identifier', resource.id)
        ].filter(Boolean),

        content: entry.content ? entry.content(resource, { payload }) : null
    };
}

/**
 * Tell whether a kind knows how to show its content.
 * @param {object} resource - The manifest entry
 * @returns {boolean} True when a Content section is worth drawing
 */
export function hasContentPanel(resource) {
    return Boolean(resource && BY_KIND[resource.kind]?.content);
}

/**
 * A payload turned into something a panel can draw.
 *
 * WHAT IS HONEST TODAY: the store holds an asset's bytes, and a data URL is the only form
 * a browser can show without a loader that does not exist yet. When the payload is not
 * something that can be drawn, this says so instead of guessing — an `<img>` pointed at
 * nothing is worse than a line of text saying the content cannot be previewed.
 *
 * @param {object} resource - The manifest entry
 * @param {any} payload - Its content
 * @returns {{type: string, source?: string, note?: string}} What to draw
 */
function previewFor(resource, payload) {
    const mime = resource.mime ?? '';

    if (typeof payload === 'string' && payload.startsWith('data:')) {
        return { type: mime.startsWith('image/') ? 'image' : 'link', source: payload };
    }

    if (payload === null || payload === undefined) {
        return { type: 'none', note: 'No content stored yet.' };
    }

    return { type: 'none', note: 'This content cannot be previewed.' };
}

function readonly(name, label, value) {
    return {
        name,
        label,
        kind: FieldKind.READONLY,
        value: value ?? '—',
        min: null,
        max: null,
        step: null,
        unit: null,
        scale: 1,
        values: null,
        readonly: true,
        tooltip: null
    };
}

function countOf(project, id) {
    if (!project) return null;
    const count = project.children(id).length;
    return `${count} item${count === 1 ? '' : 's'}`;
}

function countKeys(value) {
    return value && typeof value === 'object' ? globalThis.Object.keys(value).length : 0;
}

/**
 * Bytes, in the unit a creator reads.
 * @param {number|null} bytes - The size
 * @returns {string|null} The formatted size
 */
export function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !globalThis.Number.isFinite(bytes)) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A timestamp, in the reader's own locale.
 * @param {number|null} at - Epoch milliseconds
 * @returns {string|null} The formatted date
 */
export function formatDate(at) {
    if (typeof at !== 'number' || !globalThis.Number.isFinite(at)) return null;

    const date = new globalThis.Date(at);
    // Date and time both: "when did I last save this" is a question about today as often
    // as about last month.
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
