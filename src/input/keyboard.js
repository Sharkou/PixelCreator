import { System } from '/src/core/system.js';
import { Network } from '/src/network/network.js';

export class Keyboard {

    // static keys = {};

    static keyPressed(uid) {
        const keys = this.keys(uid);
        for (let key in keys) {
            if (keys[key]) {
                return true;
            }
        }
        return false;
    }
    
    static keyReleased(uid) {
        const keys = this.keys(uid);
        for (let key in keys) {
            if (keys[key]) {
                return false;
            }
        }
        return true;
    }

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