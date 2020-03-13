import { Stats } from '/editor/lib/stats.min.js';

const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
stats.domElement.id = 'stats';
document.getElementById('wrapper').appendChild(stats.domElement);

const button = document.getElementById('statsBtn');

// Display stats
button.addEventListener('click', () => {
    stats.domElement.classList.toggle('active');
    button.classList.toggle('active');
    /*if (stats.domElement.classList.contains('active')) {
        stats.domElement.classList.remove('active');
        button.classList.remove('active');        
    }
    else {
        stats.domElement.classList.add('active');
        button.classList.add('active');      
    }*/
});

export { stats as Stats };