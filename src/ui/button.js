import { Component } from '/src/core/mod.js';

export class Button extends Component {

    /**
     * Create a new HTML button for UI
     * @param {string} text - The button text
     * @param {number} width - The button width in pixels
     * @param {number} height - The button height in pixels
     */
    constructor(text = 'Button', width = 100, height = 40) {
        super();
        
        this.text = text;
        this.width = width;
        this.height = height;
        this.element = null;
        this.enabled = true;
        this.visible = true;
        
        // Style properties
        this.color = '#4a90d9';
        this.hoverColor = '#5a9fe9';
        this.activeColor = '#3a80c9';
        this.disabledColor = '#888888';
        this.textColor = '#ffffff';
        this.borderRadius = 4;
        this.fontSize = 14;
        this.fontFamily = 'Arial, sans-serif';
        
        // Callbacks
        this.onClick = null;
        this.onHover = null;
        this.onPress = null;
        this.onRelease = null;
    }

    /**
     * Called when component is added to an object
     * Creates the HTML button element and attaches it to the DOM
     */
    start() {
        this.createElement();
    }

    /**
     * Create the HTML button element
     * @private
     */
    createElement() {
        if (this.element) return;
        
        const button = document.createElement('button');
        button.textContent = this.text;
        button.className = 'pixel-ui-button';
        
        // Apply styles
        this.applyStyles(button);
        
        // Event listeners
        button.addEventListener('click', (e) => {
            if (this.enabled && this.onClick) {
                this.onClick(e);
            }
        });
        
        button.addEventListener('mouseenter', (e) => {
            if (this.enabled) {
                button.style.backgroundColor = this.hoverColor;
                if (this.onHover) this.onHover(e);
            }
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = this.enabled ? this.color : this.disabledColor;
        });
        
        button.addEventListener('mousedown', (e) => {
            if (this.enabled) {
                button.style.backgroundColor = this.activeColor;
                if (this.onPress) this.onPress(e);
            }
        });
        
        button.addEventListener('mouseup', (e) => {
            if (this.enabled) {
                button.style.backgroundColor = this.hoverColor;
                if (this.onRelease) this.onRelease(e);
            }
        });
        
        // Append to UI container or body
        const container = document.getElementById('ui-container') || document.body;
        container.appendChild(button);
        
        this.element = button;
        this.updatePosition();
    }

    /**
     * Apply CSS styles to the button element
     * @private
     * @param {HTMLButtonElement} button - The button element
     */
    applyStyles(button) {
        Object.assign(button.style, {
            position: 'absolute',
            width: `${this.width}px`,
            height: `${this.height}px`,
            backgroundColor: this.enabled ? this.color : this.disabledColor,
            color: this.textColor,
            border: 'none',
            borderRadius: `${this.borderRadius}px`,
            fontSize: `${this.fontSize}px`,
            fontFamily: this.fontFamily,
            cursor: this.enabled ? 'pointer' : 'not-allowed',
            outline: 'none',
            transition: 'background-color 0.15s ease',
            zIndex: '1000',
            display: this.visible ? 'block' : 'none'
        });
    }

    /**
     * Update button position based on parent object
     */
    updatePosition() {
        if (!this.element || !this.object) return;
        
        this.element.style.left = `${this.object.x}px`;
        this.element.style.top = `${this.object.y}px`;
    }

    /**
     * Update the button each frame
     */
    update() {
        this.updatePosition();
    }

    /**
     * Enable the button
     */
    enable() {
        this.enabled = true;
        if (this.element) {
            this.element.disabled = false;
            this.element.style.backgroundColor = this.color;
            this.element.style.cursor = 'pointer';
        }
    }

    /**
     * Disable the button
     */
    disable() {
        this.enabled = false;
        if (this.element) {
            this.element.disabled = true;
            this.element.style.backgroundColor = this.disabledColor;
            this.element.style.cursor = 'not-allowed';
        }
    }

    /**
     * Show the button
     */
    show() {
        this.visible = true;
        if (this.element) {
            this.element.style.display = 'block';
        }
    }

    /**
     * Hide the button
     */
    hide() {
        this.visible = false;
        if (this.element) {
            this.element.style.display = 'none';
        }
    }

    /**
     * Set button text
     * @param {string} text - The new text
     */
    setText(text) {
        this.text = text;
        if (this.element) {
            this.element.textContent = text;
        }
    }

    /**
     * Set button size
     * @param {number} width - The width in pixels
     * @param {number} height - The height in pixels
     */
    setSize(width, height) {
        this.width = width;
        this.height = height;
        if (this.element) {
            this.element.style.width = `${width}px`;
            this.element.style.height = `${height}px`;
        }
    }

    /**
     * Set button colors
     * @param {Object} colors - Color configuration
     * @param {string} [colors.normal] - Normal background color
     * @param {string} [colors.hover] - Hover background color
     * @param {string} [colors.active] - Active/pressed background color
     * @param {string} [colors.disabled] - Disabled background color
     * @param {string} [colors.text] - Text color
     */
    setColors({ normal, hover, active, disabled, text } = {}) {
        if (normal) this.color = normal;
        if (hover) this.hoverColor = hover;
        if (active) this.activeColor = active;
        if (disabled) this.disabledColor = disabled;
        if (text) this.textColor = text;
        
        if (this.element) {
            this.element.style.backgroundColor = this.enabled ? this.color : this.disabledColor;
            this.element.style.color = this.textColor;
        }
    }

    /**
     * Clean up when component is removed
     */
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
    }

    /**
     * Clone the button component
     * @returns {Button} A new button with same properties
     */
    clone() {
        const button = new Button(this.text, this.width, this.height);
        button.color = this.color;
        button.hoverColor = this.hoverColor;
        button.activeColor = this.activeColor;
        button.disabledColor = this.disabledColor;
        button.textColor = this.textColor;
        button.borderRadius = this.borderRadius;
        button.fontSize = this.fontSize;
        button.fontFamily = this.fontFamily;
        button.enabled = this.enabled;
        button.visible = this.visible;
        return button;
    }
}