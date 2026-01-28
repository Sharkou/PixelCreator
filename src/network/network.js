import { System } from '/src/core/system.js';
import { Loader } from '/src/core/loader.js';
import { Client } from '/src/network/client.js';
import { Renderer } from '/src/core/renderer.js';
import { Scene } from '/src/core/scene.js';
import { Mouse } from '/src/input/mouse.js';
import { Keyboard } from '/src/input/keyboard.js';

/**
 * Network manager for multiplayer functionality
 * Handles WebSocket connections, user management, and state synchronization
 * 
 * @class Network
 * @static
 * @example
 * // Initialize and connect
 * Network.init('localhost', 8080);
 * await Network.connect(scene);
 * 
 * // Send data to server
 * Network.send('move', { x: 100, y: 200 });
 */
export class Network {
    
    /** @type {string} Server host address */
    static host;
    
    /** @type {number} Server port */
    static port;
    
    /** @type {string} Connection protocol (http/https) */
    static protocol;
    
    /** @type {WebSocket} WebSocket connection */
    static ws;
    
    /** @type {string|null} Local user identifier */
    static uid;
    
    /** @type {Scene|null} Current game scene */
    static scene;
    
    /** @type {boolean} Whether this is an inspector client */
    static inspector;
    
    /** @type {Object} Connected users indexed by UID */
    static users;
    
    /**
     * Initialize the network
     * @constructor
     * @param {WebSocket} ws - The client websocket
     * @param {string} host - The server host
     * @param {number} port - The server port
     */
    static init(host, port) {
        
        this.host = host;
        this.port = port;
        this.protocol = 'https';
        this.ws = new WebSocket(`wss://${host}:${port}/ws`);
        this.uid = null;
        this.scene = null;
        this.inspector = false;
        this.users = {};

        return this;
    }

    /**
     * Send data to server
     * @param {string} id - The event id
     * @param {object} data - The data
     */
    static send(id, data = null) {
        if (this.ws.readyState !== WebSocket.CLOSED) {
            this.ws.send(JSON.stringify({ id, data }));
        }
    }

    /**
     * Connect to server
     * @param {Scene} scene - The scene
     * @param {boolean} inspector - Is it an inspector?
     * @param {string} password - The password access
     */
    static async connect(scene, inspector = false) {
        this.scene = scene;
        this.inspector = inspector;
        return new Promise((resolve, reject) => {

            this.ws.onopen = e => {
                console.log('%c[SERVER] Connection established!', 'color: #11AB0D');
                this.send('init', scene.name);
            };

            this.ws.onmessage = e => {
                // const { id, data } = JSON.parse(e.data);
                this.onMessage(e).then(data => {
                    resolve(data);
                });
            };

            this.ws.onerror = error => {
                console.error('[SERVER] Failed connection!');
                // console.error(error);
                reject(error);
            };

            this.ws.onclose = e => {
                console.log('%c[SERVER] Connection closed: ' + JSON.stringify(e), 'color: #11AB0D');
            };
        });
    }

    /**
     * Disconnect from the server
     * @static
     */
    static disconnect() {
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        console.log('%c[SERVER] Disconnect request from local app layer...', 'color: #11AB0D');

        // TODO: Use sendBeacon to ensure the request is sent even during page teardown
        // this.send('disconnect');
        this.ws.close();
    }

    /**
     * Get a connected user by UID
     * @static
     * @param {string} uid - The user identifier
     * @returns {Client|undefined} The user client or undefined
     */
    static getUser(uid) {
        return this.users[uid];
    }

    /**
     * Listen event messages
     * @param {EventListener} e - The event listener
     * @param {string} id - The packet id
     * @param {object} data - The data
     */
    static onMessage(e) {
        const { id, data } = JSON.parse(e.data);

        return new Promise((resolve, reject) => {
            switch (id) {
                case 'init': this.initScene(data); resolve(data); break;
                case 'message': this.message(data); break;
                case 'connection': this.connection(data); break;
                case 'disconnection': this.disconnection(data); break;
                case 'getUID': this.getUID(data); break;
                case 'getUsers': this.getUsers(data); break;
                case 'heartbeat': this.heartbeat(data); break;
                case 'beat': this.beat(data); break;
                case 'pause': this.pause(data); break;
                case 'add': this.add(data); break;
                case 'remove': this.remove(data); break;
                case 'update': this.update(data); break;
                case 'addComponent': this.addComponent(data); break;
                case 'removeComponent': this.removeComponent(data); break;
                case 'addChild': this.addChild(data); break;
                case 'removeChild': this.removeChild(data); break;
                case 'upload_file': this.uploadFile(data); break;
                case 'delete_file': this.deleteFile(data); break;
                case 'mousemove': this.mousemove(data); break;
                case 'mousedown': this.mousedown(data); break;
                case 'mouseup': this.mouseup(data); break;
                case 'keydown': this.keydown(data); break;
                case 'keyup': this.keyup(data); break;
            }
        });
    }

