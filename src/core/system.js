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
     * @param {Object} object - The object to sync
     * @param {Object} component - The component to sync
     */
    static sync(object, component = null) {

        const obj = component ?? object;
        
        // Synchronize each properties of component
        for (let prop in obj) {
            
            if (prop != 'self') { // && (!component && prop == 'x') && (!component && prop == 'y')) {
                
                let value = obj[prop]; // save value
                
                // Getter
                Object.defineProperty(obj, prop, {
                    
                    // Getter
                    get: function() {                        
                        // return value;
                        return this['_' + prop]; // get value
                    },
                    
                    // Setter
                    set: function(value) {
                        
                        // value = x;
                        this['_' + prop] = value; // set value
                        
                        // Dispatch event
                        System.dispatchEvent('setProperty', {
                            object,
                            component,
                            prop,
                            value
                        });
                    },
                    
                    configurable: true
                });

                // Set property on server
                Object.defineProperty(obj, '$' + prop, {
                    
                    set: function(value) {
                        
                        this[prop] = value; // set value
                        
                        // Dispatch event
                        System.dispatchEvent('syncProperty', {
                            object,
                            component,
                            prop,
                            value
                        });
                    },
                    
                    configurable: true
                    
                });
                
                obj[prop] = value; // restore value
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
     * @param {array} args - The function arguments
     */
    static addEventListener(e, fn, ...args) {
        
        // Create the event if undefined
        if (this.events[e] === undefined) {
            this.events[e] = [];
        }
        
        this.events[e].push(fn); // push the function
    }

    /**
     * Set interval with number of repetitions
     * @static
     * @param {function} callback - The callback function
     * @param {number} delay - The delay
     * @param {number} repetitions - The number of repetitions
     */
    static setIntervalX(callback, delay, repetitions) {
        let x = 0;
        let intervalID = window.setInterval(function () {
    
           callback();
    
           if (++x === repetitions) {
               window.clearInterval(intervalID);
           }
        }, delay);
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

    static getDate() {
        const today = new Date();
        const year = today.getFullYear().toString();
        const month = ('0' + (today.getMonth() + 1).toString()).slice(-2);
        const day = ('0' + today.getDate().toString()).slice(-2);
        const hours = ('0' + today.getHours().toString()).slice(-2);
        const minutes = ('0' + today.getMinutes().toString()).slice(-2);
        const seconds = ('0' + today.getSeconds().toString()).slice(-2);
        const milliseconds = ('00' + today.getMilliseconds().toString()).slice(-3);
        return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}]`
    }

    static log(string) {
        console.log(`%c${string}`, 'color: #3b78ff');
    }
    
    static debug(string) {
        console.log(`%c[SERVER] ${string}`, 'color: #11AB0D');
    }
    
    static warn(string) {
        console.log(`%cwarn: ${string}`, 'color: #F9F1A5');
    }
}

// Disable right mouse click
if (window.document) {
    document.addEventListener('contextmenu', e => e.preventDefault());
}