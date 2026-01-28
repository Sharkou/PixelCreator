export class Random {
    
    /**
     * Initialize a random seed
     * @constructor
     * @param {string} seedString - The seed string
     * @returns {Random} random - The random number generator
     */
    constructor(seedString) {
        this.seed = this.hashStringToSeed(seedString);
        this.state = this.seed;
    }

    /**
     * Hash a string to a seed number
     * @param {string} str - The seed string
     * @returns {number} data - The data
     */
    hashStringToSeed(str) {
        let hash = 2166136261; // FNV-1a 32-bit
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0; // force uint32
    }

    /**
     * Create a pseudo-random number generator (PRNG) using Mulberry32 algorithm
     * @param {number} seed - The seed number
     * @returns {number} rng - The PRNG object
     */
    next() {
        this.state += 0x6D2B79F5;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Get a random integer between min and max (inclusive)
     * @param {number} min - The minimum value
     * @param {number} max - The maximum value
     * @returns {number} randomInt - The generated random integer
     */
    int(min = 0, max = 100) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * Get a random float between min and max
     * @param {number} min - The minimum value
     * @param {number} max - The maximum value
     * @returns {number} randomFloat - The generated random float
     */
    float(min = 0, max = 1) {
        return this.next() * (max - min) + min;
    }

    /**
     * Determine if an event occurs based on probability
     * @param {number} probability - The probability (0 to 1)
     * @returns {boolean} result - True if the event occurs, false otherwise
     */
    chance(probability = 0.5) {
        return this.next() < probability;
    }
}