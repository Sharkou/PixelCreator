import { System } from '/src/core/system.js';
import { Network } from '/src/network/network.js';

/**
 * Keyboard input handler
 * Manages keyboard state and events for local and networked users
 */
export class Keyboard {

    // static keys = {};

    /**
     * Check if any key is currently pressed for a user
     * @static
     * @param {string} uid - The user identifier
     * @returns {boolean} True if any key is pressed
     */
    static keyPressed(uid) {
        const keys = this.keys(uid);
        for (let key in keys) {
            if (keys[key]) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Check if all keys are released for a user
     * @static
     * @param {string} uid - The user identifier
     * @returns {boolean} True if no keys are pressed
     */
    static keyReleased(uid) {
        const keys = this.keys(uid);
        for (let key in keys) {
            if (keys[key]) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get the keyboard state object for a user
     * @static
     * @param {string} uid - The user identifier
     * @returns {Object|undefined} Object with key names as keys and boolean pressed state
     */
    static keys(uid) {
        return Network.getUser(uid)?.keys;
    }
}

if (window.document) {
    document.addEventListener('keydown', e => {
        const key = e.key === ' ' ? 'Space' : e.key;
        // Keyboard.keys[key] = true;
        if (Network.uid) {
            Keyboard.keys(Network.uid)[key] = true;
        }
        System.dispatchEvent('keydown', key);
    });
    
    document.addEventListener('keyup', e => {
        const key = e.key === ' ' ? 'Space' : e.key;
        // delete Keyboard.keys[key];
        if (Network.uid) {
            delete Keyboard.keys(Network.uid)[key];
        }
        System.dispatchEvent('keyup', key);
    });
}