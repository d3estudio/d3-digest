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
                $('.grid-item.vimeo').find('iframe').each(function() {
                    var $this = $(this);
                    $this.css({
                        height: $this.parent().height(),
                        width: $this.parent().width()
                    });
                });
                $('.grid').isotope({
                    percentPosition: true,
                    itemSelector: '.grid-item',
                    masonry: {
                        columnWidth: '.grid-sizer'
                    }
                });
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
