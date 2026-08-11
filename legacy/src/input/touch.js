export class Touch {

    static touches = [];
    static active = false;
    static position = { x: 0, y: 0 };
    static swiped = false;
    static swipeDirection = '';
    static swipeThreshold = 50;
    static #startPos = { x: 0, y: 0 };
    static #canvas = null;

    /**
     * Initialize touch listeners on a canvas
     * @static
     * @param {HTMLCanvasElement} canvas - The canvas element
     */
    static init(canvas) {
        Touch.#canvas = canvas;

        canvas.addEventListener('touchstart', Touch.#onStart, { passive: false });
        canvas.addEventListener('touchmove', Touch.#onMove, { passive: false });
        canvas.addEventListener('touchend', Touch.#onEnd, { passive: false });
        canvas.addEventListener('touchcancel', Touch.#onEnd, { passive: false });
    }

    /**
     * @static
     * @param {TouchEvent} e
     */
    static #onStart(e) {
        e.preventDefault();
        Touch.active = true;
        Touch.swiped = false;
        Touch.#updateTouches(e.touches);
        if (e.touches.length > 0) {
            const rect = Touch.#canvas.getBoundingClientRect();
            Touch.#startPos.x = e.touches[0].clientX - rect.left;
            Touch.#startPos.y = e.touches[0].clientY - rect.top;
            Touch.position.x = Touch.#startPos.x;
            Touch.position.y = Touch.#startPos.y;
        }
    }

    /**
     * @static
     * @param {TouchEvent} e
     */
    static #onMove(e) {
        e.preventDefault();
        Touch.#updateTouches(e.touches);
        if (e.touches.length > 0) {
            const rect = Touch.#canvas.getBoundingClientRect();
            Touch.position.x = e.touches[0].clientX - rect.left;
            Touch.position.y = e.touches[0].clientY - rect.top;
        }
    }

    /**
     * @static
     * @param {TouchEvent} e
     */
    static #onEnd(e) {
        e.preventDefault();
        Touch.#updateTouches(e.touches);
        if (e.touches.length === 0) {
            Touch.active = false;

            const dx = Touch.position.x - Touch.#startPos.x;
            const dy = Touch.position.y - Touch.#startPos.y;
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
    static #updateTouches(touchList) {
        Touch.touches = [];
        const rect = Touch.#canvas.getBoundingClientRect();
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