    /**
     * Init scene data
     * @param {Object} data - The scene data
     * @returns {Promise} data - The promise resolved
     */
    static initScene(data) {
        console.log('%c[SERVER] Scene data received from server: ' + Object.keys(data).length, 'color: #11AB0D');
        // console.log(data);
        if (this.inspector) this.sync();
        for (let el of document.querySelectorAll('.loading')) {
            el.classList.remove('loading');
        }
        document.getElementById('loading')?.classList.add('hidden');
        this.syncInputs();
        // return data;
    }

    static message(data) {
        console.log('%c[SERVER] Message received from server: ' + data, 'color: #11AB0D');
    }

    static connection(data) {
        console.log('%c[SERVER] New user connected: ' + data.id, 'color: #11AB0D');

        // Create the user
        this.users[data.id] = new Client(data.id);
    }

    static disconnection(id) {
        console.log('%c[SERVER] User disconnected: ' + id, 'color: #11AB0D');
        delete this.users[id];
    }

    static getUID(data) {
        console.log('%c[SERVER] Your UID: ' + data, 'color: #11AB0D');
        this.uid = data;
    }

    static getUsers(data) {
        console.log('%c[SERVER] Users connected to the server: ' + Object.keys(data).length, 'color: #11AB0D');
        // console.log(data);
        this.users = data;
    }

    /**
     * Update scene every tick
     * @param {Object} data - The scene data
     */
    static heartbeat(data) {
        // if (!this.inspector) {
            // console.log('%c[SERVER] Scene heartbeat: ', 'color: #11AB0D');
            // console.log(data);
            for (let id in data) {
                if (this.scene.objects[id]) {
                    this.scene.objects[id].copy(data[id]);
                }
            }
        // }
    }

    /**
     * Update scene on beat
     * @param {Object} data - The scene data
     */
    static beat(data) {
        this.heartbeat(data);
    }

    /**
     * Pause the server
     * @param {boolean} pause - The pause state
     */
    static pause(pause) {
        console.log('%cinfo: ' + (pause ? 'Stop' : 'Start'), 'color: #3b78ff');
        Renderer.main.pause = pause;
    }

    /**
     * Update mouse position
     * @param {Object} data - The input data
     */
    static mousemove(data) {
        this.users[data.id].mouse.x = data.x;
        this.users[data.id].mouse.y = data.y;
    }

    static mousedown(data) {
        this.users[data.id].mouse.buttons[data.data] = true;
    }

    static mouseup(data) {
        delete this.users[data.id].mouse.buttons[data.data];
    }

    static keydown(data) {
        this.users[data.id].keys[data.data] = true;
    }
    
    static keyup(data) {
        delete this.users[data.id].keys[data.data];
    }

    /**
     * Add object to scene
     * @param {Object} obj - The object data
     */
    static add(obj) {
        const id = obj.id;
        console.log('%c[SERVER] Object added: ' + id, 'color: #11AB0D');
        console.log(obj);
        this.scene.instantiate(obj);
    }

    /**
     * Remove object from scene
     * @param {string} id - The object id
     */
    static remove(id) {
        console.log('%c[SERVER] Object removed: ' + id, 'color: #11AB0D');
        this.scene.remove(this.scene.objects[id]);
    }

    /**
     * Mise à jour d'un objet
     * @param {Object} data - The object data
     */
    static update(data) {
        // console.log('%c[SERVER] Object updated: ' + data.id, 'color: #11AB0D');
        // console.log(data);

        // File
        // if (data.id[0] === '/') {
        if (Loader.allowedTypes.indexOf(data.type) !== -1) {
            const files = Loader.files;
            const file = files[data.id];
            if (file) {
                file[data.prop] = data.value;
            }
        // Object
        } else {
            const obj = this.scene.objects[data.id];
            const component = data.component;
            const scene = Scene.main;
            const camera = scene.camera;
            if (obj) {
                // Camera updated
                if (data.id === camera.id) {
                    if (component) {
                        camera.components[component][data.prop] = data.value;
                    } else {
                        camera[data.prop] = data.value;
                        if (data.prop === 'x') {
                            camera.x -= camera.width / 2;
                        } else if (data.prop === 'y') {
                            camera.y -= camera.height / 2;
                        }
                    }
                    // TODO: Reset rendering
                    // Renderer.main.init(scene, camera);
                } else if (component) {
                    // obj.setComponentProperty(data.component, data.prop, data.value);
                    obj.components[component][data.prop] = data.value;
                } else {
                    // TODO: Interpolate the movement
                    // obj.setProperty(data.prop, data.value);
                    obj[data.prop] = data.value;
                }
            }
        }
    }

    static addComponent(data) {
        console.log('%c[SERVER] Component added: ' + data.component.name, 'color: #11AB0D');
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const component = data.component;
        if (obj) {
            obj.addComponent(obj.copyComponent(component), false);
            if (obj === this.scene.current) {
                this.scene.refresh();
            }
        }
    }

