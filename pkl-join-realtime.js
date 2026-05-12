(function(){
  'use strict';
  if(window.PKLJoinRealtime && window.PKLJoinRealtime.__supabaseOnly20260512) return;

  var STATE = {
    version: 4,
    waitList: [],
    cancelList: [],
    recruitState: { state:'waiting', hostHtml:'', openTime:'', deadlineText:'모집대기중', feeText:'', feeInput:'', deadlineConfigured:false },
    updatedAt: ''
  };

  var saving = false;
  var lastText = '';

  function normalizeRecruit(v){
    if(!v || typeof v !== 'object') v = {};
    return Object.assign({
      state:'waiting',
      hostHtml:'',
      openTime:'',
      deadlineText:'모집대기중',
      feeText:'',
      feeInput:'',
      deadlineConfigured:false
    }, v);
  }

  function norm(v){
    return String(v == null ? '' : v).trim().replace(/\s+/g,'').toLowerCase();
  }

  function identity(item){
    item = item && typeof item === 'object' ? item : {};
    return norm(item.discord_id || item.discordId || item.user_id || item.userId || item.uid || item.memberId || item.accountId || item.key || item.id || item.pubgId || item.gameId || item.nickname || item.nick || item.name || item.displayName);
  }

  function uniqueList(list){
    var out = [];
    var seen = {};
    (Array.isArray(list) ? list : []).forEach(function(item){
      if(!item || typeof item !== 'object') return;
      var key = identity(item);
      if(!key) return;
      if(seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function normalizeState(st){
    st = st && typeof st === 'object' ? st : {};
    return {
      version: 4,
      waitList: uniqueList(st.waitList),
      cancelList: uniqueList(st.cancelList),
      recruitState: normalizeRecruit(st.recruitState),
      updatedAt: st.updatedAt || st.updated_at || new Date().toISOString()
    };
  }

  function cloneState(){
    return normalizeState(JSON.parse(JSON.stringify(STATE)));
  }

  function textOf(st){
    st = normalizeState(st);
    return JSON.stringify({
      waitList: st.waitList,
      cancelList: st.cancelList,
      recruitState: st.recruitState
    });
  }

  function emit(){
    var st = cloneState();
    try{ window.dispatchEvent(new CustomEvent('pkl-join-state-updated', { detail: st })); }catch(e){}
    try{ window.dispatchEvent(new Event('pkl-join-state-render-request')); }catch(e){}
  }

  function apply(st, silent){
    STATE = normalizeState(st);
    lastText = textOf(STATE);
    if(!silent) emit();
    return cloneState();
  }

  function apiRead(){
    return fetch('/api/pkl-data-store?type=live_scores&id=join_state&_=' + Date.now(), {
      method:'GET',
      headers:{ 'Cache-Control':'no-store' }
    }).then(function(r){
      return r.ok ? r.json().catch(function(){return null;}) : null;
    }).then(function(data){
      var rows = data && data.rows;
      var row = rows && rows[0];
      return row && row.payload ? normalizeState(Object.assign({}, row.payload, { updatedAt: row.payload.updatedAt || row.updated_at })) : null;
    }).catch(function(){ return null; });
  }

  function apiSave(st){
    st = normalizeState(st);
    return fetch('/api/pkl-data-store', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ type:'live_scores', id:'join_state', payload: st })
    }).then(function(r){
      return r.ok ? r.json().catch(function(){return null;}) : null;
    }).catch(function(){ return null; });
  }

  function fetchNow(){
    return apiRead().then(function(st){
      if(st) return apply(st);
      emit();
      return cloneState();
    });
  }

  function saveNow(){
    var st = normalizeState(STATE);
    var text = textOf(st);
    if(text === lastText) return Promise.resolve(st);
    lastText = text;
    saving = true;
    return apiSave(st).then(function(){
      saving = false;
      emit();
      return cloneState();
    }).catch(function(){
      saving = false;
      return cloneState();
    });
  }

  function setState(next, options){
    options = options || {};
    STATE = normalizeState(Object.assign({}, STATE, next || {}, { updatedAt: new Date().toISOString() }));
    emit();
    if(options.save !== false) return saveNow();
    return Promise.resolve(cloneState());
  }

  function setRecruitState(recruitState){
    return setState({ recruitState: normalizeRecruit(recruitState) });
  }

  function setWaitList(waitList){
    return setState({ waitList: uniqueList(waitList) });
  }

  function setCancelList(cancelList){
    return setState({ cancelList: uniqueList(cancelList) });
  }

  function reset(){
    return setState({
      waitList: [],
      cancelList: [],
      recruitState: normalizeRecruit({ state:'waiting' })
    });
  }

  window.PKLJoinRealtime = {
    __supabaseOnly20260512: true,
    start: fetchNow,
    fetchNow: fetchNow,
    save: saveNow,
    state: cloneState,
    getState: cloneState,
    apply: apply,
    setState: setState,
    setRecruitState: setRecruitState,
    setWaitList: setWaitList,
    setCancelList: setCancelList,
    reset: reset
  };

  fetchNow();
})();
