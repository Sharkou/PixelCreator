import { Scene } from '/src/core/scene.js';

export class Sorter {

    static draggedElement = null;
    static list = document.getElementById('world-list');
    static x_t0 = 0;
    
    /**
     * Attach drag event listeners to an element
     * @static
     * @param {HTMLElement} el - The element to make sortable
     */
    static sort(el) {
        el.addEventListener('dragstart', Sorter.dragStart);
        el.addEventListener('drag', Sorter.drag);
        el.addEventListener('dragenter', Sorter.dragEnter);
        el.addEventListener('dragover', Sorter.dragOver);
        el.addEventListener('dragleave', Sorter.dragLeave);
        el.addEventListener('dragend', Sorter.dragEnd);
        // el.addEventListener('drop', Sorter.drop);
    }
    
    /**
     * Allow drop by preventing default behavior
     * @static
     * @param {DragEvent} e - The drag event
     */
    static allowDrop(e) {
        e.preventDefault();
    }
    
    /**
     * Check if el1 is before el2 in the DOM
     * @static
     * @param {HTMLElement} el1 - First element
     * @param {HTMLElement} el2 - Second element
     * @returns {boolean} True if el1 is before el2
     */
    static isBefore(el1, el2) {
        if (el2 != undefined)
            if (el1.parentNode === el2.parentNode)
                for (var cur = el1.previousSibling; cur; cur = cur.previousSibling)
                    if (cur === el2)
                        return true;
                return false;
    }

    /**
     * Make an element a child of another (wrap)
     * @static
     * @param {HTMLElement} el - The element to wrap
     * @param {HTMLElement} parent - The new parent element
     */
    static wrap(el, parent) {
        if (!el || !parent) return;
        const parentObj = Scene.main.objects[parent.id];
        const obj = Scene.main.objects[el.id];
        if (obj && parentObj) {
            if (!obj.parent && obj.parent != parentObj.id) {
                el.dataset.position = parseInt(parent.dataset?.position) + 1;
                parent.classList?.add('parent');
                parentObj.addChild(Scene.main.objects[el.id]);
                if (!parent.firstChild?.classList.contains('unwrap')) {
                    const i = document.createElement('i');
                    i.classList.add('unwrap');
                    i.classList.add('fas');
                    i.classList.add('fa-sort-down');
                    i.setAttribute('data-content', 'unwrap');
                    parent.insertBefore(i, parent.firstChild);
                }
            }
        }
    }

    /**
     * Remove parent-child relationship (unwrap)
     * @static
     * @param {HTMLElement} el - The child element
     * @param {HTMLElement} parent - The current parent element
     */
    static unwrap(el, parent) {
        if (!el || !parent) return;
        const parentObj = Scene.main.objects[parent.id];
        const obj = Scene.main.objects[el.id];
        if (obj && parentObj) {
            if (obj.parent && obj.parent == parentObj.id) {
                el.dataset.position = parseInt(parent.dataset?.position);
                parent.classList?.remove('parent');
                Scene.main.objects[parent.id].removeChild(Scene.main.objects[el.id]);
                if (parent.firstChild?.classList.contains('unwrap')) {
                    parent.removeChild(parent.firstChild);
                }
            }
        }
    }
    
    /**
     * Handle drag start event
     * @static
     * @param {DragEvent} e - The drag event
     */
    static dragStart(e) {
        // e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text', e.target.id);
        // let img = Scene.objects[e.target.id].img;
        // e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
        // let img = e.target.cloneNode(true);
        // img.style.position = 'absolute';
        // img.style.width = '200px';
        // img.style.top = '0px';
        // img.style.right = '0px';
        // document.body.appendChild(img);
        // e.dataTransfer.setDragImage(img, 0, 0);
        // e.dataTransfer.setDragImage(e.target, 0, 0);
        Sorter.draggedElement = e.target;
        Sorter.x_t0 = e.clientX;
        if (e.target.previousSibling instanceof HTMLElement) {
            Sorter.isChild_t0 = e.target.previousSibling.classList.contains('parent');
        }
    }
    
    static drag(e) {
        const parent = (e.target.previousSibling instanceof HTMLElement) ? e.target.previousSibling : null;
        if (!Sorter.isChild_t0) {
            if (e.clientX > Sorter.x_t0 + 20) {
                Sorter.wrap(e.target, parent);
                // console.log(e.target.previousSibling);
            } else {
                Sorter.unwrap(e.target, parent);
            }
        } else {
            if (e.clientX < Sorter.x_t0) {
                Sorter.unwrap(e.target, parent);
            } else {
                Sorter.wrap(e.target, parent);
            }
        }
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
        
        // Sorter.draggedElement.classList.add('hidden');
        
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