    static removeComponent(data) {
        console.log('%c[SERVER] Component removed: ' + data.component, 'color: #11AB0D');
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const component = data.component;
        if (obj) {
            obj.removeComponent(component, false);
            if (obj === this.scene.current) {
                this.scene.refresh();
            }
        }
    }

    static addChild(data) {
        console.log('%c[SERVER] Child added: ' + data.component.name, 'color: #11AB0D');
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const child = this.scene.objects[data.child];
        if (obj && child) {
            obj.addChild(child, false);
        }
    }

    static removeChild(data) {
        console.log('%c[SERVER] Child removed: ' + data.component.name, 'color: #11AB0D');
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const child = this.scene.objects[data.child];
        if (obj && child) {
            obj.removeChild(child, false);
        }
    }

    /**
     * Save data to server
     */
    static save() {
        this.send('save', this.scene);
    }

    /*
     * Download uploaded file
     */
    static async uploadFile(file) {
        // console.log(file);
        await Loader.load(file.id);
        // console.log('%c[SERVER] File loaded: ' + file.id, 'color: #11AB0D');
    }

    /*
     * Deleted file
     */
    static async deleteFile(fileId) {
        const file = Loader.files[fileId];
        Loader.remove(file);
        console.log('%cinfo: File deleted: ' + fileId, 'color: #3b78ff');
        // console.log('%c[SERVER] File deleted: ' + fileId, 'color: #11AB0D');
    }

    /**
     * Synchronize objects data with server
     */
    static sync() {
        let timers = {};
        let timeoutID;
        const delay = 0; // ms

        System.addEventListener('syncProperty', data => {
            // console.log(data);
            const id = data.object.id;
            const type = data.object.type;
            const prop = data.prop;
            const component = data.component?.name;
            const value = data.value;
            const key = id + '-' + prop;
            // File
            if (Loader.allowedTypes.indexOf(type) !== -1) {
                Loader.update(data.object);
            }
            if (timers[key]) {
                const lastTime = timers[key];
                // Update every 50ms
                if (Date.now() - lastTime > delay) {
                    // console.log('send to server:');
                    // console.log(data);
                    window.clearTimeout(timeoutID);
                    timers[key] = Date.now();
                    this.syncProperty(id, type, component, prop, value);
                } else {
                    window.clearTimeout(timeoutID);
                    timeoutID = window.setTimeout(() => {
                        this.syncProperty(id, type, component, prop, value);
                    }, delay);
                }
            } else {
                timers[key] = Date.now();
                this.syncProperty(id, type, component, prop, value);
            }
        });

        System.addEventListener('addComponent', data => {
            // console.log(data);
            this.send('addComponent', {
                id: data.object.id,
                component: data.component
            });
        });

        System.addEventListener('removeComponent', data => {
            this.send('removeComponent', {
                id: data.object.id,
                component: data.component.name
            });
        });

        System.addEventListener('addChild', data => {
            // console.log(data);
            this.send('addChild', {
                id: data.object.id,
                child: data.child.id
            });
        });

        System.addEventListener('removeChild', data => {
            this.send('removeChild', {
                id: data.object.id,
                child: data.child.id
            });
        });

        // System.addEventListener('heartbeat', () => {
        //     this.send('beat');
        // });

        System.addEventListener('pause', pause => {
            this.send('pause', pause);
        });

        System.addEventListener('add', obj => {
            this.send('add', obj.stringify());
        });

        System.addEventListener('remove', obj => {
            this.send('remove', obj.id);
        });

        System.addEventListener('upload_file', data => {
            // console.log(data);
            this.send('upload_file', {
                id: data.id,
                type: data.type
            });
        });

        System.addEventListener('delete_file', obj => {
            this.send('delete_file', obj.id);
        });
    }

    static syncProperty(id, type, component, prop, value) {
        this.send('update', {
            id,
            type,
            component,
            prop,
            value
        });
    }

    /**
     * Synchronize inputs with server
     */
    static syncInputs() {
        let timer = Date.now();
        let timeoutID;
        const delay = 50; // ms

        System.addEventListener('mousedown', button => this.send('mousedown', button));
        System.addEventListener('mouseup', button => this.send('mouseup', button));
        System.addEventListener('keydown', key => this.send('keydown', key));
        System.addEventListener('keyup', key => this.send('keyup', key));
        System.addEventListener('mousemove', () => {
            const lastTime = timer;
            // Update every 50ms
            if (Date.now() - lastTime > delay) {
                window.clearTimeout(timeoutID);
                timer = Date.now();
                this.updateMousePosition(Mouse.x, Mouse.y);
            } else {
                window.clearTimeout(timeoutID);
                timeoutID = window.setTimeout(() => {
                    this.updateMousePosition(Mouse.x, Mouse.y);
                }, delay);
            }
        });
    }

    static updateMousePosition(x, y) {
        this.send('mousemove', {
            x,
            y
        });
    }
}