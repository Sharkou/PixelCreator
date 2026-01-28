/**
 * Runtime environment configuration and detection
 * Handles platform detection, capabilities, and environment settings
 * 
 * @example
 * // Check environment
 * if (Environment.isBrowser) {
 *     console.log('Running in browser');
 * }
 * 
 * // Get device info
 * const info = Environment.getDeviceInfo();
 * console.log(info.platform);
 */
export class Environment {

    static #initialized = false;
    static #capabilities = {};

    /**
     * Initialize environment detection
     * @static
     */
    static init() {
        if (this.#initialized) return;
        
        this.#detectCapabilities();
        this.#initialized = true;
    }

    /**
     * Check if running in browser
     * @static
     * @type {boolean}
     */
    static get isBrowser() {
        return typeof window !== 'undefined' && typeof document !== 'undefined';
    }

    /**
     * Check if running in Deno
     * @static
     * @type {boolean}
     */
    static get isDeno() {
        return typeof Deno !== 'undefined';
    }

    /**
     * Check if running in Node.js
     * @static
     * @type {boolean}
     */
    static get isNode() {
        return typeof process !== 'undefined' && process.versions?.node;
    }

    /**
     * Check if running on server
     * @static
     * @type {boolean}
     */
    static get isServer() {
        return this.isDeno || this.isNode;
    }

    /**
     * Check if running on client
     * @static
     * @type {boolean}
     */
    static get isClient() {
        return this.isBrowser;
    }

    /**
     * Check if running on mobile device
     * @static
     * @type {boolean}
     */
    static get isMobile() {
        if (!this.isBrowser) return false;
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Check if running on desktop
     * @static
     * @type {boolean}
     */
    static get isDesktop() {
        return this.isBrowser && !this.isMobile;
    }

    /**
     * Check if touch is supported
     * @static
     * @type {boolean}
     */
    static get hasTouch() {
        if (!this.isBrowser) return false;
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    /**
     * Check if gamepad API is supported
     * @static
     * @type {boolean}
     */
    static get hasGamepad() {
        if (!this.isBrowser) return false;
        return 'getGamepads' in navigator;
    }

    /**
     * Check if WebGL is supported
     * @static
     * @type {boolean}
     */
    static get hasWebGL() {
        if (!this.isBrowser) return false;
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch {
            return false;
        }
    }

    /**
     * Check if WebGL2 is supported
     * @static
     * @type {boolean}
     */
    static get hasWebGL2() {
        if (!this.isBrowser) return false;
        try {
            const canvas = document.createElement('canvas');
            return !!canvas.getContext('webgl2');
        } catch {
            return false;
        }
    }

    /**
     * Check if WebGPU is supported
     * @static
     * @type {boolean}
     */
    static get hasWebGPU() {
        if (!this.isBrowser) return false;
        return 'gpu' in navigator;
    }

    /**
     * Check if Web Audio is supported
     * @static
     * @type {boolean}
     */
    static get hasWebAudio() {
        if (!this.isBrowser) return false;
        return 'AudioContext' in window || 'webkitAudioContext' in window;
    }

    /**
     * Check if WebSocket is supported
     * @static
     * @type {boolean}
     */
    static get hasWebSocket() {
        if (!this.isBrowser) return true; // Server always has WebSocket
        return 'WebSocket' in window;
    }

    /**
     * Check if local storage is supported
     * @static
     * @type {boolean}
     */
    static get hasLocalStorage() {
        if (!this.isBrowser) return false;
        try {
            const test = '__test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if IndexedDB is supported
     * @static
     * @type {boolean}
     */
    static get hasIndexedDB() {
        if (!this.isBrowser) return false;
        return 'indexedDB' in window;
    }

    /**
     * Check if fullscreen is supported
     * @static
     * @type {boolean}
     */
    static get hasFullscreen() {
        if (!this.isBrowser) return false;
        return document.fullscreenEnabled || 
               document.webkitFullscreenEnabled || 
               document.mozFullScreenEnabled ||
               document.msFullscreenEnabled;
    }

    /**
     * Check if pointer lock is supported
     * @static
     * @type {boolean}
     */
    static get hasPointerLock() {
        if (!this.isBrowser) return false;
        return 'pointerLockElement' in document;
    }

    /**
     * Get device pixel ratio
     * @static
     * @type {number}
     */
    static get pixelRatio() {
        if (!this.isBrowser) return 1;
        return window.devicePixelRatio || 1;
    }

    /**
     * Get screen width
     * @static
     * @type {number}
     */
    static get screenWidth() {
        if (!this.isBrowser) return 0;
        return window.screen.width;
    }

    /**
     * Get screen height
     * @static
     * @type {number}
     */
    static get screenHeight() {
        if (!this.isBrowser) return 0;
        return window.screen.height;
    }

    /**
     * Get window width
     * @static
     * @type {number}
     */
    static get windowWidth() {
        if (!this.isBrowser) return 0;
        return window.innerWidth;
    }

    /**
     * Get window height
     * @static
     * @type {number}
     */
    static get windowHeight() {
        if (!this.isBrowser) return 0;
        return window.innerHeight;
    }

    /**
     * Get user agent
     * @static
     * @type {string}
     */
    static get userAgent() {
        if (!this.isBrowser) return '';
        return navigator.userAgent;
    }

    /**
     * Get browser language
     * @static
     * @type {string}
     */
    static get language() {
        if (!this.isBrowser) return 'en';
        return navigator.language || 'en';
    }

    /**
     * Check if page is visible
     * @static
     * @type {boolean}
     */
    static get isVisible() {
        if (!this.isBrowser) return true;
        return document.visibilityState === 'visible';
    }

    /**
     * Check if page has focus
     * @static
     * @type {boolean}
     */
    static get hasFocus() {
        if (!this.isBrowser) return true;
        return document.hasFocus();
    }

    /**
     * Check if online
     * @static
     * @type {boolean}
     */
    static get isOnline() {
        if (!this.isBrowser) return true;
        return navigator.onLine;
    }

    /**
     * Get platform name
     * @static
     * @returns {string} Platform identifier
     */
    static getPlatform() {
        if (this.isDeno) return 'deno';
        if (this.isNode) return 'node';
        if (!this.isBrowser) return 'unknown';
        
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('win')) return 'windows';
        if (ua.includes('mac')) return 'macos';
        if (ua.includes('linux')) return 'linux';
        if (ua.includes('android')) return 'android';
        if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
        return 'unknown';
    }

    /**
     * Get browser name
     * @static
     * @returns {string} Browser identifier
     */
    static getBrowser() {
        if (!this.isBrowser) return 'none';
        
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('firefox')) return 'firefox';
        if (ua.includes('edg')) return 'edge';
        if (ua.includes('chrome')) return 'chrome';
        if (ua.includes('safari')) return 'safari';
        if (ua.includes('opera') || ua.includes('opr')) return 'opera';
        return 'unknown';
    }

    /**
     * Get comprehensive device info
     * @static
     * @returns {Object} Device information
     */
    static getDeviceInfo() {
        return {
            platform: this.getPlatform(),
            browser: this.getBrowser(),
            isMobile: this.isMobile,
            isDesktop: this.isDesktop,
            hasTouch: this.hasTouch,
            pixelRatio: this.pixelRatio,
            screenWidth: this.screenWidth,
            screenHeight: this.screenHeight,
            windowWidth: this.windowWidth,
            windowHeight: this.windowHeight,
            language: this.language,
            isOnline: this.isOnline
        };
    }

    /**
     * Get all capabilities
     * @static
     * @returns {Object} Capability flags
     */
    static getCapabilities() {
        return {
            webgl: this.hasWebGL,
            webgl2: this.hasWebGL2,
            webgpu: this.hasWebGPU,
            webaudio: this.hasWebAudio,
            websocket: this.hasWebSocket,
            localstorage: this.hasLocalStorage,
            indexeddb: this.hasIndexedDB,
            fullscreen: this.hasFullscreen,
            pointerlock: this.hasPointerLock,
            gamepad: this.hasGamepad,
            touch: this.hasTouch
        };
    }

    /**
     * Detect and cache capabilities
     * @private
     * @static
     */
    static #detectCapabilities() {
        this.#capabilities = this.getCapabilities();
    }

    /**
     * Log environment info to console
     * @static
     */
    static debug() {
        console.group('Environment');
        console.log('Platform:', this.getPlatform());
        console.log('Browser:', this.getBrowser());
        console.log('Device:', this.getDeviceInfo());
        console.log('Capabilities:', this.getCapabilities());
        console.groupEnd();
    }
}
