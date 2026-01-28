import { Editor } from '/editor/scripting/editor.js';

/**
 * Open a tab in a tabbed interface
 * Hides all other tabs and shows the selected one
 * @param {Event} e - The click event
 * @param {string} id - The ID of the tab content to show
 * @param {string} parentID - The ID of the parent tab container
 */
export default function openTab(e, id, parentID) {
    
    // Declare all variables
    var i, tabcontent, tablinks;
    const parentElement = document.getElementById(parentID);

    // Get all elements with class="tabcontent" and hide them
    var tabs = parentElement.getElementsByClassName('tab-content');
    for (i = 0; i < tabs.length; i++) {
        tabs[i].style.display = 'none';
    }

    // Get all elements with class="tablinks" and remove the class "active"
    tablinks = parentElement.getElementsByClassName('tab-link');
    for (i = 0; i < tablinks.length; i++) {
        // tablinks[i].className = tablinks[i].className.replace('active', '');
        tablinks[i].classList.remove('active');
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(id).style.display = 'block';
    // e.currentTarget.className += ' active';
    e.currentTarget.classList.add('active');
}

document.getElementById('scene-btn').addEventListener('click', function(e) {
    openTab(e, 'wrapper', 'scene');
});

document.getElementById('graph-btn').addEventListener('click', function(e) {
    openTab(e, 'overlay', 'scene');
});

document.getElementById('project-btn').addEventListener('click', function(e) {
    openTab(e, 'resources-container', 'resources');
});

document.getElementById('timeline-btn').addEventListener('click', function(e) {
    openTab(e, 'timeline', 'resources');
});

// document.getElementById('script-btn').addEventListener('click', function(e) {
    // openTab(e, 'editor', 'resources');
    // if (!Editor.launched) {
    //     Editor.init();
    // }
// });