// Follow — "this Object stays where that one is" (ADR-0069 §10).
//
// WHAT IT REPLACES, AND WHY IT EARNS ITS ROW. A camera that follows the player is already
// expressible: `On Update` ▸ `Find By Tag` ▸ `Get Property ▸ Transform ▸ x` ▸ `Set Position`,
// five nodes and an understanding of object sockets. That is a graph a creator can write —
// and it is five nodes for a sentence with one verb in it. A Component is one row and a
// picker, and it is what a beginner reaches for on their first scrolling level.
//
// IT IS NOT A CAMERA COMPONENT. Nothing here mentions a Camera: a torch that follows a
// player, a health bar that follows an enemy and a camera that follows a ship are one idea,
// and naming it after the first use would have made the other two look unsupported.
//
// ORDINARY, LIKE `Velocity` (ADR-0004). It runs where every component runs, in canonical
// order, and it writes a Transform through a plain write — a simulation output, never an
// authored intent (ADR-0003).
//
// IT READS THE WORLD AS IT IS WHEN IT RUNS, AND THAT IS SAID RATHER THAN HIDDEN. A target
// earlier in canonical order has already moved, so the follower is exact; a target LATER in
// the order — or one carried by a `Body`, which is moved by the pass that ends the step
// (ADR-0067 §4) — is followed one step later. At sixty steps a second that is four pixels for
// a character walking at 240 units per second, which is also why no smoothing is offered:
// there is nothing here a number could improve, and every such number is one a creator would
// have to choose.

import { worldMatrix, worldPosition } from '../../core/mod.js';

export class Follow {

    static type = 'Follow';

    static schema = {
        // AN OBJECT REFERENCE, so the picker in the Inspector and a drop from the Hierarchy
        // both work without this file knowing either exists (ADR-0034 §3.5).
        target: {
            type: 'objectref',
            default: null,
            tooltip: 'The Object to stay with. Drag one here, or pick it'
        },
        offsetX: { type: 'number', default: 0, tooltip: 'How far to the side of it to sit' },
        offsetY: { type: 'number', default: 0, tooltip: 'How far above or below it to sit' }
    };

    /**
     * Create the component.
     * @param {object|string|null} [target] - The Object to follow
     * @param {number} [offsetX] - Horizontal offset, in world units
     * @param {number} [offsetY] - Vertical offset, in world units
     */
    constructor(target = null, offsetX = 0, offsetY = 0) {
        this.target = target;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
    }

    /**
     * Move to where the target is.
     *
     * A TARGET THAT IS GONE IS A STATE OF THE SCENE, NOT A FAULT (ADR-0034 §3.4). A camera
     * whose subject was destroyed stops where it is, which is the only answer that leaves a
     * playable frame on screen.
     *
     * @param {object} self - The owning object
     * @param {object} ctx - The step context
     */
    update(self, ctx) {
        const transform = self.getComponent?.('Transform') ?? null;
        if (!transform) return;

        const target = resolve(this.target, ctx?.scene);
        if (!target || !target.getComponent?.('Transform')) return;

        const at = worldPosition(target);
        const wanted = { x: at.x + this.offsetX, y: at.y + this.offsetY };

        // THE TARGET IS SOMEWHERE IN THE WORLD AND THIS TRANSFORM IS IN ITS PARENT'S SPACE
        // (ADR-0002), so the point crosses back through the parent's matrix. Without a
        // parent — which is what a camera usually is — the two are the same numbers.
        const parent = self.parent ?? null;
        if (!parent) {
            transform.x = wanted.x;
            transform.y = wanted.y;
            return;
        }

        try {
            const local = worldMatrix(parent).invert().apply(wanted.x, wanted.y);
            transform.x = local.x;
            transform.y = local.y;
        } catch {
            // A parent scaled to nothing has no inverse and no sensible answer.
        }
    }
}

/**
 * The Object a reference names.
 *
 * TWO SHAPES, BECAUSE A PROPERTY IS STORED AS AN IDENTITY AND HANDED OVER AS A HANDLE
 * (ADR-0034 §3.5): a scene read back from a file holds an id, and one built in code may hold
 * the Object itself.
 *
 * @param {object|string|null} target - What the property holds
 * @param {object|null} scene - The scene to resolve against
 * @returns {object|null} The Object, or null
 */
function resolve(target, scene) {
    if (!target) return null;
    if (typeof target !== 'string') return scene?.has?.(target) ? target : null;
    return scene?.get?.(target) ?? null;
}
