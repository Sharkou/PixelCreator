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
import { Controller } from '/src/physics/controller.js';
import { Rotator } from '/src/physics/rotator.js';

// Add Component Button
document.getElementById('add-property').onclick = function() {    
    document.getElementsByClassName("dropdown-content")[0].classList.toggle("show");
};

// Close the dropdown menu if the user clicks outside of it
document.addEventListener('click', function(event) {
    if (!event.target.matches('#add-property')) {
      
        var dropdowns = document.getElementsByClassName("dropdown-content");
      
        for (var i = 0; i < dropdowns.length; i++) {
        
            let openDropdown = dropdowns[i];
        
            if (openDropdown.classList.contains('show')) {          
                openDropdown.classList.remove('show');
            }
        }
    }
});

document.getElementById('controller').addEventListener('click', e => {

    const component = new Controller();
    const current = Scene.main.current;

    current.addComponent(component);
    window.properties.add(current); // mise à jour des propriétés

    
});

document.getElementById('rotator').addEventListener('click', e => {

    const component = new Rotator();
    const current = Scene.main.current;

    current.addComponent(component);
    window.properties.add(current); // mise à jour des propriétés

    
});