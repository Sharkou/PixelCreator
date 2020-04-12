/* Core Modules */
import { Renderer } from '/src/core/renderer.js';
import { Object } from '/src/core/object.js';
import { Camera } from '/src/core/camera.js';
import { Scene } from '/src/core/scene.js';

/* Components */
import { Texture } from '/src/graphics/texture.js';
import { Circle } from '/src/graphics/circle.js';
import { Rect } from '/src/graphics/rect.js';
import { Light } from '/src/graphics/light.js';
import { Map } from '/src/graphics/map.js';
import { Animation } from '/src/anim/animation.js';
import { Animator } from '/src/anim/animator.js';
import { Collider } from '/src/physics/collider.js';

// const socket = io('localhost:3000');

const renderer = new Renderer(window.innerWidth, window.innerHeight);

const scene = new Scene(data.scene.name);

const camera = new Object('Camera',
                          data.camera.x - data.camera.width / 2,
                          data.camera.y - data.camera.height / 2,
                          data.camera.width,
                          data.camera.height)
                          .addComponent(new Camera(data.camera.components.camera.background)
                         );

/* Initialization */
async function init() {

    // Instanciation des objets
    for (let id in data.objects) {
        
        if (data.objects[id].components.camera) {
            continue;
        }

        let obj = new Object();

        obj.copy(data.objects[id]);

        obj.lock = true; // lock the object from editing

        scene.add(obj);
    }

    renderer.init(scene, camera);

    // let circle = new Object('Circle', 100, 100, 20, 20, 0);
    // circle.addComponent(new Circle('#CC8844', 0.6));
    // scene.add(circle);
    // console.log(circle);

    // Network
    // socket.emit('new', scene.objects);

    // socket.on('message', data => {
    //     console.log('receive from server: ' + data);
    // });

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

// Window resized
window.onresize = function() {
    renderer.resize(window.innerWidth, window.innerHeight);
    renderer.init(scene, camera);
};