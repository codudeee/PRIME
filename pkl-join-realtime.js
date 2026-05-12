(function(){
  'use strict';
  if(window.PKLJoinRealtime && window.PKLJoinRealtime.__PKL_JOIN_SUPABASE_ONLY_20260512__) return;

  var DEFAULT_RECRUIT = {
    state: 'waiting',
    hostHtml: '',
    openTime: '',
    deadlineText: '모집대기중',
    feeText: '',
    feeInput: '',
    deadlineConfigured: false
  };

  var CURRENT = {
    version: 5,
    waitList: [],
    cancelList: [],
    recruitState: Object.assign({}, DEFAULT_RECRUIT),
    updatedAt: ''
  };

  var booted = false;
  var saveTimer = null;
  var lastSavedText = '';

  function normalizeText(v){
    return String(v == null ? '' : v).trim().replace(/\s+/g,'').toLowerCase();
  }

  function identity(item){
    item = item && typeof item === 'object' ? item : {};
    return normalizeText(
      item.discord_id ||
      item.discordId ||
      item.user_id ||
      item.userId ||
      item.uid ||
      item.memberId ||
      item.accountId ||
      item.key ||
      item.id ||
      item.pubgId ||
      item.gameId ||
      item.nickname ||
      item.nick ||
      item.name ||
      item.displayName
    );
  }

  function uniqueList(list){
    var out = [];
    var seen = Object.create(null);
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

  function normalizeRecruit(recruit){
    recruit = recruit && typeof recruit === 'object' ? recruit : {};
    var state = String(recruit.state || 'waiting').toLowerCase();
    if(state !== 'open' && state !== 'closed') state = 'waiting';

    return Object.assign({}, DEFAULT_RECRUIT, recruit, {
      state: state,
      deadlineText: recruit.deadlineText || (state === 'open' ? '' : (state === 'closed' ? '모집마감' : '모집대기중'))
    });
  }

  function normalizeState(st){
    st = st && typeof st === 'object' ? st : {};
    return {
      version: 5,
      waitList: uniqueList(st.waitList),
      cancelList: uniqueList(st.cancelList),
      recruitState: normalizeRecruit(st.recruitState),
      updatedAt: st.updatedAt || st.updated_at || new Date().toISOString()
    };
  }

  function clone(){
    return normalizeState(JSON.parse(JSON.stringify(CURRENT)));
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
    var state = clone();
    try{ window.dispatchEvent(new CustomEvent('pkl-join-state-updated', { detail: state })); }catch(e){}
    try{ window.dispatchEvent(new Event('pkl-join-state-render-request')); }catch(e){}
  }

  function applyState(st, silent){
    CURRENT = normalizeState(st);
    if(!silent) emit();
    return clone();
  }

  function readRemote(){
    return fetch('/api/pkl-data-store?type=live_scores&id=join_state&_=' + Date.now(), {
      method: 'GET',
      headers: { 'Cache-Control': 'no-store' }
    }).then(function(res){
      return res.ok ? res.json().catch(function(){ return null; }) : null;
    }).then(function(data){
      var rows = data && data.rows;
      var row = rows && rows[0];
      return row && row.payload
        ? normalizeState(Object.assign({}, row.payload, { updatedAt: row.payload.updatedAt || row.updated_at }))
        : null;
    }).catch(function(){
      return null;
    });
  }

  function saveRemote(st){
    st = normalizeState(st);
    return fetch('/api/pkl-data-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'live_scores', id: 'join_state', payload: st })
    }).then(function(res){
      return res.ok ? res.json().catch(function(){ return null; }) : null;
    }).catch(function(){
      return null;
    });
  }

  function fetchNow(){
    return readRemote().then(function(remote){
      if(remote){
        booted = true;
        lastSavedText = textOf(remote);
        return applyState(remote);
      }
      booted = true;
      emit();
      return clone();
    });
  }

  function saveNow(){
    if(!booted) return Promise.resolve(clone());
    var st = normalizeState(CURRENT);
    var text = textOf(st);
    if(text === lastSavedText) return Promise.resolve(clone());
    lastSavedText = text;
    return saveRemote(st).then(function(){
      emit();
      return clone();
    });
  }

  function setState(next, options){
    options = options || {};
    CURRENT = normalizeState(Object.assign({}, CURRENT, next || {}, { updatedAt: new Date().toISOString() }));
    emit();
    if(options.save === false) return Promise.resolve(clone());
    clearTimeout(saveTimer);
    return new Promise(function(resolve){
      saveTimer = setTimeout(function(){
        saveNow().then(resolve);
      }, options.delay == null ? 120 : options.delay);
    });
  }

  function setRecruitState(recruit){
    return setState({ recruitState: normalizeRecruit(recruit) }, { delay: 80 });
  }

  function setWaitList(waitList){
    return setState({ waitList: uniqueList(waitList) }, { delay: 120 });
  }

  function setCancelList(cancelList){
    return setState({ cancelList: uniqueList(cancelList) }, { delay: 120 });
  }

  function reset(){
    return setState({
      waitList: [],
      cancelList: [],
      recruitState: Object.assign({}, DEFAULT_RECRUIT, { state: 'waiting' })
    }, { delay: 80 });
  }

  window.PKLJoinRealtime = {
    __PKL_JOIN_SUPABASE_ONLY_20260512__: true,
    start: fetchNow,
    fetchNow: fetchNow,
    save: saveNow,
    getState: clone,
    state: clone,
    apply: applyState,
    setState: setState,
    setRecruitState: setRecruitState,
    setWaitList: setWaitList,
    setCancelList: setCancelList,
    reset: reset
  };

  fetchNow();
})();
