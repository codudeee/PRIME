/* PKL responsive scroll guard
   No zoom/scale. Keeps desktop UI width stable and lets the browser show a horizontal scrollbar
   when the window becomes narrower, so buttons/text do not collapse into the center. */
(function(){
  'use strict';
  if (window.__PKL_RESPONSIVE_SCROLL_GUARD_V2__) return;
  window.__PKL_RESPONSIVE_SCROLL_GUARD_V2__ = true;

  // Broadcast scoreboard must stay transparent/content-sized for OBS/SOOP.
  if (/pkl-scoreboard-live\.html/i.test(location.pathname)) return;

  function pageWidth(){
    var path = location.pathname.toLowerCase();
    if (path.indexOf('admin') !== -1) return 1440;
    if (path.indexOf('sheet') !== -1) return 1560;
    if (path.indexOf('result') !== -1) return 1320;
    if (path.indexOf('tier') !== -1) return 1320;
    if (path.indexOf('search') !== -1) return 1280;
    return 1280;
  }

  function apply(){
    var html=document.documentElement;
    var body=document.body;
    if(!html || !body) return;
    var w=pageWidth();
    html.style.setProperty('overflow-x','auto','important');
    html.style.setProperty('overflow-y','auto','important');
    html.style.setProperty('min-width', w+'px', 'important');
    body.style.setProperty('overflow-x','visible','important');
    body.style.setProperty('min-width', w+'px', 'important');
    body.style.setProperty('transform','none','important');
    body.style.setProperty('zoom','1','important');
    body.style.setProperty('width','auto','important');
    body.style.setProperty('--pkl-page-scale','1');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();
  window.addEventListener('resize',apply,{passive:true});
})();
