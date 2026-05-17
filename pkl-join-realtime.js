(function(){
  if(window.__PKL_JOIN_REALTIME_SUPABASE_V3__) return;
  window.__PKL_JOIN_REALTIME_SUPABASE_V3__ = true;

  var WAIT_KEY='pklJoinWaitList', CANCEL_KEY='pklJoinCancelList', RECRUIT_KEY='pklJoinRecruitState';
  var KEYS={}; KEYS[WAIT_KEY]=1; KEYS[CANCEL_KEY]=1; KEYS[RECRUIT_KEY]=1;
  var originalSet=Storage.prototype.setItem, originalRemove=Storage.prototype.removeItem;
  var saveTimer=null, realtimeSocket=null, realtimeRef=1, realtimeJoined=false, applying=false;
  var lastText='', lastRemoteMs=0, lastSaveAt=0, lastLocalEditAt=0;
  var CONTROL_HOLD_MS = 8000;
  var remoteReady=false, localChanged=false, currentState=null;
  var pendingWait=[], pendingCancel=[], PENDING_MS=12000;
  var cfg=window.PKL_SUPABASE_CONFIG||{};
  var URL=String(cfg.url||localStorage.getItem('PKL_SUPABASE_URL')||'').replace(/\/+$/,'');
  var KEY=String(cfg.anonKey||localStorage.getItem('PKL_SUPABASE_ANON_KEY')||'');

  function configured(){
    var c=window.PKL_SUPABASE_CONFIG||{};
    URL=String(c.url||localStorage.getItem('SUPABASE_URL')||localStorage.getItem('PKL_SUPABASE_URL')||URL||'').replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');
    KEY=String(c.anonKey||localStorage.getItem('SUPABASE_ANON_KEY')||localStorage.getItem('PKL_SUPABASE_ANON_KEY')||KEY||'');
    return !!(URL&&KEY);
  }
  function parse(v,fb){try{var x=JSON.parse(v);return x==null?fb:x;}catch(e){return fb;}}
  function read(k,fb){try{return parse(localStorage.getItem(k),fb);}catch(e){return fb;}}
  function now(){return new Date().toISOString();}
  function norm(v){return String(v==null?'':v).trim().replace(/^discord-/i,'').replace(/\s+/g,'').toLowerCase();}
  function tokens(i){
    i=i&&typeof i==='object'?i:{};
    return [i.discord_id,i.discordId,i.uid,i.id,i.userId,i.memberId,i.loginId,i.key,i.pubg_id,i.pubgId,i.gameId,i.ref,i.nickname,i.nick,i.name,i.displayName]
      .map(norm).filter(Boolean);
  }
  function same(a,b){var aa=tokens(a),bb=tokens(b);return aa.length&&bb.length&&aa.some(function(x){return bb.indexOf(x)>=0;});}
  function actionMs(item){
    item=item||{};
    return Date.parse(item.rejoinedAt||item.canceledAt||item.cancelledAt||item.cancelAt||item.joinedAt||item.updatedAt||item.createdAt||'')||0;
  }
  function preferNewer(prev,next){
    if(!prev) return next;
    if(!next) return prev;
    var pm=actionMs(prev), nm=actionMs(next);
    if(nm && (!pm || nm>=pm)) return Object.assign({},prev,next);
    return prev;
  }
  function arr(v){
    var out=[];
    (Array.isArray(v)?v:[]).forEach(function(i){
      if(!i||typeof i!=='object') return;
      var idx=out.findIndex(function(p){return same(p,i);});
      if(idx<0){out.push(i);}else{out[idx]=preferNewer(out[idx],i);}
    });
    return out;
  }
  function addUnique(list,item){
    list=arr(list);
    if(item&&typeof item==='object'){
      var idx=list.findIndex(function(p){return same(p,item);});
      if(idx<0) list.push(item); else list[idx]=preferNewer(list[idx],item);
    }
    return list;
  }
  function removeMatching(list,item){return arr(list).filter(function(p){return !(item&&same(p,item));});}
  function mergeByIdentity(a,b){
    var out=[];
    arr(a).concat(arr(b)).forEach(function(item){
      if(!item||typeof item!=='object') return;
      var idx=out.findIndex(function(prev){return same(prev,item);});
      if(idx<0){out.push(item);}else{out[idx]=preferNewer(out[idx],item);}
    });
    return out;
  }
  function withoutMembers(list, remove){var rem=arr(remove);return arr(list).filter(function(item){return !rem.some(function(r){return same(r,item);});});}
  function waitTime(item){item=item||{};return Date.parse(item.rejoinedAt||item.joinedAt||item.updatedAt||item.createdAt||'')||0;}
  function cancelTime(item){item=item||{};return Date.parse(item.canceledAt||item.cancelledAt||item.cancelAt||item.updatedAt||item.createdAt||'')||0;}
  function cancelWins(waitItem,cancelItem){
    if(!same(waitItem,cancelItem)) return false;
    var wt=waitTime(waitItem), ct=cancelTime(cancelItem);
    if(wt&&ct) return ct>=wt;
    return true;
  }
  function waitWins(waitItem,cancelItem){
    if(!same(waitItem,cancelItem)) return false;
    var wt=waitTime(waitItem), ct=cancelTime(cancelItem);
    return !!(wt&&ct&&wt>ct);
  }
  function resolveWaitCancel(st){
    st=normalizeStateRaw(st);
    var originalWait=arr(st.waitList), originalCancel=arr(st.cancelList);
    st.waitList=originalWait.filter(function(w){return !originalCancel.some(function(c){return cancelWins(w,c);});});
    st.cancelList=originalCancel.filter(function(c){return !originalWait.some(function(w){return waitWins(w,c);});});
    return st;
  }
  function isResetState(st){
    st=st||{};
    var rs=st.recruitState||{};
    return !!(rs.resetNonce || rs.resetAt || rs.reset === true || (rs.state==='waiting' && !arr(st.waitList).length && !arr(st.cancelList).length && Date.now()-lastLocalEditAt<3000));
  }
  function rememberPending(type,item){
    if(!item||typeof item!=='object') return;
    var rec={item:item,at:Date.now()};
    if(type==='cancel'){
      pendingCancel=removeMatching(pendingCancel.map(function(x){return x.item;}),item).map(function(x){return {item:x,at:Date.now()};});
      pendingCancel.push(rec);
      pendingWait=removeMatching(pendingWait.map(function(x){return x.item;}),item).map(function(x){return {item:x,at:Date.now()};});
    }else{
      pendingWait=removeMatching(pendingWait.map(function(x){return x.item;}),item).map(function(x){return {item:x,at:Date.now()};});
      pendingWait.push(rec);
      pendingCancel=removeMatching(pendingCancel.map(function(x){return x.item;}),item).map(function(x){return {item:x,at:Date.now()};});
    }
    lastLocalEditAt=Date.now();localChanged=true;
  }
  function applyPending(normalized){
    var t=Date.now();
    pendingWait=pendingWait.filter(function(r){return t-r.at<PENDING_MS;});
    pendingCancel=pendingCancel.filter(function(r){return t-r.at<PENDING_MS;});
    pendingCancel.forEach(function(r){normalized.waitList=removeMatching(normalized.waitList,r.item);normalized.cancelList=addUnique(normalized.cancelList,r.item);});
    pendingWait.forEach(function(r){normalized.cancelList=removeMatching(normalized.cancelList,r.item);normalized.waitList=addUnique(normalized.waitList,r.item);});
    return normalized;
  }
  function stateFromLocal(){
    var recruit=read(RECRUIT_KEY,{state:'loading'});
    if(!remoteReady&&!localChanged&&(!recruit||!recruit.state)){recruit={state:'loading'};}
    var st={version:2,waitList:arr(read(WAIT_KEY,[])),cancelList:arr(read(CANCEL_KEY,[])),recruitState:recruit||{state:'loading'},updatedAt:now()};
    if(localChanged){currentState=st;}
    return st;
  }
  function normalizeStateRaw(st){
    st=st&&typeof st==='object'?st:{};
    return {version:2,waitList:arr(st.waitList),cancelList:arr(st.cancelList),recruitState:st.recruitState||{state:'loading'},updatedAt:st.updatedAt||now()};
  }
  function normalizeState(st){
    return resolveWaitCancel(normalizeStateRaw(st));
  }
  function textOf(st){return JSON.stringify({waitList:arr(st.waitList),cancelList:arr(st.cancelList),recruitState:st.recruitState||{state:'loading'}});}
  function setLocal(k,v){applying=true;try{originalSet.call(localStorage,k,typeof v==='string'?v:JSON.stringify(v));}catch(e){}finally{applying=false;}}
  var renderQueued=false;
  function requestJoinRender(){
    if(renderQueued) return;
    renderQueued=true;
    setTimeout(function(){
      renderQueued=false;
      try{
        if(typeof window.PKLJoinRenderAll === 'function') window.PKLJoinRenderAll();
        else if(typeof window.PKLJoinSyncActionButtons === 'function') window.PKLJoinSyncActionButtons();
      }catch(e){}
    },0);
  }
  function emit(st){
    try{window.dispatchEvent(new CustomEvent('pkl-join-state-updated',{detail:st}));}catch(e){}
    requestJoinRender();
  }

  function applyState(st){
    if(!st||typeof st!=='object') return;
    remoteReady=true;
    var ms=Date.parse(st.updatedAt||'')||0;
    if(ms&&ms<lastRemoteMs) return;
    var nowMs=Date.now();
    var normalized=normalizeState(st);
    normalized=resolveWaitCancel(applyPending(normalized));

    if(nowMs-lastLocalEditAt<CONTROL_HOLD_MS){
      var localWait=arr(read(WAIT_KEY,[]));
      var localCancel=arr(read(CANCEL_KEY,[]));
      var localRecruit=read(RECRUIT_KEY,null);
      if(localRecruit && localRecruit.state){
        normalized.recruitState=localRecruit;
      }
      if(!isResetState(normalized)){
        normalized.waitList=withoutMembers(mergeByIdentity(normalized.waitList, localWait), localCancel);
        normalized.cancelList=withoutMembers(mergeByIdentity(normalized.cancelList, localCancel), localWait);
      }
      if(localChanged && (!ms || ms<lastLocalEditAt)) normalized.updatedAt=now();
    }

    normalized=resolveWaitCancel(applyPending(normalized));
    if(lastSaveAt&&ms&&ms<lastSaveAt-50 && nowMs-lastLocalEditAt>=CONTROL_HOLD_MS && !pendingWait.length && !pendingCancel.length) return;
    lastRemoteMs=ms||nowMs;
    currentState=normalized;
    setLocal(WAIT_KEY,normalized.waitList);
    setLocal(CANCEL_KEY,normalized.cancelList);
    setLocal(RECRUIT_KEY,normalized.recruitState);
    lastText=textOf(normalized);
    emit(normalized);
  }
  function sb(path,opt){
    if(!configured()) return Promise.resolve(null);
    opt=opt||{};
    opt.headers=Object.assign({apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},opt.headers||{});
    return fetch(URL+'/rest/v1/'+path,opt).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).catch(function(){return null;});
  }
  function apiSave(st){return fetch('/api/pkl-data-store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'live_scores',id:'join_state',payload:st})}).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).catch(function(){return null;});}
  function apiRead(){return fetch('/api/pkl-data-store?type=live_scores&id=join_state&_='+Date.now(),{method:'GET',headers:{'Cache-Control':'no-store'}}).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).then(function(data){var rows=data&&data.rows;var r=rows&&rows[0];return r&&r.payload?Object.assign({},r.payload,{updatedAt:r.payload.updatedAt||r.updated_at}):null;}).catch(function(){return null;});}
  function mergeForSave(localSt, serverSt){
    localSt=normalizeState(localSt);
    serverSt=serverSt?normalizeState(serverSt):null;
    if(!serverSt || isResetState(localSt)) return localSt;
    var merged=normalizeState(localSt);
    // localSt는 방금 클릭한 브라우저의 최종 상태다.
    // 대기취소→다시 참가 시, 서버의 옛 cancelList가 local waitList를 다시 지우지 못하게 한다.
    merged.waitList=withoutMembers(mergeByIdentity(serverSt.waitList, localSt.waitList), localSt.cancelList);
    merged.cancelList=withoutMembers(mergeByIdentity(serverSt.cancelList, localSt.cancelList), localSt.waitList);
    merged.recruitState=localSt.recruitState&&localSt.recruitState.state?localSt.recruitState:serverSt.recruitState;
    merged.updatedAt=now();
    return resolveWaitCancel(applyPending(merged));
  }
  function saveNow(){
    var localSt=stateFromLocal();
    var doSave=function(serverSt){
      var st=mergeForSave(localSt, serverSt || currentState);
      currentState=st;
      lastSaveAt=Date.parse(st.updatedAt||'')||Date.now();
      var text=textOf(st);
      var shouldSkip=(text===lastText && Date.now()-lastLocalEditAt>1200);
      if(shouldSkip) return Promise.resolve(st);
      lastText=text;
      setLocal(WAIT_KEY,st.waitList);
      setLocal(CANCEL_KEY,st.cancelList);
      setLocal(RECRUIT_KEY,st.recruitState);
      emit(st);
      var p=apiSave(st).then(function(ok){if(!ok){return sb('live_scores?on_conflict=id',{method:'POST',body:JSON.stringify({id:'join_state',payload:st,updated_at:st.updatedAt})});}return ok;});
      if(window.PKLSupabaseDataSync){try{
        Promise.resolve(window.PKLSupabaseDataSync.setShared(WAIT_KEY,st.waitList)).catch(function(){});
        Promise.resolve(window.PKLSupabaseDataSync.setShared(CANCEL_KEY,st.cancelList)).catch(function(){});
        Promise.resolve(window.PKLSupabaseDataSync.setShared(RECRUIT_KEY,st.recruitState)).catch(function(){});
      }catch(e){}}
      return p.then(function(){localChanged=false;return st;}).catch(function(){return st;});
    };
    return apiRead().then(doSave).catch(function(){return doSave(null);});
  }
  function queueSave(d){if(applying)return;clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,d==null?180:d);}
  function fetchNow(){
    if(localChanged && Date.now()-lastLocalEditAt<CONTROL_HOLD_MS){return Promise.resolve(currentState||stateFromLocal());}
    return apiRead().then(function(st){
      if(st){applyState(st);return st;}
      if(configured()) return sb('live_scores?id=eq.join_state&select=payload,updated_at&limit=1',{method:'GET'}).then(function(rows){
        var r=rows&&rows[0];
        if(r&&r.payload){var next=Object.assign({},r.payload,{updatedAt:r.payload.updatedAt||r.updated_at});applyState(next);return next;}
        return null;
      });
      return null;
    });
  }
  function realtimeSend(topic,event,payload){
    if(!realtimeSocket || realtimeSocket.readyState!==1) return;
    realtimeSocket.send(JSON.stringify({topic:topic,event:event,payload:payload||{},ref:String(realtimeRef++)}));
  }
  function startRealtime(){
    if(!configured() || realtimeSocket) return;
    try{
      var wsUrl=URL.replace(/^http/i,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(KEY)+'&vsn=1.0.0';
      realtimeSocket=new WebSocket(wsUrl);
      realtimeSocket.onopen=function(){
        realtimeJoined=false;
        realtimeSend('realtime:public:live_scores','phx_join',{
          config:{
            broadcast:{self:false},
            presence:{key:''},
            postgres_changes:[{event:'*',schema:'public',table:'live_scores',filter:'id=eq.join_state'}]
          }
        });
      };
      realtimeSocket.onmessage=function(ev){
        var msg=null; try{msg=JSON.parse(ev.data);}catch(e){return;}
        if(msg.event==='phx_reply' && msg.payload && msg.payload.status==='ok') realtimeJoined=true;
        if(msg.event==='postgres_changes'){
          var data=msg.payload && msg.payload.data;
          var row=(data && (data.record || data.new || data.old)) || null;
          var payload=row && row.payload;
          if(payload){
            var next=Object.assign({},payload,{updatedAt:payload.updatedAt||row.updated_at});
            applyState(next);
          }
        }
      };
      realtimeSocket.onclose=function(){realtimeSocket=null; realtimeJoined=false;};
      realtimeSocket.onerror=function(){try{realtimeSocket.close();}catch(e){}};
    }catch(e){realtimeSocket=null; realtimeJoined=false;}
  }
  function start(){
    apiRead().then(function(st){
      if(st){applyState(st);}else{emit({version:2,waitList:arr(read(WAIT_KEY,[])),cancelList:arr(read(CANCEL_KEY,[])),recruitState:{state:'loading'},updatedAt:now()});}
    }).catch(function(){emit({version:2,waitList:arr(read(WAIT_KEY,[])),cancelList:arr(read(CANCEL_KEY,[])),recruitState:{state:'loading'},updatedAt:now()});});
    startRealtime();
  }
  if(!Storage.prototype.__pklJoinRealtimePatched){
    Storage.prototype.setItem=function(k,v){var ret=originalSet.apply(this,arguments);try{if(this===localStorage&&KEYS[String(k)]&&!applying){lastLocalEditAt=Date.now();localChanged=true;queueSave(String(k)===RECRUIT_KEY?220:120);emit(stateFromLocal());}}catch(e){}return ret;};
    Storage.prototype.__pklJoinRealtimePatched=true;
  }
  try{Storage.prototype.removeItem=function(k){var ret=originalRemove.apply(this,arguments);try{if(this===localStorage&&KEYS[String(k)]&&!applying){lastLocalEditAt=Date.now();localChanged=true;queueSave(180);emit(stateFromLocal());}}catch(e){}return ret;};}catch(e){}
  window.PKLJoinRealtime={__pklJoinSupabase20260516:true,start:start,save:saveNow,flush:saveNow,queueSave:queueSave,state:stateFromLocal,getState:function(){var st=(localChanged && Date.now()-lastLocalEditAt<CONTROL_HOLD_MS)?stateFromLocal():(currentState||stateFromLocal());return applyPending(normalizeState(st));},apply:applyState,fetchNow:fetchNow,markJoin:function(item){rememberPending('join',item);queueSave(0);},markCancel:function(item){rememberPending('cancel',item);queueSave(0);}};
  start();
})();
