import { System } from '/src/core/system.js';
import { Network } from '/src/network/network.js';

export class Mouse {

    static x = 0;
    static y = 0;
    static target = null;
    static down = false;
    static up = false;
    static move = false;
    static button = '';
    static editor = { x: 0, y: 0 };
    static lastPosition = { x: 0, y: 0 };
    static offset = { x: 0, y: 0 };
    static world = { x: 0, y: 0 };
        
    // Mouse position
    static getMousePos(e) {
        
        var rect = canvas.getBoundingClientRect();

        return {
            x: (e.clientX - rect.left) / (rect.right - rect.left) * canvas.width,
            y: (e.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height
        };
    }
        
    static setButton(e) {
        switch (e) {
            case 0:
                this.button = 'left';
                break;
            case 1:
                this.button = 'middle';
                break;
            case 2:
                this.button = 'right';
                break;
        }
    }

    static buttonPressed(uid) {
        const buttons = this.buttons(uid);
        for (let button in buttons) {
            if (buttons[button]) {
                return true;
            }
        }
        return false;
    }
    
    static buttonReleased(uid) {
        const buttons = this.buttons(uid);
        for (let button in buttons) {
            if (buttons[button]) {
                return false;
            }
        }
        return true;
    }

    static buttons(uid) {
        return Network.getUser(uid)?.mouse?.buttons;
    }

    static getUserMouse(uid) {
        return Network.getUser(uid)?.mouse;
    }
}

if (window.document) {
    
    // Initialize events
    document.addEventListener('mousedown', e => {
        Mouse.target = e.target;
        Mouse.setButton(e.button);
        Mouse.down = false;
        Mouse.up = true;
        if (Network.uid) {
            Mouse.buttons(Network.uid)[e.button] = true;
        }
        System.dispatchEvent('mousedown', e.button);
    });

    document.body.addEventListener('mouseup', e => {
        Mouse.setButton(e.button);
        Mouse.down = false;
        Mouse.up = true;
        Mouse.editor.x = e.clientX;
        Mouse.editor.y = e.clientY;
        if (Network.uid) {
            delete Mouse.buttons(Network.uid)[e.button];
        }
        System.dispatchEvent('mouseup', e.button);
    })

    let timeoutID;

    // Handle mouse movement on the canvas
    document.body.addEventListener('mousemove', e => {
        const delay = 50; // ms
        
        Mouse.move = true;
        Mouse.x = ~~Mouse.getMousePos(e).x;
        Mouse.y = ~~Mouse.getMousePos(e).y;
        if (Network.uid && Mouse.getUserMouse(Network.uid)) {
            Mouse.getUserMouse(Network.uid).x = Mouse.x;
            Mouse.getUserMouse(Network.uid).y = Mouse.y;
        }
        System.dispatchEvent('mousemove');
        
        if (timeoutID) {
            clearTimeout(timeoutID);
        }
        
        // on mouse stop
        timeoutID = setTimeout(function() {
            Mouse.move = false;
        }, delay);
    });
}