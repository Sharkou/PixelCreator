import { Network } from '/src/network/network.js';
import { Scene } from '/src/core/scene.js';

document.getElementById('play').addEventListener('click', function() {

    if (!Scene.main.camera) {
        console.error('Camera is not defined');
        return;
    }
    
    const scene = Scene.main;
    const camera = scene.camera;
    const width = camera.width;
    const height = camera.height;
    const centerX = window.innerWidth / 2 + window.screenLeft - width / 2;
    const centerY = window.innerHeight / 2 + window.screenTop - height / 2;
    
    const app = window.open(
        '/build/',
        '_blank',
        `directories=no,fullscreen=yes,titlebar=no,scrollbars=no,toolbar=no,location=no,status=yes,menubar=no,scrollbars=no,resizable=yes,top=${centerY},left=${centerX},width=${width},height=${height},innerHeight=${height + 1}`);

    // app.resizeBy(0, height - app.innerHeight);
    
    app.data = {
        host: Network.host,
        port: Network.port
    };
});