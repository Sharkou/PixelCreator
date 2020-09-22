import { System } from '/src/core/system.js';
import { Client } from '/src/network/client.js';
import { Renderer } from '/src/core/renderer.js';
import { Scene } from '/src/core/scene.js';
import { Mouse } from '/src/input/mouse.js';
import { Keyboard } from '/src/input/keyboard.js';

export class Network {
    
    static host;
    static port;
    static protocol;
    static ws;
    static uid;
    static scene;
    static inspector;
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
        this.protocol = 'http';
        this.ws = new WebSocket(`ws://${host}:${port}/ws`);
        // this.socket = io(host + ':' + port);        
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

    static disconnect() {
        console.log('Disconnect request from local app layer...');
        this.ws.close();
    }

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
    static initScene(data) {
        console.log('[SERVER] scene data received from server: ');
        console.log(data);
        if (this.inspector) this.sync();
        for (let el of document.querySelectorAll('.loading')) {
            el.classList.remove('loading');
        }
        document.getElementById('loading')?.classList.add('hidden');
        this.syncInputs();
        // return data;
    }

    static message(data) {
        console.log('[SERVER] message received from server: ' + data);
    }

    static connection(data) {
        console.log('[SERVER] a new user connected: ' + data.id);

        // Create the user
        this.users[data.id] = new Client(data.id);
    }

    static disconnection(id) {
        console.log('[SERVER] a user disconnected: ' + id);
        delete this.users[id];
    }

    static getUID(data) {
        console.log('[SERVER] your UID: ' + data);
        this.uid = data;
    }

    static getUsers(data) {
        console.log('[SERVER] get users connected to the server: ' + Object.keys(data).length);
        console.log(data);
        this.users = data;
    }

    /**
     * Update scene every heartbeat
     * @param {Object} data - The scene data
     */
    static heartbeat(data) {
        // if (!this.inspector) {
            console.log('[SERVER] scene heartbeat: ');
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
        console.log(pause);
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
        console.log('[SERVER] add object: ' + id);
        console.log(obj);
        this.scene.instanciate(obj);
    }

    /**
     * Remove object from scene
     * @param {string} id - The object id
     */
    static remove(id) {
        console.log('[SERVER] object removed: ' + id);
        this.scene.remove(this.scene.objects[id]);
    }

    /**
     * Mise à jour d'un objet
     * @param {Object} data - The object data
     */
    static update(data) {
        console.log('[SERVER] object updated: ' + data.id);
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

    static addComponent(data) {
        console.log('[SERVER] component added: ' + data.component.name);
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const component = data.component;
        if (obj) {
            obj.addComponent(obj.copyComponent(component), false);
        }
    }

    static removeComponent(data) {
        console.log('[SERVER] component removed: ' + data.component);
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const component = data.component;
        if (obj) {
            obj.removeComponent(component, false);
        }
    }

    static addChild(data) {
        console.log('[SERVER] child added: ' + data.component.name);
        // console.log(data);
        const obj = this.scene.objects[data.id];
        const child = this.scene.objects[data.child];
        if (obj && child) {
            obj.addChild(child, false);
        }
    }

    static removeChild(data) {
        console.log('[SERVER] child removed: ' + data.component.name);
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
                    this.syncProperty(id, component, prop, value);
                } else {
                    window.clearTimeout(timeoutID);
                    timeoutID = window.setTimeout(() => {
                        this.syncProperty(id, component, prop, value);
                    }, delay);
                }
            } else {
                timers[key] = Date.now();
                this.syncProperty(id, component, prop, value);
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
    }

    static syncProperty(id, component, prop, value) {
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