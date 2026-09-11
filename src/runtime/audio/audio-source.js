// A sound an Object keeps going: music, an engine, a wind loop.
//
// TWO SHAPES OF SOUND, AND THIS IS THE ONE THAT LASTS (ADR-0060 §6). A gunshot is a MOMENT
// — it has no state, nothing can change about it once it has started, and the node that
// fires it is `Play Sound`. A soundtrack is a STATE: it is on or off, it has a volume that
// a fade changes, and it survives for as long as the Object does. A state belongs in a
// Component, where the Inspector can show it, the format can save it and `Set Property` can
// write it; a moment does not.
//
// WHICH IS WHY THERE IS NO `Play` NODE FOR IT, AND THAT IS THE WHOLE DESIGN. `playing` is an
// ordinary boolean property, so starting the music is `Set Property AudioSource.playing =
// true` and stopping it is the same node with `false` — the primitives a creator already
// knows, with nothing new to learn and nothing new to keep in step. A `Play Sound` and a
// `Stop Sound` aimed at a Component would be a second way to write a value that
// `Set Property` already writes, and the two would disagree the first time one of them was
// used while the other was suspended in a `Delay`.
//
// AND A FADE IS A `Tween` ON `volume`, for the same reason: the mixer nobody has designed
// is not needed to make music get quieter, because the Property System already animates
// numbers and the output already accepts a new volume on a sounding sound.
//
// ONE AudioSource PER OBJECT, BECAUSE A COMPONENT TYPE IS A KEY. An Object holds at most
// one Component of a type (ADR-0004), so an Object that needs three different sounds does
// NOT get three AudioSources — it fires them with `Play Sound`, which is what that node is
// for. The split is not a taste, it falls out of the model.
//
// NOTHING HERE TOUCHES A BROWSER. The clip is a ResourceId and the output arrives on the
// step context (ADR-0014), so this component runs on a server, where `ctx.audio` is absent
// and it does nothing at all.

import { volumeOf } from './audio.js';

export class AudioSource {

    static type = 'AudioSource';

    static schema = {
        // NARROWED THE WAY `Sprite.source` IS. `kind` and `mime` are what ADR-0007 gives a
        // reference for saying what it takes, so the Editor's picker offers audio and the
        // drop rule refuses a scene from this one declaration.
        clip: { type: 'resource', kind: 'asset', mime: 'audio/', default: null },
        volume: { type: 'number', default: 1, min: 0, max: 1 },
        // A SUSTAINED SOUND USUALLY REPEATS, so this is the default a creator would have
        // set by hand. A clip that should play once and stop is a one-shot, and `Play
        // Sound` is the node for it.
        loop: { type: 'boolean', default: true },
        // THE STATE, AND THE CONTROL. Off on a fresh Component, because adding a Component
        // must never make a noise nobody asked for; the drop rule that creates one from a
        // dragged sound turns it on, because THAT gesture asked.
        playing: { type: 'boolean', default: false }
    };

    /**
     * Create the component.
     * @param {string} [clip] - Resource identifier of the sound
     * @param {number} [volume] - From 0 to 1
     * @param {boolean} [loop] - Whether it repeats
     * @param {boolean} [playing] - Whether it should be sounding
     */
    constructor(clip = null, volume = 1, loop = true, playing = false) {
        this.clip = clip;
        this.volume = volume;
        this.loop = loop;
        this.playing = playing;

        // RUNTIME STATE, NOT PROJECT DATA — absent from the schema, so it is never
        // serialized, exactly as `Sprite.image` is. A handle belongs to the output that
        // minted it and means nothing in a saved scene.
        this.handle = null;
        this.sounding = null;
        // THE OUTPUT THIS SOUND CAME OUT OF, remembered so that letting go of it does not
        // need a step context. `onDetach` is the Core's and receives none.
        this.output = null;
    }

    /**
     * Make what is sounding agree with what is asked for.
     *
     * RECONCILED EVERY STEP, NEVER COMMANDED. The component reads its own values and drives
     * the output from them, which is what makes `Set Property` the only control it needs —
     * and what makes the state after a load, after an undo and after a network operation the
     * same state, because all three end in the same values.
     *
     * A CLIP OR A LOOP THAT CHANGES RESTARTS THE SOUND; a volume that changes does not. That
     * is the difference between what a sound IS and how loud it is: swapping the track means
     * a different track, turning it down means the same one, quieter.
     *
     * @param {object} self - The owning object
     * @param {object} ctx - The step context
     */
    update(self, ctx) {
        const audio = ctx?.audio ?? null;
        if (!audio) return;
        this.output = audio;

        const wanted = Boolean(this.playing) && Boolean(this.clip);
        const volume = volumeOf(this.volume);

        if (!wanted) {
            if (this.handle) audio.stop(this.handle);
            this.handle = null;
            this.sounding = null;
            return;
        }

        const loop = Boolean(this.loop);
        if (!this.sounding || this.sounding.clip !== this.clip || this.sounding.loop !== loop) {
            if (this.handle) audio.stop(this.handle);
            this.handle = audio.play(this.clip, { volume, loop });
            this.sounding = { clip: this.clip, loop, volume };
            return;
        }

        if (this.sounding.volume !== volume) {
            audio.set(this.handle, { volume });
            this.sounding.volume = volume;
        }
    }

    /**
     * This Component has been taken off its Object.
     *
     * The reconciler stops running, so whatever it last asked for would sound for ever.
     * There is no context here — `onDetach` is the Core's hook (core/object.js) — which is
     * why the output is remembered in `update()`.
     *
     * @param {object} self - The Object it was on
     */
    onDetach(self) {
        silence(this, this.output);
    }

    /**
     * The Object has left the Scene: a `Destroy`, or a scene being emptied.
     *
     * A DIFFERENT EVENT FROM `onDetach`, and the one a game actually raises (ADR-0060 §6).
     * Destroying an Object removes nothing from it, so `onDetach` never fires — and a
     * destroyed enemy that goes on humming is the bug this closes.
     *
     * @param {object} self - The Object that left
     * @param {object} ctx - `{ scene, runtime, audio, time }`
     */
    onRemoved(self, ctx) {
        silence(this, ctx?.audio ?? this.output);
    }
}

/**
 * Stop what a source was playing, and forget it.
 * @param {object} source - The AudioSource
 * @param {object|null} audio - The output that minted the handle
 */
function silence(source, audio) {
    if (source.handle && audio) audio.stop(source.handle);
    source.handle = null;
    source.sounding = null;
}
