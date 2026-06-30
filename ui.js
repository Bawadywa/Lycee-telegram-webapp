/* ============================================================================
   Lycee Web App — desktop UI enhancer (custom selects + date picker)
   ----------------------------------------------------------------------------
   Native <select> and <input type="date"> can't be styled or animated, so on
   DESKTOP (pointer:fine / non-touch) we replace them with custom widgets that
   look like the rest of the app and open with a smooth animation.

   On TOUCH devices (mobile Telegram) we do nothing — the native wheel pickers
   are the better UX there.

   The widgets are pure progressive enhancement: they drive the SAME underlying
   <select>/<input>, keep its .value in sync, and dispatch a 'change' event, so
   the rest of the app keeps reading the native elements unchanged.

   Public API (window.LyceeUI):
     enhanceAll()  — wrap every <select> and date <input> once (no-op on touch)
     refreshAll()  — re-sync every widget's visible label from its native value
                     (call after the app changes a value programmatically or
                     switches language)
   ============================================================================ */
(function () {
  'use strict';

  function isTouch() {
    try { return window.matchMedia('(hover:none) and (pointer:coarse)').matches; }
    catch (e) { return false; }
  }

  var CARET = '<svg class="ui-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var CHECK = '<svg class="ui-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var CALICON = '<svg class="ui-calico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

  // Only one widget is open at a time.
  var openCtrl = null;

  function closeIfOutside(e) {
    if (openCtrl && !openCtrl.contains(e.target)) openCtrl.close();
  }
  // touchstart too, since multi-selects are enhanced on mobile (where there's no mousedown).
  document.addEventListener('mousedown', closeIfOutside, true);
  document.addEventListener('touchstart', closeIfOutside, true);
  document.addEventListener('keydown', function (e) {
    if (openCtrl && e.key === 'Escape') { var c = openCtrl; c.close(); c.focusTrigger(); }
  });
  window.addEventListener('resize', function () { if (openCtrl) openCtrl.reposition(); });
  window.addEventListener('scroll', function () { if (openCtrl) openCtrl.reposition(); }, true);

  // Position a fixed popup under (or above, if no room) the trigger. All coordinates are
  // in viewport px — the UI no longer applies any `zoom`/scaling, so getBoundingClientRect
  // and innerWidth/Height map 1:1 to the fixed popup's top/left.
  function positionPop(trigger, pop, matchWidth) {
    var r = trigger.getBoundingClientRect();
    if (matchWidth) pop.style.width = r.width + 'px';
    var popH = pop.offsetHeight, popW = pop.offsetWidth;
    var spaceBelow = window.innerHeight - r.bottom;
    var top = (spaceBelow < popH + 10 && r.top > popH + 10) ? (r.top - popH - 6) : (r.bottom + 6);
    var left = r.left;
    if (left + popW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - popW);
    if (left < 8) left = 8;
    // Clamp vertically so a tall popup (e.g. a 6-row month) never runs off-screen.
    if (top + popH > window.innerHeight - 8) top = window.innerHeight - 8 - popH;
    if (top < 8) top = 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  /* ----------------------------- custom <select> ----------------------------- */
  function enhanceSelect(sel) {
    if (sel._ui) return;
    var wrap = document.createElement('div');
    wrap.className = 'ui-select';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.style.display = 'none';
    sel.setAttribute('tabindex', '-1');

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ui-trigger';
    var label = document.createElement('span');
    label.className = 'ui-trigger-label';
    trigger.appendChild(label);
    trigger.insertAdjacentHTML('beforeend', CARET);
    wrap.appendChild(trigger);

    var pop = null, activeIdx = -1;

    function selOpt() { return sel.options[sel.selectedIndex]; }
    function isPlaceholder() { var o = selOpt(); return !o || o.value === ''; }
    function refresh() {
      var o = selOpt();
      label.textContent = o ? o.textContent : '';
      trigger.classList.toggle('placeholder', isPlaceholder());
    }
    // Number of real (non-placeholder) options available to pick.
    function selectableCount() {
      var n = 0;
      for (var i = 0; i < sel.options.length; i++) {
        var o = sel.options[i];
        if (!(o.value === '' && o.disabled)) n++;
      }
      return n;
    }

    function buildPop() {
      pop = document.createElement('div');
      pop.className = 'ui-pop ui-pop-list';
      for (var i = 0; i < sel.options.length; i++) {
        var opt = sel.options[i];
        if (opt.value === '' && opt.disabled) continue; // hide the "Select…" placeholder
        var row = document.createElement('div');
        row.className = 'ui-opt' + (opt.disabled ? ' disabled' : '') + (i === sel.selectedIndex ? ' selected' : '');
        row.dataset.idx = i;
        row.innerHTML = '<span class="ui-opt-txt"></span>' + CHECK;
        row.querySelector('.ui-opt-txt').textContent = opt.textContent;
        if (!opt.disabled) {
          (function (idx, el) {
            el.addEventListener('mouseenter', function () { setActive(idx); });
            el.addEventListener('click', function () { choose(idx); });
          })(i, row);
        }
        pop.appendChild(row);
      }
      document.body.appendChild(pop);
    }
    function setActive(idx) {
      activeIdx = idx;
      if (!pop) return;
      pop.querySelectorAll('.ui-opt').forEach(function (r) {
        r.classList.toggle('active', Number(r.dataset.idx) === idx);
      });
    }
    function choose(idx) {
      var opt = sel.options[idx];
      if (!opt || opt.disabled) return;
      sel.selectedIndex = idx;
      refresh();
      close();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function open() {
      if (!selectableCount()) return; // nothing to choose → don't show an empty dropdown
      if (openCtrl && openCtrl !== ctrl) openCtrl.close();
      buildPop();
      openCtrl = ctrl;
      wrap.classList.add('open');
      positionPop(trigger, pop, true);
      requestAnimationFrame(function () { if (pop) pop.classList.add('show'); });
      setActive(sel.selectedIndex);
      var act = pop.querySelector('.ui-opt.selected') || pop.querySelector('.ui-opt');
      if (act) act.scrollIntoView({ block: 'nearest' });
    }
    function close() {
      wrap.classList.remove('open');
      if (pop) { var p = pop; pop = null; p.classList.remove('show'); setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 160); }
      if (openCtrl === ctrl) openCtrl = null;
    }
    function reposition() { if (pop) positionPop(trigger, pop, true); }

    trigger.addEventListener('click', function () { if (pop) close(); else open(); });
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!pop) { open(); return; }
        var n = sel.options.length, i = activeIdx < 0 ? (e.key === 'ArrowDown' ? -1 : 0) : activeIdx, guard = 0;
        do { i = e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n; guard++; }
        while (sel.options[i].disabled && guard <= n);
        setActive(i);
        var row = pop.querySelector('.ui-opt[data-idx="' + i + '"]');
        if (row) row.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); if (pop) choose(activeIdx); else open();
      }
    });

    var ctrl = {
      refresh: refresh, close: close, reposition: reposition,
      focusTrigger: function () { trigger.focus(); },
      contains: function (n) { return wrap.contains(n) || (pop && pop.contains(n)); }
    };
    sel._ui = ctrl;
    refresh();
  }

  /* ------------------------- custom date <input> ------------------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { if (!s) return null; var p = String(s).split('-'); if (p.length !== 3) return null; var d = new Date(+p[0], +p[1] - 1, +p[2]); return isNaN(d) ? null : d; }
  function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function lang() { return document.documentElement.lang || 'en'; }
  function locale() { return lang() === 'uk' ? 'uk-UA' : 'en-US'; }

  function enhanceDate(input) {
    if (input._ui) return;
    var wrap = document.createElement('div');
    wrap.className = 'ui-select ui-date';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.style.display = 'none';
    input.setAttribute('tabindex', '-1');

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ui-trigger';
    var label = document.createElement('span');
    label.className = 'ui-trigger-label';
    trigger.appendChild(label);
    trigger.insertAdjacentHTML('beforeend', CALICON);
    wrap.appendChild(trigger);

    var pop = null, viewYear = null, viewMonth = null;

    function placeholderText() {
      var ph = wrap.parentNode.querySelector('.date-placeholder');
      var txt = ph ? ph.textContent.replace(/^📅\s*/, '').trim() : '';
      return txt || (lang() === 'uk' ? 'Оберіть дату' : 'Select date');
    }
    function refresh() {
      var d = parseISO(input.value);
      if (d) {
        label.textContent = new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
        trigger.classList.remove('placeholder');
      } else {
        label.textContent = placeholderText();
        trigger.classList.add('placeholder');
      }
    }
    function render() {
      var sel = parseISO(input.value), today = new Date();
      if (viewYear == null) { var base = sel || today; viewYear = base.getFullYear(); viewMonth = base.getMonth(); }
      var minD = parseISO(input.min), maxD = parseISO(input.max);
      var first = new Date(viewYear, viewMonth, 1);
      var startDow = (first.getDay() + 6) % 7; // Monday-first
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var title = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(first);
      var dows = [];
      for (var i = 0; i < 7; i++) dows.push(new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2024, 0, 1 + i))); // 2024-01-01 = Monday

      var html = '<div class="ui-cal-head"><div class="ui-cal-title"></div><div class="ui-cal-nav">' +
        '<button type="button" data-nav="-1" aria-label="Prev">‹</button>' +
        '<button type="button" data-nav="1" aria-label="Next">›</button></div></div><div class="ui-cal-grid">';
      for (var w = 0; w < 7; w++) html += '<div class="ui-cal-dow"></div>';
      for (var e = 0; e < startDow; e++) html += '<div class="ui-cal-day empty"></div>';
      for (var day = 1; day <= daysInMonth; day++) {
        var cur = new Date(viewYear, viewMonth, day), iso = toISO(cur);
        var disabled = (minD && cur < stripTime(minD)) || (maxD && cur > stripTime(maxD));
        var cls = 'ui-cal-day' + (disabled ? ' disabled' : '') +
          (sel && iso === toISO(sel) ? ' selected' : '') + (iso === toISO(today) ? ' today' : '');
        html += '<div class="' + cls + '" data-iso="' + iso + '">' + day + '</div>';
      }
      // Pad only the LAST partial week so the final row is full-width — but do NOT force
      // a fixed 6 rows (that left empty rows + dead space at the bottom). The panel sizes
      // to the actual number of weeks; the vertical clamp in positionPop handles overflow.
      var trailing = (7 - ((startDow + daysInMonth) % 7)) % 7;
      for (var tz = 0; tz < trailing; tz++) html += '<div class="ui-cal-day empty"></div>';
      html += '</div><div class="ui-cal-foot"><button type="button" data-act="clear"></button>' +
        '<button type="button" data-act="today"></button></div>';
      pop.innerHTML = html;
      pop.querySelector('.ui-cal-title').textContent = title;
      var dowEls = pop.querySelectorAll('.ui-cal-dow');
      for (var k = 0; k < 7; k++) dowEls[k].textContent = dows[k];
      pop.querySelector('[data-act="clear"]').textContent = lang() === 'uk' ? 'Очистити' : 'Clear';
      pop.querySelector('[data-act="today"]').textContent = lang() === 'uk' ? 'Сьогодні' : 'Today';

      pop.querySelectorAll('[data-nav]').forEach(function (b) { b.addEventListener('click', function () { shift(Number(b.dataset.nav)); }); });
      pop.querySelectorAll('.ui-cal-day:not(.empty):not(.disabled)').forEach(function (c) { c.addEventListener('click', function () { pick(c.dataset.iso); }); });
      pop.querySelector('[data-act="clear"]').addEventListener('click', function () { pick(''); });
      pop.querySelector('[data-act="today"]').addEventListener('click', function () {
        // Compare at midnight, not the live timestamp — otherwise the current time-of-day
        // makes "today" read as > a max that is itself today, and the button refuses to pick.
        var t = stripTime(new Date());
        if ((minD && t < stripTime(minD)) || (maxD && t > stripTime(maxD))) { viewYear = t.getFullYear(); viewMonth = t.getMonth(); render(); return; }
        pick(toISO(t));
      });
      positionPop(trigger, pop, false);
    }
    function shift(n) { viewMonth += n; if (viewMonth < 0) { viewMonth = 11; viewYear--; } else if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); }
    function pick(iso) { input.value = iso; refresh(); close(); input.dispatchEvent(new Event('change', { bubbles: true })); }
    function open() {
      if (openCtrl && openCtrl !== ctrl) openCtrl.close();
      viewYear = null; viewMonth = null;
      pop = document.createElement('div'); pop.className = 'ui-pop ui-cal';
      document.body.appendChild(pop);
      render();
      openCtrl = ctrl; wrap.classList.add('open');
      requestAnimationFrame(function () { if (pop) pop.classList.add('show'); });
    }
    function close() {
      wrap.classList.remove('open');
      if (pop) { var p = pop; pop = null; p.classList.remove('show'); setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 160); }
      if (openCtrl === ctrl) openCtrl = null;
    }
    function reposition() { if (pop) positionPop(trigger, pop, false); }

    trigger.addEventListener('click', function () { if (pop) close(); else open(); });

    var ctrl = {
      refresh: refresh, close: close, reposition: reposition,
      focusTrigger: function () { trigger.focus(); },
      contains: function (n) { return wrap.contains(n) || (pop && pop.contains(n)); }
    };
    input._ui = ctrl;
    refresh();
  }

  /* ----------------------- custom multi-select <select multiple> -----------------------
     Used by the Category / Counterparty table filters. A checklist popup that toggles
     options without closing; an empty selection means "All". Drives the SAME underlying
     <select multiple> (keeps option.selected in sync, dispatches 'change'), so the app
     reads it like any select. Enhanced on every device — native multi-select is clumsy
     on both desktop and mobile. Rows are keyed by VALUE, so the app rebuilding the
     <select>'s options (on each render) never invalidates the open popup. */
  function enhanceMultiSelect(sel) {
    if (sel._ui) return;
    var wrap = document.createElement('div');
    wrap.className = 'ui-select ui-multi';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.style.display = 'none';
    sel.setAttribute('tabindex', '-1');

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ui-trigger';
    var label = document.createElement('span');
    label.className = 'ui-trigger-label';
    trigger.appendChild(label);
    trigger.insertAdjacentHTML('beforeend', CARET);
    wrap.appendChild(trigger);

    var pop = null;

    function uk() { return lang() === 'uk'; }
    function allLabel() { return uk() ? 'Усі' : 'All'; }
    function selectedOpts() { return Array.from(sel.selectedOptions); }
    function realOpts() { return Array.from(sel.options).filter(function (o) { return !(o.value === '' && o.disabled); }); }

    function refreshLabel() {
      var s = selectedOpts();
      if (!s.length) { label.textContent = allLabel(); trigger.classList.add('placeholder'); }
      else if (s.length === 1) { label.textContent = s[0].textContent; trigger.classList.remove('placeholder'); }
      else { label.textContent = s.length + ' ' + (uk() ? 'вибрано' : 'selected'); trigger.classList.remove('placeholder'); }
    }
    function syncRows() {
      if (!pop) return;
      var on = {};
      selectedOpts().forEach(function (o) { on[o.value] = 1; });
      pop.querySelectorAll('.ui-opt[data-val]').forEach(function (r) { r.classList.toggle('selected', !!on[r.dataset.val]); });
      var allRow = pop.querySelector('.ui-opt-all');
      if (allRow) allRow.classList.toggle('selected', !selectedOpts().length);
    }
    function refresh() { refreshLabel(); syncRows(); }
    function emit() { sel.dispatchEvent(new Event('change', { bubbles: true })); }
    function toggleVal(val) {
      var o = Array.from(sel.options).filter(function (x) { return x.value === val; })[0];
      if (!o) return;
      o.selected = !o.selected;
      refreshLabel(); syncRows(); emit();
    }
    function clearAll() {
      Array.from(sel.options).forEach(function (o) { o.selected = false; });
      refreshLabel(); syncRows(); emit();
    }
    function buildPop() {
      pop = document.createElement('div');
      pop.className = 'ui-pop ui-pop-list';
      var all = document.createElement('div');
      all.className = 'ui-opt ui-opt-all' + (selectedOpts().length ? '' : ' selected');
      all.innerHTML = '<span class="ui-opt-txt"></span>' + CHECK;
      all.querySelector('.ui-opt-txt').textContent = allLabel();
      all.addEventListener('click', function () { clearAll(); });
      pop.appendChild(all);
      realOpts().forEach(function (o) {
        var row = document.createElement('div');
        row.className = 'ui-opt' + (o.selected ? ' selected' : '');
        row.dataset.val = o.value;
        row.innerHTML = '<span class="ui-opt-txt"></span>' + CHECK;
        row.querySelector('.ui-opt-txt').textContent = o.textContent;
        row.addEventListener('click', function () { toggleVal(row.dataset.val); });
        pop.appendChild(row);
      });
      document.body.appendChild(pop);
    }
    function open() {
      if (!realOpts().length) return;
      if (openCtrl && openCtrl !== ctrl) openCtrl.close();
      buildPop();
      openCtrl = ctrl;
      wrap.classList.add('open');
      positionPop(trigger, pop, true);
      requestAnimationFrame(function () { if (pop) pop.classList.add('show'); });
    }
    function close() {
      wrap.classList.remove('open');
      if (pop) { var p = pop; pop = null; p.classList.remove('show'); setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 160); }
      if (openCtrl === ctrl) openCtrl = null;
    }
    function reposition() { if (pop) positionPop(trigger, pop, true); }

    trigger.addEventListener('click', function () { if (pop) close(); else open(); });

    var ctrl = {
      refresh: refresh, close: close, reposition: reposition,
      focusTrigger: function () { trigger.focus(); },
      contains: function (n) { return wrap.contains(n) || (pop && pop.contains(n)); }
    };
    sel._ui = ctrl;
    refreshLabel();
  }

  window.LyceeUI = {
    enhanceAll: function () {
      // Multi-selects get a custom checklist on EVERY device (native <select multiple> is
      // clumsy on desktop and mobile alike); single selects + dates stay native on touch.
      document.querySelectorAll('select[multiple]').forEach(enhanceMultiSelect);
      if (isTouch()) return;
      document.querySelectorAll('select:not([multiple])').forEach(enhanceSelect);
      document.querySelectorAll('input[type="date"]').forEach(enhanceDate);
    },
    refreshAll: function () {
      document.querySelectorAll('select, input[type="date"]').forEach(function (el) { if (el._ui) el._ui.refresh(); });
    }
  };
})();
