(function(){
  "use strict";
  if(window.PKLFirebaseDataSync && window.PKLFirebaseDataSync.__pklSupabaseCompatShim20260512) return;

  function parse(raw, fallback){
    try{ var v = JSON.parse(raw); return v == null ? fallback : v; }catch(e){ return fallback; }
  }
  function read(key, fallback){
    try{ return parse(localStorage.getItem(key), fallback); }catch(e){ return fallback; }
  }
  function write(key, value){
    try{ localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); }catch(e){}
  }
  function normalizeUsers(value){
    var list = Array.isArray(value) ? value : parse(value, []);
    if(!Array.isArray(list)) list = [];
    var out = [];
    var seen = Object.create(null);
    list.forEach(function(u){
      if(!u || typeof u !== "object") return;
      var key = String(u.discordId || u.id || u.userId || u.uid || u.pubgId || u.pubgID || u.gameId || u.nickname || u.name || "").trim().toLowerCase();
      if(!key) key = "idx_" + out.length;
      if(seen[key]) return;
      seen[key] = true;
      out.push(u);
    });
    return out;
  }
  function emit(key){
    try{ window.dispatchEvent(new CustomEvent("pkl-firebase-data-updated", {detail:{key:key}})); }catch(e){}
    if(key === "pklUsers" || key === "PKL_USERS"){
      try{ window.dispatchEvent(new CustomEvent("pkl-users-updated", {detail:{users:read(key, [])}})); }catch(e){}
      try{ window.dispatchEvent(new CustomEvent("pkl-role-data-updated", {detail:{users:read(key, [])}})); }catch(e){}
    }
  }

  var api = {
    __pklSupabaseCompatShim20260512: true,
    __pklSingleSourceFinal20260509: true,
    keys: [],
    refresh: function(){ return Promise.resolve(null); },
    save: function(key){ emit(String(key || "")); return Promise.resolve(true); },
    setShared: function(key, value){
      key = String(key || "");
      if(!key) return;
      if(key === "pklUsers" || key === "PKL_USERS"){
        var users = normalizeUsers(value);
        write("pklUsers", users);
        write("PKL_USERS", users);
        emit("pklUsers");
        return;
      }
      write(key, value);
      emit(key);
    },
    syncUsers: function(){
      var users = normalizeUsers(read("pklUsers", read("PKL_USERS", [])));
      write("pklUsers", users);
      write("PKL_USERS", users);
      emit("pklUsers");
      return users;
    }
  };

  window.PKLFirebaseDataSync = api;
  window.saveSharedData = function(key, value){ api.setShared(key, value); };
  try{ window.dispatchEvent(new CustomEvent("pkl-firebase-sync-ready")); }catch(e){}
})();
