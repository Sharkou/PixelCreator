import { Mouse } from '/src/input/mouse.js';

export class Collab {

    /** @type {Array<{name: string, x: number, y: number}>} Connected collaborators */
    static friends = [];
    
    /** @type {{name: string, x: number, y: number}} Local user cursor */
    static me = {
        name: '',
        x: 0,
        y: 0
    };
    
    /** @type {HTMLCanvasElement|null} Collaboration overlay canvas */
    static canvas = null;
    
    /** @type {CanvasRenderingContext2D|null} Canvas 2D context */
    static ctx = null;
    
    /** @type {string} Cursor dot color */
    static color = 'rgba(240, 220, 220, 0.5)';

    /**
     * Initialize the collaboration overlay
     * @param {string} canvasId - The canvas element ID
     */
    static init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.position = 'absolute';
        this.canvas.style.zIndex = '10';
        this.canvas.style.pointerEvents = 'none';

        this.friends.push(this.me);
    }

    /**
     * Draw all collaborator cursors
     */
    static draw() {
        if (!this.ctx) return;
        this.clear();
        this.ctx.beginPath();
        for (const friend of this.friends) {
            this.ctx.arc(friend.x, friend.y, 5, 0, 2 * Math.PI);
        }
        this.ctx.fillStyle = this.color;
        this.ctx.fill();
    }
    
    /**
     * Clear the collaboration canvas
     */
    static clear() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Update local cursor position
     * @param {number} x - Mouse X position
     * @param {number} y - Mouse Y position
     */
    static updateCursor(x, y) {
        this.me.x = x;
        this.me.y = y;
    }
}

Sorter.sort(last);

socket.on('updateName', function(s) {
    s = s.split('-');
    Scene.objects[s[0]].name = s[1];
});