import { System } from '/src/core/system.js';
import { Network } from '/src/network/network.js';

export class Gamepad {

    static gamepads = {};
    static deadzone = 0.15;

    /**
     * Get connected gamepad for a user
     * @static
     * @param {string} uid - The user identifier
     * @returns {Object} The gamepad state
     */
    static get(uid) {
        return Network.getUser(uid)?.gamepad;
    }

    /**
     * Check if gamepad is connected
     * @static
     * @param {number} index - The gamepad index
     * @returns {boolean} True if connected
     */
    static isConnected(index = 0) {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        return gamepads[index] !== null && gamepads[index] !== undefined;
    }

    /**
     * Get all connected gamepads
     * @static
     * @returns {Gamepad[]} Array of connected gamepads
     */
    static getAll() {
        return navigator.getGamepads ? navigator.getGamepads() : [];
    }

    /**
     * Get button state
     * @static
     * @param {number} index - The gamepad index
     * @param {number} button - The button index
     * @returns {boolean} True if pressed
     */
    static isButtonPressed(index, button) {
        const gamepads = navigator.getGamepads();
        if (!gamepads[index]) return false;
        return gamepads[index].buttons[button]?.pressed ?? false;
    }

    /**
     * Get button value (for analog triggers)
     * @static
     * @param {number} index - The gamepad index
     * @param {number} button - The button index
     * @returns {number} Value from 0 to 1
     */
    static getButtonValue(index, button) {
        const gamepads = navigator.getGamepads();
        if (!gamepads[index]) return 0;
        return gamepads[index].buttons[button]?.value ?? 0;
    }

    /**
     * Get axis value with deadzone
     * @static
     * @param {number} index - The gamepad index
     * @param {number} axis - The axis index
     * @returns {number} Value from -1 to 1
     */
    static getAxis(index, axis) {
        const gamepads = navigator.getGamepads();
        if (!gamepads[index]) return 0;
        
        const value = gamepads[index].axes[axis] ?? 0;
        
        // Apply deadzone
        if (Math.abs(value) < this.deadzone) {
            return 0;
        }
        
        // Normalize value outside deadzone
        const sign = value > 0 ? 1 : -1;
        return sign * (Math.abs(value) - this.deadzone) / (1 - this.deadzone);
    }

    /**
     * Get left stick values
     * @static
     * @param {number} index - The gamepad index
     * @returns {Object} { x, y } values
     */
    static getLeftStick(index) {
        return {
            x: this.getAxis(index, 0),
            y: this.getAxis(index, 1)
        };
    }

    /**
     * Get right stick values
     * @static
     * @param {number} index - The gamepad index
     * @returns {Object} { x, y } values
     */
    static getRightStick(index) {
        return {
            x: this.getAxis(index, 2),
            y: this.getAxis(index, 3)
        };
    }

    /**
     * Get left trigger value
     * @static
     * @param {number} index - The gamepad index
     * @returns {number} Value from 0 to 1
     */
    static getLeftTrigger(index) {
        return this.getButtonValue(index, 6);
    }

    /**
     * Get right trigger value
     * @static
     * @param {number} index - The gamepad index
     * @returns {number} Value from 0 to 1
     */
    static getRightTrigger(index) {
        return this.getButtonValue(index, 7);
    }

    /**
     * Vibrate the gamepad (if supported)
     * @static
     * @param {number} index - The gamepad index
     * @param {number} duration - Duration in ms
     * @param {number} weakMagnitude - Weak motor intensity (0-1)
     * @param {number} strongMagnitude - Strong motor intensity (0-1)
     */
    static vibrate(index, duration = 200, weakMagnitude = 0.5, strongMagnitude = 0.5) {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[index];
        
        if (gamepad?.vibrationActuator) {
            gamepad.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: duration,
                weakMagnitude: weakMagnitude,
                strongMagnitude: strongMagnitude
            });
        }
    }

    /**
     * Update gamepad state (call each frame)
     * @static
     */
    static update() {
        const gamepads = navigator.getGamepads();
        
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                this.gamepads[i] = {
                    connected: true,
                    leftStick: this.getLeftStick(i),
                    rightStick: this.getRightStick(i),
                    leftTrigger: this.getLeftTrigger(i),
                    rightTrigger: this.getRightTrigger(i),
                    buttons: gamepads[i].buttons.map(b => ({
                        pressed: b.pressed,
                        value: b.value
                    }))
                };
            }
        }
    }
}

// Standard button mapping (Xbox layout)
Gamepad.BUTTONS = {
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LB: 4,
    RB: 5,
    LT: 6,
    RT: 7,
    BACK: 8,
    START: 9,
    LEFT_STICK: 10,
    RIGHT_STICK: 11,
    DPAD_UP: 12,
    DPAD_DOWN: 13,
    DPAD_LEFT: 14,
    DPAD_RIGHT: 15,
    HOME: 16
};

// Axis mapping
Gamepad.AXES = {
    LEFT_STICK_X: 0,
    LEFT_STICK_Y: 1,
    RIGHT_STICK_X: 2,
    RIGHT_STICK_Y: 3
};

// Event listeners
if (typeof window !== 'undefined') {
    window.addEventListener('gamepadconnected', e => {
        System.dispatchEvent('gamepadconnected', {
            index: e.gamepad.index,
            id: e.gamepad.id
        });
    });

    window.addEventListener('gamepaddisconnected', e => {
        delete Gamepad.gamepads[e.gamepad.index];
        System.dispatchEvent('gamepaddisconnected', {
            index: e.gamepad.index,
            id: e.gamepad.id
        });
    });
}