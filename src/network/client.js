// import { System } from '/src/core/system.js';
// import { Network } from '/src/network/network.js';

export class Client {

    /**
     * Initialize the client
     * @constructor
     * @param {string} uid - The user identifier
     */
    constructor(uid) {
        this.id = uid;
        this.keys = {};
        this.mouse = {
            buttons: {},
            x: 0,
            y: 0
        };
    }
}