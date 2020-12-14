import { Network } from '/src/network/network.js';

const popup = document.getElementById('save-popup');

// Save project
document.getElementById('save').addEventListener('click', function() {
    Network.save();
    console.log('Project saved!');
    popup.classList.add('active');
    setTimeout(function(popup) {
        popup.classList.remove('active');
    }, 4000, popup);
});