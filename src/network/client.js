// import { System } from '/src/core/system.js';
// import { Network } from '/src/network/network.js';

export class Client {

    /**
     * Create a new network client for multiplayer sync
     * @param {string} uid - The unique user identifier
     */
    constructor(uid) {
        this.id = uid;
        this.keys = {};
        this.mouse = { buttons: {}, x: 0, y: 0 };
    }
}