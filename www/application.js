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
        that.templates[item.attr('data-template')] = Handlebars.compile(item.html());
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
        scrollHandler = $.debounce(controller.handleScroll.bind(controller), 300);
    controller.load();

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
