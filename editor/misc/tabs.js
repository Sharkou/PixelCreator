function openTab(e, name) {
    
    // Declare all variables
    var i, tabcontent, tablinks;

    // Get all elements with class="tabcontent" and hide them
    var tabs = document.getElementsByClassName('tab-content');
    for (i = 0; i < tabs.length; i++) {
        tabs[i].style.display = 'none';
    }

    // Get all elements with class="tablinks" and remove the class "active"
    tablinks = document.getElementsByClassName('tab-link');
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(' active', '');
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(name).style.display = 'block';
    e.currentTarget.className += ' active';
}

document.getElementById('scene-btn').addEventListener('click', function(e) {
    openTab(e, 'wrapper');
});

document.getElementById('blueprint-btn').addEventListener('click', function(e) {
    openTab(e, 'overlay');
});

document.getElementById('project-btn').addEventListener('click', function(e) {
    openTab(e, 'resources-container');
});

document.getElementById('timeline-btn').addEventListener('click', function(e) {
    openTab(e, 'timeline');
});