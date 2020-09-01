import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';
import { Mouse } from '/src/input/mouse.js';
import { Keyboard } from '/src/input/keyboard.js';

export class Network {

    // static host;
    // static port;
    // static socket;
    // static id;
    
    /**
     * Initialize the network
     * @constructor
     * @param {WebSocket} ws - The client websocket
     * @param {string} host - The server host
     * @param {number} port - The server port
     */
    constructor(host, port) {
        
        this.host = host;
        this.port = port;
        this.ws = new WebSocket(`ws://${host}:${port}/ws`);
        // this.socket = io(host + ':' + port);        
        // this.id = this.socket.id;
        this.scene = null;
        this.inspector = false;
        this.users = {};
        this.events = {};

        return this;
    }

    /**
     * Get current network
     * @return {Network} network - The current network
     */
    static get main() {
        return this._main;
    }
    
    /**
     * Set current network
     * @param {Network} network - The current network
     */
    static set main(network) {
        this._main = network;
    }

    /**
     * Send data to server
     * @param {string} id - The event id
     * @param {object} data - The data
     */
    send(id, data = null) {
        this.ws.send(JSON.stringify({ id, data }));
    }

    /**
     * Connect to server
     * @param {Scene} scene - The scene
     * @return {boolean} inspector - Is it an inspector?
     */
    async connect(scene, inspector = false) {
        this.scene = scene;
        this.inspector = inspector;
        return new Promise((resolve, reject) => {

            this.ws.onopen = e => {
                console.log('[SERVER] Connection established!');
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
                console.log('[SERVER] Connection closed: ' + JSON.stringify(e));
            };
        });
    }

    disconnect() {
        console.log('Disconnect request from local app layer...');
        this.ws.close();
    }

    /**
     * Listen event messages
     * @param {EventListener} e - The event listener
     * @param {string} id - The packet id
     * @param {object} data - The data
     */
    onMessage(e) {
        const { id, data } = JSON.parse(e.data);

        return new Promise((resolve, reject) => {
            switch (id) {
                case 'init': this.init(data); resolve(data); break;
                case 'message': this.message(data); break;
                case 'connection': this.connection(data); break;
                case 'disconnection': this.disconnection(data); break;
                case 'getUsers': this.getUsers(data); break;
                case 'heartbeat': this.heartbeat(data); break;
                case 'beat': this.beat(data); break;
                case 'pause': this.pause(data); break;
                case 'add': this.add(data); break;
                case 'remove': this.remove(data); break;
                case 'update': this.update(data); break;
                case 'addComponent': this.addComponent(data); break;
                case 'removeComponent': this.removeComponent(data); break;
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
     * @return {Promise} data - The promise resolved
     */
    init(data) {
        console.log('[SERVER] scene data received from server: ');
        console.log(data);
        if (this.inspector) this.sync();
        for (let el of document.getElementsByClassName('loading')) el.classList.add('hidden');
        this.syncInputs();
        // return data;
    }

    message(data) {
        console.log('[SERVER] message received from server: ' + data);
    }

    connection(data) {
        console.log('[SERVER] a new user connected: ' + data.id);

        // Create the user
        this.users[data.id] = {
            keys: {},
            mouse: {
                buttons: {},
                x: 0,
                y: 0
            }
        };
    }

    disconnection(id) {
        console.log('[SERVER] a user disconnected: ' + id);
        delete this.users[id];
    }

    getUsers(users) {
        console.log('[SERVER] get users connected to the server: ' + Object.keys(users).length);
        // console.log(users);
        this.users = users;
    }

    /**
     * Update scene every heartbeat
     * @param {Object} data - The scene data
     */
    heartbeat(data) {
        if (!this.inspector) {
            console.log('[SERVER] scene heartbeat: ');
            console.log(data);
            for (let id in data) {
                if (this.scene.objects[id]) {
                    this.scene.objects[id].copy(data[id]);
                }
            }
        }
    }

    /**
     * Update scene on beat
     * @param {Object} data - The scene data
     */
    beat(data) {
        this.heartbeat(data);
    }

    /**
     * Pause the server
     * @param {boolean} pause - The pause state
     */
    pause(pause) {
        console.log(pause);
    }

    /**
     * Update mouse position
     * @param {Object} data - The input data
     */
    mousemove(data) {
        this.users[data.id].mouse.x = data.x;
        this.users[data.id].mouse.y = data.y;
    }

    mousedown(data) {
        this.users[data.id].mouse.buttons[data.button] = true;
    }

    mouseup(data) {
        delete this.users[data.id].mouse.buttons[data.button];
    }

    keydown(data) {
        this.users[data.id].keys[data.key] = true;
    }
    
    keyup(data) {
        delete this.users[data.id].keys[data.key];
    }

    /**
     * Add object to scene
     * @param {Object} obj - The object data
     */
    add(obj) {
        const id = obj.id;
        console.log('[SERVER] add object: ' + id);
        console.log(obj);
        this.scene.instanciate(obj);
    }

    /**
     * Remove object from scene
     * @param {string} id - The object id
     */
    remove(id) {
        console.log('[SERVER] object removed: ' + id);
        this.scene.remove(this.scene.objects[id]);
    }

    /**
     * Mise à jour d'un objet
     * @param {Object} data - The object data
     */
    update(data) {
        console.log('[SERVER] object updated: ');
        console.log(data);
        const obj = this.scene.objects[data.id];
        if (obj) {
            if (data.component) {
                obj.setComponentProperty(data.component, data.prop, data.value, false);
            } else if (obj) {
                obj.setProperty(data.prop, data.value, false);
                // TODO: Interpolate the movement
            }
            if (this.inspector) {
                // Update properties editor
                System.dispatchEvent('setProperty', {
                    object: obj
                });
            }
        }
    }

    addComponent(data) {
        console.log('[SERVER] component added: ' + data.component.name);
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const component = data.component;
        if (obj) {
            obj.addComponent(obj.copyComponent(component), false);
        }
    }

    removeComponent(data) {
        console.log('[SERVER] component removed: ' + data.component);
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const component = data.component;
        if (obj) {
            obj.removeComponent(component, false);
        }
    }

    /**
     * Save data to server
     */
    save() {
        this.send('save', this.scene);
    }   

    /**
     * Synchronize objects data with server
     */
    sync() {
        let timers = {};
        let timeoutID;
        const delay = 0; // ms

        System.addEventListener('updateProperties', data => {
            console.log(data);
            const id = data.object.id;
            const prop = data.prop;
            const component = data.component?.name;
            const value = data.value;
            const key = id + '-' + prop;
            if (timers[key]) {
                const lastTime = timers[key];
                // Update every 50ms
                if (Date.now() - lastTime > delay) {
                    // console.log('send to server:');
                    // console.log(data);
                    window.clearTimeout(timeoutID);
                    timers[key] = Date.now();
                    this.updateObjectProperty(id, component, prop, value);
                } else {
                    window.clearTimeout(timeoutID);
                    timeoutID = window.setTimeout(() => {
                        this.updateObjectProperty(id, component, prop, value);
                    }, delay);
                }
            } else {
                timers[key] = Date.now();
                this.updateObjectProperty(id, component, prop, value);
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
    }

    updateObjectProperty(id, component, prop, value) {
        this.send('update', {
            id,
            component,
            prop,
            value
        });
    }

    /**
     * Synchronize inputs with server
     */
    syncInputs() {
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

    updateMousePosition(x, y) {
        this.send('mousemove', {
            x,
            y
        });
    }
}