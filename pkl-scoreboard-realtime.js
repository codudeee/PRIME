(function(){
  "use strict";
  if(window.PKLScoreboardRealtime && window.PKLScoreboardRealtime.__pklCellLiveFinal20260510) return;

  var STORAGE_KEY="PKL_EFFICIENT_MATCH_SHEET_LIVE_SYNC_V1";
  var SNAPSHOT_KEY="PKL_SCOREBOARD_LIVE_SNAPSHOT_V1";
  var cfg=window.PKL_SUPABASE_CONFIG||{};
  var SUPABASE_URL=String(cfg.url||localStorage.getItem('PKL_SUPABASE_URL')||'').replace(/\/+$/,'');
  var SUPABASE_KEY=String(cfg.anonKey||localStorage.getItem('PKL_SUPABASE_ANON_KEY')||'');
  var publishTimer=null, fallbackPollTimer=null, unsubscribe=null, lastPayloadText="", publishInFlight=false, pendingPublish=false, lastLiveSeq=0, publishBackoffUntil=0, publishBackoffMs=0;
  var RESET_LOCK_KEY='PKL_SHEET_RESET_LOCK_V2';
  function readResetLock(){try{return window.__PKL_RESET_LOCK||JSON.parse(localStorage.getItem(RESET_LOCK_KEY)||'null');}catch(e){return null;}}
  function resetLockedAgainst(remoteNonce){var l=readResetLock();if(!l||Date.now()>Number(l.until||0))return false;var rn=Number(remoteNonce||0);return !rn || rn<Number(l.nonce||0);}

  function configured(){var c=window.PKL_SUPABASE_CONFIG||{};SUPABASE_URL=String(c.url||localStorage.getItem('SUPABASE_URL')||localStorage.getItem('PKL_SUPABASE_URL')||SUPABASE_URL||'').replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');SUPABASE_KEY=String(c.anonKey||localStorage.getItem('SUPABASE_ANON_KEY')||localStorage.getItem('PKL_SUPABASE_ANON_KEY')||SUPABASE_KEY||'');return !!(SUPABASE_URL&&SUPABASE_KEY);}
  function sb(path,opt){
    if(!configured()) return Promise.resolve(null);
    opt=opt||{};
    opt.headers=Object.assign({apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},opt.headers||{});
    return fetch(SUPABASE_URL+'/rest/v1/'+path,opt).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).catch(function(){return null;});
  }
  function rowToDoc(row){return row&&row.payload?{fields:{payload:{stringValue:JSON.stringify(row.payload.payload||row.payload)},live:{stringValue:JSON.stringify(row.payload.live||null)}}}:null;}

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function readJson(key,fb){try{var v=JSON.parse(localStorage.getItem(key)||'null');return v==null?fb:v;}catch(e){return fb;}}
  function clean(v){return String(v==null?'':v).trim();}
  function num(v){v=Number(v||0);return Number.isFinite(v)?v:0;}
  function tierRole(text){var raw=clean(text), c=raw.replace(/[\s_-]+/g,'').toLowerCase();var map={tier0high:'tier0_high',tier0mid:'tier0_mid',tier0low:'tier0_low',tier1high:'tier1_high',tier1mid:'tier1_mid',tier1low:'tier1_low',tier2high:'tier2_high',tier2mid:'tier2_mid',tier2low:'tier2_low',tier3high:'tier3_high',tier3mid:'tier3_mid',tier3low:'tier3_low',tier4high:'tier4_high',tier4mid:'tier4_mid',tier4low:'tier4_low',beast:'beast','0티어상':'tier0_high','0상':'tier0_high','0티어중':'tier0_mid','0중':'tier0_mid','0티어하':'tier0_low','0하':'tier0_low','1티어상':'tier1_high','1상':'tier1_high','1티어중':'tier1_mid','1중':'tier1_mid','1티어하':'tier1_low','1하':'tier1_low','2티어상':'tier2_high','2상':'tier2_high','2티어중':'tier2_mid','2중':'tier2_mid','2티어하':'tier2_low','2하':'tier2_low','3티어상':'tier3_high','3상':'tier3_high','3티어중':'tier3_mid','3중':'tier3_mid','3티어하':'tier3_low','3하':'tier3_low','4티어상':'tier4_high','4상':'tier4_high','4티어중':'tier4_mid','4중':'tier4_mid','4티어하':'tier4_low','4하':'tier4_low','짐승':'beast'};return map[c]||raw;}
  function lane(role){return {tier0_high:'0상',tier0_mid:'0중',tier0_low:'0하',tier1_high:'1상',tier1_mid:'1중',tier1_low:'1하',tier2_high:'2상',tier2_mid:'2중',tier2_low:'2하',tier3_high:'3상',tier3_mid:'3중',tier3_low:'3하',tier4_high:'4상',tier4_mid:'4중',tier4_low:'4하',beast:'짐승'}[role]||role;}
  function defaults(){return {'0상':{target:85,death:-3},'0중':{target:75,death:-3},'0하':{target:65,death:-3},'1상':{target:55,death:-3},'1중':{target:50,death:-3},'1하':{target:45,death:-3},'2상':{target:40,death:-3},'2중':{target:35,death:-2},'2하':{target:30,death:-2},'3상':{target:25,death:-2},'3중':{target:20,death:-2},'3하':{target:15,death:-1},'4상':{target:10,death:-1},'4중':{target:5,death:-1},'4하':{target:0,death:-1},'짐승':{target:0,death:-1}};}
  function config(){var b=defaults();var s=readJson('pklTierScoreConfig',null);if(s&&typeof s==='object')Object.keys(s).forEach(function(k){var v=s[k]||{},l=lane(k);b[l]={target:Number.isFinite(Number(v.target))?Number(v.target):(b[l]||{}).target||0,death:Number.isFinite(Number(v.death))?Number(v.death):(b[l]||{}).death||0};});return b;}
  function memberName(m){return clean(m&&(m.name||m.nickname||m.nick||m.displayName||m.pubgId||m.gameId||m.username));}
  function memberTier(m){var r=tierRole(m&&(m.memberTier||m.tierRole||m.gradeRole||m.tier||m.grade||m.memberGrade));var c=config();return c[lane(r)]||{target:0,death:0};}
  function realTeamId(viewId){return String(viewId||'').replace(/[ab]$/,'');}
  function teamData(round,id){return (round&&round.teams&&round.teams[id])||{kills:[0,0,0,0],deaths:[0,0,0,0],chicken:0,stop:0};}
  function chickenScore(round,d){if(!d||!num(d.chicken))return 0;return clean(round&&round.map)==='사'?5:8;}
  function visibleTeams(state){
    var teams=Array.isArray(state.teams)?state.teams:[];
    if(state.mode==='duo'){
      var out=[];teams.forEach(function(t,i){var ms=Array.isArray(t.members)?t.members:[];out.push({id:(t.id||('team'+(i+1)))+'a',realId:t.id||('team'+(i+1)),memberOffset:0,members:ms.slice(0,2)});out.push({id:(t.id||('team'+(i+1)))+'b',realId:t.id||('team'+(i+1)),memberOffset:2,members:ms.slice(2,4)});});
      return out.filter(function(t){return t.members.some(function(m){return memberName(m)&&memberName(m)!=='-';});});
    }
    return teams.slice(0,10).map(function(t,i){return {id:t.id||('team'+(i+1)),realId:t.id||('team'+(i+1)),memberOffset:0,members:(Array.isArray(t.members)?t.members:[]).slice(0,4)};}).filter(function(t){return t.members.some(function(m){return memberName(m)&&memberName(m)!=='-';});});
  }
  function calc(state,team){var kills=[0,0,0,0],deaths=[0,0,0,0],chicken=0,stop=0,chickenCount=0,offset=team.memberOffset||0;(Array.isArray(state.rounds)?state.rounds:[]).forEach(function(r){var d=teamData(r,team.realId||realTeamId(team.id));(d.kills||[]).forEach(function(v,i){if(i>=offset&&i<offset+4) kills[i-offset]+=num(v);});(d.deaths||[]).forEach(function(v,i){if(i>=offset&&i<offset+4) deaths[i-offset]+=num(v);});var cs=chickenScore(r,d);chicken+=cs;if(cs)chickenCount+=1;stop+=num(d.stop);});var target=team.members.reduce(function(s,m){return s+num(memberTier(m).target);},0);var pure=kills.slice(0,team.members.length).reduce(function(a,b){return a+b;},0);var deathPenalty=team.members.reduce(function(s,m,i){return s+num(memberTier(m).death)*num(deaths[i]);},0);var score=pure+chicken+stop+deathPenalty;var percent=target>0?Math.round(score/target*100):(score>0?100:(score<0?-100:0));return {kills:kills,deaths:deaths,target:target,score:score,percent:percent,gauge:Math.max(0,Math.min(100,percent)),pure:pure,chicken:chicken,chickenCount:chickenCount,stop:stop};}

  function feedBaseKey(f){
    var type=clean(f&&f.type), text=clean(f&&f.text), key=clean(f&&f.key);
    if(key){
      var parts=key.split(':');
      if(type==='콜드' && parts[0]==='cold' && parts[1]) return 'cold-active:'+parts[1]+':'+(parts[2]||'');
      return key;
    }
    return type+'|'+text;
  }
  function normalizeFeeds(list){
    var seen={}, out=[];
    (Array.isArray(list)?list:[]).forEach(function(f){
      if(!f || typeof f!=='object') return;
      var item={type:clean(f.type),text:clean(f.text),time:num(f.time)||Date.now(),key:clean(f.key)};
      var base=feedBaseKey(item);
      if(!base || seen[base]) return;
      seen[base]=true;
      out.push(item);
    });
    return out.sort(function(a,b){return num(b.time)-num(a.time);}).slice(0,50);
  }
  function buildSnapshot(){
    var state=readJson(STORAGE_KEY,{});
    var teams=visibleTeams(state).map(function(t,i){var c=calc(state,t);return {id:t.id,idx:i,score:c.score,target:c.target,percent:c.percent,gauge:c.gauge,pure:c.pure,kills:c.kills,deaths:c.deaths,chicken:c.chicken,chickenCount:c.chickenCount,stop:c.stop,members:t.members.map(function(m){var mt=memberTier(m);return {name:memberName(m),death:num(mt.death)};})};}).sort(function(a,b){return b.percent-a.percent||b.score-a.score||b.pure-a.pure||a.idx-b.idx;});
    return {version:1,updatedAt:new Date().toISOString(),teams:teams};
  }
  function readSheetState(){
    try{
      if(window.PKLSheetLiveBridge && typeof window.PKLSheetLiveBridge.getState==='function'){
        var st=window.PKLSheetLiveBridge.getState();
        if(st && Array.isArray(st.teams) && Array.isArray(st.rounds)) return st;
      }
    }catch(e){}
    return readJson(STORAGE_KEY,{});
  }
  function normalizeLiveState(st){
    try{
      (Array.isArray(st&&st.rounds)?st.rounds:[]).forEach(function(r){
        Object.keys((r&&r.teams)||{}).forEach(function(k){
          var d=r.teams[k]||{};
          d.chicken=!!Number(d.chicken||0);
          if(!Array.isArray(d.kills)) d.kills=[0,0,0,0];
          if(!Array.isArray(d.deaths)) d.deaths=[0,0,0,0];
          d.stop=num(d.stop);
          r.teams[k]=d;
        });
      });
    }catch(e){}
    return st;
  }
  function normalizeTeamData(d){
    d=d&&typeof d==='object'?d:{};
    d.kills=Array.isArray(d.kills)?d.kills.slice(0,4):[0,0,0,0];
    d.deaths=Array.isArray(d.deaths)?d.deaths.slice(0,4):[0,0,0,0];
    while(d.kills.length<4)d.kills.push(0);
    while(d.deaths.length<4)d.deaths.push(0);
    d.kills=d.kills.map(num);
    d.deaths=d.deaths.map(num);
    d.chicken=!!Number(d.chicken||0);
    d.stop=num(d.stop);
    return d;
  }
  function cellLivePayload(){
    var st=readSheetState();
    if(!st || !Array.isArray(st.teams) || !Array.isArray(st.rounds)) return '';
    var live={version:4,seq:Date.now(),updatedAt:new Date().toISOString(),resetNonce:st.resetNonce||0,mode:st.mode||'squad',selectedTeamId:st.selectedTeamId||'',teams:[],rounds:[],feeds:[],eventKeys:{},colds:(st.colds&&typeof st.colds==='object')?st.colds:{},fires:(st.fires&&typeof st.fires==='object')?st.fires:{},surrenders:(st.surrenders&&typeof st.surrenders==='object')?st.surrenders:{}};
    try{
      live.teams=(st.teams||[]).map(function(t,i){return {id:t.id||('team'+(i+1)),members:(Array.isArray(t.members)?t.members:[]).map(function(m){return {name:memberName(m),nickname:clean(m&&(m.nickname||m.nick||m.displayName)),pubgId:clean(m&&(m.pubgId||m.pubgID||m.gameId||m.pubgName)),memberTier:clean(m&&(m.memberTier||m.tierRole||m.gradeRole||m.tier||m.grade||m.memberGrade))};})};});
      live.rounds=(st.rounds||[]).map(function(r,ri){var round={no:r.no||ri+1,map:clean(r.map),teams:{}};Object.keys((r&&r.teams)||{}).forEach(function(teamId){round.teams[teamId]=normalizeTeamData(r.teams[teamId]);});return round;});
      live.feeds=normalizeFeeds(st.feeds);
      live.eventKeys=(st.eventKeys&&typeof st.eventKeys==='object')?st.eventKeys:{};
      return JSON.stringify(live);
    }catch(e){return '';}
  }
  function writeLocalSnapshot(snap){try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(snap));}catch(e){} try{window.dispatchEvent(new CustomEvent('pkl-live-scoreboard-updated',{detail:snap}));}catch(e){}}
  function doPublish(){
    if(Date.now()<publishBackoffUntil){ schedulePublish(Math.max(1000,publishBackoffUntil-Date.now())); return; }
    var snap=buildSnapshot();
    var payload=JSON.stringify(snap);
    var sheet=cellLivePayload();
    var compare=payload+'|'+sheet;
    if(compare===lastPayloadText) return;
    lastPayloadText=compare;
    writeLocalSnapshot(snap);
    var body={id:'live_scoreboard',payload:{payload:snap,live:sheet?JSON.parse(sheet):null},updated_at:snap.updatedAt};
    publishInFlight=true;
    try{
      sb('live_scores',{method:'POST',body:JSON.stringify(body)})
        .then(function(){publishBackoffMs=0;publishBackoffUntil=0;})
        .catch(function(){publishBackoffMs=publishBackoffMs?Math.min(publishBackoffMs*2,60000):10000;publishBackoffUntil=Date.now()+publishBackoffMs;})
        .finally(function(){publishInFlight=false;if(pendingPublish){pendingPublish=false;setTimeout(doPublish,220);}});
    }catch(e){publishInFlight=false;}
  }
  function publishNow(){
    if(publishInFlight){pendingPublish=true;return;}
    doPublish();
  }
  function schedulePublish(delay){clearTimeout(publishTimer);publishTimer=setTimeout(publishNow,delay==null?450:delay);}

  function syncLiveScoreboardSize(){
    var grid=document.getElementById('grid');
    var wrap=document.getElementById('wrap');
    if(!grid || !wrap || !/pkl-scoreboard-live/i.test(location.pathname)) return;
    var count=parseInt(grid.getAttribute('data-count')||'0',10)||0;
    var cols=count<=1?1:(count===2?2:(count<=4?4:(count<=8?4:5)));
    var card=288, gap=10, pad=24;
    var width=count?((cols*card)+((cols-1)*gap)+pad):520;
    grid.style.width=width+'px';
    wrap.style.width=width+'px';
    document.documentElement.style.width=width+'px';
    document.body.style.width=width+'px';
    document.documentElement.style.height='auto';
    document.body.style.height='auto';
  }

  function renderSnapshot(snap){
    var grid=document.getElementById('grid'); if(!grid||!snap) return;
    var teams=Array.isArray(snap.teams)?snap.teams:[];
    grid.setAttribute('data-count', String(Math.max(0, Math.min(10, teams.length))));
    if(!teams.length){grid.innerHTML='<div class="pkl-empty">표시할 팀 스코어보드가 없습니다.</div>';syncLiveScoreboardSize();return;}
    grid.innerHTML=teams.map(function(t,rank){return '<article class="pkl-team-card '+(rank===0?'first':'')+'"><div class="pkl-score" style="--gauge:'+num(t.gauge)+'%"><span>'+num(t.score)+' / '+num(t.target)+' ('+num(t.percent)+'%)</span></div><div class="pkl-members">'+(Array.isArray(t.members)?t.members:[]).map(function(m,i){var kill=num((t.kills||[])[i]);var death=Math.abs(num(m.death)*num((t.deaths||[])[i]));return '<div class="pkl-member"><span class="pkl-name">'+esc(m.name)+'</span><span class="pkl-kd">'+(kill-death)+' ('+kill+'/'+death+')</span></div>';}).join('')+'</div><div class="pkl-team-footer"><span class="pkl-foot-stat chicken">'+num(t.chicken||0)+'</span><span class="pkl-foot-stat stop">'+num(t.stop||0)+'</span></div></article>';}).join('');
    syncLiveScoreboardSize();
  }
  function readRemotePayload(doc){
    var p=doc&&doc.fields&&doc.fields.payload&&doc.fields.payload.stringValue; if(!p && doc&&doc.payload&&doc.payload.payload) p=doc.payload.payload;
    if(!p && doc && typeof doc.data==='function'){var d=doc.data()||{};p=d.payload;}
    if(!p) return null;
    try{return typeof p==='string'?JSON.parse(p):p;}catch(e){return null;}
  }
  function readRemoteLive(doc){
    var p=doc&&doc.fields&&doc.fields.live&&doc.fields.live.stringValue; if(!p && doc&&doc.payload&&doc.payload.live) p=doc.payload.live;
    if(!p && doc && typeof doc.data==='function'){var d=doc.data()||{};p=d.live;}
    if(!p) return null;
    try{return typeof p==='string'?JSON.parse(p):p;}catch(e){return null;}
  }
  function mergeLiveIntoState(live){
    if(!live || !Array.isArray(live.rounds)) return null;
    if(resetLockedAgainst(live && live.resetNonce)) return null;
    var st=readSheetState();
    try{
      var localMs=Date.parse((st&&st.savedAt)||(st&&st.teamExportedAt)||(st&&st.updatedAt)||'');
      var liveMs=Date.parse((live&&live.updatedAt)||'');
      if(localMs && liveMs && localMs-liveMs>250) return null;
    }catch(e){}
    if(live.seq && Number(live.seq)<lastLiveSeq) return null;
    try{
      var localNonce=Number((st&&st.resetNonce)||0), remoteNonce=Number((live&&live.resetNonce)||0);
      if(localNonce && remoteNonce && remoteNonce<localNonce) return null;
    }catch(e){}
    if(live.seq) lastLiveSeq=Number(live.seq);
    if(!st || !Array.isArray(st.teams) || !Array.isArray(st.rounds)) st={mode:live.mode||'squad',selectedTeamId:live.selectedTeamId||'team1',teams:[],rounds:[],feeds:[],sideBets:[],eventKeys:{},surrenders:{},fires:{},fireCancels:{},colds:{},startTime:'',endTime:''};
    st.mode=live.mode||st.mode||'squad';
    st.selectedTeamId=live.selectedTeamId||st.selectedTeamId||'team1';
    if(Array.isArray(live.teams) && live.teams.length){
      st.teams=live.teams.map(function(t,i){var old=(st.teams||[]).find(function(x){return String(x&&x.id)===String(t&&t.id);})||(st.teams||[])[i]||{};return Object.assign({},old,{id:t.id||old.id||('team'+(i+1)),members:Array.isArray(t.members)?t.members:(old.members||[])});});
    }
    live.rounds.forEach(function(r,ri){
      if(!st.rounds[ri]) st.rounds[ri]={no:r.no||ri+1,map:'',teams:{}};
      st.rounds[ri].no=r.no||st.rounds[ri].no||ri+1;
      if(r.map!==undefined) st.rounds[ri].map=r.map;
      if(!st.rounds[ri].teams) st.rounds[ri].teams={};
      Object.keys((r&&r.teams)||{}).forEach(function(teamId){st.rounds[ri].teams[teamId]=normalizeTeamData(r.teams[teamId]);});
    });
    if(Array.isArray(live.feeds)){
      /*
        IMPORTANT: LIVE cards are a real-time mirror, not an append-only backup.
        Older builds merged remote feeds with local feeds, so when chicken/fire/surrender
        was toggled OFF and removed remotely, the old local card could be merged back in
        on re-enter or slow guest refresh. Replace the visible feed list with the latest
        remote feed list exactly, so ON/OFF state is deterministic.
      */
      st.feeds=normalizeFeeds(live.feeds);
    }
    if(live.eventKeys && typeof live.eventKeys==='object') st.eventKeys=live.eventKeys;
    if(live.resetNonce) st.resetNonce=live.resetNonce;
    if(live.colds && typeof live.colds==='object') st.colds=live.colds;
    if(live.fires && typeof live.fires==='object') st.fires=live.fires;
    if(live.surrenders && typeof live.surrenders==='object') st.surrenders=live.surrenders;
    return st;
  }
  function startViewer(){
    var local=readJson(SNAPSHOT_KEY,null); if(local) renderSnapshot(local);
    startFallbackPoll();
  }
  function startFallbackPoll(){
    if(fallbackPollTimer) return;
    var tick=function(){try{sb('live_scores?id=eq.live_scoreboard&select=payload,updated_at&limit=1',{method:'GET'}).then(function(rows){var doc=rows&&rows[0];var snap=readRemotePayload(doc);if(snap){writeLocalSnapshot(snap);renderSnapshot(snap);}applySheetFromDoc(doc);}).catch(function(){});}catch(e){}};
    tick(); fallbackPollTimer=null;
  }
  function applySheetFromDoc(doc){
    var bridge=window.PKLSheetLiveBridge;
    if(!bridge || typeof bridge.applyState!=='function') return;
    try{
      if(bridge.isTyping && bridge.isTyping()) return;
      if(bridge.getLastLocalEditAt && Date.now()-Number(bridge.getLastLocalEditAt()||0)<350) return;
    }catch(e){}
    var st=mergeLiveIntoState(readRemoteLive(doc));
    if(st) bridge.applyState(normalizeLiveState(st));
  }
  function startSheetMirror(){
    startFallbackPoll();
  }
  function bindSheetPublisher(){
    schedulePublish(450);
    document.addEventListener('input',function(e){if(e.target&&e.target.dataset&&e.target.dataset.field&&e.target.dataset.field!=='map'){try{window.PKLSheetLiveBridge&&window.PKLSheetLiveBridge.markLocalEdit&&window.PKLSheetLiveBridge.markLocalEdit();}catch(x){} schedulePublish(e&&e.target&&e.target.type==='checkbox'?180:550);}},true);
    document.addEventListener('change',function(e){if(e.target&&e.target.dataset&&e.target.dataset.field){try{window.PKLSheetLiveBridge&&window.PKLSheetLiveBridge.markLocalEdit&&window.PKLSheetLiveBridge.markLocalEdit();}catch(x){} schedulePublish(e&&e.target&&e.target.type==='checkbox'?180:550);}},true);
    document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-map-pick],[data-stop-pick]')) schedulePublish(180);},true);
    /* 2차 청소: storage 이벤트 기반 재게시 금지. 입력/변경/클릭 저장 흐름만 사용한다. */
  }
  window.addEventListener('pkl-sheet-hard-reset',function(e){lastPayloadText='';lastLiveSeq=Date.now();setTimeout(function(){try{publishNow();}catch(x){}},180);});
  window.PKLScoreboardRealtime={__pklCellLiveFinal20260510:true,publish:publishNow,schedulePublish:schedulePublish,startViewer:startViewer,renderSnapshot:renderSnapshot,buildSnapshot:buildSnapshot,startSheetMirror:startSheetMirror};
  if(document.getElementById('recordBody')){ bindSheetPublisher(); startSheetMirror(); }
  if(document.getElementById('grid') && /pkl-scoreboard-live/i.test(location.pathname)) startViewer();
})();


// pklTeamModePassiveRealtime
window.addEventListener('pkl-team-mode-changed', function(e){
  var d = e.detail || {};
  try{
    document.documentElement.dataset.pklTeamMode = d.mode || '';
    document.documentElement.dataset.pklTeamCount = String(d.teams || 10);
    document.documentElement.dataset.pklTeamSlots = String(d.slots || 4);
  }catch(error){}
});
