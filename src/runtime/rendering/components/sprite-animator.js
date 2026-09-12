// Walking a sprite through a clip (ADR-0062 §4).
//
// A SECOND COMPONENT, NOT TWENTY MORE FIELDS ON `Sprite`. A Sprite answers "what picture,
// how big"; this answers "which frame, and when". They are two questions with two lifetimes
// — a Sprite that never animates is most Sprites, and an animator that changes clip does not
// change what a Sprite IS — so they are two Components, and an Object that wants both says
// so by carrying both. That is the same split `Velocity` and `Transform` already are.
//
// IT WRITES `Sprite.source` AND `Sprite.frame`, AND THAT IS THE WHOLE MECHANISM. The clip
// names its own sheet, so pointing an animator at `Walk.animation` is the complete statement:
// a creator does not also set the Sprite's picture, and the two cannot disagree about which
// sheet is playing. A Sprite with no animator keeps the source it was given and draws the
// whole picture, exactly as before.
//
// THE PLAYHEAD IS SECONDS, NEVER A FRAME INDEX (core/animation.js). The same elapsed time
// gives the same frame at 30 fps and at 144, because the division happens once rather than
// accumulating a rounded index sixty times a second — which is what makes an animation part
// of a deterministic simulation rather than a decoration on top of one.
//
// NOTHING HERE TOUCHES A PICTURE, AND NOTHING HERE MEASURES ONE. The clip is a `ResourceId`
// resolved before the simulation into the Runtime's resource table (ADR-0062 §1), and the
// sheet's layout is declared in the clip rather than derived from the decoded sheet — so a
// frame rectangle is the same rectangle before and after the picture has arrived, and this
// component runs identically on a server that will never decode anything.

import { animationOf, frameAt, frameAtTime } from '../../../core/animation.js';

export class SpriteAnimator {

    static type = 'SpriteAnimator';

    static schema = {
        clip: { type: 'resource', kind: 'animation', default: null },
        playing: { type: 'boolean', default: true },
        // A MULTIPLIER, NOT A SECOND `fps`. The rate belongs to the CLIP — it is a fact about
        // how the frames were drawn — and what an instance says is "faster than that", which
        // is what a sprinting enemy and a slow-motion death both need.
        speed: { type: 'number', default: 1, min: 0 }
    };

    /**
     * Create the component.
     * @param {string} [clip] - ResourceId of the animation
     * @param {boolean} [playing] - Whether the playhead advances
     * @param {number} [speed] - Multiplier on the clip's own frame rate
     */
    constructor(clip = null, playing = true, speed = 1) {
        this.clip = clip;
        this.playing = playing;
        this.speed = speed;

        // RUNTIME STATE, ABSENT FROM THE SCHEMA AND THEREFORE NEVER SERIALIZED — the same
        // arrangement `AudioSource.handle` and `Sprite.frame` have.
        this.elapsed = 0;
        this.frame = 0;
        this.finished = false;
        this.playingClip = null;
    }

    /**
     * Advance the playhead and tell the Sprite what to draw.
     *
     * RECONCILED EVERY STEP, NEVER COMMANDED — the same shape `AudioSource` has (ADR-0060
     * §6). Changing `clip` with `Set Property` rewinds and plays the new one; that is the
     * whole of "Play Animation", and it is why there is one node rather than three.
     *
     * @param {object} self - The owning object
     * @param {object} ctx - The step context
     */
    update(self, ctx) {
        const definition = animationOf(ctx?.resources?.get?.(this.clip) ?? null);
        const sprite = self?.getComponent?.('Sprite') ?? null;

        if (!definition) {
            // NO CLIP, NO FRAME, AND THE SPRITE GOES BACK TO ITS WHOLE PICTURE. A clip that
            // was deleted must not leave a Sprite showing the last rectangle it computed,
            // which would be a corner of a sheet that is no longer there.
            this.playingClip = null;
            this.finished = true;
            if (sprite) sprite.frame = null;
            return;
        }

        if (this.playingClip !== this.clip) {
            this.playingClip = this.clip;
            this.elapsed = 0;
            this.frame = 0;
            this.finished = false;
        }

        // READ FIRST, THEN ADVANCE, AND THE ORDER IS THE WHOLE OF "when does frame 0 show".
        // Advancing first means the very first step already reports frame 1, so the opening
        // frame of every animation is displayed for no time at all — which is the one thing
        // a creator notices immediately on a four-frame walk cycle. The frame shown is the
        // frame for the time the simulation is AT; the clock moves afterwards.
        const at = frameAtTime(definition, this.elapsed);
        this.frame = at.index;
        this.finished = at.finished;

        if (this.playing && !at.finished) {
            this.elapsed += Math.max(0, ctx?.deltaTime ?? 0) * Math.max(0, this.speed);
        }

        if (!sprite) return;

        // THE CLIP NAMES ITS OWN SHEET, so pointing an animator at a clip is the complete
        // statement and the two cannot disagree about which picture is playing.
        sprite.source = definition.source;
        sprite.frame = frameAt(definition, at.index);
    }
}
