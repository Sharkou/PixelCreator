export class Keyboard {
    
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

Keyboard.keys = {};

document.addEventListener('keydown', function(e) {
    Keyboard.keys[e.key === ' ' ? 'Space' : e.key] = true;
});

document.addEventListener('keyup', function(e) {
    delete Keyboard.keys[e.key === ' ' ? 'Space' : e.key];
});