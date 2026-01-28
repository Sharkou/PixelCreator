// import { System } from '/src/core/system.js';
// import { Network } from '/src/network/network.js';

/**
 * Network client representing a connected user
 * Stores user input state for network synchronization
 * 
 * @class Client
 * @example
 * const client = new Client('user123');
 * client.keys['ArrowUp'] = true;
 */
export class Client {

    /**
     * Create a new network client
     * @param {string} uid - The unique user identifier
     */
    constructor(uid) {
        this.id = uid;
        this.keys = {};
        this.mouse = { buttons: {}, x: 0, y: 0 };
    }
}