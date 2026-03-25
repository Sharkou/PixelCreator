import { Audio } from '/src/audio/audio.js';

export class Sound {

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

        this._source = null;
        this._gainNode = null;
        this._startTime = 0;
        this._pauseOffset = 0;

        // Load if URL
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

        this._source = Audio.ctx.createBufferSource();
        this._source.buffer = this.buffer;
        this._source.loop = this.loop;
        this._source.playbackRate.value = this.playbackRate;

        this._gainNode = Audio.ctx.createGain();
        this._gainNode.gain.value = this.volume;

        this._source.connect(this._gainNode);
        this._gainNode.connect(Audio.output);

        this._source.start(0, this._pauseOffset);
        this._startTime = Audio.ctx.currentTime - this._pauseOffset;
        this._pauseOffset = 0;
        this.playing = true;

        this._source.onended = () => {
            if (!this.loop) this.playing = false;
        };

        return this;
    }

    /**
     * Pause the sound
     */
    pause() {
        if (!this.playing || !this._source) return;
        this._pauseOffset = Audio.ctx.currentTime - this._startTime;
        this._source.stop();
        this.playing = false;
    }

    /**
     * Stop the sound and reset to beginning
     */
    stop() {
        if (this._source) {
            this._source.onended = null;
            try { this._source.stop(); } catch (e) { /* already stopped */ }
            this._source = null;
        }
        this._pauseOffset = 0;
        this.playing = false;
    }

    /**
     * Set volume with optional fade duration
     * @param {number} value - Volume from 0 to 1
     * @param {number} duration - Fade duration in seconds (0 = instant)
     */
    setVolume(value, duration = 0) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this._gainNode) {
            if (duration > 0) {
                this._gainNode.gain.linearRampToValueAtTime(this.volume, Audio.ctx.currentTime + duration);
            } else {
                this._gainNode.gain.value = this.volume;
            }
        }
    }

    /**
     * Get the current playback position in seconds
     * @returns {number} Current time in seconds
     */
    get currentTime() {
        if (!this.playing || !Audio.ctx) return this._pauseOffset;
        return Audio.ctx.currentTime - this._startTime;
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
