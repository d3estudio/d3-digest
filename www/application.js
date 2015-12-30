var Controller = function() {
    this.firstCall = true;  // Whether we are requesting data for the first time.
    this.finished = false;  // Whether we already hit the bottom.
    this.from      = null;  // Last "from" parameter we received from the remote.
    this.waiting  = false;  // Whether we are already waiting for the remote.
    this.templates = {};
    this.$ = $(this);
    this.window = $(window);
    this.document = $(document);
    this.content = $('#page_content');
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

Controller.prototype.supportsEmojiNatively = function() {
    if (typeof(navigator) !== 'undefined') {
        var ua = navigator.userAgent;
        if (ua.match(/(iPhone|iPod|iPad|iPhone\s+Simulator)/i)) {
            if (ua.match(/OS\s+[12345]/i)) {
                return true;
            }
            if (ua.match(/OS\s+[6789]/i)) {
                return true;
            }
        }
        if (ua.match(/Mac OS X 10[._ ](?:[789]|1\d)/i)) {
            if (!ua.match(/Chrome/i) && !ua.match(/Firefox/i)) {
                return true;
            }
        }
        if (ua.match(/Windows NT 6.[1-9]/i) || ua.match(/Windows NT 10.[0-9]/i)) {
            if (!ua.match(/Chrome/i) && !ua.match(/MSIE 8/i)) {
                return true;
            }
        }
    }
    return false;
}

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

Controller.prototype.fixEmojis = function() {
    if(!window.supportsEmojiNatively) {
        window.supportsEmojiNatively = this.supportsEmojiNatively();
    }
    if(!window.supportsEmojiNatively) {
        twemoji.parse(document.body);
    }
}

Controller.prototype.load = function() {
    if(this.finished || this.waiting) {
        return;
    }
    this.$.trigger('loading');
    this.waiting = true;
    $.ajax({
            url: this.firstCall ? '/api/latest' : ['/api/skip/', this.next].join(''),
            method: 'GET',
            type: 'json'
        })
        .done(function(data) {
            this.next = data.next;
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
            this.fixEmojis();
        }.bind(this))
        .fail(function() {
            this.waiting = false;
            this.$.trigger('failed');
        }.bind(this));
};

Controller.prototype.handleScroll = function() {
    if(this.window.scrollTop() + this.window.height() > this.document.height() - this.window.height()) {
        this.load();
    }
}


Controller.prototype.fixHeaderHeight = function() {
    this.content.css({
        paddingTop: this.window.outerHeight()
    });
    this.window.resize($.debounce(function() {
        this.fixHeaderHeight()
    }.bind(this), 300));
}

$(function() {
    Handlebars.registerHelper('truncate', function(opts) {
        if(typeof opts === 'object') {
            opts = opts.fn(this);
        }

        if(opts.length > 255) {
            var parts = opts.split(' '),
                part;
            opts = [];
            while(parts) {
                part = parts.shift();
                if(opts.join(' ').length + part.length > 255) {
                    break;
                }
                opts.push(part);
            }
            opts = opts.join(' ') + '...';
        }

        return opts;
    });

    Handlebars.registerHelper('domain', function(opts) {
        if(typeof opts === 'object') {
            opts = opts.fn(this);
        }
        var regex = /(?:https?:\/\/)?([^\/]+).*/;
        if(regex.match(opts)) {
            opts = regex.exec(opts)[1];
        }
        return opts;
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
        fadeFooter = $('footer'),
        $document  = $(document),
        controller = new Controller(),
        scrollHandler = $.debounce(controller.handleScroll.bind(controller), 300);

    controller.load();
    controller.fixHeaderHeight();

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
        fadeFooter.css('opacity', 1 - opacity);

        $("#scroll_helper").remove();
    });
});
