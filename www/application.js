var Controller = function() {
    this.firstCall = true;  // Whether we are requesting data for the first time.
    this.finished = false;  // Whether we already hit the bottom.
    this.from      = null;  // Last "from" parameter we received from the remote.
    this.waiting  = false;  // Whether we are already waiting for the remote.
    this.templates = {};
    this.$ = $(this);
    this.window = $(window);
    this.document = $(document);
    var that = this;
    $('[data-template-partial]:not([data-registered])').each(function() {
        var item = $(this);
        Handlebars.registerPartial(item.attr('data-template-partial'), item.html());
        item.attr('data-registered', 'true');
    });
    $('[data-template]').each(function() {
        var item = $(this);
        item.attr('data-template').split(',').forEach(function(k) {
            that.templates[k] = Handlebars.compile(item.html());
        });
    });
};

Controller.prototype.render = function(item) {
    var result = '';
    if(!this.templates[item.type]) {
        console.warn(['Unregistered template for item with type ', item.type].join(''));
    } else {
        try {
            result = this.templates[item.type](item);
        } catch(ex) {
            console.error('Error rendering item with template ' + item.type, ex);
        }
    }
    return result;
}

Controller.prototype.fixEmbeds = function(items) {
    $.when(
        items.find('iframe').ready,
        items.find('img').load
    ).done(function() {
        $('.grid').isotope('layout');
    });
    $('[data-item-type="vimeo"],[data-item-type="youtube"]').find('iframe').attr({
        width: 285,
        height: 168
    });
    this.embedInterval = this.embedInterval || setInterval(function() {
        $('[data-item-type="tweet"]').each(function() {
            var $this = $(this);
            $this.find('iframe').css({
                marginTop: 0,
                marginBottom: 0
            });
        }).promise().done(function() {
            $('.grid').isotope('layout');
        });
    }, 1000);
}

Controller.prototype.load = function() {
    if(this.finished || this.waiting) {
        return;
    }
    this.$.trigger('loading');
    this.waiting = true;
    $.ajax({
            url: this.firstCall ? '/api/latest' : ['/api/from/', this.from].join(''),
            method: 'GET',
            type: 'json'
        })
        .done(function(data) {
            this.from = data.from;
            this.$.trigger('loaded');
            this.waiting = false;
            if(!data.items) {
                this.finished = true;
                this.$.trigger('finished');
                return;
            }
            var $grid = $('.grid'),
                result = $();

            data.items.items.forEach(function(item) {
                result = result.add($(this.render(item)));
            }.bind(this));

            if(this.firstCall) {
                this.firstCall = false;
                $grid
                    .append(result)
                    .isotope({
                        itemSelector: '.grid-item',
                        masonry: {
                            columnWidth: '.grid-item'
                        }
                    });
            } else {
                $grid.isotope('insert', result);
            }
            this.fixEmbeds(result);
        }.bind(this))
        .fail(function() {
            this.waiting = false;
            this.$.trigger('failed');
        }.bind(this));
};

Controller.prototype.handleScroll = function() {
    if(this.window.scrollTop() + this.window.height() > this.document.height() - 100) {
        this.load();
    }
}

// CANVAS

var Animation = function() {
    this.animationFrame = undefined;
    this.canvas_square01 = document.getElementById('canvas_square01');
    this.ctx_square01 = canvas_square01.getContext('2d');
    this.$window = $(window);
    canvas_square01.width  = this.$window.width();
    canvas_square01.height = this.$window.height();
    this.W_square01 = this.$window.width();
    this.H_square01 = this.$window.height();
    this.particles_square01 = [];
    this.edges = [1000, 50];
    this.edgeSize = this.edges[Math.floor(Math.random() * this.edges.length)];
    this.$window.resize(function(){
        this.canvas_square01.width = this.$window.width();
    }.bind(this));
    for(var i = 0; i < 200; i++)
    {
        //This will add 50 particles_square01 to the array with random positions
        this.particles_square01.push(new AnimationSquare(this.W_square01, this.H_square01, this.edgeSize));
    }
    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = (function() {
            return  window.requestAnimationFrame       ||
                    window.webkitRequestAnimationFrame ||
                    window.mozRequestAnimationFrame    ||
                    window.oRequestAnimationFrame      ||
                    window.msRequestAnimationFrame     ||
                    function(callback){
                        window.setTimeout(callback, 1000 / 60);
                    };
        })();
    }
};

