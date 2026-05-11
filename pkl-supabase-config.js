(function(){
  "use strict";

  function clean(value){ return String(value || "").trim(); }
  function cleanUrl(value){ return clean(value).replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, ""); }

  function readLocal(names){
    for(var i=0;i<names.length;i++){
      try{
        var v = clean(localStorage.getItem(names[i]));
        if(v) return v;
      }catch(e){}
    }
    return "";
  }

  function saveLocal(url, key){
    try{
      localStorage.setItem("SUPABASE_URL", url);
      localStorage.setItem("SUPABASE_ANON_KEY", key);
      localStorage.setItem("PKL_SUPABASE_URL", url);
      localStorage.setItem("PKL_SUPABASE_ANON_KEY", key);
    }catch(e){}
  }

  function applyConfig(config){
    config = config || {};
    var url = cleanUrl(config.url || config.supabaseUrl || config.SUPABASE_URL || "");
    var key = clean(config.anonKey || config.supabaseAnonKey || config.SUPABASE_ANON_KEY || "");

    window.PKL_SUPABASE_CONFIG = {
      url: url,
      anonKey: key,
      ready: !!(url && key)
    };

    if(url && key) saveLocal(url, key);

    try{
      window.dispatchEvent(new CustomEvent("pkl-supabase-config-ready", { detail: window.PKL_SUPABASE_CONFIG }));
    }catch(e){}

    return window.PKL_SUPABASE_CONFIG;
  }



  function ensureUnifiedSyncLoaded(){
    try{
      if(window.PKLSupabaseDataSync && window.PKLSupabaseDataSync.__pklSupabaseUnified20260511) return;
      if(exists) return;
      var script = document.createElement("script");
      script.defer = true;
      (document.head || document.documentElement).appendChild(script);
    }catch(e){}
  }

  var initialUrl = cleanUrl(readLocal(["SUPABASE_URL", "PKL_SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]));
  var initialKey = clean(readLocal(["SUPABASE_ANON_KEY", "PKL_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]));
  applyConfig({ url: initialUrl, anonKey: initialKey });

  window.PKL_SUPABASE_READY = fetch("/api/supabase-config", { cache: "no-store" })
    .then(function(res){ return res.ok ? res.json() : null; })
    .then(function(config){
      if(config && (config.url || config.anonKey)) return applyConfig(config);
      return window.PKL_SUPABASE_CONFIG;
    })
    .catch(function(){ return window.PKL_SUPABASE_CONFIG; });

  window.PKLGetSupabaseConfig = function(){ return window.PKL_SUPABASE_READY; };
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureUnifiedSyncLoaded, { once:true }); else ensureUnifiedSyncLoaded();
})();
