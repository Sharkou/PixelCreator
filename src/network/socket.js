import * as Peer from '/src/lib/simplepeer.js';

/**
 * P2P socket using WebRTC for peer-to-peer connections
 * Provides direct communication between clients without server relay
 * 
 * @class Socket
 * @example
 * const socket = new Socket();
 * await socket.init(true); // As initiator
 * socket.on('connect', () => console.log('Connected!'));
 */
export class Socket {
    
    /**
     * Create a new P2P socket
     */
    constructor() {
        /** @type {string|null} Connection signal ID */
        this.id = null;
        
        /** @type {Object|null} Host peer signal data */
        this.host = null;
        
        /** @type {SimplePeer|null} SimplePeer instance */
        this.peer = null;
        
        /** @type {boolean} Whether this socket initiated the connection */
        this.initiator = false;
        
        /** @type {Object<string, Function[]>} Event listeners */
        this.events = {
            connect: [],
            disconnect: []
        };
        
        /** @type {boolean} Connection state */
        this.connected = false;
    }
    
    /**
     * Initialize the peer connection
     * @param {boolean} initiator - Whether to initiate the connection
     * @param {boolean} trickle - Whether to use ICE trickle
     */
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
    
    /**
     * Wait for and return the connection signal
     * @returns {Promise<string>} The signal ID as JSON string
     */
    signal() {
        
        return new Promise(resolve => {
            this.peer.on('signal', (data) => {
                this.id = JSON.stringify(data);
                console.log(this.id);
                resolve(this.id)
            });
        });
    }
    
    /**
     * Connect to a peer using their signal ID
     * @param {string} id - The peer's signal ID (JSON string)
     * @param {boolean} host - Whether connecting as host
     */
    async connect(id, host = false) {
            
        this.host = JSON.parse(id);
        this.peer.signal(this.host); // send signal to host
        
        if (!host) {
            await this.signal(); // wait for signal
        }
    }
    
    /**
     * Send data to the connected peer
     * @param {string} type - Event type
     * @param {*} value - Data to send
     */
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