(function () {
    'use strict';

    class TypewriterController {
        constructor() {
            this.queue = [];
            this.charDelay = 70;
            this.startDelay = 600;
        }

        register(element, pauseBefore) {
            if (!element) return;
            this.queue.push({
                element: element,
                text: element.dataset.text || '',
                pauseBefore: pauseBefore
            });
        }

        async start() {
            await this.sleep(this.startDelay);
            for (const item of this.queue) {
                await this.sleep(item.pauseBefore);
                await this.typeElement(item.element, item.text);
            }
        }

        async typeElement(el, text) {
            el.classList.add('typing');
            for (let i = 0; i <= text.length; i++) {
                el.textContent = text.substring(0, i);
                await this.sleep(this.charDelay);
            }
            el.classList.remove('typing');
            el.classList.add('typed');
        }

        sleep(ms) {
            return new Promise(function (resolve) {
                setTimeout(resolve, ms);
            });
        }
    }

    function init() {
        var tw = new TypewriterController();
        tw.register(document.getElementById('main-title'), 0);
        tw.register(document.getElementById('subtitle-1'), 400);
        tw.register(document.getElementById('subtitle-2'), 300);

        // Wait for fonts then start
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () {
                tw.start();
            });
        } else {
            tw.start();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
