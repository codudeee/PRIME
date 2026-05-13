(function(){
  'use strict';
  if (window.__PKL_DESKTOP_SCROLL_LOCK_V1__) return;
  window.__PKL_DESKTOP_SCROLL_LOCK_V1__ = true;
  if (/pkl-scoreboard-live\.html/i.test(location.pathname)) return;

  function widthForPath(){
    var p = (location.pathname || '').toLowerCase();
    if (p.indexOf('sheet') !== -1 || p.indexOf('pkl-sheet') !== -1) return 1560;
    if (p.indexOf('admin') !== -1) return 1440;
    if (p.indexOf('team') !== -1) return 1440;
    if (p.indexOf('result') !== -1) return 1440;
    return 1440;
  }
  function apply(){
    var w = widthForPath();
    var content = Math.max(1320, w - 120);
    var root = document.documentElement;
    var body = document.body;
    if (!root) return;
    root.style.setProperty('--pkl-desktop-width', w + 'px');
    root.style.setProperty('--pkl-content-width', content + 'px');
    root.style.setProperty('min-width', w + 'px', 'important');
    root.style.setProperty('overflow-x', 'auto', 'important');
    root.style.setProperty('overflow-y', 'auto', 'important');
    if (body){
      body.style.setProperty('min-width', w + 'px', 'important');
      body.style.setProperty('overflow-x', 'visible', 'important');
      body.style.setProperty('transform', 'none', 'important');
      body.style.setProperty('zoom', '1', 'important');
      body.dataset.pklDesktopLock = '1';
    }
  }
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true});
  else apply();
  window.addEventListener('resize', apply, {passive:true});
})();
