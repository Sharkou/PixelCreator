document.getElementById('canvas').style.display = 'none';

function colorer(text, color) {
    return '<span style="color:' + color + ';">' + text + '</span>';
}

String.prototype.replaceAll = function(search, replacement) {
    return this.replace(new RegExp(search, 'i'), replacement);
};

function replaceAll (str) {
    for (key in obj) {
        str = str.replaceAll(obj[key].re, colorer(new RegExp(obj[key].re, 'i').exec(str), obj[key].color));
    }
    return str;
}

function syntaxHighlights() {
    var codes = document.getElementsByTagName('code');
    for (var i = 0; i < codes.length; i++) {
        for (var attr in obj) {
            var data = codes[i].textContent;        
            data = data.replace(new RegExp(obj[attr].re, 'gi'), colorer('ok', 'blue'));
            codes[i].innerHTML = data;
        }        
    }
}

var obj = {
    string: {
        re: '".+"',
        color: 'green'
    },
    equal: {
        re: '=',
        color: 'red'
    },
    const: {
        re: 'const',
        color: 'green'
    },
    var: {
        re: 'var',
        color: 'blue'
    },
};

window.addEventListener('load', syntaxHighlights);

/*var colorationIntervalID = window.setInterval(function() {
    document.getElementById('code').innerHTML = replaceAll(document.getElementById('code').textContent);
}, 2000);*/