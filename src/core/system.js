export class System {

    static events = {}; // events list
    
    /**
     * Create unique ID
     * Math.random should be unique because of its seeding algorithm.
     * Convert it to base 36 (numbers + letters), and grab the first 9 characters after the decimal.
     */
    static createID() {
        return /*'_' + */Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * Generate random number between a and b
     * @static
     * @param {number} a - The first number
     * @param {number} b - The second number
     */
    static random(a, b) {
        return Math.floor((Math.random() * b) + a);
    }
    
    /**
     * Synchronize a component
     * @static
     * @param {Object} object - The component to sync
     */
    static sync(object) {
        
        // Synchronize each properties of component
        for (let prop in object) {
            
            if (prop != 'self') {
                
                let value = object[prop]; // save value
                
                // Getter
                Object.defineProperty(object, prop, {
                    
                    get: function() {
                        
                        return this['_' + prop]; // get value
                    },
                    
                    configurable: true
                });
                
                // Setter
                Object.defineProperty(object, prop, {
                    
                    set: function(value) {
                        
                        this['_' + prop] = value; // set value
                        
                        // Dispatch event
                        System.dispatchEvent('setProperty', {
                            object,
                            prop,
                            value
                        });
                    },
                    
                    configurable: true
                    
                });
                
                object[prop] = value; // restore value
            }
        }
    }

    // Validate input text
    static validate(e, event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            e.blur();
        }
    }
    
    /**
     * Dispatch event
     * @static
     * @param {string} e - The event name
     * @param {object} data - The data
     */
    static dispatchEvent(e, data = null) {
        
        if (this.events[e] !== undefined) {
            
            for (let event of this.events[e]) {
                event(data);
            }
        }
    }
    
    /**
     * Listen event
     * @static
     * @param {string} e - The event name
     * @param {function} fn - The callback function
     */
    static addEventListener(e, fn) {
        
        // Create the event if undefined
        if (this.events[e] === undefined) {
            this.events[e] = [];
        }
        
        this.events[e].push(fn); // push the function
    }
    
    static include(url) {
        let script = document.createElement('script'); // create a script DOM node
        script.src = url; // set its src to the provided URL
        script.async = false;
        script.type = 'module';
        document.head.appendChild(script); // add it to the end of the head section of the page (could change 'head' to 'body' to add it to the end of the body section instead)
    }
    
    static stringify(o) {
        return JSON.stringify(o, function(key, val) {
            return (typeof val === 'function') ? '' + val : val;
        });
    }

    static parse(o) {
        return JSON.parse(o, function(key, val) {
            return (typeof val === 'string') ? ((val.substr(0, 8) === 'function') ? new Function('return ' + val)() : val) : val;
        });
    }
}

// Disable right mouse click
document.addEventListener('contextmenu', event => event.preventDefault());