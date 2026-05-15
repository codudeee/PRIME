(function(){
  "use strict";
  var VERSION = "20260513b";
  try {
    var url = new URL(window.location.href);
    var p = url.pathname || "/";
    if (/\/api\/discord-callback/i.test(p)) return;
  } catch(e) {}
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs){
        regs.forEach(function(reg){ try { reg.unregister(); } catch(e){} });
      }).catch(function(){});
    }
  } catch(e) {}
  try {
    if (window.caches && caches.keys) {
      caches.keys().then(function(keys){
        keys.forEach(function(key){ try { caches.delete(key); } catch(e){} });
      }).catch(function(){});
    }
  } catch(e) {}
  try {
    var last = sessionStorage.getItem("PKL_BOOT_VERSION");
    if (last !== VERSION) sessionStorage.setItem("PKL_BOOT_VERSION", VERSION);
  } catch(e) {}
})();
