import { Time } from '/src/time/time.js';

export class Tween {

    #startValues = {};
    #onComplete = null;
    #chain = null;

    static #tweens = [];

    /**
     * Create a tween animation between values
     * @constructor
     * @param {Object} target - The object to animate
     * @param {Object} properties - Target property values (e.g., { x: 100, y: 200 })
     * @param {number} duration - Duration in milliseconds
     * @param {string} easing - Easing function name
     */
    constructor(target, properties, duration = 500, easing = 'easeInOutQuad') {

        this.target = target;
        this.properties = properties;
        this.duration = duration;
        this.easing = easing;

        this.elapsed = 0;
        this.active = false;
        this.finished = false;
    }

    /**
     * Start the tween
     * @returns {Tween} this
     */
    start() {
        for (let prop in this.properties) {
            this.#startValues[prop] = this.target[prop];
        }
        this.elapsed = 0;
        this.active = true;
        this.finished = false;
        Tween.#tweens.push(this);
        return this;
    }

    /**
     * Set a callback for when the tween completes
     * @param {Function} fn - The callback
     * @returns {Tween} this
     */
    onComplete(fn) {
        this.#onComplete = fn;
        return this;
    }

    /**
     * Chain another tween to play after this one
     * @param {Tween} tween - The tween to chain
     * @returns {Tween} this
     */
    chain(tween) {
        this.#chain = tween;
        return this;
    }

    /**
     * Stop the tween
     */
    stop() {
        this.active = false;
        const idx = Tween.#tweens.indexOf(this);
        if (idx !== -1) Tween.#tweens.splice(idx, 1);
    }

    /**
     * Update all active tweens (call once per frame)
     * @static
     */
    static update() {
        for (let i = Tween.#tweens.length - 1; i >= 0; i--) {
            const tween = Tween.#tweens[i];
            if (!tween.active) continue;

            tween.elapsed += Time.deltaTime * (1000 / 60);
            let t = Math.min(tween.elapsed / tween.duration, 1);
            let easedT = Tween.ease(tween.easing, t);

            for (let prop in tween.properties) {
                const start = tween.#startValues[prop];
                const end = tween.properties[prop];
                tween.target[prop] = start + (end - start) * easedT;
            }

            if (t >= 1) {
                tween.active = false;
                tween.finished = true;
                Tween.#tweens.splice(i, 1);
                if (tween.#onComplete) tween.#onComplete();
                if (tween.#chain) tween.#chain.start();
            }
        }
    }

    /**
     * Easing functions
     * @static
     * @param {string} name - Easing function name
     * @param {number} t - Progress from 0 to 1
     * @returns {number} Eased value
     */
    static ease(name, t) {
        switch (name) {
            case 'linear':
                return t;
            case 'easeInQuad':
                return t * t;
            case 'easeOutQuad':
                return t * (2 - t);
            case 'easeInOutQuad':
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            case 'easeInCubic':
                return t * t * t;
            case 'easeOutCubic':
                return (--t) * t * t + 1;
            case 'easeInOutCubic':
                return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
            case 'easeInElastic':
                return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI) / 3);
            case 'easeOutElastic':
                return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
            case 'easeOutBounce':
                if (t < 1 / 2.75) return 7.5625 * t * t;
                if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
                if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
                return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
            default:
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        }
    }

    /**
     * Helper: tween an object's properties
     * @static
     * @param {Object} target - The object
     * @param {Object} props - Target values
     * @param {number} duration - Duration in ms
     * @param {string} easing - Easing name
     * @returns {Tween} The started tween
     */
    static to(target, props, duration = 500, easing = 'easeInOutQuad') {
        return new Tween(target, props, duration, easing).start();
    }
}
