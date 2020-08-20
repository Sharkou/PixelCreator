/* Core Modules */
import { Renderer } from '/src/core/renderer.js';
import { Object } from '/src/core/object.js';
import { Camera } from '/src/core/camera.js';
import { Scene } from '/src/core/scene.js';
import { Mouse } from '/src/input/mouse.js';
import { Keyboard } from '/src/input/keyboard.js';
import { Network } from '/src/network/network.js';
import { Texture } from '/src/graphics/texture.js';
import { Circle } from '/src/graphics/circle.js';
import { Rect } from '/src/graphics/rect.js';
import { Light } from '/src/graphics/light.js';
import { Map } from '/src/graphics/map.js';
import { Animation } from '/src/anim/animation.js';
import { Animator } from '/src/anim/animator.js';
import { Collider } from '/src/physics/collider.js';
import { Controller } from '/src/physics/controller.js';
import { Rotator } from '/src/physics/rotator.js';

// Get project ID
// const id = app.dataset ? app.dataset['id'] : null;
// console.log(`id: ${id}`);

const app = document.getElementById('app');
const network = new Network('localhost', 80);
const renderer = new Renderer(window.innerWidth, window.innerHeight);

let scene = new Scene('Main Scene');
let camera = new Object();

/* Initialization */
async function init() {

    // Connect to main scene
    let data = await network.init(scene);
    let objects = data.objects;

    // Objects instantiating
    for (let id in objects) {

        scene.instanciate(objects[id]);

        // Camera initialization
        if (objects[id].components.camera) {
            // obj.x -= obj.width / 2;
            // obj.y -= obj.height / 2;
            // obj.visible = false;
            camera = objects[id];
            camera.x -= camera.width / 2;
            camera.y -= camera.height / 2;
        }
    }

    renderer.init(scene, camera);
    renderer.pause = false;

    // Start loop
    loop();
}

/* Game loop */
async function loop() {    
    window.requestAnimationFrame(loop);    
    renderer.render(scene, camera);
}

// Initialize on load
window.onload = init;

//  Window resized
window.onresize = function() {
    renderer.resize(window.innerWidth, window.innerHeight);
    renderer.init(scene, camera);
};