import { Network } from '/src/network/network.js';

document.getElementById('sync').addEventListener('click', function() {
    // System.dispatchEvent('heartbeat');
    const el = document.getElementById('sync');
    el.classList.toggle('active');
    const network = Network.main;
    network.inspector = !network.inspector;
});