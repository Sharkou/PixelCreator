import * as Peer from '/src/lib/simplepeer.js';

export class Socket {
    
    /**
     * Initialize the socket
     * @constructor
     */
    constructor() {
        
        this.id = null;
        this.host = null;
        this.peer = null;
        this.initiator = false;
        this.events = {
            connect: [],
            disconnect: []
        };
        this.connected = false;
    }
    
    async init(initiator = false, trickle = false) {
        
        this.peer = new SimplePeer({
            initiator: initiator,
            trickle: trickle
        });

        // Signal
        if (initiator) {
            this.initiator = true;
            await this.signal();
        }

        // Connection
        this.peer.on('connect', () => {
            for (let event of this.events['connect']) {                    
                event();
            }
        });

        // Disconnection
        this.peer.on('close', () => {
            for (let event of this.events['disconnect']) {                    
                event();
            }
        });

        // Receive data
        this.peer.on('data', (data) => {

            data = JSON.parse(data);

            if (this.events[data.type] !== undefined) {

                for (let event of this.events[data.type]) {

                    event(data.value); // dispatch event
                }
            }
        });

        // Error
        this.peer.on('error', (err) => {
            console.error(err);
        });
    }
    
    signal() {
        
        return new Promise(resolve => {
            this.peer.on('signal', (data) => {
                this.id = JSON.stringify(data);
                console.log(this.id);
                resolve(this.id)
            });
        });
    }
    
    async connect(id, host = false) {
            
        this.host = JSON.parse(id);
        this.peer.signal(this.host); // send signal to host
        
        if (!host) {
            await this.signal(); // wait for signal
        }
    }
    
    send(type, value) {
        
        let data = {
            type: type,
            value: value
        };
        
        this.peer.send(JSON.stringify(data));
    }
    
    /**
     * Listen event
     * @param {string} e - The event type
     * @param {function} fn - The callback function
     */
    on(e, fn) {
        
        // Create the event if undefined
        if (this.events[e] === undefined) {
            this.events[e] = [];
        }
        
        this.events[e].push(fn); // push the function
    }
}

/*socket.on('add', function(o) {
    o = parse(o);
    o = new window[o.type](o);
    // Scene.add(o);
    
    // Add to the scene
    Scene.objects[o.id] = o;
    var last = World.node.appendChild(o.view());
    Sorter.sort(last);
});*/