import { Network } from '/src/network/network.js';

// Save project
document.getElementById('save').addEventListener('click', function() {
    Network.save();
    console.log('Project saved!');
});