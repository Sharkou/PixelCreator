// Focus input on Search Icon click
document.querySelector('#world #filter i').addEventListener('click', function() {
    document.querySelector('#world #filter input').focus();
});

function filter() {
    // Declare variables
    var input, filter, ul, li, i;
    input = document.getElementById('filterInput');
    filter = input.value.toUpperCase();
    ul = document.getElementById('world-list');
    li = ul.getElementsByTagName('li');

    // Loop through all list items, and hide those who don't match the search query
    for (i = 0; i < li.length; i++) {
        var name = li[i].getElementsByTagName('div')[0].textContent.toUpperCase();
        if (name.indexOf(filter) > -1) {
            li[i].style.display = '';
        } else {
            li[i].style.display = 'none';
        }
    }
}

document.getElementById('filterInput').addEventListener('keyup', filter);