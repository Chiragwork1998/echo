// ECHO site. A little script and no libraries: the phone menu, reveals as sections arrive, the
// tagline lighting word by word, the living sky, and which part of the page the nav is on.
// Nothing here measures visitors or talks to any server.
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hasObserver = 'IntersectionObserver' in window;

  /* The phone menu ----------------------------------------------------------------------------- */

  var toggle = document.querySelector('.nav-toggle');
  var panel = document.getElementById('nav-panel');
  if (toggle && panel) {
    var items = panel.querySelectorAll('.nav-panel-list > li');
    // Each link arrives 60 ms after the one before, and the whole sequence stays under 400 ms.
    var step = Math.min(60, items.length > 1 ? 400 / (items.length - 1) : 60);
    items.forEach(function (item, index) {
      item.style.transitionDelay = Math.round(index * step) + 'ms';
    });

    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      panel.classList.toggle('is-open', open);
      panel.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) {
        var first = panel.querySelector('a');
        if (first) window.setTimeout(function () { first.focus(); }, 60);
      }
    };

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    panel.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 900px)').addEventListener('change', function (event) {
      if (event.matches) setOpen(false);
    });
  }

  /* Scroll reveals: once each, never replayed -------------------------------------------------- */

  var reveals = document.querySelectorAll('.reveal');
  if (hasObserver) {
    var revealer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          revealer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );
    reveals.forEach(function (element) { revealer.observe(element); });
  } else {
    reveals.forEach(function (element) { element.classList.add('is-in'); });
  }

  /* The tagline: each word lights in reading order as the section moves up the screen ---------- */

  var tagline = document.querySelector('[data-tagline]');
  if (tagline) {
    var words = [];
    // Split text nodes into words, keeping any line breaks the markup already has.
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.textContent.split(/(\s+)/);
          var fragment = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              fragment.appendChild(document.createTextNode(part));
              return;
            }
            var span = document.createElement('span');
            span.className = 'word';
            span.textContent = part;
            fragment.appendChild(span);
            words.push(span);
          });
          child.parentNode.replaceChild(fragment, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(tagline);

    var lit = 0;
    var light = function (count) {
      for (; lit < count && lit < words.length; lit += 1) words[lit].classList.add('is-lit');
    };

    if (reduceMotion.matches || !hasObserver) {
      light(words.length);
    } else {
      var ticking = false;
      var update = function () {
        ticking = false;
        var box = tagline.getBoundingClientRect();
        var view = window.innerHeight || root.clientHeight;
        // The trigger line sits at 70 percent of the screen. A word lights once the text has moved
        // far enough past it, so the words go one at a time in reading order.
        var start = view * 0.7;
        var travel = box.height + view * 0.25;
        var progress = (start - box.top) / travel;
        light(Math.floor(Math.max(0, Math.min(1, progress)) * (words.length + 1)));
        if (lit >= words.length) stop();
      };
      var onScroll = function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(update);
      };
      var listening = false;
      var start = function () {
        if (listening) return;
        listening = true;
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        onScroll();
      };
      var stop = function () {
        if (!listening) return;
        listening = false;
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      };
      // The scroll listener only runs while the tagline is on screen.
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && lit < words.length) start();
          else stop();
        });
      }).observe(tagline);
    }
  }

  /* The living sky: plays only when motion is welcome and data is not being saved -------------- */

  var sky = document.querySelector('[data-sky]');
  if (sky) {
    var video = sky.querySelector('video');
    var control = sky.querySelector('.window-control');
    var saveData = navigator.connection && navigator.connection.saveData;
    var userPaused = false;
    var canPlay = video && !reduceMotion.matches && !saveData;

    if (canPlay) {
      video.querySelectorAll('source[data-src]').forEach(function (source) {
        source.src = source.getAttribute('data-src');
      });
      video.load();
      video.addEventListener('playing', function () { video.classList.add('is-playing'); });
      var play = function () {
        var attempt = video.play();
        if (attempt && attempt.catch) attempt.catch(function () {});
      };
      if (control) {
        control.hidden = false;
        control.addEventListener('click', function () {
          userPaused = !userPaused;
          control.setAttribute('aria-pressed', String(userPaused));
          control.setAttribute('aria-label', userPaused ? 'Play the moving sky' : 'Pause the moving sky');
          if (userPaused) video.pause();
          else play();
        });
      }
      if (hasObserver) {
        // Off screen, the sky rests, so it costs no battery.
        new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && !userPaused) play();
            else video.pause();
          });
        }).observe(sky);
      } else {
        play();
      }
    } else if (control) {
      control.hidden = true;
    }
  }

  /* Which part of the page the nav is on ------------------------------------------------------- */

  var spyLinks = document.querySelectorAll('[data-spy]');
  if (spyLinks.length && hasObserver) {
    var byId = {};
    spyLinks.forEach(function (link) {
      var id = link.getAttribute('data-spy');
      (byId[id] = byId[id] || []).push(link);
    });
    var current = null;
    var mark = function (id) {
      if (id === current) return;
      current = id;
      spyLinks.forEach(function (link) {
        if (link.getAttribute('data-spy') === id) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    };
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) mark(entry.target.id);
          else if (entry.target.id === current) mark(null);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }
})();
