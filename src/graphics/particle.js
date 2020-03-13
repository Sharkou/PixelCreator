import { GameObject } from '/src/core/entity.js';

var Particle = function()
{
    /*this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.width = width;
    this.height = height;
    this.color = color;*/
    
    this.baseColor = '#f86f1c';
    this.enabled = true;
    
    this.reset = function() {
        this.startRadius = rand(1, 25);
        this.radius = this.startRadius;
        this.x = 300/2 + (rand(0, 6) - 3);
        this.y = 250;
        this.vx = 0;
        this.vy = 0;
        this.hue = 23;
        this.saturation = rand(50, 100);
        this.lightness = rand(20, 70);
        this.startAlpha = rand(1, 10) / 100;
        this.alpha = this.startAlpha;
        this.decayRate = .1;
        this.startLife = 7;
        this.life = this.startLife;
        this.lineWidth = rand(1, 3);        
    };
    
    this.update = function() {
        if (this.enabled) {
            this.vx += (rand(0, 200) - 100) / 1500;
            this.vy -= this.life/50;  
            this.x += this.vx;
            this.y += this.vy;
            this.alpha = this.startAlpha * (this.life / this.startLife);
            this.radius = this.startRadius * (this.life / this.startLife);
            this.life -= this.decayRate;
            if (
            this.x > 300 + this.radius ||
            this.x < -this.radius ||
            this.y > 300 + this.radius ||
            this.y < -this.radius ||
            this.life <= this.decayRate
            ){
                this.reset();
            }
        }
    };
    
    this.draw = function(ctx) {
        if (this.enabled) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
            ctx.fillStyle = 'rgba(200, 20, 20, 0.5)';
            ctx.fillStyle = ctx.strokeStyle = 'hsla('+this.hue+', '+this.saturation+'%, '+this.lightness+'%, '+this.alpha+')';
            ctx.lineWidth = this.lineWidth;
            ctx.fill();
            ctx.stroke();
        }
    };
    
    this.reset();
};

var ParticleSystem = function(name, x, y, width = 200, height = 400) {
    
    GameObject.call(this, name, x, y, width, height);
    
    /*this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.width = width;
    this.height = height;
    this.color = color;*/
    
    this.particles = [];
    this.maxParticle = 200;
    this.full = false;
    
    this.enabled = true;
    
    this.addComponent(new Particle2());
    
    /*this.addComponent(new Appearance({
        color: 'rgba(200, 50, 50)',
        opacity: 0.8,
        weight: 2
    }));*/
};

ParticleSystem.prototype = Object.create(GameObject.prototype);

ParticleSystem.prototype.createParticle = function() {
    if (!this.full) {
        if (this.particles.length > this.maxParticle) {
            this.full = true;
        } else {
            this.particles.push(new Particle());
        }
    }
};

ParticleSystem.prototype.draw = function(ctx) {
    if (this.enabled) {
        /*ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'hsla(0, 0%, 0%, .3)';*/
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < this.particles.length; i++) {
            this.particles[i].draw(ctx);            
        }
    }
};

/*var icon = document.createElement('i');
icon.setAttribute('class', 'material-icons');
icon.appendChild(document.createTextNode('blur_on'));
Objects.add('ParticleSystem', icon);*/