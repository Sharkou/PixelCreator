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
// import { Editor } from '/editor/scripting/editor.js'
import { Toolbar } from '/editor/windows/toolbar.js';
import { Graph } from '/editor/graph/graph.js';
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

/* Online mode: set to true to connect to the remote server */
const online = false;

/* Engine initialization */
const host = 'apps.pixelcreator.io';
const port = 443;
const canvas = document.getElementById('wrapper');
const renderer = new Renderer(canvas.clientWidth, canvas.clientHeight, canvas, false, true);
const scene = new Scene('Main Scene');
const camera = new Object('Viewport', 0, 0, canvas.clientWidth, canvas.clientHeight);
camera.addComponent(new Camera('#272727'));

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

    let files = null;
    let objects = null;

    if (online) {
        try {
            // Download project resources
            files = await Loader.download(`https://${host}:${port}`);

            // Connect to main scene
            objects = await Network.init(host, port).connect(scene, true);
        } catch (err) {
            console.warn('Failed to connect to server, running in offline mode.');
            console.warn(err);
        }
    }

    // Scene initialization
    project.init(files);
    scene.init(objects || {});
    renderer.init(scene, camera);

    // Remove loading state
    for (let el of document.querySelectorAll('.loading')) {
        el.classList.remove('loading');
    }
    document.getElementById('loading')?.classList.add('hidden');

    // Start loop
    loop();
}

/* Main loop */
async function loop() {

    // Performance analysis
    Stats.begin();
    
    // Update cursor
    Dnd.update();

    // Delta-time calculation
    Time.deltaTime = (Time.now() - Time.last) / (1000 / 60);
    
    // Performance metrics
    Performance.update();
    
    // Main loop
    window.requestAnimationFrame(loop);
    
    renderer.render(scene, camera);

    // Ruler display
    Ruler.active ? Ruler.update(renderer.ctx, Mouse.x, Mouse.y) : false;

    // Grid display
    Grid.active ? Grid.draw(renderer.ctx) : false;

    // Fin de l'analyse des performances
    Stats.end();

    Time.last = Time.current;
}

// Initialize on load
window.onload = init;

// Window resized
window.onresize = function() {
    // Editor.resize();
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
    // renderer.init(scene, camera);
};

window.onbeforeunload = function(e) {
    // Warn the user before leaving the page
    // e.preventDefault();
    // e.returnValue = '';
};

window.addEventListener('pagehide', e => {
    // This event is fired when the page is being unloaded or put into the bfcache
    // TODO: Use sendBeacon to ensure the request is sent even during page teardown
    // Example: navigator.sendBeacon('/api/disconnect');
    if (online) Network.disconnect();
});

/* Debug */
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
    hierarchy as Hierarchy,
    project as Project,
    properties as Properties,
    manager as Manager,
    handler as Handler,
    toolbar as Toolbar,
    graph as Graph
};