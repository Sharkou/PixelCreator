export class Database {
    
    /**
     * Initialize the database
     * @constructor
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
    
    connect(username, password) {
        
        return this.send('connect', {
            username,
            password
        });
    }
    
    create(name) {
        
        return this.send('create', {
            name
        });
    }
    
    open(name) {
        
        return this.send('open', {
            name
        });
    }
    
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