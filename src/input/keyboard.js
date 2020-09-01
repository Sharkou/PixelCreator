import { System } from '/src/core/system.js';

export class Keyboard {

    static keys = {};
    
    static get keyPressed() {
        for (let key in this.keys) {
            if (this.keys[key]) {
                return true;
            }
        }
        return false;
    }
    
    static get keyReleased() {
        for (let key in this.keys) {
            if (this.keys[key]) {
                return false;
            }
        }
        return true;
    }
}

document.addEventListener('keydown', function(e) {
    const key = e.key === ' ' ? 'Space' : e.key;
    Keyboard.keys[key] = true;
    System.dispatchEvent('keydown', key);
});

document.addEventListener('keyup', function(e) {
    const key = e.key === ' ' ? 'Space' : e.key;
    delete Keyboard.keys[key];
    System.dispatchEvent('keyup', key);
});