Animation.prototype.draw = function() {
    this.ctx_square01.fillStyle = 'rgba(166,59,85,1)';
    this.ctx_square01.fillRect(0, 0, this.W_square01, this.H_square01);
    var p_square01, height;
    for(var t = 0; t < this.particles_square01.length; t++)
    {
        p_square01 = this.particles_square01[t];

        this.ctx_square01.beginPath();


        this.ctx_square01.moveTo(p_square01.x - p_square01.lu, p_square01.y - p_square01.lu);
        this.ctx_square01.lineTo(p_square01.x + 10 + p_square01.ru, p_square01.y - p_square01.ru);
        this.ctx_square01.lineTo(p_square01.x + 10 + p_square01.rd, p_square01.y + 10 + p_square01.rd);
        this.ctx_square01.lineTo(p_square01.x - p_square01.rd, p_square01.y + 10 + p_square01.rd);
        this.ctx_square01.fillStyle = p_square01.color;
        this.ctx_square01.fill();

        p_square01.x += p_square01.vx;
        p_square01.y += p_square01.vy;


        height = this.$window.scrollTop();

        if(height  > 500) {
            p_square01.x -= p_square01.vx;
            p_square01.y -= p_square01.vy;
        }


        if(p_square01.x < -150) p_square01.x = this.W_square01 + 150;
        if(p_square01.y < -150) p_square01.y = this.H_square01 + 150;
        if(p_square01.x > this.W_square01 + 150) p_square01.x = -150;
        if(p_square01.y > this.H_square01 + 150) p_square01.y = -150;
    }
    window.requestAnimationFrame(this.draw.bind(this));
};

Animation.prototype.start = function() {
    if(!this.globalID_01) {
        this.globalID_01 = window.requestAnimationFrame(this.draw.bind(this));
    }
};

var AnimationSquare = function(width, height, edge)
{
    //Random position on the canvas_square01
    this.x = Math.random() * width;
    this.y = Math.random() * height;

    this.vx = Math.random() - 0.5;
    this.vy = Math.random() - 0.5;

    var colors_square01 = ['rgba(212,9,76,0.8)', 'rgba(174,210,163,0.7)', 'rgba(252,245,198,0.7)'];
    this.color = colors_square01[Math.round(Math.random()*3)];

    // Distort
    this.ru = Math.random() * edge + 40;
    this.rd = Math.random() * 60 + 30;
    this.ld = Math.random() * 60 + 30;
    this.lu = Math.random() * 60 + 30;
};

$(function() {
    Handlebars.registerHelper('truncate', function(options) {
        var value = options.fn(this);
        if(value.length > 255) {
            var parts = value.split(' '),
                part;
            value = '';
            while(parts) {
                part = parts.shift();
                if(value.length + part.length > 255) {
                    value += '...';
                    break;
                } else {
                    value += ' ' + part;
                }
            }
        }
        return value;
    });
    Handlebars.registerHelper('domain', function(options) {
        var value = options.fn(this),
            regex = /(?:https?:\/\/)?([^\/]+).*/;
        if(regex.test(value)) {
            var match = regex.exec(value);
            value = regex[1];
        }
        return value;
    });
    $.debounce = function(func, wait) {
        var timeout;
        return function() {
            var context = this, args = arguments,
                then = function() {
                    timeout = null;
                    func.apply(context, args);
                };
            if(timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(then, wait);
        }
    };

    var fadeStart  = 0,
        fadeUntil  = Math.max(1, screen.height / 2),
        fadeTarget = $('#page_cover header, .cover_pattern'),
        $document  = $(document),
        controller = new Controller(),
        scrollHandler = $.debounce(controller.handleScroll.bind(controller), 300),
        animation = new Animation();

    controller.load();
    animation.start();

    $(window).scroll(function() {
        scrollHandler();
        var offset  = $document.scrollTop(),
            opacity = 0;
        if(offset <= fadeStart) {
            opacity = 1;
        } else if(offset <= fadeUntil) {
            opacity = 1 - offset / fadeUntil;
        }
        fadeTarget.css('opacity', opacity);
    });
});
