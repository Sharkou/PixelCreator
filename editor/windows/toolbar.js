import { Object } from '/src/core/object.js';
import { Circle } from '/src/graphics/circle.js';
import { Rect } from '/src/graphics/rect.js';
import { Light } from '/src/graphics/light.js';

export class Toolbar {

    // static node = document.getElementById('toolbar');
    // static current = 'Selection';

    /**
     * Initialize toolbar
     * @constructor
     */
    constructor() {
        const tools = document.getElementsByClassName('tool');
        const width = 40;
        const height = 40;

        // Parcourt l'ensemble des outils pour leur attribuer une image de drag
        for (let tool of tools) {
            
            /*tool.addEventListener('click', () => {
                Toolbar.changeCurrent(tool);
            });*/
            
            let obj = new Object('Empty', 0, 0, width, height);
            
            switch (tool.id) {
                case 'Circle':
                    obj.addComponent(new Circle('#CC8844', 0.4));
                    break;

                case 'Rectangle':
                    obj.addComponent(new Rect('#CC8844', 0.4));
                    break;

                case 'Light':
                    obj.addComponent(new Light());
                    break;

                case 'Particle':
                    break;
            }
            
            obj.createImage();
            
            tool.addEventListener('dragstart', function(e) {
                e.dataTransfer.setData('text', e.target.id);
                e.dataTransfer.setDragImage(obj.image, width / 2, height / 2);
            });
        }
    }
    
    /**
     * Sélectionne un autre outil.
     * @param {Element} el - L'élément à sélectionner.
     */
    changeCurrent(el) {
        let tools = document.getElementsByClassName('tool');
        
        // Suppression des outils actifs
        for (var i = 0; i < tools.length; i++) {
            tools[i].classList.remove('active');
        }
        el.classList.add('active');
        this.current = el.id;
    }
}