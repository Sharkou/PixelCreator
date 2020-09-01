import { Renderer } from '/src/core/renderer.js';
import { System } from '/src/core/system.js';

document.getElementById('pause').addEventListener('click', function() {
    const el = document.getElementById('pause');
    const renderer = Renderer.main;
    const pause = !renderer.pause;
    renderer.pause = pause;
    System.dispatchEvent('pause', pause);
    el.classList.toggle('active');
});