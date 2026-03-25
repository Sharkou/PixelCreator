export class Touch {

    /**
     * Manage touch input for mobile devices
     * @constructor
     */
    constructor() {}

    /** @type {Array} Active touches */
    static touches = [];

    /** @type {boolean} Whether any touch is active */
    static active = false;

    /** @type {{x: number, y: number}} Position of the primary touch */
    static position = { x: 0, y: 0 };

    /** @type {boolean} Whether a swipe was just detected */
    static swiped = false;

    /** @type {string} Direction of last swipe */
    static swipeDirection = '';

    /** @type {{x: number, y: number}} Start position of current touch */
    static _startPos = { x: 0, y: 0 };

    /** @type {number} Minimum distance for swipe detection */
    static swipeThreshold = 50;

    /**
     * Initialize touch listeners on a canvas
     * @static
     * @param {HTMLCanvasElement} canvas - The canvas element
     */
    static init(canvas) {
        Touch._canvas = canvas;

        canvas.addEventListener('touchstart', Touch._onStart, { passive: false });
        canvas.addEventListener('touchmove', Touch._onMove, { passive: false });
        canvas.addEventListener('touchend', Touch._onEnd, { passive: false });
        canvas.addEventListener('touchcancel', Touch._onEnd, { passive: false });
    }

    /**
     * @static
     * @param {TouchEvent} e
     */
    static _onStart(e) {
        e.preventDefault();
        Touch.active = true;
        Touch.swiped = false;
        Touch._updateTouches(e.touches);
        if (e.touches.length > 0) {
            const rect = Touch._canvas.getBoundingClientRect();
            Touch._startPos.x = e.touches[0].clientX - rect.left;
            Touch._startPos.y = e.touches[0].clientY - rect.top;
            Touch.position.x = Touch._startPos.x;
            Touch.position.y = Touch._startPos.y;
        }
    }

    /**
     * @static
     * @param {TouchEvent} e
     */
    static _onMove(e) {
        e.preventDefault();
        Touch._updateTouches(e.touches);
        if (e.touches.length > 0) {
            const rect = Touch._canvas.getBoundingClientRect();
            Touch.position.x = e.touches[0].clientX - rect.left;
            Touch.position.y = e.touches[0].clientY - rect.top;
        }
    }

    /**
     * @static
     * @param {TouchEvent} e
     */
    static _onEnd(e) {
        e.preventDefault();
        Touch._updateTouches(e.touches);
        if (e.touches.length === 0) {
            Touch.active = false;

            // Swipe detection
            const dx = Touch.position.x - Touch._startPos.x;
            const dy = Touch.position.y - Touch._startPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= Touch.swipeThreshold) {
                Touch.swiped = true;
                if (Math.abs(dx) > Math.abs(dy)) {
                    Touch.swipeDirection = dx > 0 ? 'right' : 'left';
                } else {
                    Touch.swipeDirection = dy > 0 ? 'down' : 'up';
                }
            }
        }
    }

    /**
     * @static
     * @param {TouchList} touchList
     */
    static _updateTouches(touchList) {
        Touch.touches = [];
        const rect = Touch._canvas.getBoundingClientRect();
        for (let i = 0; i < touchList.length; i++) {
            Touch.touches.push({
                id: touchList[i].identifier,
                x: touchList[i].clientX - rect.left,
                y: touchList[i].clientY - rect.top
            });
        }
    }

    /**
     * Reset per-frame states (call at end of frame)
     * @static
     */
    static reset() {
        Touch.swiped = false;
        Touch.swipeDirection = '';
    }
}
