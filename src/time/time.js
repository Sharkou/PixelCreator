/**
 * Time management utility
 * Provides delta time and timing functions for game loop
 */
export class Time {

    /** @type {number} Time elapsed since last frame in seconds */
    static deltaTime = 0;
    
    /** @type {number} Current timestamp in milliseconds */
    static current = 0;
    
    /** @type {number} Previous frame timestamp in milliseconds */
    static last = 0;
    
    /**
     * Initialize the timer
     * @constructor
     */
    /*constructor() {        
        this.deltaTime = 0;
        this.current = 0;
        this.last = 0;
    }*/
    
    /**
     * Get the time in milliseconds
     * @static
     * @returns {DOMHighResTimeStamp} current - the time in milliseconds
     */
    static now() {
        Time.current = performance.now();
        return Time.current;
    }
}