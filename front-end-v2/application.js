$.when(
    $(document).load,
    $('iframe').ready,
    $('img').load
).done(function() {
    $('[data-item-type="vimeo"],[data-item-type="youtube"]').find('iframe').attr({
        width: 285,
        height: 168
    });
    setInterval(function() {
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
    setTimeout(function() {
        $('.grid').isotope({
            // percentPosition: true,
            itemSelector: '.grid-item',
            masonry: {
                columnWidth: '.grid-sizer'
            }
        });
    }, 400);
});
// 100px scroll or less will equiv to 1 opacity
var fadeStart  = 0,
    /* 200px scroll or more will equiv to 0 opacity */
    fadeUntil  = Math.max(1, screen.height / 2),
    fading     = $('#page_cover header'),
    pattern    = $('.cover_pattern');

$(window).bind('scroll', function() {
    // console.log(screen.height , $(document).scrollTop());
    var offset  = $(document).scrollTop(),
        opacity = 0;
    if(offset <= fadeStart) {
        opacity = 1;
    } else if(offset <= fadeUntil) {
        opacity = 1 - offset / fadeUntil;
    }
    $(fading, pattern).css('opacity', opacity);
});
