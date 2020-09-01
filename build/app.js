/* Core Modules */
import {
    Renderer,
    Object,
    Scene,
    Camera,
    Component,
    Mouse,
    Keyboard,
    Network
} from 'http://localhost:5501/src/core/mod.js';

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
    let data = await network.connect(scene);
    let objects = data.objects;

    Component.init();

    // Objects instantiating
    for (let id in objects) {

        scene.instanciate(objects[id]);

        // Camera initialization
        if (objects[id].components.camera) {
            // obj.x -= obj.width / 2;
            // obj.y -= obj.height / 2;
            // obj.visible = false;
            camera.copy(objects[id]);
            camera.x -= camera.width / 2;
            camera.y -= camera.height / 2;
        }
    }

    renderer.init(scene, camera);
    // renderer.pause = false;

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

window.onbeforeunload = function() {
    network.disconnect();
};

window.onunload = function() {
    network.disconnect();
};