/* Core Modules */
import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';
import { Renderer } from '/src/core/renderer.js';
import { Component } from '/src/core/component.js';
import { Camera } from '/src/core/camera.js';
import { Object } from '/src/core/object.js';
import { Time } from '/src/time/time.js';
import { Performance } from '/src/time/performance.js';
import { Mouse } from '/src/input/mouse.js';
import { Keyboard } from '/src/input/keyboard.js';
import { Network } from '/src/network/network.js';

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
import '/editor/misc/save.js';

/* Initialization data */
const canvas = document.getElementById('wrapper');
const network = new Network('localhost', 80);
const renderer = new Renderer(canvas.clientWidth, canvas.clientHeight, canvas);
const scene = new Scene('Main Scene');
const camera = new Object('Viewport', 0, 0, canvas.clientWidth, canvas.clientHeight)
    .addComponent(new Camera('#272727'));

/* Initialization */
async function init() {

    // Connect to main scene
    let data = await network.init(scene, true);
    let objects = data.objects;

    renderer.init(scene, camera);

    const hierarchy = new Hierarchy('world-list', scene);
    const project = new Project('resources-list', scene);
    const properties = new Properties('properties-list', scene);
    const handler = new Handler(scene, camera, renderer, project);
    const toolbar = new Toolbar(camera);

    Component.init(properties);

    // Objects instantiating
    for (let id in objects) {
        scene.instanciate(objects[id]);
    }    

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
    
    // Calcul des performances
    Performance.update();
    
    // Lancement de la boucle principal
    window.requestAnimationFrame(loop);
    
    renderer.render(scene, camera);

    // Affichage de la règle
    Ruler.active ? Ruler.update(renderer.ctx, Mouse.x, Mouse.y) : false;

    // Affichage de la grille
    Grid.active ? Grid.draw(renderer.ctx) : false;

    // Fin de l'analyse des performances
    Stats.end();

    Time.last = Time.current;
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
// window.renderer = renderer;
// window.camera = camera;
// window.keyboard = Keyboard;
// window.mouse = Mouse;
// window.system = System;
// window.time = Time;
// window.socket = socket;