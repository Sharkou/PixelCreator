export class Time {
    
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

// Delta time in milliseconds
Time.deltaTime = 0;
Time.current = 0;
Time.last = 0;