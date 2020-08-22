import { Scene } from '/src/core/scene.js';

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