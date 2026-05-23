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
  function postLiveScoreboardPayload(payload, updatedAt){
    /*
      점수 반영 지연의 핵심 원인: 브라우저가 서버 API 응답을 3~10초 기다린 뒤에야
      live_scores가 갱신되면 다른 창은 결국 polling fallback으로만 보게 된다.
      실시간 점수는 live_scores 한 row upsert만 필요하므로, Supabase REST 직접 upsert를
      1순위로 시도하고 실패할 때만 서버 API로 fallback한다.
      운영 데이터의 원본은 여전히 Supabase live_scores이며 localStorage 복구는 사용하지 않는다.
    */
    var now=updatedAt||new Date().toISOString();
    var body={id:'live_scoreboard',payload:payload,updated_at:now};
    function directUpsert(){
      if(!configured()) return Promise.resolve(false);
      var controller=null,timer=null;
      try{controller=new AbortController();timer=setTimeout(function(){try{controller.abort();}catch(e){}},1200);}catch(e){}
      return fetch(SUPABASE_URL+'/rest/v1/live_scores?on_conflict=id',{
        method:'POST',
        headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
        cache:'no-store',
        signal:controller&&controller.signal,
        body:JSON.stringify(body)
      }).then(function(res){return !!(res&&res.ok);})
        .catch(function(){return false;})
        .finally(function(){if(timer)clearTimeout(timer);});
    }
    function apiFallback(){
      var controller=null,timer=null;
      try{controller=new AbortController();timer=setTimeout(function(){try{controller.abort();}catch(e){}},2500);}catch(e){}
      return fetch('/api/pkl-data-store',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        signal:controller&&controller.signal,
        body:JSON.stringify({type:'live_scores',id:'live_scoreboard',payload:payload,updated_at:now})
      }).then(function(res){return !!(res&&res.ok);})
        .catch(function(){return false;})
        .finally(function(){if(timer)clearTimeout(timer);});
    }
    return directUpsert().then(function(ok){return ok || apiFallback();});
  }
  function rowToDoc(row){return row&&row.payload?{fields:{payload:{stringValue:JSON.stringify(row.payload.payload||row.payload)},live:{stringValue:JSON.stringify(row.payload.live||null)}}}:null;}

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function readJson(key,fb){try{var v=JSON.parse(localStorage.getItem(key)||'null');return v==null?fb:v;}catch(e){return fb;}}
  function clean(v){return String(v==null?'':v).trim();}
  function num(v){v=Number(v||0);return Number.isFinite(v)?v:0;}
  function tierRole(text){var raw=clean(text), c=raw.replace(/[\s_-]+/g,'').toLowerCase();var map={tier0high:'tier0_high',tier0mid:'tier0_mid',tier0low:'tier0_low',tier1high:'tier1_high',tier1mid:'tier1_mid',tier1low:'tier1_low',tier2high:'tier2_high',tier2mid:'tier2_mid',tier2low:'tier2_low',tier3high:'tier3_high',tier3mid:'tier3_mid',tier3low:'tier3_low',tier4high:'tier4_high',tier4mid:'tier4_mid',tier4low:'tier4_low',beast:'tier5_low',beasthigh:'tier5_high',beastlow:'tier5_low',beastmid:'tier5_mid',tier5high:'tier5_high',tier5mid:'tier5_mid',tier5low:'tier5_low','0티어상':'tier0_high','0상':'tier0_high','0티어중':'tier0_mid','0중':'tier0_mid','0티어하':'tier0_low','0하':'tier0_low','1티어상':'tier1_high','1상':'tier1_high','1티어중':'tier1_mid','1중':'tier1_mid','1티어하':'tier1_low','1하':'tier1_low','2티어상':'tier2_high','2상':'tier2_high','2티어중':'tier2_mid','2중':'tier2_mid','2티어하':'tier2_low','2하':'tier2_low','3티어상':'tier3_high','3상':'tier3_high','3티어중':'tier3_mid','3중':'tier3_mid','3티어하':'tier3_low','3하':'tier3_low','4티어상':'tier4_high','4상':'tier4_high','4티어중':'tier4_mid','4중':'tier4_mid','4티어하':'tier4_low','4하':'tier4_low','5티어상':'tier5_high','5상':'tier5_high','5티어중':'tier5_mid','5중':'tier5_mid','5티어하':'tier5_low','5하':'tier5_low','짐승':'tier5_low','짐승상':'tier5_high','짐승중':'tier5_mid','짐승하':'tier5_low','5상':'tier5_high','5중':'tier5_mid','5하':'tier5_low','5티어상':'tier5_high','5티어중':'tier5_mid','5티어하':'tier5_low','5티어 상':'tier5_high','5티어 중':'tier5_mid','5티어 하':'tier5_low'};return map[c]||raw;}
  function lane(role){return {tier0_high:'0상',tier0_mid:'0중',tier0_low:'0하',tier1_high:'1상',tier1_mid:'1중',tier1_low:'1하',tier2_high:'2상',tier2_mid:'2중',tier2_low:'2하',tier3_high:'3상',tier3_mid:'3중',tier3_low:'3하',tier4_high:'4상',tier4_mid:'4중',tier4_low:'4하',beast:'5하',beast_high:'5상',beast_mid:'5중',beast_low:'5하',tier5_high:'5상',tier5_mid:'5중',tier5_low:'5하'}[role]||role;}
  function defaults(){return {'0상':{target:85,death:-3},'0중':{target:75,death:-3},'0하':{target:65,death:-3},'1상':{target:55,death:-3},'1중':{target:50,death:-3},'1하':{target:45,death:-3},'2상':{target:40,death:-3},'2중':{target:35,death:-2},'2하':{target:30,death:-2},'3상':{target:25,death:-2},'3중':{target:20,death:-2},'3하':{target:15,death:-1},'4상':{target:10,death:-1},'4중':{target:5,death:-1},'4하':{target:0,death:-1},'5상':{target:0,death:-1},'5중':{target:-5,death:-1},'5하':{target:-10,death:-1},'짐승':{target:-10,death:-1}};}
  function mergeTierScoreConfig(b,s){if(s&&typeof s==='object')Object.keys(s).forEach(function(k){var v=s[k]||{},l=lane(k);if(!b[l])return;b[l]={target:Number.isFinite(Number(v.target))?Number(v.target):(b[l]||{}).target||0,death:Number.isFinite(Number(v.death))?Number(v.death):(b[l]||{}).death||0};});return b;}
  function config(){return mergeTierScoreConfig(defaults(), window.__PKL_TIER_SCORE_CONFIG||{});}
  function loadTierScoreConfig(){return fetch('/api/pkl-data-store?type=live_scores&id='+encodeURIComponent('tier_score_config_current')+'&_='+Date.now(),{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-store'}}).then(function(r){return r.json().catch(function(){return {};});}).then(function(data){var row=data&&Array.isArray(data.rows)?data.rows[0]:null;var server=row&&row.payload&&typeof row.payload==='object'?row.payload:{};window.__PKL_TIER_SCORE_CONFIG=mergeTierScoreConfig({},server);try{renderSnapshot(buildSnapshot());}catch(e){};}).catch(function(){return fetch('/api/pkl-shared?key='+encodeURIComponent('pklTierScoreConfig')+'&_='+Date.now(),{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-store'}}).then(function(r){return r.json().catch(function(){return {};});}).then(function(data){var server=(data&&data.item&&data.item.value&&typeof data.item.value==='object')?data.item.value:{};window.__PKL_TIER_SCORE_CONFIG=mergeTierScoreConfig({},server);try{renderSnapshot(buildSnapshot());}catch(e){};}).catch(function(e){console.error('PKL scoreboard tier score config load failed',e);});});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadTierScoreConfig);else loadTierScoreConfig();
  window.addEventListener('pkl-tier-score-config-updated',function(e){if(e&&e.detail&&e.detail.config)window.__PKL_TIER_SCORE_CONFIG=e.detail.config;try{renderSnapshot(buildSnapshot());}catch(_e){}});
  function memberName(m){return clean(m&&(m.name||m.nickname||m.nick||m.displayName||m.pubgId||m.gameId||m.username));}
  function memberTier(m){var r=tierRole(m&&(m.memberTier||m.tierRole||m.gradeRole||m.tier||m.grade||m.memberGrade));var c=config();return c[lane(r)]||{target:0,death:0};}
  function realTeamId(viewId){return String(viewId||'').replace(/[ab]$/,'');}
  function teamData(round,id){return (round&&round.teams&&round.teams[id])||{kills:[0,0,0,0],deaths:[0,0,0,0],chicken:0,stop:0,map:''};}
  function chickenScore(round,d){if(!d||!num(d.chicken))return 0;return clean(d&&d.map)==='사'?5:8;}
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
    d.map=clean(d.map);
    return d;
  }
  function cellLivePayload(){
    var st=readSheetState();
    if(!st || !Array.isArray(st.teams) || !Array.isArray(st.rounds)) return '';
    var live={version:4,seq:Date.now(),updatedAt:new Date().toISOString(),resetNonce:st.resetNonce||0,teamImportNonce:st.teamImportNonce||0,mode:st.mode||'squad',selectedTeamId:'',startTime:clean(st.startTime),endTime:clean(st.endTime),teams:[],rounds:[],feeds:[],eventKeys:{},colds:(st.colds&&typeof st.colds==='object')?st.colds:{},fires:(st.fires&&typeof st.fires==='object')?st.fires:{},surrenders:(st.surrenders&&typeof st.surrenders==='object')?st.surrenders:{}};
    try{
      live.teams=(st.teams||[]).map(function(t,i){return {id:t.id||('team'+(i+1)),members:(Array.isArray(t.members)?t.members:[]).map(function(m){return {name:memberName(m),nickname:clean(m&&(m.nickname||m.nick||m.displayName)),pubgId:clean(m&&(m.pubgId||m.pubgID||m.gameId||m.pubgName)),memberTier:clean(m&&(m.memberTier||m.tierRole||m.gradeRole||m.tier||m.grade||m.memberGrade))};})};});
      live.rounds=(st.rounds||[]).map(function(r,ri){var round={no:r.no||ri+1,map:'',teams:{}};Object.keys((r&&r.teams)||{}).forEach(function(teamId){round.teams[teamId]=normalizeTeamData(r.teams[teamId]);});return round;});
      live.feeds=normalizeFeeds(st.feeds);
      live.eventKeys=(st.eventKeys&&typeof st.eventKeys==='object')?st.eventKeys:{};
      return JSON.stringify(live);
    }catch(e){return '';}
  }
  function writeLocalSnapshot(snap){try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(snap));}catch(e){} try{window.dispatchEvent(new CustomEvent('pkl-live-scoreboard-updated',{detail:snap}));}catch(e){}}
  function doPublish(){
    try{
      var lock=readResetLock();
      if(lock && Date.now()<=Number(lock.until||0)){
        var current=readSheetState();
        if(Number(current && current.resetNonce || 0) < Number(lock.nonce||0)){ return; }
      }
    }catch(e){}
    if(Date.now()<publishBackoffUntil){ schedulePublish(Math.max(1000,publishBackoffUntil-Date.now())); return; }
    var snap=buildSnapshot();
    var payload=JSON.stringify(snap);
    var sheet=cellLivePayload();
    var liveObj=null;
    try{liveObj=sheet?JSON.parse(sheet):null;}catch(e){liveObj=null;}
    if(!liveHasMeaningfulData(liveObj)) return;
    var compare=payload+'|'+sheet;
    if(compare===lastPayloadText) return;
    lastPayloadText=compare;
    writeLocalSnapshot(snap);
    publishInFlight=true;
    try{
      postLiveScoreboardPayload({payload:snap,live:liveObj}, snap.updatedAt)
        .then(function(){publishBackoffMs=0;publishBackoffUntil=0;})
        .catch(function(){publishBackoffMs=publishBackoffMs?Math.min(publishBackoffMs*2,1200):350;publishBackoffUntil=Date.now()+publishBackoffMs;})
        .finally(function(){publishInFlight=false;if(pendingPublish){pendingPublish=false;setTimeout(doPublish,25);}});
    }catch(e){publishInFlight=false;}
  }
  function publishNow(){
    if(publishInFlight){pendingPublish=true;return;}
    doPublish();
  }
  function schedulePublish(delay){clearTimeout(publishTimer);publishTimer=setTimeout(publishNow,delay==null?45:Math.max(15,delay));}

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
  function filledMemberCount(st){
    try{return (Array.isArray(st&&st.teams)?st.teams:[]).reduce(function(sum,t){return sum+(Array.isArray(t&&t.members)?t.members:[]).filter(function(m){return memberName(m);}).length;},0);}catch(e){return 0;}
  }
  function liveFilledMemberCount(live){
    try{return (Array.isArray(live&&live.teams)?live.teams:[]).reduce(function(sum,t){return sum+(Array.isArray(t&&t.members)?t.members:[]).filter(function(m){return memberName(m);}).length;},0);}catch(e){return 0;}
  }

  function stateScoreActivityCount(st){
    try{
      var count=0;
      if(Array.isArray(st&&st.feeds)) count+=st.feeds.length;
      ['fires','surrenders','colds'].forEach(function(k){if(st&&st[k]&&typeof st[k]==='object') count+=Object.keys(st[k]).length;});
      (Array.isArray(st&&st.rounds)?st.rounds:[]).forEach(function(r){
        Object.keys((r&&r.teams)||{}).forEach(function(teamId){
          var d=r.teams[teamId]||{};
          if(clean(d&&d.map)) count+=1;
          if(num(d.chicken)) count+=1;
          if(num(d.stop)) count+=1;
          if(Array.isArray(d.kills)) d.kills.forEach(function(v){if(num(v)) count+=1;});
          if(Array.isArray(d.deaths)) d.deaths.forEach(function(v){if(num(v)) count+=1;});
        });
      });
      return count;
    }catch(e){return 0;}
  }
  function liveScoreActivityCount(live){return stateScoreActivityCount(live);}
  function liveHasMeaningfulData(live){
    try{
      if(!live || typeof live!=='object') return false;
      if(Number(live.resetNonce||0)>0) return true;
      if(liveFilledMemberCount(live)>0) return true;
      if(liveScoreActivityCount(live)>0) return true;
      return false;
    }catch(e){return false;}
  }

  function isHardResetLive(live){
    try{
      return !!(live && Number(live.resetNonce||0)>0 && liveFilledMemberCount(live)===0 && liveScoreActivityCount(live)===0);
    }catch(e){return false;}
  }
  function makeEmptyLiveSheetState(live){
    var nonce=Number((live&&live.resetNonce)||Date.now());
    var now=(live&&live.updatedAt)||new Date().toISOString();
    var teams=Array.isArray(live&&live.teams) && live.teams.length ? live.teams : Array.from({length:10},function(_,i){return {id:'team'+(i+1),target:0,members:Array.from({length:4},function(){return {name:'',tier:''};})};});
    var rounds=Array.isArray(live&&live.rounds) && live.rounds.length ? live.rounds : Array.from({length:30},function(_,i){return {no:i+1,map:'',teams:{}};});
    return {mode:(live&&live.mode)||'squad',pklTeamMode:'',pklTeamCount:10,pklTeamSlots:4,pklBuddyMode:false,selectedTeamId:'',teams:teams,rounds:rounds,feeds:[],sideBets:[],eventKeys:{},colds:{},fires:{},fireCancels:{},surrenders:{},itemHistory:[],startTime:'',endTime:'',resetNonce:nonce,teamImportNonce:0,updatedFromTeamBoardAt:'',savedAt:now};
  }

  function liveFreshTime(x){
    try{
      var arr=[
        Date.parse((x&&x.savedAt)||''),
        Date.parse((x&&x.updatedAt)||''),
        Date.parse((x&&x.teamExportedAt)||''),
        Date.parse((x&&x.updatedFromTeamBoardAt)||''),
        Number((x&&x.teamImportNonce)||0),
        Number((x&&x.resetNonce)||0),
        Number((x&&x.seq)||0)
      ].filter(function(v){return isFinite(v)&&v>0;});
      return arr.length ? Math.max.apply(null,arr) : 0;
    }catch(e){return 0;}
  }
  function shouldIgnoreStaleResetLive(live, st){
    try{
      var remoteReset=Number((live&&live.resetNonce)||0);
      if(!remoteReset) return false;
      if(liveFilledMemberCount(live)>0 || liveScoreActivityCount(live)>0) return false;
      if(filledMemberCount(st)<=0 && stateScoreActivityCount(st)<=0) return false;
      var localFresh=liveFreshTime(st);
      var remoteFresh=liveFreshTime(live);
      return !!(localFresh && remoteFresh && remoteFresh < localFresh - 500);
    }catch(e){return false;}
  }

  function mergeLiveIntoState(live){
    if(!live || !Array.isArray(live.rounds)) return null;
    if(resetLockedAgainst(live && live.resetNonce)) return null;
    var st=readSheetState();
    if(isHardResetLive(live)){
      if(shouldIgnoreStaleResetLive(live, st)) return null;
      return makeEmptyLiveSheetState(live);
    }
    if(shouldIgnoreStaleResetLive(live, st)) return null;
    try{
      var localMs=Date.parse((st&&st.savedAt)||(st&&st.teamExportedAt)||(st&&st.updatedAt)||(st&&st.updatedFromTeamBoardAt)||'');
      var liveMs=Date.parse((live&&live.updatedAt)||'');
      var bridge=window.PKLSheetLiveBridge;
      var recentlyEdited=bridge&&bridge.getLastLocalEditAt&&Date.now()-Number(bridge.getLastLocalEditAt()||0)<1200;
      if(recentlyEdited && localMs && liveMs && localMs-liveMs>250) return null;
    }catch(e){}
    try{
      var localFilled=filledMemberCount(st), remoteFilled=liveFilledMemberCount(live);
      var localResetForMembers=Number((st&&st.resetNonce)||0), remoteResetForMembers=Number((live&&live.resetNonce)||0);
      var localActivity=stateScoreActivityCount(st), remoteActivity=liveScoreActivityCount(live);
      var localTs=Date.parse((st&&st.savedAt)||(st&&st.updatedAt)||(st&&st.teamExportedAt)||(st&&st.updatedFromTeamBoardAt)||'')||0;
      var remoteTs=Date.parse((live&&live.updatedAt)||'')||0;
      var remoteIsOlder=localTs && remoteTs && remoteTs < localTs - 1200;
      /* 최신 서버 상태는 체크 해제/점수 삭제처럼 값이 줄어드는 변경도 적용한다.
         단, resetNonce가 없는 완전 빈 오래된 시트만 아래 조건으로 차단한다. */
      if(remoteIsOlder && localFilled>0 && remoteFilled===0 && remoteActivity===0 && remoteResetForMembers<=localResetForMembers) return null;
    }catch(e){}
    if(live.seq && Number(live.seq)<lastLiveSeq) return null;
    try{
      var localNonce=Number((st&&st.resetNonce)||0), remoteNonce=Number((live&&live.resetNonce)||0);
      if(localNonce && remoteNonce && remoteNonce<localNonce) return null;
    }catch(e){}
    if(live.seq) lastLiveSeq=Number(live.seq);
    if(!st || !Array.isArray(st.teams) || !Array.isArray(st.rounds)) st={mode:live.mode||'squad',selectedTeamId:'team1',teams:[],rounds:[],feeds:[],sideBets:[],eventKeys:{},surrenders:{},fires:{},fireCancels:{},colds:{},startTime:'',endTime:''};
    st.mode=live.mode||st.mode||'squad';
    st.selectedTeamId=st.selectedTeamId||'team1';
    if(live.startTime !== undefined){
      var __pklLiveStartTime = clean(live.startTime);
      if(__pklLiveStartTime) st.startTime = __pklLiveStartTime;
    }
    if(live.endTime !== undefined){
      var __pklLiveEndTime = clean(live.endTime);
      if(__pklLiveEndTime) st.endTime = __pklLiveEndTime;
    }
    if(live.teamImportNonce) st.teamImportNonce = Number(live.teamImportNonce)||st.teamImportNonce||0;
    if(Array.isArray(live.teams) && live.teams.length){
      st.teams=live.teams.map(function(t,i){var old=(st.teams||[]).find(function(x){return String(x&&x.id)===String(t&&t.id);})||(st.teams||[])[i]||{};return Object.assign({},old,{id:t.id||old.id||('team'+(i+1)),members:Array.isArray(t.members)?t.members:(old.members||[])});});
    }
    live.rounds.forEach(function(r,ri){
      if(!st.rounds[ri]) st.rounds[ri]={no:r.no||ri+1,map:'',teams:{}};
      st.rounds[ri].no=r.no||st.rounds[ri].no||ri+1;
      if(r.map!==undefined) st.rounds[ri].map='';
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
  function readLiveScoreboardRows(){
    if(configured()){
      return sb('live_scores?id=eq.live_scoreboard&select=payload,updated_at&limit=1',{method:'GET'}).then(function(rows){
        if(rows && rows.length) return rows;
        return fetch('/api/pkl-data-store?type=live_scores&id=live_scoreboard', {cache:'no-store'})
          .then(function(res){return res.ok?res.json():null;})
          .then(function(data){return data && data.rows ? data.rows : rows;})
          .catch(function(){return rows;});
      });
    }
    return fetch('/api/pkl-data-store?type=live_scores&id=live_scoreboard', {cache:'no-store'})
      .then(function(res){return res.ok?res.json():null;})
      .then(function(data){return data && data.rows ? data.rows : [];})
      .catch(function(){return [];});
  }

  function startFallbackPoll(){
    if(fallbackPollTimer) return;
    var busy=false;
    var tick=function(){
      if(busy) return;
      busy=true;
      try{
        readLiveScoreboardRows()
          .then(function(rows){
            var doc=rows&&rows[0];
            var snap=readRemotePayload(doc);
            if(snap){writeLocalSnapshot(snap);renderSnapshot(snap);}
            applySheetFromDoc(doc);
          })
          .catch(function(){})
          .finally(function(){busy=false;});
      }catch(e){busy=false;}
    };
    tick();
    fallbackPollTimer=setInterval(function(){
      if(document.hidden) return;
      tick();
    }, 500);
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) setTimeout(tick, 120);
    });
  }
  function applySheetFromDoc(doc){
    var bridge=window.PKLSheetLiveBridge;
    if(!bridge || typeof bridge.applyState!=='function') return;
    try{
      if(bridge.isTyping && bridge.isTyping()) return;
      if(bridge.getLastLocalEditAt && Date.now()-Number(bridge.getLastLocalEditAt()||0)<250) return;
    }catch(e){}
    var st=mergeLiveIntoState(readRemoteLive(doc));
    if(st) bridge.applyState(normalizeLiveState(st));
  }
  function startSheetMirror(){
    startFallbackPoll();
  }

  function resetToEmpty(emptyState, nonce){
    try{clearTimeout(publishTimer); pendingPublish=false;}catch(e){}
    nonce=Number(nonce || (emptyState && emptyState.resetNonce) || Date.now());
    var now=new Date().toISOString();
    var st=emptyState && typeof emptyState==='object' ? emptyState : {mode:'squad',selectedTeamId:'team1',teams:[],rounds:[],feeds:[],sideBets:[],eventKeys:{},colds:{},fires:{},surrenders:{},resetNonce:nonce,savedAt:now};
    st.resetNonce=nonce;
    st.savedAt=st.savedAt||now;
    try{localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); sessionStorage.setItem(STORAGE_KEY, JSON.stringify(st)); sessionStorage.setItem(STORAGE_KEY+'_SESSION_BACKUP', JSON.stringify(st));}catch(e){}
    var snap={version:1,updatedAt:now,teams:[]};
    var live={version:4,seq:Date.now(),updatedAt:now,resetNonce:nonce,mode:st.mode||'squad',selectedTeamId:'',teams:Array.isArray(st.teams)?st.teams:[],rounds:Array.isArray(st.rounds)?st.rounds:[],feeds:[],eventKeys:{},colds:{},fires:{},fireCancels:{},surrenders:{}};
    lastPayloadText='';
    lastLiveSeq=Date.now();
    writeLocalSnapshot(snap);
    try{ postLiveScoreboardPayload({payload:snap,live:live}, now); }catch(e){}
  }
  function bindSheetPublisher(){
    /* 첫 로드 직후 빈 기본 시트를 live_scores에 게시하지 않는다. 입력/변경 때만 게시한다. */
    document.addEventListener('input',function(e){if(e.target&&e.target.dataset&&e.target.dataset.field&&e.target.dataset.field!=='map'){try{window.PKLSheetLiveBridge&&window.PKLSheetLiveBridge.markLocalEdit&&window.PKLSheetLiveBridge.markLocalEdit();}catch(x){} schedulePublish(e&&e.target&&e.target.type==='checkbox'?20:35);}},true);
    document.addEventListener('change',function(e){if(e.target&&e.target.dataset&&e.target.dataset.field){try{window.PKLSheetLiveBridge&&window.PKLSheetLiveBridge.markLocalEdit&&window.PKLSheetLiveBridge.markLocalEdit();}catch(x){} schedulePublish(e&&e.target&&e.target.type==='checkbox'?20:35);}},true);
    document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-map-pick],[data-stop-pick]')) schedulePublish(20);},true);
    /* 2차 청소: storage 이벤트 기반 재게시 금지. 입력/변경/클릭 저장 흐름만 사용한다. */
  }
  window.addEventListener('pkl-sheet-hard-reset',function(e){try{resetToEmpty((e&&e.detail&&e.detail.state)||window.__PKL_SHEET_RESET_STATE, e&&e.detail&&e.detail.nonce);}catch(x){lastPayloadText='';lastLiveSeq=Date.now();}});
  window.PKLScoreboardRealtime={__pklCellLiveFinal20260510:true,publish:publishNow,schedulePublish:schedulePublish,resetToEmpty:resetToEmpty,startViewer:startViewer,renderSnapshot:renderSnapshot,buildSnapshot:buildSnapshot,startSheetMirror:startSheetMirror};
  if(document.getElementById('recordBody')){ bindSheetPublisher(); startSheetMirror(); }
  if(document.getElementById('grid') && /pkl-scoreboard-live/i.test(location.pathname)) startViewer();
})();


// PKL_SCOREBOARD_MODE_HELPER
window.addEventListener('pkl-team-mode-change', function(e){
  document.documentElement.dataset.teamMode = (e.detail && e.detail.mode) || 'squad10';
});

(function(){
  if(window.__PKL_SCOREBOARD_MODE_HELPER__) return;
  window.__PKL_SCOREBOARD_MODE_HELPER__ = true;
  window.addEventListener('pkl-team-mode-changed', function(e){
    var d = e.detail || {};
    try{
      document.documentElement.dataset.pklTeamMode = d.mode || '';
      document.documentElement.dataset.pklTeamCount = String(d.teams || 10);
      document.documentElement.dataset.pklTeamSlots = String(d.slots || 4);
    }catch(_){}
  });
})();
