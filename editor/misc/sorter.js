import { Scene } from '/src/core/scene.js';

export class Sorter {

    static draggedElement = null;
    static list = document.getElementById('world-list');
    
    static sort(el) {
        el.addEventListener('dragstart', Sorter.dragStart);
        el.addEventListener('drag', Sorter.drag);
        el.addEventListener('dragenter', Sorter.dragEnter);
        el.addEventListener('dragover', Sorter.dragOver);
        el.addEventListener('dragleave', Sorter.dragLeave);
        el.addEventListener('dragend', Sorter.dragEnd);
        // el.addEventListener('drop', Sorter.drop);
    }
    
    static allowDrop(e) {
        e.preventDefault();
    }
    
    static isBefore(el1, el2) {
        if (el2 != undefined)
            if (el1.parentNode === el2.parentNode)
                for (var cur = el1.previousSibling; cur; cur = cur.previousSibling)
                    if (cur === el2)
                        return true;
                return false;
    }
    
    static dragStart(e) {
        // e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData('text', e.target.id);
        // var img = Scene.objects[e.target.id].img;
        // e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);        
        Sorter.draggedElement = e.target;
    }
    
    static drag(e) {
        console.log(e.target.offsetWidth);
        console.log(e.offsetX);
    }
    
    static dragEnter(e) {
        e.preventDefault();
        
        if (e.target.tagName === 'LI') {
            if (Sorter.isBefore(Sorter.draggedElement, e.target)) {
                e.target.parentNode.insertBefore(Sorter.draggedElement, e.target);
            }

            else {
                e.target.parentNode.insertBefore(Sorter.draggedElement, e.target.nextSibling);
            }
        }
        else {
            if (Sorter.isBefore(Sorter.draggedElement, e.target.parent)) {
                e.target.parentNode.parentNode.insertBefore(Sorter.draggedElement, e.target.parentNode);
            }

            else {
                if (e.target != undefined)
                    e.target.parentNode.parentNode.insertBefore(Sorter.draggedElement, e.target.parentNode.nextSibling);
            }
        }
    }
    
    static dragOver(e) {
        e.preventDefault();
        
        //Sorter.draggedElement.classList.add('hidden');
        
        if (e.target.tagName === 'LI') {
            e.target.classList.add('hidden');
        }
        else {
            e.target.parentNode.classList.add('hidden');
        }
    }
    
    static dragLeave(e) {
        if (e.target.tagName === 'LI') {
            e.target.classList.remove('hidden');
        }
    }
    
    static dragEnd(e) {
        let nodes = Sorter.list.getElementsByClassName('hidden');
        for (let i = 0, l = nodes.length; i < l; i++) {
            nodes[i].classList.remove('hidden');
        }
        Sorter.draggedElement = null;
    }
    
    static drop(e) {
        e.preventDefault();        
        
        if (e.target.tagName === 'LI') {
            if (Sorter.isBefore(Sorter.draggedElement, e.target)) {
                e.target.parentNode.insertBefore(Sorter.draggedElement, e.target);
            }

            else {
                e.target.parentNode.insertBefore(Sorter.draggedElement, e.target.nextSibling);
            }
        }
        else {
            if (Sorter.isBefore(Sorter.draggedElement, e.target.parent)) {
                e.target.parentNode.parentNode.insertBefore(Sorter.draggedElement, e.target.parentNode);
            }

            else {
                e.target.parentNode.parentNode.insertBefore(Sorter.draggedElement, e.parentNode.target.nextSibling);
            }
        }
    }
}