import { Mouse } from '/src/input/mouse.js';
import { Component } from '/editor/blueprint/component.js';
import { Project } from '/app.js';

// Disable right mouse click
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

document.getElementById('resources-list').addEventListener('contextmenu', function(e) {
    let contextmenu = document.getElementsByClassName('context-menu')[0];
    contextmenu.classList.toggle('show');
    let y = Mouse.editor.y;
    let x = Mouse.editor.x;
    let height = contextmenu.offsetHeight;
    if (y + height > window.innerHeight) {
        contextmenu.style.top = y - height + 'px';
        contextmenu.style.left = x + 'px';
    } else {
        contextmenu.style.top = y + 'px';
        contextmenu.style.left = x + 'px';
    }
});

// Close the dropdown menu if the user clicks outside of it
document.addEventListener('mousedown', function(event) {

    let contextmenus = document.getElementsByClassName('context-menu');

    for (var i = 0; i < contextmenus.length; i++) {

        let contextmenu = contextmenus[i];

        if (contextmenu.classList.contains('show')) {
            contextmenu.classList.remove('show');
        }
    }
});

// New Script
document.getElementById('script').addEventListener('mousedown', function() {

    var script = new Script('New Script', 'js', null);

    // Code.getDoc().setValue(code);

    // Ouverture de l'onglet Code
    // document.getElementById('code-btn').click();
    // Code.refresh();
});

// New Custom Component
document.getElementById('custom').addEventListener('mousedown', function() {
    // let graph = new Graph('Custom Component');
    let component = new Component('Custom Component', 'px');
    // Project.addResource(component);
    Project.uploadFiles(component);
});