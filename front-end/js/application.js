var application = {
    supportsEmojiNatively: function() {
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
    },
    setupGrid: function() {
        $(window).on('load', function() {
            $.when(
                $(document).load,
                $('iframe').ready,
                $('img').load
            ).done(function() {
                $('.grid-item.vimeo, .grid-item.youtube').find('iframe').each(function() {
                    var $this = $(this);
                    $this.css({
                        height: Math.round(($this.parent().width() / 16) * 9),
                        width: $this.parent().width()
                    });
                });

                $('.grid-item.tweet').find('iframe').each(function() {
                    var $this = $(this);
                    $this.css({
                        marginTop: 0,
                        marginBottom: 0
                    });
                });

                $('.grid-item').find('img').each(function() {
                    var $this = $(this);
                    $this.css({
                        maxHeight: $(this).parent().height()
                    });
                });
                setTimeout(function() {
                    $('.grid').isotope({
                        percentPosition: true,
                        itemSelector: '.grid-item',
                        layoutMode: 'packery',
                        packery: {
                            columnWidth: '.grid-sizer'
                        }
                    });
                }, 300);
            });
        });
    },
    init: function() {
        if(!this.supportsEmojiNatively()) {
            twemoji.parse(document.body);
        }
        this.setupGrid();
        $('#page_content').css('min-height', $(window).outerHeight());
    }
};

$(document).ready(function() {
    application.init();
});
