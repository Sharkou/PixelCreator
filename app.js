/* Core Modules */
import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';
import { Renderer } from '/src/core/renderer.js';
import { Camera } from '/src/core/camera.js';
import { Object } from '/src/core/object.js';
import { Loader } from '/src/core/loader.js';
import { Time } from '/src/time/time.js';
import { Performance } from '/src/time/performance.js';
import { Mouse } from '/src/input/mouse.js';
import { Keyboard } from '/src/input/keyboard.js';
import { Network } from '/src/network/network.js';

/* Editor Modules */
import { Manager } from '/editor/system/manager.js';
import { Handler } from '/editor/system/handler.js';
import { Dnd } from '/editor/system/dnd.js';
import { Hierarchy } from '/editor/windows/hierarchy.js';
import { Properties } from '/editor/windows/properties.js';
import { Project } from '/editor/windows/project.js';
import { Toolbar } from '/editor/windows/toolbar.js';
import { Graph } from '/editor/blueprint/graph.js';
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
import '/editor/misc/pause.js';
import '/editor/misc/save.js';

/* Engine initialization */
const host = 'localhost'; // 'apps.pixelcreator.io';
const port = 443;
const canvas = document.getElementById('wrapper');
const renderer = new Renderer(canvas.clientWidth, canvas.clientHeight, canvas, false, true);
const scene = new Scene('Main Scene');
const camera = new Object('Viewport', 0, 0, canvas.clientWidth, canvas.clientHeight).addComponent(new Camera('#272727'));

/* Editor initialization */
const hierarchy = new Hierarchy('world-list', scene);
const project = new Project('resources-list', scene);
const properties = new Properties('properties-list', scene);
const manager = new Manager(properties); // components manager
const handler = new Handler(scene, camera, renderer, project);
const toolbar = new Toolbar(camera);
const graph = new Graph();

/* Initialization */
async function init() {

    // Load plugins
    // const plugins = await fetch(`https://${host}/plugins`)
    //     .then(res => res.json())
    //     .then(json => json)

    // for (const plugin of plugins.names) {
    //     Loader.import(plugin);
    // }

    // Download project resources
    let resources = await Loader.download(`https://${host}:${port}`);

    // console.log(resources);

    // Connect to main scene
    let objects = await Network.init(host, port).connect(scene, true);

    // console.log(objects);

    // Scene initialization
    project.init(resources);
    scene.init(objects);
    renderer.init(scene, camera);

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

window.onbeforeunload = function(e) {
    Network.disconnect();
};

window.onunload = function(e) {
    Network.disconnect();
};

// Debug
window.scene = scene;
window.project = project;
window.loader = Loader;
// window.renderer = renderer;
// window.camera = camera;
// window.keyboard = Keyboard;
// window.mouse = Mouse;
// window.system = System;
// window.time = Time;
// window.socket = socket;

export {
    renderer as Renderer,
    scene as Scene,
    camera as Camera,
    hierarchy as Hiearchy,
    project as Project,
    properties as Properties,
    manager as Manager,
    handler as Handler,
    toolbar as Toolbar,
    graph as Graph
};