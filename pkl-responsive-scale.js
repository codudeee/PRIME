/* PKL desktop-scale responsive helper
   Keeps the original desktop layout fixed, and scales the whole page down
   when the browser window is narrower than the designed page width. */
(function(){
  'use strict';
  if (window.__PKL_RESPONSIVE_SCALE_V1__) return;
  window.__PKL_RESPONSIVE_SCALE_V1__ = true;

  var MIN_SCALE = 0.48;
  var MAX_SCALE = 1;
  var baseWidth = 0;
  var ticking = false;

  function pxNumber(value){
    var n = parseFloat(String(value || '').replace('px',''));
    return Number.isFinite(n) ? n : 0;
  }

  function measureElementRight(){
    var maxRight = 0;
    var nodes = document.body ? document.body.querySelectorAll('body > *:not(script), .app, .page, .wrap, .container, main, header, nav, section') : [];
    for (var i=0;i<nodes.length;i++){
      var el = nodes[i];
      if (!el || el.id === 'pkl-scale-debug') continue;
      var rect = el.getBoundingClientRect();
      if (!rect || rect.width < 40 || rect.height < 20) continue;
      if (rect.right > 0 && rect.right < 10000) maxRight = Math.max(maxRight, rect.right + window.scrollX);
      var cs = window.getComputedStyle(el);
      maxRight = Math.max(maxRight, pxNumber(cs.minWidth), pxNumber(cs.width));
    }
    return maxRight;
  }

  function detectBaseWidth(){
    var body = document.body;
    var html = document.documentElement;
    if (!body || !html) return 1280;

    var oldZoom = body.style.zoom;
    var oldTransform = body.style.transform;
    body.style.zoom = '1';
    body.style.transform = 'none';

    var explicit = pxNumber(body.getAttribute('data-pkl-design-width')) || pxNumber(html.getAttribute('data-pkl-design-width'));
    var minBody = pxNumber(window.getComputedStyle(body).minWidth);
    var minHtml = pxNumber(window.getComputedStyle(html).minWidth);
    var minApp = 0;
    var app = document.querySelector('.app');
    if (app) minApp = pxNumber(window.getComputedStyle(app).minWidth);

    var measured = Math.max(
      explicit,
      minBody,
      minHtml,
      minApp,
      body.scrollWidth || 0,
      html.scrollWidth || 0,
      measureElementRight(),
      1280
    );

    body.style.zoom = oldZoom;
    body.style.transform = oldTransform;
    return Math.ceil(measured);
  }

  function setScale(){
    ticking = false;
    var body = document.body;
    var html = document.documentElement;
    if (!body || !html) return;

    if (!baseWidth) baseWidth = detectBaseWidth();

    var viewport = Math.max(window.innerWidth || 0, html.clientWidth || 0, 320);
    var scale = viewport < baseWidth ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewport / baseWidth)) : 1;
    scale = Math.round(scale * 10000) / 10000;

    html.style.overflowX = 'hidden';
    body.style.overflowX = 'hidden';
    body.style.transformOrigin = '0 0';
    body.style.setProperty('--pkl-page-scale', String(scale));

    if ('zoom' in body.style) {
      body.style.zoom = String(scale);
      body.style.transform = '';
      body.style.width = scale < 1 ? (100 / scale) + 'vw' : '';
      body.style.minWidth = baseWidth + 'px';
    } else {
      body.style.zoom = '';
      body.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
      body.style.width = baseWidth + 'px';
      body.style.minWidth = baseWidth + 'px';
      var h = Math.ceil((body.scrollHeight || html.scrollHeight || window.innerHeight) * scale);
      html.style.minHeight = h + 'px';
    }
  }

  function requestScale(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(setScale);
  }

  function boot(){
    baseWidth = detectBaseWidth();
    setScale();
    setTimeout(function(){ baseWidth = Math.max(baseWidth, detectBaseWidth()); setScale(); }, 250);
    setTimeout(function(){ baseWidth = Math.max(baseWidth, detectBaseWidth()); setScale(); }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  window.addEventListener('resize', requestScale, { passive:true });
  window.addEventListener('orientationchange', function(){ setTimeout(function(){ baseWidth = 0; requestScale(); }, 120); }, { passive:true });
})();
