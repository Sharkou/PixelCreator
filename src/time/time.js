export class Time {

    // Delta time in milliseconds
    static deltaTime = 0;
    static current = 0;
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
     * @return {DOMHighResTimeStamp} current - the time in milliseconds
     */
    static now() {
        Time.current = performance.now();
        return Time.current;
    }
}