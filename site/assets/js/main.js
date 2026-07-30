/* ООО «СитиСтрой» — скрипты сайта
   Меню, карусель, лайтбокс, форма обратной связи, карты. Без внешних библиотек. */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------
     1. Шапка: закрашивается при прокрутке
     ------------------------------------------------------------------ */
  var header = $('.header');
  if (header) {
    var solidFrom = header.hasAttribute('data-always-solid') ? -1 : 40;
    var onScroll = function () {
      header.classList.toggle('header--solid', window.scrollY > solidFrom);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ------------------------------------------------------------------
     2. Мобильное меню
     ------------------------------------------------------------------ */
  var mob = $('.mobmenu');
  var burger = $('.burger');

  function openMenu() {
    if (!mob) return;
    mob.classList.add('is-open');
    document.body.classList.add('is-locked');
    burger && burger.setAttribute('aria-expanded', 'true');
    mob.setAttribute('aria-hidden', 'false');
    var first = mob.querySelector('.mobmenu__close');
    first && first.focus();
  }
  function closeMenu() {
    if (!mob) return;
    mob.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    burger && burger.setAttribute('aria-expanded', 'false');
    mob.setAttribute('aria-hidden', 'true');
  }

  burger && burger.addEventListener('click', openMenu);
  $$('.mobmenu__close, .mobmenu a[href]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      // ссылки-якори внутри страницы тоже закрывают меню
      if (el.classList.contains('mobmenu__close') || el.tagName === 'A') closeMenu();
      if (el.classList.contains('mobmenu__close')) e.preventDefault();
    });
  });

  // Раскрывающийся подпункт «Деятельность»
  $$('.mobmenu__sub-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sub = btn.parentNode.querySelector('.mobmenu__sub');
      if (!sub) return;
      var open = sub.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (mob && mob.classList.contains('is-open')) closeMenu();
    closeLightbox();
    closeModal();
  });

  /* ------------------------------------------------------------------
     3. Карусель проектов
     ------------------------------------------------------------------ */
  $$('.carousel').forEach(function (car) {
    var track = $('.carousel__track', car);
    var prev  = $('.carousel__btn--prev', car);
    var next  = $('.carousel__btn--next', car);
    var dotsBox = $('.carousel__dots', car);
    if (!track) return;

    var slides = $$('.carousel__track > *', track);
    if (!slides.length) return;

    function step() {
      var s = slides[0];
      var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || 0) || 0;
      return s.getBoundingClientRect().width + gap;
    }
    function perView() {
      return Math.max(1, Math.round(track.clientWidth / step()));
    }
    function pages() {
      return Math.max(1, Math.ceil(slides.length / perView()));
    }

    // точки
    var dots = [];
    function buildDots() {
      if (!dotsBox) return;
      dotsBox.innerHTML = '';
      dots = [];
      var n = pages();
      if (n < 2) return;
      for (var i = 0; i < n; i++) {
        (function (i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', 'Слайд ' + (i + 1));
          b.addEventListener('click', function () {
            track.scrollTo({ left: i * perView() * step(), behavior: 'smooth' });
          });
          dotsBox.appendChild(b);
          dots.push(b);
        })(i);
      }
    }

    function sync() {
      var max = track.scrollWidth - track.clientWidth - 2;
      prev && (prev.disabled = track.scrollLeft <= 2);
      next && (next.disabled = track.scrollLeft >= max);
      if (dots.length) {
        var idx = Math.round(track.scrollLeft / (perView() * step()));
        idx = Math.min(dots.length - 1, Math.max(0, idx));
        dots.forEach(function (d, i) { d.classList.toggle('is-active', i === idx); });
      }
    }

    prev && prev.addEventListener('click', function () {
      track.scrollBy({ left: -perView() * step(), behavior: 'smooth' });
    });
    next && next.addEventListener('click', function () {
      track.scrollBy({ left: perView() * step(), behavior: 'smooth' });
    });

    track.addEventListener('scroll', function () {
      window.clearTimeout(track._t);
      track._t = window.setTimeout(sync, 60);
    }, { passive: true });

    var rebuild = function () { buildDots(); sync(); };
    window.addEventListener('resize', function () {
      window.clearTimeout(car._r);
      car._r = window.setTimeout(rebuild, 180);
    });
    rebuild();
  });

  /* ------------------------------------------------------------------
     4. Лайтбокс (документы и галереи объектов)
     ------------------------------------------------------------------ */
  var lb = $('.lightbox');
  var lbImg, lbCap, lbPrev, lbNext;
  var lbGroup = [];
  var lbIndex = 0;

  if (lb) {
    lbImg  = $('.lightbox__img', lb);
    lbCap  = $('.lightbox__caption', lb);
    lbPrev = $('.lightbox__nav--prev', lb);
    lbNext = $('.lightbox__nav--next', lb);

    $('.lightbox__close', lb).addEventListener('click', closeLightbox);
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
    lbPrev && lbPrev.addEventListener('click', function () { showLb(lbIndex - 1); });
    lbNext && lbNext.addEventListener('click', function () { showLb(lbIndex + 1); });

    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'ArrowLeft')  showLb(lbIndex - 1);
      if (e.key === 'ArrowRight') showLb(lbIndex + 1);
    });

    // свайп на телефоне
    var sx = null;
    lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 55) showLb(lbIndex + (dx < 0 ? 1 : -1));
      sx = null;
    }, { passive: true });
  }

  function showLb(i) {
    if (!lbGroup.length) return;
    lbIndex = (i + lbGroup.length) % lbGroup.length;
    var item = lbGroup[lbIndex];
    lbImg.src = item.src;
    lbImg.alt = item.caption || '';
    lbCap.textContent = lbGroup.length > 1
      ? (item.caption ? item.caption + ' — ' : '') + (lbIndex + 1) + ' / ' + lbGroup.length
      : (item.caption || '');
    var many = lbGroup.length > 1;
    lbPrev && (lbPrev.style.display = many ? '' : 'none');
    lbNext && (lbNext.style.display = many ? '' : 'none');
  }

  function openLightbox(group, index) {
    if (!lb) return;
    lbGroup = group;
    showLb(index);
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
  }
  function closeLightbox() {
    if (!lb || !lb.classList.contains('is-open')) return;
    lb.classList.remove('is-open');
    lb.setAttribute('aria-hidden', 'true');
    if (!$('.modal.is-open') && !(mob && mob.classList.contains('is-open'))) {
      document.body.classList.remove('is-locked');
    }
  }

  // Собираем группы по атрибуту data-lightbox="имя-группы"
  var groups = {};
  $$('[data-lightbox]').forEach(function (el) {
    var name = el.getAttribute('data-lightbox');
    groups[name] = groups[name] || [];
    groups[name].push({
      src: el.getAttribute('data-full') || (el.querySelector('img') || {}).src,
      caption: el.getAttribute('data-caption') || ''
    });
    var idx = groups[name].length - 1;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      openLightbox(groups[name], idx);
    });
  });

  /* ------------------------------------------------------------------
     5. Форма обратной связи
     ------------------------------------------------------------------ */
  var modal = $('.modal');
  function openModal() {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    var b = $('.modal__box button', modal);
    b && b.focus();
  }
  function closeModal() {
    if (!modal || !modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (!(mob && mob.classList.contains('is-open'))) document.body.classList.remove('is-locked');
  }
  if (modal) {
    $$('[data-close-modal]', modal).forEach(function (b) { b.addEventListener('click', closeModal); });
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-zА-Яа-я]{2,}$/;

  function setError(field, msg) {
    var wrap = field.closest('.field');
    if (!wrap) return;
    wrap.classList.add('has-error');
    var err = wrap.querySelector('.field__err');
    if (err) err.textContent = msg;
  }
  function clearError(field) {
    var wrap = field.closest('.field');
    wrap && wrap.classList.remove('has-error');
  }

  function validate(form) {
    var ok = true, firstBad = null;

    var name = form.elements['name'];
    var mail = form.elements['email'];
    var msg  = form.elements['message'];
    var tel  = form.elements['phone'];

    if (!name.value.trim()) { setError(name, 'Укажите ваше имя'); ok = false; firstBad = firstBad || name; }
    else clearError(name);

    if (!mail.value.trim()) { setError(mail, 'Укажите e-mail для ответа'); ok = false; firstBad = firstBad || mail; }
    else if (!EMAIL_RE.test(mail.value.trim())) { setError(mail, 'Проверьте адрес — похоже, в нём опечатка'); ok = false; firstBad = firstBad || mail; }
    else clearError(mail);

    if (tel && tel.value.trim() && tel.value.replace(/\D/g, '').length < 10) {
      setError(tel, 'Проверьте номер телефона'); ok = false; firstBad = firstBad || tel;
    } else if (tel) clearError(tel);

    if (!msg.value.trim()) { setError(msg, 'Напишите ваше сообщение'); ok = false; firstBad = firstBad || msg; }
    else clearError(msg);

    if (firstBad) firstBad.focus();
    return ok;
  }

  $$('form.js-form').forEach(function (form) {
    var loadedAt = Date.now();
    var btn   = $('.js-submit', form);
    var alert = $('.form__alert', form);

    $$('input, textarea', form).forEach(function (f) {
      f.addEventListener('input', function () { clearError(f); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      alert && alert.classList.remove('is-visible');
      if (!validate(form)) return;

      var data = new FormData(form);
      data.append('elapsed', String(Math.round((Date.now() - loadedAt) / 1000)));

      btn && btn.classList.add('is-busy');

      // Локальный просмотр вёрстки через file:// — сервер недоступен, показываем модалку
      if (location.protocol === 'file:') {
        window.setTimeout(function () {
          btn && btn.classList.remove('is-busy');
          form.reset();
          openModal();
        }, 500);
        return;
      }

      var payload = {};
      data.forEach(function (value, key) { payload[key] = value; });

      fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          btn && btn.classList.remove('is-busy');
          if (res && res.ok) {
            form.reset();
            loadedAt = Date.now();
            openModal();
          } else {
            showAlert(alert, (res && res.error) || 'Не удалось отправить письмо. Позвоните нам: +7 (843) 253-74-24');
          }
        })
        .catch(function () {
          btn && btn.classList.remove('is-busy');
          showAlert(alert, 'Нет связи с сервером. Позвоните нам: +7 (843) 253-74-24');
        });
    });
  });

  function showAlert(box, text) {
    if (!box) { window.alert(text); return; }
    box.textContent = text;
    box.classList.add('is-visible');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ------------------------------------------------------------------
     6. Переключатель карт на странице контактов
     ------------------------------------------------------------------ */
  var tabs = $$('.maptab');
  if (tabs.length) {
    var frame = $('#mapFrame');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        if (frame) frame.src = tab.getAttribute('data-map');
      });
    });
  }

  /* ------------------------------------------------------------------
     7. Подсветка текущего пункта меню
     ------------------------------------------------------------------ */
  var current = document.body.getAttribute('data-nav');
  if (current) {
    $$('.nav__link[data-nav="' + current + '"]').forEach(function (el) { el.classList.add('is-active'); });
  }

  /* ------------------------------------------------------------------
     8. Год в подвале
     ------------------------------------------------------------------ */
  $$('.js-year').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
