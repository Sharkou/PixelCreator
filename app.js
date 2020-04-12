/* Core Modules */
import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';
import { Renderer } from '/src/core/renderer.js';
import { Camera } from '/src/core/camera.js';
import { Object } from '/src/core/object.js';
import { Time } from '/src/time/time.js';
import { Performance } from '/src/time/performance.js';
import { Mouse } from '/src/input/mouse.js';
import { Keyboard } from '/src/input/keyboard.js';
// import { Socket } from '/src/network/socket.js';
// import { Room } from '/src/network/room.js';

/* Components */
import { Texture } from '/src/graphics/texture.js';
import { Circle } from '/src/graphics/circle.js';
import { Rect } from '/src/graphics/rect.js';
import { Light } from '/src/graphics/light.js';
import { Map } from '/src/graphics/map.js';
import { Animation } from '/src/anim/animation.js';
import { Animator } from '/src/anim/animator.js';
import { Collider } from '/src/physics/collider.js';

/* Editor Modules */
import { Handler } from '/editor/system/handler.js';
import { Hierarchy } from '/editor/windows/hierarchy.js';
import { Properties } from '/editor/windows/properties.js';
import { Project } from '/editor/windows/project.js';
import { Toolbar } from '/editor/windows/toolbar.js';
import { Dnd } from '/editor/system/dnd.js';
import { Grid } from '/editor/misc/grid.js';
import { Ruler } from '/editor/misc/ruler.js';
import { Stats } from '/editor/misc/stats.js';

/* Editor Miscellaneous */
import '/editor/misc/tabs.js';
import '/editor/misc/tree.js';
import '/editor/misc/dropdown.js';
import '/editor/misc/select.js';
import '/editor/misc/context-menu.js';
import '/editor/misc/filter.js';
import '/editor/misc/fullscreen.js';
import '/editor/misc/shortcut.js';
import '/editor/misc/play.js';

const canvas = document.getElementById('wrapper');

const renderer = new Renderer(canvas.clientWidth, canvas.clientHeight, canvas);

const scene = new Scene('Main Scene');

const camera = new Object('Viewport', 0, 0, canvas.clientWidth, canvas.clientHeight).addComponent(new Camera('#272727'));

// const socket = new Socket();
// const room = new Room(socket);

/* Initialization */
async function init() {
    
    renderer.init(scene, camera);
    
    const hierarchy = new Hierarchy('world-list', scene);
    const project = new Project('resources-list', scene);
    const properties = new Properties('properties-list', scene);
    const handler = new Handler(scene, camera, renderer, project);
    const toolbar = new Toolbar();

    // Start loop
    loop();
}

/* Main loop */
async function loop() {

    // Analyse des performances
    Stats.begin();
    
    // Changement du curseur
    Dnd.update();

    // Calcul du delta-time
    Time.deltaTime = (Time.now() - Time.last) / (1000 / 60);
    Time.last = Time.current;
    
    // Calcul des performances
    Performance.update();
    
    // Lancement de la boucle principal
    window.requestAnimationFrame(loop);
    
    renderer.render(scene, camera);

    // Affichage de la règle
    // Ruler.active ? Ruler.update(renderer.ctx, Mouse.x, Mouse.y) : false;

    // Affichage de la grille
    Grid.active ? Grid.draw(renderer.ctx) : false;

    // Fin de l'analyse des performances
    Stats.end();
}

// Initialize on load
window.onload = init;

// Window resized
window.onresize = function() {
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
    // renderer.init(scene, camera);
};

// Debug
window.scene = scene;
window.renderer = renderer;
window.camera = camera;
window.keyboard = Keyboard;
window.mouse = Mouse;
window.system = System;
window.time = Time;