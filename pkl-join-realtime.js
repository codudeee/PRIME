(function(){
  'use strict';
  if(window.PKLJoinRealtime && window.PKLJoinRealtime.__pklJoinSupabase20260512) return;

  var WAIT_KEY='pklJoinWaitList', CANCEL_KEY='pklJoinCancelList', RECRUIT_KEY='pklJoinRecruitState';
  var KEYS={pklJoinWaitList:true,pklJoinCancelList:true,pklJoinRecruitState:true};
  var originalSet=Storage.prototype.setItem;
  var originalRemove=Storage.prototype.removeItem;
  var applying=false, bootstrapped=false, booting=false, saveTimer=null, lastText='', lastLocalEditAt=0;
  var cfg=window.PKL_SUPABASE_CONFIG||{};
  var URL=String(cfg.url||'').replace(/\/+$/,'');
  var KEY=String(cfg.anonKey||'');

  function configured(){
    var c=window.PKL_SUPABASE_CONFIG||{};
    URL=String(c.url||localStorage.getItem('SUPABASE_URL')||localStorage.getItem('PKL_SUPABASE_URL')||URL||'')
      .replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');
    KEY=String(c.anonKey||localStorage.getItem('SUPABASE_ANON_KEY')||localStorage.getItem('PKL_SUPABASE_ANON_KEY')||KEY||'');
    return !!(URL&&KEY);
  }
  function parse(v,fb){try{var x=JSON.parse(v);return x==null?fb:x;}catch(e){return fb;}}
  function read(k,fb){try{return parse(localStorage.getItem(k),fb);}catch(e){return fb;}}
  function now(){return new Date().toISOString();}
  function norm(v){return String(v==null?'':v).trim().replace(/\s+/g,'').toLowerCase();}
  function identity(i){
    i=i&&typeof i==='object'?i:{};
    return norm(i.discord_id||i.discordId||i.discord||i.uid||i.userId||i.memberId||i.accountId||i.key||i.id||i.pubgId||i.gameId||i.nickname||i.nick||i.name||i.displayName);
  }
  function arr(v){
    var out=[], seen={};
    (Array.isArray(v)?v:[]).forEach(function(i){
      if(!i||typeof i!=='object') return;
      var k=identity(i);
      if(!k) return;
      if(seen[k]) return;
      seen[k]=true;
      out.push(i);
    });
    return out;
  }
  function defaultRecruit(){
    return {state:'waiting',hostHtml:'',openTime:'',deadlineText:'모집대기중',feeText:'',feeInput:'',deadlineConfigured:false};
  }
  function stateFromLocal(){
    return {
      version:3,
      waitList:arr(read(WAIT_KEY,[])),
      cancelList:arr(read(CANCEL_KEY,[])),
      recruitState:read(RECRUIT_KEY,defaultRecruit())||defaultRecruit(),
      updatedAt:now()
    };
  }
  function normalizeState(st){
    st=st&&typeof st==='object'?st:{};
    return {
      version:3,
      waitList:arr(st.waitList),
      cancelList:arr(st.cancelList),
      recruitState:(st.recruitState&&typeof st.recruitState==='object')?st.recruitState:defaultRecruit(),
      updatedAt:st.updatedAt||st.updated_at||now()
    };
  }
  function textOf(st){
    st=normalizeState(st);
    return JSON.stringify({waitList:st.waitList,cancelList:st.cancelList,recruitState:st.recruitState});
  }
  function setLocal(k,v){
    applying=true;
    try{originalSet.call(localStorage,k,typeof v==='string'?v:JSON.stringify(v));}catch(e){}
    applying=false;
  }
  function emit(st){
    try{window.dispatchEvent(new CustomEvent('pkl-join-state-updated',{detail:normalizeState(st)}));}catch(e){}
    try{window.dispatchEvent(new Event('pkl-join-state-render-request'));}catch(e){}
  }
  function applyState(st){
    st=normalizeState(st);
    setLocal(WAIT_KEY,st.waitList);
    setLocal(CANCEL_KEY,st.cancelList);
    setLocal(RECRUIT_KEY,st.recruitState);
    lastText=textOf(st);
    emit(st);
  }
  function sb(path,opt){
    if(!configured()) return Promise.resolve(null);
    opt=opt||{};
    opt.headers=Object.assign({
      apikey:KEY,
      Authorization:'Bearer '+KEY,
      'Content-Type':'application/json',
      Prefer:'resolution=merge-duplicates,return=representation'
    },opt.headers||{});
    return fetch(URL+'/rest/v1/'+path,opt).then(function(r){
      return r.ok?r.json().catch(function(){return null;}):null;
    }).catch(function(){return null;});
  }
  function apiSave(st){
    st=normalizeState(st);
    return fetch('/api/pkl-data-store',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'live_scores',id:'join_state',payload:st})
    }).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).catch(function(){return null;});
  }
  function apiRead(){
    return fetch('/api/pkl-data-store?type=live_scores&id=join_state&_='+Date.now(),{
      method:'GET',
      headers:{'Cache-Control':'no-store'}
    }).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).then(function(data){
      var rows=data&&data.rows;
      var r=rows&&rows[0];
      return r&&r.payload?normalizeState(Object.assign({},r.payload,{updatedAt:r.payload.updatedAt||r.updated_at})):null;
    }).catch(function(){return null;});
  }
  function fetchRemote(){
    return apiRead().then(function(st){
      if(st) return st;
      if(!configured()) return null;
      return sb('live_scores?id=eq.join_state&select=payload,updated_at&limit=1',{method:'GET'}).then(function(rows){
        var r=rows&&rows[0];
        return r&&r.payload?normalizeState(Object.assign({},r.payload,{updatedAt:r.payload.updatedAt||r.updated_at})):null;
      });
    });
  }
  function saveNow(){
    if(!bootstrapped || booting) return;
    var st=normalizeState(stateFromLocal());
    var text=textOf(st);
    if(text===lastText) return;
    lastText=text;
    apiSave(st).then(function(ok){
      if(!ok){
        sb('live_scores?on_conflict=id',{method:'POST',body:JSON.stringify({id:'join_state',payload:st,updated_at:st.updatedAt})});
      }
    });
  }
  function queueSave(d){
    if(applying || booting || !bootstrapped) return;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(saveNow,d==null?350:d);
  }
  function boot(){
    if(booting) return;
    booting=true;
    fetchRemote().then(function(st){
      if(st){
        applyState(st);
      }else{
        lastText=textOf(stateFromLocal());
        emit(stateFromLocal());
      }
    }).finally(function(){
      booting=false;
      bootstrapped=true;
      setTimeout(function(){emit(stateFromLocal());},0);
    });
  }
  function fetchNow(){
    return fetchRemote().then(function(st){
      if(st) applyState(st);
      return st;
    });
  }

  if(!Storage.prototype.__pklJoinRealtimePatchedV3){
    Storage.prototype.setItem=function(k,v){
      var ret=originalSet.apply(this,arguments);
      try{
        if(this===localStorage&&KEYS[String(k)]&&!applying){
          lastLocalEditAt=Date.now();
          queueSave(String(k)===RECRUIT_KEY?180:300);
          if(bootstrapped) emit(stateFromLocal());
        }
      }catch(e){}
      return ret;
    };
    Storage.prototype.__pklJoinRealtimePatchedV3=true;
  }
  try{
    Storage.prototype.removeItem=function(k){
      var ret=originalRemove.apply(this,arguments);
      try{
        if(this===localStorage&&KEYS[String(k)]&&!applying){
          lastLocalEditAt=Date.now();
          queueSave(300);
          if(bootstrapped) emit(stateFromLocal());
        }
      }catch(e){}
      return ret;
    };
  }catch(e){}

  window.PKLJoinRealtime={
    __pklJoinSupabase20260512:true,
    start:boot,
    save:saveNow,
    queueSave:queueSave,
    state:stateFromLocal,
    apply:applyState,
    fetchNow:fetchNow
  };

  boot();
})();
