// A picture, centred on the object's origin.
//
// IT HOLDS AN IDENTITY AND NOTHING ELSE (ADR-0062 §2). `source` is a `ResourceId`; the
// backend resolves it and owns whatever its pixels are made of. There is no `image` field
// any more — it held `null` for the life of this component because nothing in the repository
// ever filled it, and it could never have been serialized if anything had.
//
// SIZE HAS ONE SOURCE OF TRUTH, AND ZERO MEANS "the picture's own" (ADR-0062 §3). A Sprite
// added from the menu and pointed at a 64 × 48 image draws at 64 × 48 without a creator
// typing two numbers they did not choose — and typing them is still how a picture is
// stretched. One number given and the other left at zero keeps the aspect ratio, which is
// the common case for "make this twice as wide as it is tall" being NOT what was meant.
//
// A FRAME IS A RECTANGLE OF THE SOURCE, not a second component and not a second format
// (ADR-0062 §4): `SpriteAnimator` writes `frame` here and this draws it. A Sprite with no
// animator has no frame and draws the whole picture, which is what it always did.
//
// THERE IS NO `flipX`. Facing the other way is `Transform.rotationY = 180°`: ADR-0050
// removed the boolean on purpose, because under an orthographic projection a rotation about
// the vertical axis IS a horizontal scale by `cos θ` — the matrix does it exactly, and it
// can say `45` where a boolean can only say "back".

export class Sprite {

    static type = 'Sprite';

    static schema = {
        // NARROWED, BECAUSE IT CAN BE. `kind` and `mime` are the two words ADR-0007 gives
        // a reference for saying what it takes; the Editor's picker offers exactly that
        // set and the drop rule refuses exactly the rest, from this one declaration. A
        // Sprite pointed at a scene is not a state worth being able to reach.
        source: { type: 'resource', kind: 'asset', mime: 'image/', default: null },
        // ZERO IS NOT "invisible", IT IS "the picture's own size" (ADR-0062 §3). It used to
        // mean the first, which made every Sprite added by hand draw nothing at all and made
        // the drop rule invent a 64 × 64 that was true of no picture.
        width: { type: 'number', default: 0, min: 0, placeholder: 'Image' },
        height: { type: 'number', default: 0, min: 0, placeholder: 'Image' },
        alpha: { type: 'number', default: 1, min: 0, max: 1 }
    };

    /**
     * Create the component.
     * @param {string} [source] - Resource identifier of the image
     * @param {number} [width] - Destination width; 0 takes the picture's own
     * @param {number} [height] - Destination height; 0 takes the picture's own
     * @param {number} [alpha] - Opacity from 0 to 1
     */
    constructor(source = null, width = 0, height = 0, alpha = 1) {
        this.source = source;
        this.width = width;
        this.height = height;
        this.alpha = alpha;

        // RUNTIME STATE, ABSENT FROM THE SCHEMA AND THEREFORE NEVER SERIALIZED — the same
        // arrangement `AudioSource.handle` has. `frame` is what an animator writes; `drawn`
        // is the size the last frame actually used, so `bounds()` can answer without a
        // renderer to ask.
        this.frame = null;
        this.drawn = null;
    }

    /**
     * Draw the picture.
     * @param {object} self - The owning object
     * @param {object} renderer - The renderer backend
     */
    draw(self, renderer) {
        if (!this.source) return;

        const box = spriteSize(this, renderer);
        if (!box) return;

        // REMEMBERED FOR `bounds()`, which has no renderer to ask. A picture that has never
        // been drawn reports nothing, and Editor picking falls back to the handle square it
        // already gives an Object with no geometry.
        this.drawn = box;

        renderer.drawImage(
            this.source,
            -box.width / 2,
            -box.height / 2,
            box.width,
            box.height,
            { alpha: this.alpha, clip: this.frame ?? null }
        );
    }

    /**
     * The area this component covers, in the object's local space.
     * @param {object} self - The owning object
     * @returns {{x: number, y: number, width: number, height: number}|null} The local bounds
     */
    bounds(self) {
        const width = this.width > 0 ? this.width : this.drawn?.width ?? 0;
        const height = this.height > 0 ? this.height : this.drawn?.height ?? 0;
        if (width <= 0 || height <= 0) return null;

        return { x: -width / 2, y: -height / 2, width, height };
    }
}

/**
 * How big to draw: what the creator declared, what the frame is, or what the picture is.
 *
 * FOUR ANSWERS, IN THIS ORDER:
 *
 *   both declared      exactly that — a picture stretched on purpose
 *   one declared       that, and the other in proportion to what is actually being drawn
 *   neither            the frame's size, or the whole picture's
 *   not decoded yet    null: this frame draws nothing and the next one draws it
 *
 * THE PROPORTION IS TAKEN FROM THE FRAME, NOT FROM THE SHEET. A 320 × 32 strip of ten
 * 32 × 32 frames is ten squares, and scaling one of them by the strip's aspect ratio would
 * make a square character ten times too wide.
 *
 * @param {object} sprite - The component
 * @param {object} renderer - The renderer backend
 * @returns {{width: number, height: number}|null} The destination size
 */
function spriteSize(sprite, renderer) {
    if (sprite.width > 0 && sprite.height > 0) return { width: sprite.width, height: sprite.height };

    const frame = sprite.frame;
    const natural = frame && frame.width > 0 && frame.height > 0
        ? { width: frame.width, height: frame.height }
        : renderer.imageSize?.(sprite.source) ?? null;
    if (!natural) return null;

    if (sprite.width > 0) return { width: sprite.width, height: sprite.width * (natural.height / natural.width) };
    if (sprite.height > 0) return { width: sprite.height * (natural.width / natural.height), height: sprite.height };

    return natural;
}
