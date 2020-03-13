// Get objects of the scene
var elements = document.getElementsByClassName('object');

for (var i = 0; i < elements.length; i++) {
    
    elements[i].addEventListener("click", function() {
        // this.classList.toggle('active');
        
        var childs = this.lastChild; // list of childs
        var icon = this.firstChild; // arrow
        
        if (childs.style.maxHeight) {
            childs.style.maxHeight = null;
            childs.style.paddingTop = '0px';
            icon.style.transform = 'rotate(0deg)';
        }
        
        else {
            childs.style.maxHeight = childs.scrollHeight + "px";
            childs.style.paddingTop = '7px';
            icon.style.transform = 'rotate(90deg)';
        }
    });
}