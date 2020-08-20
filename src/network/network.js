import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';

export class Network {

    // static host;
    // static port;
    // static socket;
    // static id;
    
    /**
     * Initialize the network
     * @constructor
     * @param {Socket} socket - The client socket
     * @param {string} host - The host
     * @param {number} port - The server port
     */
    constructor(host, port) {
        
        this.host = host;
        this.port = port;
        this.socket = io(host + ':' + port);
        this.id = this.socket.id;
        this.scene = null;
        this.users = {};
        this.events = {};
    
        this.on('message', data => {
            console.log('[SERVER] message received from server: ' + data);
        });

        this.on('new', data => {
            console.log('[SERVER] a new user connected: ' + data.id);
        });

        // Add object to scene
        this.on('add', data => {
            console.log('[SERVER] add object: ' + data.id);
            this.scene.instanciate(data);
        });

        // Remove object from scene
        this.on('remove', id => {
            console.log('[SERVER] object removed: ' + id);
            this.scene.remove(this.scene.objects[id]);
        });

        // Mise à jour d'un objet
        this.on('update', data => {
            console.log('[SERVER] object updated: ');
            console.log(data);
            let obj = this.scene.objects[data.id];
            if (obj) {
                obj.setProperty(data.prop, data.value);
            }
        });

        return this;
    }

    /**
     * Listen event
     * @param {string} e - The event type
     * @param {function} fn - The callback function
     */
    on(e, fn, override = true) {        
        // Create the event if undefined
        // if (this.events[e] === undefined) {
        //     this.events[e] = [];
        // }
        
        // this.events[e].push(fn); // push the function

        this.socket.on(e, fn);
    }

    /**
     * Emit event
     * @param {string} e - The event type
     * @param {object} data - The data
     */
    emit(e, data = null) {        
        // if (this.events[e] !== undefined) {            
        //     for (let event of this.events[e]) {                
        //         event(data);
        //     }
        // }

        this.socket.emit(e, data);
    }

    /**
     * Connect to scene
     * @param {Scene} scene - The scene
     * @return {Object} objects - The scene objects
     */
    init(scene, sync = false) {
        this.scene = scene;
        this.emit('init', scene.name);

        if (sync) {
            this.sync();
        }

        return new Promise(resolve => {
            this.on('init', data => {
                console.log('[SERVER] data received from server: ');
                console.log(data);
                resolve(data);
            });
        });
    }

    /**
     * Save data to server
     */
    save() {
        this.emit('save', this.scene);
    }

    /**
     * Synchronize objects data with server
     */
    sync() {
        System.addEventListener('setProperty', data => {
                this.emit('update', {
                    id: data.object.id,
                    prop: data.prop,
                    value: data.value
                });
                // TODO: limiter la bande passante
                // TODO: envoyer les données des composants
        });
        this.scene.addEventListener('add', obj => {
            this.emit('add', obj.stringify());
        });
        this.scene.addEventListener('remove', obj => {
            this.emit('remove', obj.id);
        });
    }
}