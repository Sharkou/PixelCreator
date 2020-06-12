/** 
 * Classe statique permettant de gérer le drag & drop
 */
export class Dnd {

    /* Propriétés statiques de la classe */
    static draggedElement = null; // élément en cours de déplacement
    static drag = false;
    static move = false;
    static hovering = false;
    static resize = false;
    
    /**
     * Change le curseur
     * @param {string} cursor - The cursor
     */
    static setCursor(cursor) {
        document.body.style.setProperty('cursor', '-webkit-' + cursor);
        document.body.style.setProperty('cursor', cursor);
    }
    
    /**
     * Applique un événement 'dragstart' sur l'élément
     * @param {Element} el - The HTML Element
     */
    static applyDragEvents(el) {
        
        // On stoppe la propagation de l'événement pour empêcher la zone de drop d'agir
        el.addEventListener('drop', function(e) {
            e.stopPropagation();
        });
        
        // L'élément devient déplaçable
        el.draggable = true;

        // Au drag de l'élément
        el.addEventListener('dragstart', function(e) {            
            Dnd.draggedElement = e.target; // On sauvegarde l'élément en cours de déplacement
            e.dataTransfer.setData('text/plain', ''); // Nécessaire pour Firefox
        });
        
        /*el.addEventListener('dragend', function(e) {
            
        });*/
    }
    
    /**
     * Applique un événement 'drop' sur l'élément
     * @param {Element} el - The HTML Element
     */
    static applyDropEvents(el) {
        
        // Au survol de l'élément
        el.addEventListener('dragover', function(e) {
            e.preventDefault(); // On autorise le drop d'éléments
            this.classList.add('drop_hover'); // On ajoute une classe
        });
        
        // Lorsqu'on quitte la zone de l'élément
        el.addEventListener('dragleave', function() {
            this.classList.remove('drop_hover'); // On supprime la classe
        });
        
        // Lorsqu'on dépose l'élément
        el.addEventListener('drop', function(e) {

            // Stockage de l'élément déposé
            var target = e.currentTarget;
                
            // Récupération de l'élément concerné
            var draggedElement = Dnd.draggedElement;
            var clone = draggedElement.cloneNode(true);

            e.target.classList.remove('drop_hover');

            clone = e.target.appendChild(clone);
            console.log(clone);
            Dnd.applyDragEvents(clone);

            // Suppression de l'élément d'origine
            draggedElement.parentNode.removeChild(draggedElement);

        });
        
    }
    
    /**
     * Mise à jour du curseur
     */
    static update() {
        if (this.resize) {
            if (this.resize == 'right' || this.resize == 'left') {
                this.setCursor('ew-resize');
            }
            else if (this.resize == 'bottom' || this.resize == 'top') {
                this.setCursor('ns-resize');
            }
            else if (this.resize == 'right-top' || this.resize == 'left-bottom') {
                this.setCursor('nesw-resize');
            }
            else
            {
                this.setCursor('nwse-resize');
            }
            
        }
        else if (this.drag) {
            if (this.hovering) {
                this.setCursor('grabbing');
            }
        }
        else if (this.hovering) {
            this.setCursor('grab')
        }
        else {
            this.setCursor('default');        
        }

        this.hovering = false;
        this.resize = false;
    }
}

document.addEventListener('mousedown', function(e) {
    Dnd.drag = true;
});

document.addEventListener('mouseup', function(e) {
    Dnd.drag = false;
});

/** 
 * Détecte le mouvement de la souris
 */
(function() {
    var thread;
    
    document.addEventListener('mousemove', function(e) {
        Dnd.move = true;
        
        if (thread) {
            clearTimeout(thread);
        }
        
        // on mouse stop
        thread = setTimeout(function() {
            Dnd.move = false;
        }, 100);
    });
})();