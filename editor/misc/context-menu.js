import { Mouse } from '/src/input/mouse.js';
import { Project } from '/editor/windows/project.js';

// Disable right mouse click
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

document.getElementById('resources-list').addEventListener('contextmenu', function(e) {
    var contextmenu = document.getElementsByClassName('context-menu')[0];
    contextmenu.classList.toggle('show');
    contextmenu.style.top = Mouse.editor.y + 'px';
    contextmenu.style.left = Mouse.editor.x + 'px';
});

// Close the dropdown menu if the user clicks outside of it
document.addEventListener('click', function(event) {
      
    var contextmenus = document.getElementsByClassName('context-menu');
      
    for (var i = 0; i < contextmenus.length; i++) {
        
      var contextmenu = contextmenus[i];
        
      if (contextmenu.classList.contains('show')) {
          
        contextmenu.classList.remove('show');
          
      }
        
    }
    
});

// New Script
document.getElementById('script').addEventListener('click', function() {
    
    var script = new Script('New Script', 'js', null);    
    
    // Code.getDoc().setValue(code);
    
    // Ouverture de l'onglet Code
    // document.getElementById('code-btn').click();
    // Code.refresh();
});

window.updateScript = function(id, code) {
    let script = Project.resources[id];
    script.data = Compiler.compile(code);
    Compiler.update(script);
};