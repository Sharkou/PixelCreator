import { System } from '/src/core/system.js';
import { Loader } from '/src/core/loader.js';
import { Mouse } from '/src/input/mouse.js';
import { Editor } from '/editor/scripting/editor.js';
import { Component } from '/editor/graph/component.js';

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
// document.getElementById('script').addEventListener('mousedown', function() {

//     let name = 'New Script';
//     let rename = 'New Script';
//     let i = 1;

//     while (Loader.contains(rename)) {
//         rename = name + ' ' + i;
//         i++
//     }

//     name = rename;

//     // let script = new Resource(name, 'js', 'application/javascript');
//     let value = 
// `export default class ${name.replace(/\s/g,'')} {
//     constructor() {
        
//     }
// }`;

//     let script = new File([value], name + '.js', {
//         type: 'application/javascript',
//     });

//     // let script = System.createFile(name + '.js', 'application/javascript', '/', value);
    
//     // console.log(script);

//     Loader.uploadFiles([script]);

//     // Ouverture de l'onglet Script
//     // document.getElementById('script-btn').click();
//     // Editor.setValue(value);
// });

// New Custom Component
document.getElementById('custom').addEventListener('mousedown', function() {
    // let graph = new Graph('Custom Component');
    let component = new Component('Custom Component', 'px');
    // Project.add(component);
    Loader.uploadFiles(component);
});