var eventName = `
<div class="box">
    <h3>Event Name</h3>
    <span class="label labelName">&nbsp;Name</span>
    <input type="text" id="eventName"/>
</div>
`;

var keyPressedBox = `
<div class="box keyPressed">
    <h3>Key Pressed</h3>
    <div class="box-content">
        <button id="keyButton"><i class="material-icons">touch_app</i><span class="object-text">Press a key...</span></button>
        <p id="key">Key</p>
    </div>
</div>
`;

var moveActionBox = `
<div class="box move">
    <h3>Move</h3>
    <div>
        <div class="inputPosition">
            <label class="axis">X</label>
            <input class="number moveX" type="number" />
        </div>
        <br />
        <div class="inputPosition">
            <label class="axis">Y</label>
            <input class="number moveY" type="number" />
        </div>
    </div>
</div>
`;