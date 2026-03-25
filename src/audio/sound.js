import { Audio } from '/src/audio/audio.js';

export class Sound {

    #source = null;
    #gainNode = null;
    #startTime = 0;
    #pauseOffset = 0;

    /**
     * Create a sound instance from a URL or AudioBuffer
     * @constructor
     * @param {string|AudioBuffer} source - URL or pre-loaded AudioBuffer
     * @param {Object} options - Sound options
     * @param {number} options.volume - Volume from 0 to 1
     * @param {boolean} options.loop - Whether to loop
     * @param {number} options.playbackRate - Playback speed (1 = normal)
     */
    constructor(source, { volume = 1, loop = false, playbackRate = 1 } = {}) {

        this.buffer = null;
        this.volume = volume;
        this.loop = loop;
        this.playbackRate = playbackRate;
        this.playing = false;

        if (typeof source === 'string') {
            Audio.load(source).then(buf => { this.buffer = buf; });
        } else {
            this.buffer = source;
        }
    }

    /**
     * Play the sound from the beginning or resume from pause
     * @returns {Sound} this
     */
    play() {
        if (!this.buffer || !Audio.ctx) return this;
        Audio.resume();

        this.stop();

        this.#source = Audio.ctx.createBufferSource();
        this.#source.buffer = this.buffer;
        this.#source.loop = this.loop;
        this.#source.playbackRate.value = this.playbackRate;

        this.#gainNode = Audio.ctx.createGain();
        this.#gainNode.gain.value = this.volume;

        this.#source.connect(this.#gainNode);
        this.#gainNode.connect(Audio.output);

        this.#source.start(0, this.#pauseOffset);
        this.#startTime = Audio.ctx.currentTime - this.#pauseOffset;
        this.#pauseOffset = 0;
        this.playing = true;

        this.#source.onended = () => {
            if (!this.loop) this.playing = false;
        };

        return this;
    }

    /**
     * Pause the sound
     */
    pause() {
        if (!this.playing || !this.#source) return;
        this.#pauseOffset = Audio.ctx.currentTime - this.#startTime;
        this.#source.stop();
        this.playing = false;
    }

    /**
     * Stop the sound and reset to beginning
     */
    stop() {
        if (this.#source) {
            this.#source.onended = null;
            try { this.#source.stop(); } catch (e) { /* already stopped */ }
            this.#source = null;
        }
        this.#pauseOffset = 0;
        this.playing = false;
    }

    /**
     * Set volume with optional fade duration
     * @param {number} value - Volume from 0 to 1
     * @param {number} duration - Fade duration in seconds (0 = instant)
     */
    setVolume(value, duration = 0) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.#gainNode) {
            if (duration > 0) {
                this.#gainNode.gain.linearRampToValueAtTime(this.volume, Audio.ctx.currentTime + duration);
            } else {
                this.#gainNode.gain.value = this.volume;
            }
        }
    }

    /**
     * Get the current playback position in seconds
     * @returns {number} Current time in seconds
     */
    get currentTime() {
        if (!this.playing || !Audio.ctx) return this.#pauseOffset;
        return Audio.ctx.currentTime - this.#startTime;
    }

    /**
     * Get the total duration of the sound in seconds
     * @returns {number} Duration in seconds
     */
    get duration() {
        return this.buffer ? this.buffer.duration : 0;
    }

    /**
     * Clone this sound (shares the same buffer)
     * @returns {Sound} A new Sound instance
     */
    clone() {
        return new Sound(this.buffer, {
            volume: this.volume,
            loop: this.loop,
            playbackRate: this.playbackRate
        });
    }
}
