export class Tilemap {

    /**
     * Tile-based collision and rendering system for platformer levels
     * @param {number} tileSize - Size of each tile in pixels
     * @param {number} cols - Number of columns
     * @param {number} rows - Number of rows
     */
    constructor(tileSize = 16, cols = 0, rows = 0) {
        this.tileSize = tileSize;
        this.cols = cols;
        this.rows = rows;
        this.data = [];
        this.tileColors = {};
    }

    init(cols, rows, fill = 0) {
        this.cols = cols;
        this.rows = rows;
        this.data = new Array(cols * rows).fill(fill);
    }

    get(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 1;
        return this.data[row * this.cols + col];
    }

    set(col, row, value) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
        this.data[row * this.cols + col] = value;
    }

    isSolid(col, row) {
        return this.get(col, row) > 0;
    }

    worldToCol(x) {
        return Math.floor(x / this.tileSize);
    }

    worldToRow(y) {
        return Math.floor(y / this.tileSize);
    }

    /**
     * Resolve collisions between a Body and the tilemap
     * @param {Object} obj - The game object with x, y, width, height
     * @param {Body} body - The Body component
     */
    resolveCollisions(obj, body) {
        const ts = this.tileSize;
        const hw = obj.width / 2;
        const hh = obj.height / 2;

        body.grounded = false;

        // Horizontal resolution
        const left = this.worldToCol(obj.x - hw);
        const right = this.worldToCol(obj.x + hw - 1);
        const topH = this.worldToRow(obj.y - hh + 1);
        const bottomH = this.worldToRow(obj.y + hh - 2);

        for (let row = topH; row <= bottomH; row++) {
            // Moving right
            if (body.vx > 0 && this.isSolid(right, row)) {
                obj.x = right * ts - hw;
                body.vx = -body.vx * body.bounce;
                break;
            }
            // Moving left
            if (body.vx < 0 && this.isSolid(left, row)) {
                obj.x = (left + 1) * ts + hw;
                body.vx = -body.vx * body.bounce;
                break;
            }
        }

        // Vertical resolution
        const leftV = this.worldToCol(obj.x - hw + 1);
        const rightV = this.worldToCol(obj.x + hw - 2);
        const top = this.worldToRow(obj.y - hh);
        const bottom = this.worldToRow(obj.y + hh - 1);

        for (let col = leftV; col <= rightV; col++) {
            // Falling down
            if (body.vy > 0 && this.isSolid(col, bottom)) {
                obj.y = bottom * ts - hh;
                body.vy = -body.vy * body.bounce;
                if (body.vy > -1) body.vy = 0;
                body.grounded = true;
                break;
            }
            // Moving up
            if (body.vy < 0 && this.isSolid(col, top)) {
                obj.y = (top + 1) * ts + hh;
                body.vy = 0;
                break;
            }
        }
    }

    /**
     * Draw visible tiles
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {object} camera - Camera with x, y, width, height, scale
     */
    draw(ctx, camera) {
        const ts = this.tileSize;
        const startCol = Math.max(0, Math.floor(camera.x / ts) - 1);
        const endCol = Math.min(this.cols, Math.ceil((camera.x + camera.width / camera.scale) / ts) + 1);
        const startRow = Math.max(0, Math.floor(camera.y / ts) - 1);
        const endRow = Math.min(this.rows, Math.ceil((camera.y + camera.height / camera.scale) / ts) + 1);

        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
                const tile = this.get(col, row);
                if (tile > 0) {
                    const color = this.tileColors[tile] || '#555';
                    ctx.fillStyle = color;
                    ctx.fillRect(col * ts, row * ts, ts, ts);

                    // Draw subtle border for depth
                    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(col * ts, row * ts, ts, ts);
                }
            }
        }
    }
}
