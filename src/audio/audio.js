export class Audio {

    static ctx = null;
    static #volume = 1;
    static #masterGain = null;

    /**
     * Initialize the audio system (must be called after user interaction)
     * @static
     */
    static init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.#masterGain = this.ctx.createGain();
        this.#masterGain.connect(this.ctx.destination);
    }

    /**
     * Resume the audio context (needed after browser autoplay policy)
     * @static
     */
    static resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Get master volume
     * @static
     * @returns {number} Volume from 0 to 1
     */
    static get volume() {
        return this.#volume;
    }

    /**
     * Set master volume
     * @static
     * @param {number} value - Volume from 0 to 1
     */
    static set volume(value) {
        this.#volume = Math.max(0, Math.min(1, value));
        if (this.#masterGain) {
            this.#masterGain.gain.value = this.#volume;
        }
    }

    /**
     * Load an audio file and return a decoded AudioBuffer
     * @static
     * @param {string} url - The audio file URL
     * @returns {Promise<AudioBuffer>} The decoded audio buffer
     */
    static async load(url) {
        this.init();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return this.ctx.decodeAudioData(arrayBuffer);
    }

    /**
     * Get the master output node (for connecting sources)
     * @static
     * @returns {GainNode} The master gain node
     */
    static get output() {
        this.init();
        return this.#masterGain;
    }
}
