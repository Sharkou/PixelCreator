import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';

export class Ruler {

    static rulerOffset = 45;
    static spacing = 40;
    static active = true;

    static update(ctx, x, y) {

        const camera = Camera.main;
        
        // Cursor
        ctx.strokeStyle = '#339af0';
        ctx.fillStyle = '#339af0';
        // ctx.font = "bold 11px 'Work Sans'";
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.lineWidth = 2;

        // Top Ruler Cursor
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 10);
        ctx.stroke();

        const xPos = ~~(x / camera.scale + camera.x);
        const yPos = ~~(y / camera.scale + camera.y);

        // Add 'x' Text
        ctx.fillText(xPos + 'px', x, 25);

        // Left Ruler Cursor
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(10, y);
        ctx.stroke();

        // Add 'y' Text
        ctx.fillText(yPos + 'px', 33, y + 3);
        
        // Ruler
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = "11px 'Work Sans'";
        ctx.lineWidth = 2;

        ctx.beginPath();

        // Draw Ruler graduations
        /*
        for (var i = -3000; i < 3000; i += this.spacing) {
            // ctx.save();

            // if (i - camera.x >= 0) {
                // Right graduations
                ctx.moveTo(i - camera.x * camera.scale, 0);
                ctx.lineTo(i - camera.x * camera.scale, 5);
            
                // Left graduations
                ctx.moveTo(0, i - camera.y * camera.scale);
                ctx.lineTo(5, i - camera.y * camera.scale);

                // Add Text
                // ctx.translate(i - camera.x, 0);
                // ctx.rotate(-0.5 * Math.PI);
                // ctx.fillText(i, 0, 20);
            // }

            // ctx.restore();
        }
        */

        // Top Line
        /*this.ctx.moveTo(40, 40);
        this.ctx.lineTo(this.width, 40);*/

        ctx.stroke();
    }

    static resize() {
        this.top.width = Scene.width;
        this.top.height = rulerOffset;

        this.left.width = rulerOffset;
        this.left.height = Scene.height;

        this.create();
    }
}

const button = document.getElementById('rulerBtn');

// Display ruler
button.addEventListener('click', () => {
    Ruler.active = !Ruler.active;
    button.classList.toggle('active');
});