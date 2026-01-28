export class Random {
    
    /**
     * Initialize a random seed
     * @constructor
     * @param {string|number} seedString - The seed string or number
     * @returns {Random} random - The random number generator
     */
    constructor(seedString = 'default') {
        if (typeof seedString === 'number') {
            this.seed = seedString >>> 0;
        } else if (typeof seedString === 'string') {
            this.seed = this.hashStringToSeed(seedString);
        } else {
            this.seed = this.hashStringToSeed(String(seedString ?? Date.now()));
        }
        this.state = this.seed;
        this.permutation = this.generatePermutation();
    }

    /**
     * Hash a string to a seed number using FNV-1a algorithm
     * @param {string} str - The seed string
     * @returns {number} hash - The hashed seed value
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
     * Reset the generator to its initial state
     * @returns {Random} this - The random instance for chaining
     */
    reset() {
        this.state = this.seed;
        return this;
    }

    /**
     * Generate the next pseudo-random number using Mulberry32 algorithm
     * @returns {number} random - A random float between 0 (inclusive) and 1 (exclusive)
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

    /**
     * Pick a random element from an array
     * @param {Array} array - The array to pick from
     * @returns {*} element - A random element from the array
     */
    pick(array) {
        if (!array || array.length === 0) return undefined;
        return array[this.int(0, array.length - 1)];
    }

    /**
     * Shuffle an array in place using Fisher-Yates algorithm
     * @param {Array} array - The array to shuffle
     * @returns {Array} array - The shuffled array
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Generate a random number with Gaussian (normal) distribution
     * @param {number} mean - The mean of the distribution
     * @param {number} stdDev - The standard deviation
     * @returns {number} random - A random number from the normal distribution
     */
    gaussian(mean = 0, stdDev = 1) {
        // Box-Muller transform
        const u1 = this.next();
        const u2 = this.next();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return z0 * stdDev + mean;
    }

    /**
     * Generate permutation table for Perlin noise
     * @returns {Uint8Array} permutation - The permutation table
     */
    generatePermutation() {
        const perm = new Uint8Array(512);
        const p = Array.from({ length: 256 }, (_, i) => i);
        
        // Shuffle using current random state
        const savedState = this.state;
        this.state = this.seed;
        this.shuffle(p);
        this.state = savedState;
        
        for (let i = 0; i < 256; i++) {
            perm[i] = perm[i + 256] = p[i];
        }
        return perm;
    }

    /**
     * Fade function for Perlin noise (6t^5 - 15t^4 + 10t^3)
     * @param {number} t - The input value
     * @returns {number} faded - The faded value
     */
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * Linear interpolation
     * @param {number} a - Start value
     * @param {number} b - End value
     * @param {number} t - Interpolation factor
     * @returns {number} result - The interpolated value
     */
    lerp(a, b, t) {
        return a + t * (b - a);
    }

    /**
     * Gradient function for Perlin noise
     * @param {number} hash - The hash value
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate (optional)
     * @param {number} z - Z coordinate (optional)
     * @returns {number} gradient - The gradient value
     */
    grad(hash, x, y = 0, z = 0) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    /**
     * Generate 1D/2D/3D Perlin noise
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate (optional, default 0)
     * @param {number} z - Z coordinate (optional, default 0)
     * @returns {number} noise - Noise value between -1 and 1
     */
    noise(x, y = 0, z = 0) {
        const perm = this.permutation;
        
        // Find unit cube containing point
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        
        // Find relative position in cube
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        
        // Compute fade curves
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        
        // Hash coordinates of cube corners
        const A  = perm[X] + Y;
        const AA = perm[A] + Z;
        const AB = perm[A + 1] + Z;
        const B  = perm[X + 1] + Y;
        const BA = perm[B] + Z;
        const BB = perm[B + 1] + Z;
        
        // Blend results from 8 corners of cube
        return this.lerp(
            this.lerp(
                this.lerp(this.grad(perm[AA], x, y, z), this.grad(perm[BA], x - 1, y, z), u),
                this.lerp(this.grad(perm[AB], x, y - 1, z), this.grad(perm[BB], x - 1, y - 1, z), u),
                v
            ),
            this.lerp(
                this.lerp(this.grad(perm[AA + 1], x, y, z - 1), this.grad(perm[BA + 1], x - 1, y, z - 1), u),
                this.lerp(this.grad(perm[AB + 1], x, y - 1, z - 1), this.grad(perm[BB + 1], x - 1, y - 1, z - 1), u),
                v
            ),
            w
        );
    }

    /**
     * Generate fractal Brownian motion (fBm) noise with multiple octaves
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate (optional)
     * @param {number} z - Z coordinate (optional)
     * @param {number} octaves - Number of octaves (default 4)
     * @param {number} lacunarity - Frequency multiplier per octave (default 2)
     * @param {number} persistence - Amplitude multiplier per octave (default 0.5)
     * @returns {number} noise - Noise value approximately between -1 and 1
     */
    fbm(x, y = 0, z = 0, octaves = 4, lacunarity = 2, persistence = 0.5) {
        
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        return total / maxValue;
    }
}
