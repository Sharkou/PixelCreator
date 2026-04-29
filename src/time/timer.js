import { Time } from '/src/time/time.js';

export class Timer {

    /**
     * Create a timer with pause/resume support
     * @constructor
     * @param {number} duration - Duration in milliseconds
     * @param {Function} callback - Called when the timer completes
     * @param {boolean} repeat - Whether the timer loops
     */
    constructor(duration = 1000, callback = null, repeat = false) {

        this.duration = duration;
        this.callback = callback;
        this.repeat = repeat;

        this.elapsed = 0;
        this.active = false;
        this.paused = false;
        this.finished = false;
    }

    /**
     * Start (or restart) the timer
     * @returns {Timer} this
     */
    start() {
        this.elapsed = 0;
        this.active = true;
        this.paused = false;
        this.finished = false;
        return this;
    }

    /**
     * Pause the timer
     */
    pause() {
        if (this.active) this.paused = true;
    }

    /**
     * Resume the timer after pause
     */
    resume() {
        if (this.active) this.paused = false;
    }

    /**
     * Stop the timer completely
     */
    stop() {
        this.active = false;
        this.paused = false;
    }

    /**
     * Reset the timer without starting it
     */
    reset() {
        this.elapsed = 0;
        this.finished = false;
    }

    /**
     * Get progress from 0 to 1
     * @returns {number} Progress ratio
     */
    get progress() {
        return Math.min(this.elapsed / this.duration, 1);
    }

    /**
     * Get remaining time in milliseconds
     * @returns {number} Remaining time
     */
    get remaining() {
        return Math.max(this.duration - this.elapsed, 0);
    }

    /**
     * Update the timer each frame (called as component)
     * @update
     */
    update() {

        if (!this.active || this.paused) return;

        this.elapsed += Time.deltaTime * (1000 / 60);

        if (this.elapsed >= this.duration) {
            this.finished = true;

            if (this.callback) {
                this.callback();
            }

            if (this.repeat) {
                this.elapsed -= this.duration;
                this.finished = false;
            } else {
                this.active = false;
            }
        }
    }

    /**
     * Create a one-shot timer
     * @static
     * @param {number} duration - Duration in milliseconds
     * @param {Function} callback - Called when complete
     * @returns {Timer} The started timer
     */
    static after(duration, callback) {
        return new Timer(duration, callback, false).start();
    }

    /**
     * Create a repeating timer
     * @static
     * @param {number} interval - Interval in milliseconds
     * @param {Function} callback - Called each interval
     * @returns {Timer} The started timer
     */
    static every(interval, callback) {
        return new Timer(interval, callback, true).start();
    }
}