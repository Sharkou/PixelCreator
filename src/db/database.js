export class Database {
    
    /**
     * Create a new WebSocket database connection
     * @param {string} addr - Server address
     * @param {number} port - Server port
     * @param {Function} onconnect - Callback when connected
     */
    constructor(addr, port, onconnect) {
        this.addr = addr;
        this.port = port;
        this.id = 0;
        this.callbacks = {};
		this.ws = new WebSocket("ws://" + addr + ":" + port);

		this.ws.onopen = e => onconnect(e);
        
        // TODO: Faire event onmessage constant
        // TODO: Setter infini avec le bind
	}
    
    /**
     * Send a command to the database
     * @param {string} name - Command name
     * @param {Object} args - Command arguments
     * @returns {Promise<*>} Response data
     */
    send(name, args) {
        
        this.ws.send(JSON.stringify({
            'c': name,
            'id' : ++this.id,
            'a': args
        }));
        
        return new Promise((resolve, reject) => {
            
            console.log('Commande envoyée: ' + name);
            
            const id = this.id;
            
            // console.log('path: ' + args.keyPath);
            
            this.ws.addEventListener('message', e => {

                let data = JSON.parse(e.data);

                // console.log(data);

                if (data.s) {

                    if (data.id === id) {

                        // Synchronize
                        if (this.callbacks[id]) {

                            this.callbacks[id](data.r);

                        } else {

                            resolve(data.r);
                        }
                    }

                } else {

                    reject(data.r);
                }
            });
        });
    }
    
    /**
     * Authenticate with the database
     * @param {string} username - Username
     * @param {string} password - Password
     * @returns {Promise<*>} Authentication result
     */
    connect(username, password) {
        
        return this.send('connect', {
            username,
            password
        });
    }
    
    /**
     * Create a new database
     * @param {string} name - Database name
     * @returns {Promise<*>} Creation result
     */
    create(name) {
        
        return this.send('create', {
            name
        });
    }
    
    /**
     * Open an existing database
     * @param {string} name - Database name
     * @returns {Promise<*>} Open result
     */
    open(name) {
        
        return this.send('open', {
            name
        });
    }
    
    /**
     * Get data from a key path
     * @param {string} keyPath - Path to data (e.g., 'users/123')
     * @param {boolean} link - Whether to follow links
     * @returns {Promise<*>} Retrieved data
     */
    get(keyPath, link = false) {
        
        keyPath = keyPath.split('/');
        
        return this.send('get', {
            keyPath,
            link
        });
    }
    
    set(keyPath, value) {
        
        keyPath = keyPath.split('/');
        
        return this.send('set', {
            keyPath,
            value
        });
    }
    
    sync(keyPath) {
        
        return {
            then: async fn => {
                this.callbacks[this.id + 1] = fn;
                return await this.get(keyPath, true);
            }
        };
    }
    
    bind(obj, prop, keyPath) {
        
        Object.defineProperty(obj, prop, {
            get: () => {
                return this.get(keyPath);
            }
        });
        
        Object.defineProperty(obj, prop, {
            set: (value) => {
                return db.set(keyPath, value);
            }
        });
        
        // Set current value to database
        // db.set(keyPath, obj[prop]);
    }
    
    unlink(links) {
        
        return this.send('unlink', {
            links
        });
    }
}