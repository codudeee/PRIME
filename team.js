(() => {
  const STORAGE_KEY = 'pklTeamBuilderState.v1';

  const TIERS = [
    { id: 'tier0', label: '0티어', weight: 6, badgeClass: 'grade-role-tier0' },
    { id: 'tier1', label: '1티어', weight: 5, badgeClass: 'grade-role-tier1' },
    { id: 'tier2', label: '2티어', weight: 4, badgeClass: 'grade-role-tier2' },
    { id: 'tier3', label: '3티어', weight: 3, badgeClass: 'grade-role-tier3' },
    { id: 'tier4', label: '4티어', weight: 2, badgeClass: 'grade-role-tier4' },
    { id: 'tier5', label: '5티어', weight: 1, badgeClass: 'grade-role-beast' }
  ];


  function getCanonicalTierId(tierId) {
    const key = String(tierId || '').trim();
    if (!key) return '';
    if (key === 'beast') return 'tier5';
    if (/^beast_(high|mid|low)$/i.test(key)) return 'tier5';
    if (/^tier5(_|-)?(high|mid|low)?$/i.test(key.replace(/\s+/g, ''))) return 'tier5';
    return key;
  }

  function isValidTierId(tierId) {
    const key = getCanonicalTierId(tierId);
    return TIERS.some(tier => tier.id === key);
  }

  const TEAM_COUNT = 20;
  const SLOT_COUNT = 4;
  const ADMIN_STORAGE_KEY = 'pklAdminState_v3';
  const ACCOUNT_STORAGE_KEY = 'pklUsers';
  const JOIN_WAITLIST_STORAGE_KEY = 'pklJoinWaitList';
  const JOIN_CANCEL_STORAGE_KEY = 'pklJoinCancelList';
  const JOIN_RECRUIT_STATE_STORAGE_KEY = 'pklJoinRecruitState';
  const SHEET_STORAGE_KEY = 'PKL_EFFICIENT_MATCH_SHEET_LIVE_SYNC_V1';
  const TEAM_IMPORT_KEY = 'PKL_TEAM_TO_SHEET_IMPORT_V1';

  const defaultState = () => ({
    players: [],
    waiting: TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {}),
    teams: Array.from({ length: TEAM_COUNT }, (_, teamIndex) => ({
      id: `team-${teamIndex + 1}`,
      name: `${teamIndex + 1}팀`,
      slots: Array.from({ length: SLOT_COUNT }, () => null)
    })),
    selected: null,
    selectedSlots: [],
    matchStartTime: '',
    matchEndTime: '',
    memo: '',
    rule: '',
    warningLog: [],
    rerollRequests: {},
    rerollHiddenKeys: [],
    teamMode: 'squad20'
  });

  let state = loadState();
  let draggedPlayerId = null;
  let supabaseUsersCache = [];
  let supabaseUsersLoadedOnce = false;
  let supabaseTierRefreshTimer = null;
  let lastWaitingTierSignature = '';
  let isPlayerDragActive = false;
  let pendingTeamBackgroundSync = false;
  let teamStateSaveTimer = null;
  let lastSavedTeamStateJson = '';
  let teamLookupCache = null;
  let waitingSortDetailCache = null;
  let playerByIdCache = null;
  let teamBackgroundRefreshBound = false;
  let teamBackgroundRefreshTimer = null;
  let lastTeamBackgroundRefreshAt = 0;

  function invalidateTeamPlayerCache() {
    playerByIdCache = null;
  }

  function getTeamPlayerById(playerId) {
    if (!playerByIdCache) {
      playerByIdCache = new Map((state.players || []).map(player => [player.id, player]));
    }
    return playerByIdCache.get(playerId) || null;
  }

  function requestTeamBackgroundRefresh(delay) {
    // 팀구성 화면은 드래그/hover가 많아서 자동 백그라운드 동기화가 잔렉의 원인이 된다.
    // 참가자 불러오기 버튼을 눌렀을 때만 Supabase 대기자/티어를 다시 읽는다.
    return false;
  }

  function requestTeamBoardRender(delay) {
    if (teamBackgroundRefreshTimer) clearTimeout(teamBackgroundRefreshTimer);
    teamBackgroundRefreshTimer = setTimeout(() => {
      teamBackgroundRefreshTimer = null;
      if (isPlayerDragActive || isRerolling || document.hidden) {
        pendingTeamBackgroundSync = true;
        return;
      }
      renderBoardOnlyAndSave();
    }, Math.max(0, Number(delay || 0)));
  }



  function pklTeamCanEdit(){
    if (window.PKLRoleSystem && typeof window.PKLRoleSystem.currentHasRole === "function") {
      if (window.PKLRoleSystem.currentHasRole("operator") || window.PKLRoleSystem.currentHasRole("admin")) return true;
    }
    if (window.PKLPagePermissions && typeof window.PKLPagePermissions.isOperatorUp === "function" && window.PKLPagePermissions.isOperatorUp()) return true;
    if (window.PKLPagePermissions && typeof window.PKLPagePermissions.isAdmin === "function" && window.PKLPagePermissions.isAdmin()) return true;

    const loginUser = readCurrentLoginUser();
    const user = findFullUserForViewer(loginUser) || loginUser || {};
    const rawRole = String(getViewerRoleValue(user) || '').trim();
    const role = rawRole.toLowerCase();
    const rawTitle = String(user.title || user.memberTitle || user.badge || '').trim();
    const title = rawTitle.toLowerCase();

    return !!(
      user.isAdmin || user.is_admin || user.admin || user.manager || user.isManager || user.operator || user.isOperator ||
      role === 'admin' || role === 'administrator' || role === 'manager' || role === 'owner' || role === 'operator' || role === 'staff' ||
      title === 'admin' || title === 'administrator' || title === 'manager' || title === 'operator' ||
      ['관리자', '총관리자', '운영자', '운영진'].includes(rawRole) ||
      ['관리자', '총관리자', '운영자', '운영진'].includes(rawTitle)
    );
  }
  function pklTeamDeny(){
    if(window.PKLRoleSystem && typeof window.PKLRoleSystem.showAccessModal === "function") window.PKLRoleSystem.showAccessModal("관리자/운영자만 팀구성 기능을 사용할 수 있습니다.", "권한 제한");
  }
  let suppressNextClick = false;
  let isRerolling = false;
  let rerollTimers = [];
  let rerollIntervals = [];
  let rerollBackupTeams = null;
  let matchTimeSettingsConfirmed = Boolean(String(state.matchStartTime || '').trim() && String(state.matchEndTime || '').trim());
          document.body.classList.remove('is-rerolling-locked');

  const tierPools = document.getElementById('tierPools');
  const teamGrid = document.getElementById('teamGrid');

  const teamModeSelect = document.getElementById('pklTeamModeSelect');
  const teamBoardModeText = document.getElementById('teamBoardModeText');
  const builderLayout = document.querySelector('.builder-layout');

  const PKL_TEAM_MODE_CONFIG = {
    squad20: { key:'squad20', label:'20팀 스쿼드', teams:20, slots:4, modeClass:'pkl-mode-20 pkl-mode-squad' },
    squadPartner20: { key:'squadPartner20', label:'20팀 스쿼드 깐부', teams:20, slots:4, modeClass:'pkl-mode-20 pkl-mode-squad pkl-mode-partner' },
    duo20: { key:'duo20', label:'40팀 듀오', teams:40, slots:2, modeClass:'pkl-mode-40 pkl-mode-duo' },
    duoPartner20: { key:'duoPartner20', label:'40팀 듀오 깐부', teams:40, slots:2, modeClass:'pkl-mode-40 pkl-mode-duo pkl-mode-partner' }
  };

  function getTeamModeConfig(modeKey){
    return PKL_TEAM_MODE_CONFIG[modeKey] || PKL_TEAM_MODE_CONFIG.squad20;
  }

  function ensureTeamModeState(modeKey){
    const cfg = getTeamModeConfig(modeKey || state.teamMode || 'squad20');
    state.teamMode = cfg.key;

    if(!Array.isArray(state.teams)) state.teams = [];

    const nextTeams = [];
    for(let i=0;i<cfg.teams;i++){
      const prev = state.teams[i] || {};
      const prevSlots = Array.isArray(prev.slots) ? prev.slots : [];
      nextTeams.push({
        id: prev.id || `team-${i+1}`,
        name: `${i+1}팀`,
        slots: Array.from({length:cfg.slots}, (_,idx)=> prevSlots[idx] || null)
      });
    }

    state.teams = nextTeams;
    state.selectedSlots = Array.isArray(state.selectedSlots)
      ? state.selectedSlots.filter(slot => slot && slot.teamIndex < cfg.teams && slot.slotIndex < cfg.slots)
      : [];

    if(teamModeSelect && teamModeSelect.value !== cfg.key) teamModeSelect.value = cfg.key;
    if(teamModeDropdown) teamModeDropdown.dataset.value = cfg.key;
    if(teamModeText) teamModeText.textContent = cfg.label.replace(/^20팀\s+|^40팀\s+/, '');
    teamModeOptions.forEach(option => option.classList.toggle('is-active', option.dataset.value === cfg.key));
    if(teamBoardModeText) teamBoardModeText.textContent = cfg.label;
    if(builderLayout){
      builderLayout.classList.remove('pkl-mode-10','pkl-mode-20','pkl-mode-40','pkl-mode-duo','pkl-mode-squad','pkl-mode-partner');
      cfg.modeClass.split(/\s+/).forEach(cls => cls && builderLayout.classList.add(cls));
    }

    try{
      document.documentElement.dataset.pklTeamMode = cfg.key;
      document.documentElement.dataset.pklTeamCount = String(cfg.teams);
      document.documentElement.dataset.pklTeamSlots = String(cfg.slots);
    }catch(e){}

    return cfg;
  }

  function changeTeamMode(modeKey){
    const cfg = ensureTeamModeState(modeKey);
    render();
    try{
      window.dispatchEvent(new CustomEvent('pkl-team-mode-changed',{detail:{mode:cfg.key, teams:cfg.teams, slots:cfg.slots, label:cfg.label}}));
    }catch(e){}
  }


  const boardSummary = document.getElementById('boardSummary');
  const rerollCheckButton = document.getElementById('rerollCheckButton');
  const currentTime = document.getElementById('currentTime');
  const playerModal = document.getElementById('playerModal');
  const memoModal = document.getElementById('memoModal');
  const pklToast = document.getElementById('pklToast');
  const matchTimeModal = document.getElementById('matchTimeModal');
  const rerollListModal = document.getElementById('rerollListModal');
  const rerollListEntries = document.getElementById('rerollListEntries');
  const rerollUserInput = document.getElementById('rerollUserInput');
  const rerollUserSuggestBox = document.getElementById('rerollUserSuggestBox');
  const rerollUserOptions = document.getElementById('pklRerollUserOptions');
  const addRerollUserButton = document.getElementById('addRerollUserButton');
  const matchCurrentTime = document.getElementById('matchCurrentTime');
  const matchStartTimeGroup = document.querySelector('[data-time-group="start"]');
  const matchEndTimeGroup = document.querySelector('[data-time-group="end"]');
  const saveMatchTimeButton = document.getElementById('saveMatchTimeButton');
  const newPlayerName = document.getElementById('newPlayerName');
  const newPlayerTier = document.getElementById('newPlayerTier');
  const newPlayerTierDropdown = document.getElementById('newPlayerTierDropdown');
  const newPlayerTierTrigger = document.getElementById('newPlayerTierTrigger');
  const newPlayerTierText = document.getElementById('newPlayerTierText');
  const newPlayerTierOptions = Array.from(document.querySelectorAll('.pkl-tier-custom-option'));
  const memoText = document.getElementById('memoText');
  const rerollModeDropdown = document.getElementById('rerollModeDropdown');
  const rerollModeTrigger = document.getElementById('rerollModeTrigger');
  const rerollModeText = document.getElementById('rerollModeText');
  const rerollModeList = document.getElementById('rerollModeList');
  const rerollModeOptions = Array.from((rerollModeList || document).querySelectorAll('.pkl-custom-select-option'));
  const teamModeDropdown = document.getElementById('teamModeDropdown');
  const teamModeTrigger = document.getElementById('teamModeTrigger');
  const teamModeText = document.getElementById('teamModeText');
  const teamModeList = document.getElementById('teamModeList');
  const teamModeOptions = Array.from((teamModeList || document).querySelectorAll('.pkl-mode-custom-option'));
  const rerollModeSelect = {
    get value() {
      return rerollModeDropdown ? rerollModeDropdown.dataset.value || 'selected' : 'selected';
    },
    set value(nextValue) {
      setRerollModeValue(nextValue || 'selected', false);
    }
  };

  document.addEventListener('DOMContentLoaded', init);

  function queueTeamBackgroundSyncWork(work) {
    if (isPlayerDragActive || isRerolling) {
      pendingTeamBackgroundSync = true;
      return false;
    }
    if (typeof work === 'function') work();
    return true;
  }

  function flushPendingTeamBackgroundSync() {
    pendingTeamBackgroundSync = false;
  }

  function renderBoardOnlyAndSave() {
    return withTeamLookupCache(() => {
      invalidateTeamPlayerCache();
      cleanPlacedPlayersOutOfWaitingPools();
      renderTierPools();
      renderTeams();
      renderSummary();
      saveState();
    });
  }


  function installTeamPerformanceStyle() {
    if (document.getElementById('pkl-team-performance-style')) return;
    const style = document.createElement('style');
    style.id = 'pkl-team-performance-style';
    style.textContent = `
      .tier-box, .team-card { contain: layout paint; }
      .tier-list, .team-slot { contain: layout paint; }
      .player-card { will-change: transform; backface-visibility: hidden; }
      body.is-player-dragging .player-card,
      body.is-player-dragging .team-card,
      body.is-player-dragging .tier-box { transition: none !important; }
    `;
    document.head.appendChild(style);
  }

  function init() {
    installTeamPerformanceStyle();
    fillTierSelect();
    bindControls();
    bindNewPlayerTierDropdown();
    bindRerollModeDropdown();
    bindTeamModeDropdown();
    fillMatchTimeSelects();
    bindUserSyncEvents();
    applyTeamControlAccess();
    startClock();

    const supabaseReady = (window.PKLGetSupabaseConfig && typeof window.PKLGetSupabaseConfig === 'function')
      ? window.PKLGetSupabaseConfig().catch(() => window.PKL_SUPABASE_CONFIG || null)
      : Promise.resolve(window.PKL_SUPABASE_CONFIG || null);

    supabaseReady.finally(() => {
      loadTeamBuilderStateFromSupabaseOnce().finally(() => {
        ensureTeamModeState(state.teamMode || 'squad20');
        matchTimeSettingsConfirmed = Boolean(String(state.matchStartTime || '').trim() && String(state.matchEndTime || '').trim());
        // 먼저 저장된 팀 보드를 즉시 그린 뒤, Supabase 유저/참가자 보정은 뒤에서 붙인다.
        // 진입 시 1000명 users 조회가 보드 첫 렌더를 막아 멈춘 것처럼 보이는 현상을 줄인다.
        applyTeamControlAccess();
        render();
        // 첫 화면 렌더를 막지 않도록, 배지 보정만 뒤에서 1회 수행한다.
        // 참가자/대기칸 재분류는 하지 않고 Supabase users의 저장 배지값만 player.memberTier에 반영한다.
        scheduleTeamBadgeHydrationFromSupabaseOnce();
        // 참가자 갱신은 '대기자 불러오기' 버튼으로만 수동 실행한다.
      });
    });
  }

  function getWaitingTierSignature() {
    const parts = [];
    Object.entries(state.waiting || {}).forEach(([tierId, ids]) => {
      if (!Array.isArray(ids)) return;
      ids.forEach(playerId => {
        const player = state.players.find(item => item && item.id === playerId);
        if (!player) return;
        parts.push([
          playerId,
          tierId,
          player.tier || '',
          player.discordId || player.discord_id || player.userUid || player.accountId || '',
          player.pubgId || player.pubg_id || player.gameId || '',
          normalizeName(player.name || '')
        ].join(':'));
      });
    });
    return parts.sort().join('|');
  }

  function refreshWaitingTiersFromSupabase() {
    // 자동 티어 보정 렌더 금지. 팀구성 중에는 현재 보드의 player.tier가 화면 기준이다.
    // Supabase users 강제 재조회는 수동 대기자 불러오기에서만 수행한다.
    return Promise.resolve(false);
  }

  function scheduleSupabaseWaitingTierRefresh() {
    // 자동 티어/대기자 동기화는 team 페이지 성능 때문에 완전히 끈다.
    // 수동 대기자 불러오기만 허용한다.
    return false;
  }

  let teamBadgeHydrationStarted = false;
  function scheduleTeamBadgeHydrationFromSupabaseOnce() {
    if (teamBadgeHydrationStarted) return;
    teamBadgeHydrationStarted = true;
    setTimeout(() => {
      if (isPlayerDragActive || isRerolling || document.hidden) {
        teamBadgeHydrationStarted = false;
        return;
      }
      loadSupabaseUsersForJoinWaitListOnce(false).then(() => {
        const changed = hydrateTeamPlayerBadgesFromSupabaseOnly();
        if (changed && !isPlayerDragActive && !isRerolling && !document.hidden) renderBoardOnlyAndSave();
      }).catch(() => {});
    }, 450);
  }

  function hydrateTeamPlayerBadgesFromSupabaseOnly() {
    if (!teamLookupCache) return withTeamLookupCache(() => hydrateTeamPlayerBadgesFromSupabaseOnly());
    let changed = false;
    state.players.forEach(player => {
      if (!player) return;
      const user = findSupabaseUserStrict(player) || findSupabaseUserByLooseName(player.name);
      if (!user) return;
      const badgeValue = resolveUserTierBadgeValue(user);
      const tierKey = resolveUserTierKey(user);
      if (badgeValue && player.memberTier !== badgeValue) {
        player.memberTier = badgeValue;
        changed = true;
      }
      if (isValidTierId(tierKey) && player.tier !== getCanonicalTierId(tierKey)) {
        player.tier = getCanonicalTierId(tierKey);
        changed = true;
      }
    });
    return changed;
  }

  function refreshJoinWaitListFromSupabaseOnce() {
    if (isPlayerDragActive || isRerolling) {
      pendingTeamBackgroundSync = true;
      return;
    }
    const realtime = window.PKLJoinRealtime;
    if (!realtime || typeof realtime.fetchNow !== 'function') return;
    realtime.fetchNow().then(() => loadSupabaseUsersForJoinWaitListOnce(true)).then(() => {
      syncJoinWaitListIntoTeamBoard(true);
      syncPlayersWithUserSources();
      applyTeamControlAccess();
      renderBoardOnlyAndSave();
    }).catch(() => {});
  }

  function fillTierSelect() {
    if (!newPlayerTier) return;
    if (!newPlayerTier.value) newPlayerTier.value = 'tier0';
    setNewPlayerTierValue(newPlayerTier.value || 'tier0', false);
  }

  function bindControls() {
const saveMemoButton = document.getElementById('saveMemoButton');
    const savePlayerButton = document.getElementById('savePlayerButton');
    const ruleButton = document.getElementById('ruleButton');
    const startButton = document.getElementById('startButton');
    const rerollListButton = document.getElementById('rerollListButton');

    bindTeamControlViewerGuard();

    if (saveMemoButton) saveMemoButton.addEventListener('click', () => { if (!isTeamControlManager()) return; saveMemo(); });
    if (savePlayerButton) savePlayerButton.addEventListener('click', () => { if (!isTeamControlManager()) return; addPlayer(); });
    if (ruleButton) ruleButton.addEventListener('click', () => { if (!isTeamControlManager()) return; showRuleConstructionToast(); });
    if (startButton) startButton.addEventListener('click', () => { if (!isTeamControlManager()) return; openMatchTimeModal(); });
    if (saveMatchTimeButton) saveMatchTimeButton.addEventListener('click', () => { if (!isTeamControlManager()) return; saveMatchTimeSettings(); });
    if (rerollListButton) rerollListButton.addEventListener('click', openRerollListModal);
    if (addRerollUserButton) addRerollUserButton.addEventListener('click', () => { if (!isTeamControlManager()) return; addManualRerollUser(); });
    if (rerollUserInput) {
      rerollUserInput.addEventListener('focus', refreshRerollUserAutocomplete);
      rerollUserInput.addEventListener('input', refreshRerollUserAutocomplete);
      rerollUserInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') { if (!isTeamControlManager()) return; addManualRerollUser(); }
      });
    }
    
    if (rerollUserInput) {
      rerollUserInput.setAttribute('data-pkl-reroll-suggest-bound', 'true');
      rerollUserInput.setAttribute('autocomplete', 'off');
      rerollUserInput.removeAttribute('list');
      rerollUserInput.addEventListener('input', renderRerollUserSuggestions);
      rerollUserInput.addEventListener('focus', renderRerollUserSuggestions);
    }
    document.addEventListener('click', event => {
      if (!rerollUserInput || !rerollUserSuggestBox) return;
      if (event.target === rerollUserInput || rerollUserSuggestBox.contains(event.target)) return;
      closeRerollUserSuggestions();
    });
if (rerollListModal) {
      bindRerollCalculatorEvents(rerollListModal);
      bindRerollModalFocusGuard(rerollListModal);
    }
    const addTestPlayersButton = document.getElementById('addTestPlayersButton');
    if (addTestPlayersButton) addTestPlayersButton.addEventListener('click', () => { if (!isTeamControlManager()) return; openPlayerModal(); });
    document.getElementById('resetButton').addEventListener('click', () => { if (!isTeamControlManager()) return; openResetBoardConfirmModal(); });
    document.getElementById('rerollAllButton').addEventListener('click', () => { if (!isTeamControlManager()) return; runRerollByMode(); });
    document.getElementById('completeButton').addEventListener('click', () => { if (!isTeamControlManager()) return; completeTeams(); });
    const loadWaitingButton = document.getElementById('loadWaitingButton');
    if (loadWaitingButton) {
      loadWaitingButton.addEventListener('click', () => { if (!isTeamControlManager()) return; loadCurrentJoinWaitingList(); });
    }


    document.querySelectorAll('[data-close-modal]').forEach(button => {
      button.addEventListener('click', () => closeModal(document.getElementById(button.dataset.closeModal)));
    });


    document.querySelectorAll('.modal-layer').forEach(layer => {
      layer.addEventListener('click', event => {
        if (event.target !== layer) return;
        if (layer.id === 'playerModal' || layer.id === 'matchTimeModal' || layer.id === 'rerollListModal') return;
        closeModal(layer);
      });
    });
  }

  function render() {
    // team 페이지 렌더는 이미 보드에 들어온 player 값을 기준으로만 그린다.
    // 렌더 때마다 Supabase/users를 다시 매칭하면 hover/drag 중 티어가 흔들리고 잔렉이 생긴다.
    return withTeamLookupCache(() => {
      invalidateTeamPlayerCache();
      cleanPlacedPlayersOutOfWaitingPools();
      renderTierPools();
      renderTeams();
      renderSummary();
      saveState();
    });
  }

  function renderTierPools() {
    if (!canViewTeamParticipants()) {
      tierPools.classList.add('team-board-locked');
      tierPools.innerHTML = renderTeamPrivacyLock('tier', getJoinWaitingCount());
      return;
    }

    tierPools.classList.remove('team-board-locked');
    tierPools.innerHTML = TIERS.map(tier => {
      const players = state.waiting[tier.id].map(playerId => renderPlayerCard(playerId)).join('');
      return `
        <section class="tier-box" data-tier="${tier.id}">
          <div class="tier-head">
            <span>${tier.label}</span>
            <span class="tier-count">${state.waiting[tier.id].length}명</span>
          </div>
          <div class="tier-list" data-drop-type="tier" data-tier-id="${tier.id}">
            ${players || '<div class="empty-slot">대기 인원 없음</div>'}
          </div>
        </section>
      `;
    }).join('');

    bindDropZones();
    bindPlayerCards();
  }

  function getPartnerTeamClass(teamIndex) {
    const cfg = getTeamModeConfig(state.teamMode || 'squad20');
    if (!cfg.modeClass || !cfg.modeClass.includes('pkl-mode-partner')) return '';
    const pairIndex = Math.floor(teamIndex / 2);
    const tone = pairIndex % 6;
    return `is-partner-team is-partner-${teamIndex % 2 === 0 ? 'left' : 'right'} is-partner-tone-${tone}`;
  }

  function renderTeamCard(team, teamIndex, extraClass = '') {
    const slots = team.slots.map((playerId, slotIndex) => `
      <div class="team-slot ${isSlotSelected(teamIndex, slotIndex) ? 'is-selected' : ''}" data-drop-type="slot" data-team-index="${teamIndex}" data-slot-index="${slotIndex}" aria-label="${team.name} ${slotIndex + 1}번자리">
        ${playerId ? renderPlayerCard(playerId) : '<div class="empty-slot"></div>'}
      </div>
    `).join('');

    return `
      <section class="team-card ${extraClass}" data-team-index="${teamIndex}">
        <div class="team-head">
          <span class="team-name">${team.name}</span>
        </div>
        <div class="slot-list">${slots}</div>
      </section>
    `;
  }

  function renderPartnerTeamPair(pairIndex, leftTeam, leftIndex, rightTeam, rightIndex) {
    const tone = pairIndex % 6;
    const title = `${leftTeam ? leftTeam.name : `${leftIndex + 1}팀`} · ${rightTeam ? rightTeam.name : `${rightIndex + 1}팀`}`;
    return `
      <section class="pkl-kanbu-pair-card is-partner-tone-${tone}" data-pair-index="${pairIndex}">
        <div class="pkl-kanbu-pair-head">
          <span>${escapeHtml(title)}</span>
          <em>${getTeamModeConfig(state.teamMode || 'squad20').slots * 2} SLOT</em>
        </div>
        <div class="pkl-kanbu-pair-body">
          ${leftTeam ? renderTeamCard(leftTeam, leftIndex, 'is-partner-team is-partner-left') : ''}
          ${rightTeam ? renderTeamCard(rightTeam, rightIndex, 'is-partner-team is-partner-right') : ''}
        </div>
      </section>
    `;
  }

  function renderTeams() {
    ensureTeamModeState(state.teamMode || 'squad20');
    if (!canViewTeamParticipants()) {
      teamGrid.classList.add('team-board-locked');
      teamGrid.innerHTML = renderTeamPrivacyLock('team', getJoinWaitingCount());
      return;
    }

    const cfg = getTeamModeConfig(state.teamMode || 'squad20');
    const isPartnerMode = !!(cfg.modeClass && cfg.modeClass.includes('pkl-mode-partner'));

    teamGrid.classList.remove('team-board-locked');

    if (isPartnerMode) {
      const pairs = [];
      for (let i = 0; i < state.teams.length; i += 2) {
        pairs.push(renderPartnerTeamPair(Math.floor(i / 2), state.teams[i], i, state.teams[i + 1], i + 1));
      }
      teamGrid.innerHTML = pairs.join('');
    } else {
      teamGrid.innerHTML = state.teams.map((team, teamIndex) => renderTeamCard(team, teamIndex, getPartnerTeamClass(teamIndex))).join('');
    }

    bindDropZones();
    bindPlayerCards();
    bindSlotSelection();
  }

  function renderTeamPrivacyLock(kind, count) {
    const title = kind === 'team' ? '팀구성 비공개' : '티어 대기칸 비공개';
    const desc = kind === 'team'
      ? '참가하기 이후 팀구성을 확인할 수 있습니다.'
      : '참가하기 이후 대기자 리스트를 확인할 수 있습니다.';
    const safeCount = Math.max(0, Number(count || 0));
    return `
      <div class="team-preview-lock-box" data-lock-kind="${kind}" aria-live="polite">
        <b>${escapeHtml(title)}</b>
        <span>${escapeHtml(desc)}</span>
        <small>현재 대기 인원 수 <strong>${safeCount}명</strong></small>
      </div>
    `;
  }

  function isActiveJoinWaitItem(item) {
    if (!item || typeof item !== 'object') return false;
    const rawState = String(item.state || item.status || item.joinStatus || item.recruitStatus || '').trim().toLowerCase();
    if (['cancel','cancelled','canceled','cancelled_wait','canceled_wait','대기취소','취소'].includes(rawState)) return false;
    if (item.canceledAt || item.cancelledAt || item.cancelAt || item.cancelReason || item.reasonCanceled) return false;
    return true;
  }

  function readJoinCancelList() {
    try {
      const st = window.PKLJoinRealtime && typeof window.PKLJoinRealtime.getState === 'function'
        ? window.PKLJoinRealtime.getState()
        : null;
      if (st && Array.isArray(st.cancelList)) return st.cancelList;
    } catch (error) {}
    try {
      const saved = JSON.parse(localStorage.getItem(JOIN_CANCEL_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      return [];
    }
  }

  function getActiveJoinWaitList() {
    const cancelKeys = new Set(readJoinCancelList().map(getJoinWaitItemKey).filter(Boolean));
    return readJoinWaitList().filter(item => {
      if (!isActiveJoinWaitItem(item)) return false;
      const key = getJoinWaitItemKey(item);
      return !key || !cancelKeys.has(key);
    });
  }

  function getJoinWaitingCount() {
    return getActiveJoinWaitList().length;
  }

  function canViewTeamParticipants() {
    return isTeamManagerViewer() || isCurrentUserInJoinWaitingList();
  }

  function isTeamManagerViewer() {
    const loginUser = readCurrentLoginUser();
    const user = findFullUserForViewer(loginUser) || loginUser || {};
    const rawRole = String(getViewerRoleValue(user) || '').trim();
    const role = rawRole.toLowerCase();
    const rawTitle = String(user.title || user.memberTitle || user.badge || '').trim();
    const title = rawTitle.toLowerCase();
    return !!(
      user.isAdmin || user.is_admin || user.admin || user.manager || user.isManager || user.operator || user.isOperator ||
      role === 'admin' || role === 'administrator' || role === 'manager' || role === 'owner' || role === 'operator' || role === 'staff' ||
      title === 'admin' || title === 'administrator' || title === 'manager' || title === 'operator' ||
      ['관리자', '총관리자', '운영자', '운영진'].includes(rawRole) ||
      ['관리자', '총관리자', '운영자', '운영진'].includes(rawTitle)
    );
  }

  function getViewerRoleValue(user) {
    if (!user) return '';
    if (window.PKLRoleSystem && typeof window.PKLRoleSystem.accessRoleFromUser === 'function') {
      const role = window.PKLRoleSystem.accessRoleFromUser(user);
      if (role) return role;
    }
    return user.memberRole || user.role || user.userRole || user.authRole || user.permission || user.type || '';
  }

  function readCurrentLoginUser() {
    const keys = ['pklLoginUser', 'pklCurrentUser', 'pklUser', 'pklLoggedInUser', 'pkl_current_user'];
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!raw) continue;
        const user = JSON.parse(raw);
        if (user && typeof user === 'object') return user;
      } catch (error) {}
    }
    return null;
  }

  function findFullUserForViewer(loginUser) {
    if (!loginUser) return null;
    const users = readSupabaseUsers();
    const byIdentity = users.find(user => isSameUserIdentity(loginUser, user));
    if (byIdentity) return byIdentity;
    const hasStrongId = !!(loginUser.discord_id || loginUser.discordId || loginUser.discordID || loginUser.uid || loginUser.id || loginUser.userId);
    if (hasStrongId) return null;
    return users.find(user => sameName(user, loginUser.nickname || loginUser.nick || loginUser.name || loginUser.discord_username || loginUser.discordUsername)) || null;
  }

  function isTeamControlManager() {
    return pklTeamCanEdit();
  }

  function isRerollListButtonTarget(target) {
    const listButton = document.getElementById('rerollListButton');
    return !!(listButton && (target === listButton || (target && target.closest && target.closest('#rerollListButton'))));
  }

  function applyTeamControlAccess() {
    const canManage = isTeamControlManager();
    document.body.classList.toggle('pkl-team-viewer-only', !canManage);

    const listButton = document.getElementById('rerollListButton');
    document.querySelectorAll('.control-panel button, .control-panel select, .control-panel input, .control-panel textarea, .control-panel .pkl-custom-select-trigger, .control-panel .pkl-custom-select, .control-panel .pkl-team-mode-dropdown').forEach(control => {
      const isListButton = control === listButton || control.id === 'rerollListButton';
      if (canManage || isListButton) {
        if ('disabled' in control) control.disabled = false;
        control.removeAttribute('aria-disabled');
        control.classList.remove('pkl-viewer-disabled-control');
        return;
      }
      if ('disabled' in control) control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      control.classList.add('pkl-viewer-disabled-control');
    });

    if (listButton) {
      listButton.disabled = false;
      listButton.removeAttribute('aria-disabled');
      listButton.classList.remove('pkl-viewer-disabled-control');
    }
  }

  function bindTeamControlViewerGuard() {
    const panel = document.querySelector('.control-panel');
    if (!panel || panel.dataset.pklViewerGuardBound === 'true') return;
    panel.dataset.pklViewerGuardBound = 'true';

    const blockViewerControl = event => {
      if (isTeamControlManager()) return;
      if (isRerollListButtonTarget(event.target)) return;
      if (event.target && event.target.closest && event.target.closest('#rerollListModal')) return;
      const control = event.target && event.target.closest && event.target.closest('button, select, input, textarea, .pkl-custom-select, .pkl-custom-select-trigger, .pkl-team-mode-dropdown');
      if (!control) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      closeTeamModeDropdown();
      closeRerollModeDropdown();
      closeRerollUserSuggestions();
    };

    ['click', 'pointerdown', 'mousedown', 'keydown', 'input', 'change'].forEach(type => {
      panel.addEventListener(type, blockViewerControl, true);
    });
  }

  function isCurrentUserInJoinWaitingList() {
    const currentUser = findFullUserForViewer(readCurrentLoginUser()) || readCurrentLoginUser();
    if (!currentUser) return false;
    return getActiveJoinWaitList().some(item => isSameUserIdentity(currentUser, item) || sameName(item, currentUser.nickname || currentUser.nick || currentUser.name || currentUser.discord_username || currentUser.discordUsername));
  }

  function renderPlayerCard(playerId) {
    const player = getTeamPlayerById(playerId);
    if (!player) return '';
    // 카드 렌더 중 외부 유저 DB 재조회 금지: 렉/티어 흔들림 방지
    const displayName = player.name || player.nickname || player.discord_username || '알 수 없음';
    const tierBadge = renderPlayerTierBadge(player, null);
    return `
      <div class="player-card" draggable="true" data-player-id="${player.id}" data-player-name="${escapeHtml(displayName)}" data-discord-id="${escapeHtml(player.discordId || player.discord_id || player.userUid || '')}">
        <span class="player-name">${escapeHtml(displayName)}</span>
        ${tierBadge}
      </div>
    `;
  }

  function bindPlayerCards() {
    document.querySelectorAll('.player-card').forEach(card => {
      card.draggable = true;

      card.ondragstart = event => {
        if(!pklTeamCanEdit()){ event.preventDefault(); pklTeamDeny(); return; }
        
        if (isRerolling) { event.preventDefault(); return; }
        isPlayerDragActive = true;
        document.body.classList.add('is-player-dragging');
        draggedPlayerId = card.dataset.playerId;
        card.classList.add('is-dragging');
        event.dataTransfer.setData('text/plain', draggedPlayerId);
        event.dataTransfer.effectAllowed = 'move';
      };

      card.ondragend = () => {
        suppressNextClick = true;
        card.classList.remove('is-dragging');
        draggedPlayerId = null;
        isPlayerDragActive = false;
        document.body.classList.remove('is-player-dragging');
        clearDropStyles();
        setTimeout(() => {
          suppressNextClick = false;
          flushPendingTeamBackgroundSync();
        }, 80);
      };
    });
  }

  function bindDropZones() {
    document.querySelectorAll('[data-drop-type]').forEach(zone => {
      zone.ondragover = event => {
        if (isRerolling || !draggedPlayerId) return;
        event.preventDefault();
        if (!zone.classList.contains('is-over')) zone.classList.add('is-over');
      };

      zone.ondragleave = () => {
        zone.classList.remove('is-over');
      };

      zone.ondrop = event => {
        
        if (isRerolling) { event.preventDefault(); return; }
event.preventDefault();

        const playerId = draggedPlayerId || event.dataTransfer.getData('text/plain');
        if (!playerId) return;

        if (zone.dataset.dropType === 'tier') {
          movePlayerToTier(playerId, zone.dataset.tierId);
        }

        if (zone.dataset.dropType === 'slot') {
          movePlayerToSlot(playerId, Number(zone.dataset.teamIndex), Number(zone.dataset.slotIndex));
        }

        clearDropStyles();
        isPlayerDragActive = false;
        document.body.classList.remove('is-player-dragging');
        renderBoardOnlyAndSave();
      };
    });
  }

  function bindSlotSelection() {
    document.querySelectorAll('.team-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        
        if (isRerolling) return;
const teamIndex = Number(slot.dataset.teamIndex);
        const slotIndex = Number(slot.dataset.slotIndex);
        const hasPlayer = Boolean(state.teams[teamIndex] && state.teams[teamIndex].slots[slotIndex]);

        if (!hasPlayer) return;

        if (rerollModeSelect) rerollModeSelect.value = 'selected';
        if (!Array.isArray(state.selectedSlots)) state.selectedSlots = [];

        const selectedIndex = state.selectedSlots.findIndex(item => (
          item.teamIndex === teamIndex && item.slotIndex === slotIndex
        ));

        if (selectedIndex >= 0) {
          state.selectedSlots.splice(selectedIndex, 1);
        } else {
          state.selectedSlots.push({ teamIndex, slotIndex });
        }

        state.selected = state.selectedSlots[state.selectedSlots.length - 1] || null;
        syncSelectedSlotClasses();
        saveState();
      });
    });
  }


  function findPlayerLocation(playerId) {
    for (const [tierId, ids] of Object.entries(state.waiting)) {
      if (ids.includes(playerId)) return { type: 'tier', tierId };
    }

    for (let teamIndex = 0; teamIndex < state.teams.length; teamIndex += 1) {
      const slotIndex = state.teams[teamIndex].slots.findIndex(id => id === playerId);
      if (slotIndex >= 0) return { type: 'slot', teamIndex, slotIndex };
    }

    return null;
  }

  function setSlotPlayer(teamIndex, slotIndex, playerId) {
    state.teams[teamIndex].slots[slotIndex] = playerId || null;
  }

  function movePlayerToTier(playerId, tierId) {
    removePlayerFromEverywhere(playerId);
    insertPlayerIntoWaitingTier(playerId, tierId);
    state.selected = null;
    state.selectedSlots = [];
    setStatus(`${getPlayerName(playerId)}님을 ${getTierLabel(tierId)} 대기칸으로 이동했습니다.`);
  }

  function movePlayerToSlot(playerId, teamIndex, slotIndex) {
    if (!state.teams[teamIndex] || !Array.isArray(state.teams[teamIndex].slots)) return;
    if (slotIndex < 0 || slotIndex >= state.teams[teamIndex].slots.length) return;
    const from = findPlayerLocation(playerId);
    const targetPlayerId = state.teams[teamIndex].slots[slotIndex];

    if (from && from.type === 'slot' && from.teamIndex === teamIndex && from.slotIndex === slotIndex) {
      return;
    }

    if (from && from.type === 'slot') {
      setSlotPlayer(from.teamIndex, from.slotIndex, targetPlayerId || null);
      setSlotPlayer(teamIndex, slotIndex, playerId);
    } else {
      removePlayerFromEverywhere(playerId);
      if (targetPlayerId) movePlayerToOriginalTier(targetPlayerId);
      setSlotPlayer(teamIndex, slotIndex, playerId);
    }

    state.selected = { teamIndex, slotIndex };
    state.selectedSlots = [{ teamIndex, slotIndex }];
    setStatus(`${getPlayerName(playerId)}님을 ${teamIndex + 1}팀 ${slotIndex + 1}번자리에 배치했습니다.`);
  }

  function movePlayerToOriginalTier(playerId) {
    const player = state.players.find(item => item.id === playerId);
    if (!player) return;
    insertPlayerIntoWaitingTier(playerId, getCanonicalTierId(player.tier));
  }

  function removePlayerFromEverywhere(playerId) {
    Object.keys(state.waiting).forEach(tierId => {
      state.waiting[tierId] = state.waiting[tierId].filter(id => id !== playerId);
    });
    state.teams.forEach(team => {
      team.slots = team.slots.map(id => id === playerId ? null : id);
    });
  }



  function bindNewPlayerTierDropdown() {
    if (!newPlayerTierDropdown || !newPlayerTierTrigger) return;

    newPlayerTierDropdown.addEventListener('click', event => {
      event.stopPropagation();
    });

    newPlayerTierTrigger.addEventListener('click', event => {
      event.stopPropagation();
      const isOpen = newPlayerTierDropdown.classList.toggle('is-open');
      newPlayerTierTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    newPlayerTierOptions.forEach(option => {
      option.addEventListener('click', () => {
        setNewPlayerTierValue(option.dataset.value || 'tier0', true);
        closeNewPlayerTierDropdown();
      });
    });

    document.addEventListener('click', event => {
      if (!newPlayerTierDropdown || !newPlayerTierDropdown.contains(event.target)) closeNewPlayerTierDropdown();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeNewPlayerTierDropdown();
    });

    setNewPlayerTierValue(newPlayerTier ? newPlayerTier.value || 'tier0' : 'tier0', false);
  }

  function closeNewPlayerTierDropdown() {
    if (!newPlayerTierDropdown || !newPlayerTierTrigger) return;
    newPlayerTierDropdown.classList.remove('is-open');
    newPlayerTierTrigger.setAttribute('aria-expanded', 'false');
  }

  function setNewPlayerTierValue(value, shouldFocus) {
    const option = newPlayerTierOptions.find(item => item.dataset.value === value) || newPlayerTierOptions[0];
    const nextValue = option ? option.dataset.value : 'tier0';
    const nextText = option ? option.textContent.trim() : '0티어';

    if (newPlayerTier) newPlayerTier.value = nextValue;
    if (newPlayerTierDropdown) newPlayerTierDropdown.dataset.value = nextValue;
    if (newPlayerTierText) newPlayerTierText.textContent = nextText;

    newPlayerTierOptions.forEach(item => {
      const isActive = item.dataset.value === nextValue;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });

    if (shouldFocus && newPlayerTierTrigger) newPlayerTierTrigger.focus();
  }


  function openPlayerModal() {
    if (!playerModal) return;
    if (newPlayerName) newPlayerName.value = '';
    if (newPlayerTier && !newPlayerTier.value) setNewPlayerTierValue('tier0', false);
    openModal(playerModal);
    window.setTimeout(() => {
      if (newPlayerName) newPlayerName.focus();
    }, 80);
  }

  function addPlayer() {
    if (!newPlayerName || !newPlayerTier) return;

    const name = newPlayerName.value.trim();
    const tier = newPlayerTier.value || 'tier0';

    if (!name) {
      setStatus('닉네임을 입력해야 인원을 추가할 수 있습니다.');
      newPlayerName.focus();
      return;
    }

    const adminUser = findAdminUserByNickname(name);
    const accountUser = findAccountUserByName(name);
    const linkedUser = adminUser || accountUser || null;
    const id = `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const player = createLinkedPlayerRecord({ id, name, tier, linkedUser });
    state.players.push(player);

    insertPlayerIntoWaitingTier(id, tier);

    syncTemporaryPlayerToPklUsers(player, tier);

    newPlayerName.value = '';
    setNewPlayerTierValue('tier0', false);
    closeModal(playerModal);
    setStatus(`${name}님을 ${getTierLabel(tier)} 대기칸에 추가했습니다.`);
    render();
  }

  function syncTemporaryPlayerToPklUsers(player, tier) {
    // localStorage pklUsers 백업은 사용하지 않는다.
    return false;
  }


  function bindUserSyncEvents() {
    // team 페이지에서는 외부 storage/realtime 이벤트로 전체 보드를 다시 그리지 않는다.
    // 참가자/티어는 '대기자 불러오기' 또는 페이지 진입 시 저장된 보드 기준으로 고정한다.
    let lastJoinStateSignature = '';
    window.addEventListener('pkl-join-state-updated', event => {
      const detail = event && event.detail ? event.detail : {};
      const list = Array.isArray(detail.waitList) ? detail.waitList : [];
      const sig = JSON.stringify(list.map(getJoinWaitItemKey).filter(Boolean).sort());
      if (sig === lastJoinStateSignature) return;
      lastJoinStateSignature = sig;
      pendingTeamBackgroundSync = true;
    });
    window.addEventListener('pkl-role-data-updated', event => {
      const changedUsers = event && event.detail && Array.isArray(event.detail.changedUsers) ? event.detail.changedUsers : [];
      if (changedUsers.length) {
        changedUsers.forEach(user => {
          const idx = supabaseUsersCache.findIndex(item => isSameUserIdentity(item, user));
          if (idx >= 0) supabaseUsersCache[idx] = { ...supabaseUsersCache[idx], ...user };
          else supabaseUsersCache.push(user);
        });
        supabaseUsersLoadedOnce = true;
      }
      // 자동 render 금지
      pendingTeamBackgroundSync = true;
    });
  }


  function readJoinRecruitState() {
    try {
      const saved = JSON.parse(localStorage.getItem(JOIN_RECRUIT_STATE_STORAGE_KEY) || 'null');
      return saved && typeof saved === 'object' ? saved : {};
    } catch (error) {
      return {};
    }
  }

  function isJoinRecruitClosed() {
    const st = window.PKLJoinRealtime && typeof window.PKLJoinRealtime.getState === 'function'
      ? window.PKLJoinRealtime.getState()
      : null;
    const state = st && st.recruitState ? st.recruitState.state : '';
    return state === 'closed';
  }

  function parsePrisonUntilMs(text) {
    const m = String(text || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
    if (!m) return 0;
    return new Date(`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}T${String(m[4]).padStart(2,'0')}:${String(m[5]).padStart(2,'0')}:00+09:00`).getTime();
  }
  function isPrisonerForJoin(user) {
    if (!user) return false;
    const raw = String(user.memberRole || user.role || user.userRole || user.authRole || '').trim();
    const low = raw.toLowerCase();
    const p = user.penalty || {};
    const active = low === 'prisoner' || raw === '수감자' || user.isPrisoner || p.type === 'prisoner';
    if (!active) return false;
    const until = parsePrisonUntilMs(p.until || user.joinBlockedUntil || '');
    return !until || until > Date.now();
  }


  function readJoinWaitList() {
    try {
      const st = window.PKLJoinRealtime && typeof window.PKLJoinRealtime.getState === 'function'
        ? window.PKLJoinRealtime.getState()
        : null;
      if (st && Array.isArray(st.waitList)) return st.waitList;
    } catch (error) {}
    try {
      const saved = JSON.parse(localStorage.getItem(JOIN_WAITLIST_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      return [];
    }
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function forceFetchJoinStateForTeam() {
    if (window.PKLJoinRealtime && typeof window.PKLJoinRealtime.fetchNow === 'function') {
      return Promise.resolve(window.PKLJoinRealtime.fetchNow()).then(st => {
        if (st && Array.isArray(st.waitList)) return st;
        return wait(250).then(() => window.PKLJoinRealtime && typeof window.PKLJoinRealtime.getState === 'function' ? window.PKLJoinRealtime.getState() : st);
      }).catch(() => null);
    }
    return fetch('/api/pkl-data-store?type=live_scores&id=join_state&_=' + Date.now(), {
      method: 'GET',
      headers: { 'Cache-Control': 'no-store' }
    }).then(response => response.ok ? response.json() : null)
      .then(data => {
        const row = data && data.rows && data.rows[0];
        const st = row && row.payload ? Object.assign({}, row.payload, { updatedAt: row.payload.updatedAt || row.updated_at }) : null;
        if (st && window.PKLJoinRealtime && typeof window.PKLJoinRealtime.apply === 'function') window.PKLJoinRealtime.apply(st);
        return st;
      })
      .catch(() => null);
  }

  function getJoinWaitItemKey(item) {
    if (!item) return '';
    return String(item.discord_id || item.discordId || item.discordID || item.userDiscordId || item.userId || item.uid || item.key || item.accountId || item.id || item.pubgId || item.pubg_id || item.gameId || item.name || item.nickname || '').trim();
  }

  function findAdminUserForJoinItem(item) {
    const users = readAdminUsers();
    return users.find(user => isSameUserIdentity(item, user)) || users.find(user => sameName(user, item.name || item.nickname)) || null;
  }

  function findAccountUserForJoinItem(item, adminUser) {
    const users = readAccountUsers();
    return users.find(user => isSameUserIdentity(adminUser || item, user)) || users.find(user => sameName(user, (adminUser && (adminUser.nickname || adminUser.nick || adminUser.name)) || item.name || item.nickname)) || null;
  }

  function isPlayerPlacedInTeam(playerId) {
    return state.teams.some(team => Array.isArray(team.slots) && team.slots.includes(playerId));
  }

  function isPlayerInWaitingPool(playerId) {
    return Object.values(state.waiting || {}).some(ids => Array.isArray(ids) && ids.includes(playerId));
  }

  function findPlayerForJoinItem(item, adminUser, accountUser) {
    const seeds = [item, adminUser, accountUser].filter(Boolean);
    const keys = new Set();
    seeds.forEach(seed => {
      collectIdentityValuesFromObject(seed).forEach(value => {
        const key = normalizeName(value);
        if (key) keys.add(key);
      });
      const joinKey = normalizeName(getJoinWaitItemKey(seed));
      if (joinKey) keys.add(joinKey);
    });

    return state.players.find(player => {
      if (seeds.some(seed => isSameUserIdentity(player, seed))) return true;
      const playerValues = collectIdentityValuesFromObject(player).map(normalizeName).filter(Boolean);
      if (playerValues.some(value => keys.has(value))) return true;
      return false;
    }) || state.players.find(player => sameName(player, (adminUser && (adminUser.nickname || adminUser.nick || adminUser.name)) || item.name || item.nickname));
  }

  function loadCurrentJoinWaitingList() {
    showPklConfirmModal({
      title: '대기자 불러오기',
      message: '현재 등록되어있는 대기자 명단을 불러오시겠습니까?',
      danger: false,
      confirmText: '예',
      cancelText: '아니오',
      onConfirm: () => {
        setStatus('Supabase 모집 대기자를 불러오는 중입니다...');
        Promise.all([
          forceFetchJoinStateForTeam(),
          loadSupabaseUsersForJoinWaitListOnce(true)
        ]).then(() => {
          syncJoinWaitListIntoTeamBoard(true);
          syncPlayersWithUserSources();
          renderBoardOnlyAndSave();
          setStatus('현재 Supabase 모집 대기자를 팀구성 대기칸으로 불러왔습니다.');
        }).catch(() => {
          syncJoinWaitListIntoTeamBoard(true);
          syncPlayersWithUserSources();
          renderBoardOnlyAndSave();
          setStatus('대기자 명단을 불러왔습니다. 일부 사용자 정보는 다음 새로고침 후 보정됩니다.');
        });
      }
    });
  }

  function getSupabaseRestConfig() {
    const cfg = window.PKL_SUPABASE_CONFIG || {};
    const readLocal = key => {
      try { return localStorage.getItem(key) || ''; } catch (error) { return ''; }
    };
    const url = String(
      cfg.url || cfg.supabaseUrl || cfg.SUPABASE_URL ||
      readLocal('SUPABASE_URL') || readLocal('PKL_SUPABASE_URL') || ''
    ).replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    const key = String(
      cfg.anonKey || cfg.anon_key || cfg.supabaseAnonKey || cfg.SUPABASE_ANON_KEY ||
      readLocal('SUPABASE_ANON_KEY') || readLocal('PKL_SUPABASE_ANON_KEY') || ''
    );
    return { url, key };
  }

  function loadSupabaseUsersForJoinWaitListOnce(force) {
    if (supabaseUsersLoadedOnce && !force) return Promise.resolve(supabaseUsersCache);
    const config = getSupabaseRestConfig();
    if (!config.url || !config.key || !window.fetch) {
      supabaseUsersLoadedOnce = true;
      return Promise.resolve(supabaseUsersCache);
    }

    const select = [
      'id','discord_id','discord_username','nickname','pubg_id','tier','title','role','prime','warnings','banned','prison_until','created_at'
    ].join(',');

    return fetch(`${config.url}/rest/v1/users?select=${encodeURIComponent(select)}&order=created_at.asc&limit=1000`, {
      method: 'GET',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Cache-Control': 'no-store'
      }
    }).then(response => response.ok ? response.json() : [])
      .then(rows => {
        supabaseUsersCache = Array.isArray(rows) ? rows : [];
        supabaseUsersLoadedOnce = true;
        return supabaseUsersCache;
      })
      .catch(() => {
        supabaseUsersLoadedOnce = true;
        return supabaseUsersCache;
      });
  }

  function readSupabaseUsers() {
    const base = Array.isArray(supabaseUsersCache) ? supabaseUsersCache.slice() : [];
    try{
      if(window.PKLUsersRealtime && typeof window.PKLUsersRealtime.getUsers === 'function'){
        window.PKLUsersRealtime.getUsers().forEach(user => {
          const idx = base.findIndex(item => isSameUserIdentity(item, user));
          if(idx >= 0) base[idx] = { ...base[idx], ...user };
          else base.push(user);
        });
      }
    }catch(error){}
    return base;
  }


  function buildTeamLookupCache() {
    const users = readSupabaseUsers();
    const userByValue = new Map();
    const userByName = new Map();
    users.forEach(user => {
      collectIdentityValuesFromObject(user).forEach(value => {
        const key = normalizeName(value);
        if (key && !userByValue.has(key)) userByValue.set(key, user);
      });
      getUserDisplayNames(user).forEach(name => {
        if (name && !userByName.has(name)) userByName.set(name, user);
      });
    });

    const joinItems = getActiveJoinWaitList();
    const joinByValue = new Map();
    joinItems.forEach(item => {
      collectIdentityValuesFromObject(item).forEach(value => {
        const key = normalizeName(value);
        if (key && !joinByValue.has(key)) joinByValue.set(key, item);
      });
      const key = normalizeName(getJoinWaitItemKey(item));
      if (key && !joinByValue.has(key)) joinByValue.set(key, item);
    });

    return { users, userByValue, userByName, joinItems, joinByValue };
  }

  function withTeamLookupCache(work) {
    const previous = teamLookupCache;
    if (!teamLookupCache) teamLookupCache = buildTeamLookupCache();
    try {
      return work();
    } finally {
      if (!previous) teamLookupCache = null;
    }
  }

  function findSupabaseUserInLookup(seed) {
    if (!seed || !teamLookupCache) return null;
    const values = collectIdentityValuesFromObject(seed);
    for (const value of values) {
      const key = normalizeName(value);
      if (key && teamLookupCache.userByValue.has(key)) return teamLookupCache.userByValue.get(key);
    }
    return null;
  }

  function getUserDisplayNames(user) {
    if (!user) return [];
    return [user.nickname, user.nick, user.name, user.discord_username, user.discordUsername, user.displayName]
      .map(value => normalizeName(value))
      .filter(Boolean);
  }

  function findSupabaseUserByLooseName(name) {
    const target = normalizeName(name);
    if (!target) return null;
    const cache = teamLookupCache;
    if (cache) {
      const exact = cache.userByName.get(target);
      if (exact) return exact;
      const loose = [];
      cache.users.forEach(user => {
        if (getUserDisplayNames(user).some(nameValue => {
          if (!nameValue || nameValue.length < 2 || target.length < 2) return false;
          return nameValue.endsWith(target) || target.endsWith(nameValue) || nameValue.includes(target) || target.includes(nameValue);
        })) loose.push(user);
      });
      return loose.length === 1 ? loose[0] : null;
    }

    return withTeamLookupCache(() => findSupabaseUserByLooseName(name));
  }

  function collectIdentityValuesFromObject(obj) {
    if (!obj) return [];
    return [
      obj.discord_id, obj.discordId, obj.discordID, obj.userDiscordId, obj.discord,
      obj.userUid, obj.uid, obj.userId, obj.accountId, obj.key, obj.id,
      obj.pubgId, obj.pubg_id, obj.pubgID, obj.gameId, obj.pubg, obj.ref,
      obj.nickname, obj.nick, obj.name, obj.discord_username, obj.discordUsername, obj.displayName,
      obj.joinWaitKey, obj.sourceName
    ].map(value => String(value || '').trim()).filter(Boolean);
  }

  function sameIdentityValue(a, b) {
    const av = String(a || '').trim();
    const bv = String(b || '').trim();
    if (!av || !bv) return false;
    return av.toLowerCase() === bv.toLowerCase();
  }

  function findSupabaseUserStrict(seed) {
    if (!seed) return null;
    if (teamLookupCache) return findSupabaseUserInLookup(seed);
    return withTeamLookupCache(() => findSupabaseUserStrict(seed));
  }

  function findSupabaseUserForJoinItem(item, adminUser, accountUser) {
    const candidates = [item, accountUser, adminUser].filter(Boolean);
    for (const seed of candidates) {
      const matched = findSupabaseUserStrict(seed);
      if (matched) return matched;
    }

    const names = [];
    candidates.forEach(seed => {
      names.push(seed.nickname, seed.nick, seed.name, seed.discord_username, seed.discordUsername, seed.displayName);
    });
    for (const name of names) {
      const matched = findSupabaseUserByLooseName(name);
      if (matched) return matched;
    }
    return null;
  }

  function findActiveJoinItemForPlayer(player) {
    if (!player) return null;
    if (teamLookupCache) {
      const values = collectIdentityValuesFromObject(player);
      for (const value of values) {
        const key = normalizeName(value);
        if (key && teamLookupCache.joinByValue.has(key)) return teamLookupCache.joinByValue.get(key);
      }
      return null;
    }
    return withTeamLookupCache(() => findActiveJoinItemForPlayer(player));
  }

  function findSupabaseUserForPlayer(player) {
    const activeJoinItem = findActiveJoinItemForPlayer(player);
    const direct = findSupabaseUserStrict(player) || findSupabaseUserStrict(activeJoinItem);
    if (direct) return direct;
    const byName = findSupabaseUserByLooseName((activeJoinItem && (activeJoinItem.nickname || activeJoinItem.name)) || (player && player.name));
    return byName || null;
  }

  function syncJoinWaitListIntoTeamBoard(forceLoad) {
    if (!teamLookupCache) return withTeamLookupCache(() => syncJoinWaitListIntoTeamBoard(forceLoad));
    if (!forceLoad && isJoinRecruitClosed()) return;
    const joinList = getActiveJoinWaitList().filter(item => {
      const adminUser = findAdminUserForJoinItem(item);
      const accountUser = findAccountUserForJoinItem(item, adminUser);
      return !isPrisonerForJoin(adminUser) && !isPrisonerForJoin(accountUser) && !isPrisonerForJoin(item);
    });
    /* join 대기 명단은 pklJoinState/current가 원본이다. team 페이지는 읽기/분류만 하고 대기 명단을 다시 저장하지 않는다. */
    const activeKeys = new Set();

    joinList.forEach(item => {
      const adminUser = findAdminUserForJoinItem(item);
      const accountUser = findAccountUserForJoinItem(item, adminUser);
      const supabaseUser = findSupabaseUserForJoinItem(item, adminUser, accountUser);
      const identity = getJoinWaitItemKey(supabaseUser || accountUser || adminUser || item);
      if (identity) activeKeys.add(identity);

      const sourceUser = supabaseUser || accountUser || adminUser || item;
      const displayName = (sourceUser && (sourceUser.nickname || sourceUser.nick || sourceUser.name || sourceUser.discord_username || sourceUser.discordUsername)) || item.name || item.nickname || '참가자';
      const resolvedTier = resolveUserTierKey(sourceUser);
      const resolvedTierBadge = resolveUserTierBadgeValue(sourceUser);
      const tier = isValidTierId(resolvedTier) ? getCanonicalTierId(resolvedTier) : 'tier0';
      const player = findPlayerForJoinItem(item, supabaseUser || adminUser, accountUser);

      if (player) {
        player.source = player.source || 'joinWaitList';
        player.joinWaitKey = identity || player.joinWaitKey || '';
        player.userUid = player.userUid || (supabaseUser && (supabaseUser.discord_id || supabaseUser.uid || supabaseUser.id)) || (adminUser && (adminUser.uid || adminUser.id)) || (accountUser && (accountUser.uid || accountUser.id)) || item.discord_id || item.userId || item.uid || item.key || '';
        player.discordId = player.discordId || (supabaseUser && supabaseUser.discord_id) || item.discord_id || item.discordId || '';
        player.accountId = player.accountId || (supabaseUser && (supabaseUser.id || supabaseUser.discord_id)) || (accountUser && (accountUser.id || accountUser.uid)) || (adminUser && (adminUser.id || adminUser.uid)) || item.userId || item.uid || item.key || '';
        player.pubgId = player.pubgId || (supabaseUser && (supabaseUser.pubgId || supabaseUser.pubg_id || supabaseUser.gameId)) || (adminUser && (adminUser.pubgId || adminUser.pubg_id || adminUser.gameId)) || item.pubgId || item.pubg_id || (accountUser && (accountUser.pubgId || accountUser.pubg_id || accountUser.gameId)) || '';
        player.name = displayName;
        player.tier = isValidTierId(tier) ? getCanonicalTierId(tier) : player.tier;
        if (resolvedTierBadge) player.memberTier = resolvedTierBadge;
        if (!isPlayerPlacedInTeam(player.id)) {
          insertPlayerIntoWaitingTier(player.id, player.tier);
        }
        return;
      }

      const id = `join-wait-${identity || Date.now() + '-' + Math.random().toString(16).slice(2)}`;
      const nextPlayer = {
        id,
        name: displayName,
        tier: isValidTierId(tier) ? getCanonicalTierId(tier) : 'tier0',
        memberTier: resolvedTierBadge || '',
        status: 'waiting',
        source: 'joinWaitList',
        joinWaitKey: identity || '',
        userUid: (supabaseUser && (supabaseUser.discord_id || supabaseUser.uid || supabaseUser.id)) || (adminUser && (adminUser.uid || adminUser.id)) || (accountUser && (accountUser.uid || accountUser.id)) || item.discord_id || item.userId || item.uid || item.key || '',
        discordId: (supabaseUser && supabaseUser.discord_id) || item.discord_id || item.discordId || '',
        accountId: (supabaseUser && (supabaseUser.id || supabaseUser.discord_id)) || (accountUser && (accountUser.id || accountUser.uid)) || (adminUser && (adminUser.id || adminUser.uid)) || item.userId || item.uid || item.key || '',
        pubgId: (supabaseUser && (supabaseUser.pubgId || supabaseUser.pubg_id || supabaseUser.gameId)) || (adminUser && (adminUser.pubgId || adminUser.pubg_id || adminUser.gameId)) || item.pubgId || item.pubg_id || (accountUser && (accountUser.pubgId || accountUser.pubg_id || accountUser.gameId)) || ''
      };
      state.players.push(nextPlayer);
      insertPlayerIntoWaitingTier(nextPlayer.id, nextPlayer.tier);
    });

    cleanupDuplicateJoinWaitPlayers();

    const removableIds = new Set();
    state.players.forEach(player => {
      if (player.source !== 'joinWaitList') return;
      const key = player.joinWaitKey || getJoinWaitItemKey(player);
      if (!key || activeKeys.has(key) || isPlayerPlacedInTeam(player.id)) return;
      removableIds.add(player.id);
    });

    if (removableIds.size) {
      state.players = state.players.filter(player => !removableIds.has(player.id));
      Object.keys(state.waiting).forEach(tierId => {
        state.waiting[tierId] = state.waiting[tierId].filter(playerId => !removableIds.has(playerId));
      });
    }
  }

  function hydratePlayersForDisplayOnly() {
    state.players.forEach(player => {
      hydratePlayerIdentity(player);
      const displayName = resolvePlayerDisplayName(player);
      if (displayName) player.name = displayName;
    });
  }

  function cleanupDuplicateJoinWaitPlayers() {
    const keepByKey = new Map();
    const removeIds = new Set();

    state.players.forEach(player => {
      if (!player || player.source !== 'joinWaitList') return;
      const key = String(player.joinWaitKey || player.discordId || player.accountId || player.userUid || player.pubgId || normalizeName(player.name) || '').trim();
      if (!key) return;
      const previousId = keepByKey.get(key);
      if (!previousId) {
        keepByKey.set(key, player.id);
        return;
      }

      const previousPlaced = isPlayerPlacedInTeam(previousId);
      const currentPlaced = isPlayerPlacedInTeam(player.id);
      if (currentPlaced && !previousPlaced) {
        removeIds.add(previousId);
        keepByKey.set(key, player.id);
      } else {
        removeIds.add(player.id);
      }
    });

    if (!removeIds.size) return;
    state.players = state.players.filter(player => !removeIds.has(player.id));
    Object.keys(state.waiting || {}).forEach(tierId => {
      state.waiting[tierId] = (state.waiting[tierId] || []).filter(playerId => !removeIds.has(playerId));
    });
  }

  function syncPlayersWithUserSources() {
    let changed = false;
    state.players.forEach(player => {
      // 슬롯에 이미 배치된 인원은 리롤/드래그 중 티어가 흔들리면 안 되므로 건드리지 않는다.
      if (isPlayerPlacedInTeam(player.id)) return;
      const supabaseUser = findSupabaseUserStrict(player);
      if (!supabaseUser) return;
      const syncedTier = resolveUserTierKey(supabaseUser);
      if (isValidTierId(syncedTier) && player.tier !== getCanonicalTierId(syncedTier)) {
        player.tier = getCanonicalTierId(syncedTier);
        changed = true;
      }
      const tierBadge = resolveUserTierBadgeValue(supabaseUser);
      if (tierBadge && player.memberTier !== tierBadge) {
        player.memberTier = tierBadge;
        changed = true;
      }
      const displayName = supabaseUser.nickname || supabaseUser.nick || supabaseUser.name || supabaseUser.discord_username || '';
      if (displayName && player.name !== displayName) { player.name = displayName; changed = true; }
    });
    syncWaitingPoolsWithPlayerTiers();
    return changed;
  }



  window.PKLTeamApplySingleTierSync = function(sync){
    if(!sync) return;
    const tierKey = resolveUserTierKey(sync);
    if(!isValidTierId(tierKey)) return;
    const nick = sync.nickname || sync.nick || sync.name || sync.discord_username || sync.discordUsername || '';
    const did = sync.discord_id || sync.discordId || '';
    let changed = false;
    const cached = readSupabaseUsers();
    const idx = cached.findIndex(user => (did && (user.discord_id === did || user.discordId === did)) || (nick && sameName(user, nick)));
    const nextUser = Object.assign({}, idx >= 0 ? cached[idx] : {}, sync, { memberTier:tierKey, gradeRole:tierKey, tierRole:tierKey, baseRole:tierKey, tier:getTierLabel(tierKey), nickname:nick || (idx >= 0 ? cached[idx].nickname : '') });
    if(idx >= 0) cached[idx] = nextUser; else cached.push(nextUser);
    state.players.forEach(player => {
      const matchDiscord = did && (player.discordId === did || player.discord_id === did || player.userUid === did || player.accountId === did);
      const matchName = nick && sameName(player, nick);
      if(matchDiscord || matchName){
        player.tier = getCanonicalTierId(tierKey);
        player.memberTier = sync.memberTier || tierKey;
        player.discordId = player.discordId || did;
        player.name = nick || player.name;
        changed = true;
      }
    });
    if(changed){
      syncWaitingPoolsWithPlayerTiers();
      render();
    }
  };

  function resolvePlayerPklTier(player, accountUser) {
    const user = accountUser || resolvePlayerAccountUser(player, resolvePlayerDisplayName(player));
    const tierKey = user ? resolveUserTierKey(user) : 'none';
    return isValidTierId(tierKey) ? getCanonicalTierId(tierKey) : '';
  }

  function syncWaitingPoolsWithPlayerTiers() {
    const nextWaiting = TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {});
    const seen = new Set();

    Object.entries(state.waiting || {}).forEach(([currentTierId, ids]) => {
      if (!Array.isArray(ids)) return;
      const safeTierId = isValidTierId(currentTierId) ? getCanonicalTierId(currentTierId) : 'tier0';
      ids.forEach(playerId => {
        if (!playerId || seen.has(playerId)) return;
        // 슬롯에 배치된 인원은 대기칸에도 동시에 남기지 않는다.
        // 리롤/드래그 후 Supabase 보정 렌더가 돌 때 대기칸으로 복사되어 보이는 원인을 차단한다.
        if (isPlayerPlacedInTeam(playerId)) return;
        const player = state.players.find(item => item.id === playerId);
        if (!player) return;
        const resolvedTierId = isValidTierId(player.tier) ? getCanonicalTierId(player.tier) : safeTierId;
        nextWaiting[resolvedTierId].push(playerId);
        seen.add(playerId);
      });
    });

    state.waiting = sortAllWaitingPools(nextWaiting);
  }

  function cleanPlacedPlayersOutOfWaitingPools() {
    if (!state.waiting || typeof state.waiting !== 'object') return;
    Object.keys(state.waiting).forEach(tierId => {
      if (!Array.isArray(state.waiting[tierId])) { state.waiting[tierId] = []; return; }
      state.waiting[tierId] = state.waiting[tierId].filter(playerId => !isPlayerPlacedInTeam(playerId));
    });
  }

  function insertPlayerIntoWaitingTier(playerId, tierId) {
    const safeTierId = isValidTierId(tierId) ? getCanonicalTierId(tierId) : 'tier0';
    if (!state.waiting || typeof state.waiting !== 'object') state.waiting = TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {});
    TIERS.forEach(tier => {
      if (!Array.isArray(state.waiting[tier.id])) state.waiting[tier.id] = [];
      state.waiting[tier.id] = state.waiting[tier.id].filter(id => id !== playerId);
    });
    state.waiting[safeTierId].push(playerId);
    state.waiting = sortAllWaitingPools(state.waiting);
  }

  function sortAllWaitingPools(waiting) {
    const previousSortCache = waitingSortDetailCache;
    waitingSortDetailCache = {
      playerById: new Map((state.players || []).map(player => [player.id, player])),
      detailById: new Map()
    };
    try {
      const nextWaiting = TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {});
      TIERS.forEach(tier => {
        const ids = Array.isArray(waiting && waiting[tier.id]) ? waiting[tier.id] : [];
        nextWaiting[tier.id] = sortWaitingIdsForTier(ids, tier.id);
      });
      return nextWaiting;
    } finally {
      waitingSortDetailCache = previousSortCache;
    }
  }

  function sortWaitingIdsForTier(ids, boxTierId) {
    return [...ids].sort((a, b) => comparePlayersForWaitingBox(a, b, boxTierId));
  }

  function comparePlayersForWaitingBox(playerIdA, playerIdB, boxTierId) {
    const detailA = resolvePlayerTierDetailById(playerIdA);
    const detailB = resolvePlayerTierDetailById(playerIdB);
    const boxIndex = getTierNumericIndex(boxTierId);
    const zoneA = getWaitingBoxZone(detailA, boxIndex);
    const zoneB = getWaitingBoxZone(detailB, boxIndex);
    if (zoneA !== zoneB) return zoneA - zoneB;
    if (zoneA === 1) {
      if (detailA.subOrder !== detailB.subOrder) return detailA.subOrder - detailB.subOrder;
      return detailA.originalIndex - detailB.originalIndex;
    }
    if (detailA.originalIndex !== detailB.originalIndex) return detailA.originalIndex - detailB.originalIndex;
    if (detailA.subOrder !== detailB.subOrder) return detailA.subOrder - detailB.subOrder;
    return String(playerIdA).localeCompare(String(playerIdB), 'ko');
  }

  function getWaitingBoxZone(detail, boxIndex) {
    if (!Number.isFinite(boxIndex) || !Number.isFinite(detail.originalIndex)) return 1;
    if (detail.originalIndex < boxIndex) return 0;
    if (detail.originalIndex > boxIndex) return 2;
    return 1;
  }

  function resolvePlayerTierDetailById(playerId) {
    if (waitingSortDetailCache && waitingSortDetailCache.detailById.has(playerId)) return waitingSortDetailCache.detailById.get(playerId);
    const player = waitingSortDetailCache && waitingSortDetailCache.playerById
      ? waitingSortDetailCache.playerById.get(playerId)
      : getTeamPlayerById(playerId);
    const detail = resolvePlayerTierDetail(player, null);
    if (waitingSortDetailCache) waitingSortDetailCache.detailById.set(playerId, detail);
    return detail;
  }

  function resolvePlayerTierDetail(player, accountUser) {
    // 정렬/렌더 중 외부 유저 DB를 다시 뒤지지 않는다. 티어 흔들림과 렉 방지.
    if (!player) return normalizeTierDetail('tier0');
    const detail = normalizeTierDetail(player.memberTier || player.tier);
    return detail.id !== 'none' ? detail : normalizeTierDetail('tier0');
  }

  function getUserTierFields(user) {
    if (!user) return [];
    return [
      user.tier,
      user.memberTier,
      user.member_tier,
      user.pklTier,
      user.memberGrade,
      user.grade,
      user.dataTierRole,
      user.dataTier
    ];
  }

  function getTierNumericIndex(tierId) {
    const canonicalTierId = getCanonicalTierId(tierId);
    const match = String(canonicalTierId || '').match(/^tier([0-5])$/);
    return match ? Number(match[1]) : Number.NaN;
  }

  function normalizeTierDetail(value) {
    const id = getCanonicalTierId(normalizeTierKey(value));
    if (id === 'none') return { id: 'none', originalIndex: Number.POSITIVE_INFINITY, subOrder: 3 };
    const text = String(value || '').replace(/\s+/g, '').toLowerCase();
    let subOrder = 3;
    if (/[상上]/.test(text) || /high|upper|top/.test(text)) subOrder = 0;
    else if (/[중中]/.test(text) || /mid|middle/.test(text)) subOrder = 1;
    else if (/[하下]/.test(text) || /low|lower|bottom/.test(text)) subOrder = 2;
    return { id, originalIndex: getTierNumericIndex(id), subOrder };
  }


  function createLinkedPlayerRecord({ id, name, tier, linkedUser }) {
    const player = { id, name, tier, memberTier: linkedUser ? resolveUserTierBadgeValue(linkedUser) : '', status: 'waiting' };
    if (linkedUser) {
      player.userUid = linkedUser.uid || linkedUser.id || '';
      player.accountId = linkedUser.id || linkedUser.uid || '';
      player.pubgId = linkedUser.pubgId || linkedUser.gameId || '';
      player.name = linkedUser.nickname || linkedUser.nick || linkedUser.name || name;
      player.sourceName = name;
    }
    return player;
  }

  function hydratePlayerIdentity(player) {
    if (!player) return player;
    const supabaseUser = findSupabaseUserForPlayer(player);
    const adminUser = resolvePlayerAdminUser(player);
    const accountUser = resolvePlayerAccountUser(player, supabaseUser ? (supabaseUser.nickname || supabaseUser.discord_username) : (adminUser ? adminUser.nickname : player.name));
    const linkedUser = supabaseUser || accountUser || adminUser;
    if (!linkedUser) return player;

    player.userUid = linkedUser.discord_id || linkedUser.uid || linkedUser.id || player.userUid || '';
    player.discordId = linkedUser.discord_id || linkedUser.discordId || player.discordId || '';
    player.accountId = linkedUser.id || linkedUser.uid || linkedUser.discord_id || player.accountId || '';
    player.pubgId = linkedUser.pubgId || linkedUser.pubg_id || linkedUser.gameId || player.pubgId || '';
    player.name = linkedUser.nickname || linkedUser.nick || linkedUser.name || linkedUser.discord_username || player.name;
    const tierKey = resolveUserTierKey(linkedUser);
    const tierBadgeValue = resolveUserTierBadgeValue(linkedUser);
    if (isValidTierId(tierKey)) player.tier = getCanonicalTierId(tierKey);
    if (tierBadgeValue) player.memberTier = tierBadgeValue;
    return player;
  }


  function resolvePlayerDisplayName(player) {
    if (player && (player.name || player.nickname || player.discord_username)) return player.name || player.nickname || player.discord_username;
    const supabaseUser = findSupabaseUserForPlayer(player);
    if (supabaseUser) return supabaseUser.nickname || supabaseUser.nick || supabaseUser.name || supabaseUser.discord_username || '알 수 없음';
    return '알 수 없음';
  }


  function renderPlayerTierBadge(player, accountUser) {
    // 외부 유저 조회는 하지 않고, 이미 Supabase에서 player.memberTier에 반영된 저장 배지값을 우선 표시한다.
    const tierValue = (player && (player.memberTier || player.tier)) || (accountUser && resolveUserTierBadgeValue(accountUser)) || '';
    if (window.PKLTierBadge && typeof window.PKLTierBadge.render === 'function') {
      const html = window.PKLTierBadge.render(tierValue, { extraClass: 'player-tier member-role-badge' });
      if (html) return html;
    }
    const safeTier = isValidTierId(tierValue) ? getCanonicalTierId(tierValue) : 'tier0';
    const label = formatTierBadgeLabel(tierValue, getTierLabel(safeTier));
    return `<span class="player-tier member-role-badge ${escapeHtml(safeTier)}">${escapeHtml(label)}</span>`;
  }


  function resolvePlayerAdminUser(player) {
    return findSupabaseUserForPlayer(player) || null;
  }

  function resolvePlayerAccountUser(player, displayName) {
    const user = findSupabaseUserForPlayer(player);
    if (user) return user;
    const users = readSupabaseUsers();
    return users.find(item => isSameUserIdentity(player, item)) || users.find(item => sameName(item, displayName || player.name)) || null;
  }


  function findAdminUserByNickname(name) {
    return findSupabaseUserByLooseName(name) || null;
  }

  function findAccountUserByName(name) {
    return findSupabaseUserByLooseName(name) || null;
  }

  function readAdminUsers() {
    // Supabase 단일 원본: 예전 admin localStorage 캐시는 팀구성 권한/배지 판정에 사용하지 않는다.
    return [];
  }

  function readAccountUsers() {
    // Supabase 단일 원본: 예전 pklUsers localStorage 캐시는 팀구성 권한/배지 판정에 사용하지 않는다.
    return [];
  }

  function isSameUserIdentity(a, b) {
    if (!a || !b) return false;
    const discordA = a.discord_id || a.discordId || a.discordID || a.userDiscordId || a.discord || '';
    const discordB = b.discord_id || b.discordId || b.discordID || b.userDiscordId || b.discord || '';
    if (discordA && discordB && String(discordA) === String(discordB)) return true;
    const uidA = a.userUid || a.uid || a.userId || a.accountId || a.key || a.id || a.discord_id || a.discordId || '';
    const uidB = b.uid || b.userUid || b.userId || b.accountId || b.key || b.id || b.discord_id || b.discordId || '';
    if (uidA && uidB && String(uidA) === String(uidB)) return true;
    const pubgA = a.pubgId || a.pubg_id || a.gameId || '';
    const pubgB = b.pubgId || b.pubg_id || b.gameId || '';
    return !!(pubgA && pubgB && String(pubgA).trim().toLowerCase() === String(pubgB).trim().toLowerCase());
  }

  function sameName(user, name) {
    const target = normalizeName(name);
    if (!target || !user) return false;
    return [user.nickname, user.nick, user.name, user.discord_username, user.discordUsername].some(value => normalizeName(value) === target);
  }

  function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
  }

  function resolveUserTierKey(user) {
    const tierValue = resolveUserTierValue(user);
    return normalizeTierKey(tierValue);
  }

  function resolveUserTierValue(user) {
    if (!user) return '';
    for (const field of getUserTierFields(user)) {
      const value = extractTierCandidateValue(field);
      if (normalizeTierKey(value) !== 'none') return value;
    }
    return '';
  }

  function resolveUserTierBadgeValue(user) {
    if (!user) return '';
    for (const field of getUserTierFields(user)) {
      const value = extractTierCandidateValue(field);
      if (!value) continue;
      if (window.PKLTierBadge && typeof window.PKLTierBadge.normalize === 'function') {
        const key = window.PKLTierBadge.normalize(value);
        if (key && key !== 'none') return key;
      }
      const text = String(value || '').trim();
      if (!text) continue;
      if (/^tier[0-5]_(high|mid|low)$/i.test(text) || /^tier[0-5](high|mid|low)$/i.test(text.replace(/[\s_-]+/g, ''))) return text;
      if (/[0-5]\s*티어\s*[상중하]/.test(text) || /[0-5]\s*[상중하]/.test(text) || text === '짐승' || text === '5티어' || /^beast$/i.test(text) || /^tier5$/i.test(text)) return text;
      if (normalizeTierKey(text) !== 'none') return text;
    }
    return '';
  }

  function extractTierCandidateValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return value.key || value.role || value.value || value.name || value.label || value.dataGrade || value.dataTierRole || '';
    }
    return value;
  }

  function formatTierBadgeLabel(value, fallback) {
    if (window.PKLTierBadge && typeof window.PKLTierBadge.label === 'function') {
      const label = window.PKLTierBadge.label(value);
      if (label && label !== '없음') return label;
    }
    const text = String(extractTierCandidateValue(value) || '').trim();
    return text || fallback || '0티어';
  }

  function normalizeTierKey(value) {
    if (value === null || value === undefined) return 'none';
    const text = String(value).trim();
    if (!text) return 'none';
    const exactTier = TIERS.find(item => item.id === text || item.label === text);
    if (exactTier) return exactTier.id;

    const compact = text.replace(/\s+/g, '').toLowerCase();
    const normalizedCompact = compact.replace(/[_-]/g, '');
    const idTier = TIERS.find(item => item.id.toLowerCase() === compact || item.label.replace(/\s+/g, '').toLowerCase() === compact);
    if (idTier) return idTier.id;

    if (compact === '짐승' || compact === '5티어' || compact === '5tier' || compact === 'tier5' || compact === 'beast' || compact === 'animal') return 'tier5';

    const koreanTier = compact.match(/([0-5])티어/);
    if (koreanTier) return `tier${koreanTier[1]}`;

    const idMatch = normalizedCompact.match(/^tier([0-5])(high|mid|low|상|중|하)?$/);
    if (idMatch) return `tier${idMatch[1]}`;

    return 'none';
  }

  function rerollSelected() {
    if (!state.selected) {
      setStatus('리롤할 팀 슬롯을 먼저 선택하세요.');
      return;
    }

    const mode = document.querySelector('input[name="rerollMode"]:checked').value;
    if (mode === 'team') rerollSlotLine(state.selected.slotIndex);
    if (mode === 'slot') rerollSlot(state.selected.teamIndex, state.selected.slotIndex);
    render();
  }

  function rerollSlot(teamIndex, slotIndex) {
    const waitingIds = getWaitingPlayerIds();
    if (!waitingIds.length) {
      setStatus('대기칸에 리롤 가능한 인원이 없습니다.');
      return;
    }
    const currentPlayerId = state.teams[teamIndex].slots[slotIndex];
    const nextPlayerId = pickRandom(waitingIds);
    removePlayerFromEverywhere(nextPlayerId);
    if (currentPlayerId) movePlayerToOriginalTier(currentPlayerId);
    state.teams[teamIndex].slots[slotIndex] = nextPlayerId;
    setStatus(`${teamIndex + 1}팀 ${slotIndex + 1}번자리를 리롤했습니다.`);
  }

  function rerollSlotLine(slotIndex) {
    const targets = state.teams
      .map((team, teamIndex) => ({ teamIndex, slotIndex, playerId: team.slots[slotIndex] }))
      .filter(item => Boolean(item.playerId));

    if (targets.length < 2) {
      setStatus(`${slotIndex + 1}번 자리라인에 리롤 가능한 인원이 부족합니다.`);
      render();
      return;
    }

    const shuffledIds = targets.map(item => item.playerId).sort(() => Math.random() - 0.5);

    targets.forEach(({ teamIndex, slotIndex }, index) => {
      state.teams[teamIndex].slots[slotIndex] = shuffledIds[index];
    });

    state.selectedSlots = targets.map(({ teamIndex, slotIndex }) => ({ teamIndex, slotIndex }));
    state.selected = state.selectedSlots[0] || null;

    setStatus(`${slotIndex + 1}번 자리라인의 팀박스 배치 인원만 리롤했습니다.`);
    render();
  }

  function rerollTeam(teamIndex) {
    const team = state.teams[teamIndex];
    const currentIds = team.slots.filter(Boolean);
    currentIds.forEach(movePlayerToOriginalTier);
    team.slots = Array.from({ length: SLOT_COUNT }, () => null);

    for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
      const waitingIds = getWaitingPlayerIds();
      if (!waitingIds.length) break;
      const nextPlayerId = pickRandom(waitingIds);
      removePlayerFromEverywhere(nextPlayerId);
      team.slots[slotIndex] = nextPlayerId;
    }

    setStatus(`${teamIndex + 1}팀 전체를 리롤했습니다.`);
  }


  function setRerollButtonMode(isStopMode) {
    const button = document.getElementById('rerollAllButton');
    if (!button) return;

    button.textContent = isStopMode ? '정지' : '리롤';
    button.classList.toggle('is-stop-mode', isStopMode);
  }

  function trackRerollTimeout(timerId) {
    rerollTimers.push(timerId);
    return timerId;
  }

  function trackRerollInterval(intervalId) {
    rerollIntervals.push(intervalId);
    return intervalId;
  }

  function clearRerollSchedules() {
    rerollTimers.forEach(timerId => window.clearTimeout(timerId));
    rerollIntervals.forEach(intervalId => window.clearInterval(intervalId));
    rerollTimers = [];
    rerollIntervals = [];
  }

  function cancelRerollAndRestore() {
    if (!isRerolling) return;

    clearRerollSchedules();

    // keep current randomized state

    isRerolling = false;
    rerollBackupTeams = null;
    document.body.classList.remove('is-rerolling-locked');
    setRerollButtonMode(false);
    setStatus('리롤을 정지했습니다.');
    render();
  }


  function runRerollByMode() {
    if (isRerolling) {
      cancelRerollAndRestore();
      return;
    }

    const mode = rerollModeSelect ? rerollModeSelect.value : 'selected';

    if (mode === 'selected') {
      rerollSelectedSlots();
      return;
    }

    if (mode.startsWith('line-')) {
      const slotIndex = Number(mode.split('-')[1]);
      selectSlotLine(slotIndex);
      rerollSelectedSlots();
    }
  }


  function bindTeamModeDropdown() {
    if (teamModeSelect && !teamModeSelect.dataset.pklTeamModeBound) {
      teamModeSelect.dataset.pklTeamModeBound = 'true';
      teamModeSelect.addEventListener('change', function(){
        if (!isTeamControlManager()) return;
        changeTeamMode(teamModeSelect.value);
      });
    }
    if (!teamModeDropdown || !teamModeTrigger || !teamModeList) return;

    teamModeTrigger.addEventListener('click', () => {
      if (!isTeamControlManager()) { closeTeamModeDropdown(); return; }
      const isOpen = teamModeDropdown.classList.toggle('is-open');
      teamModeTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    teamModeOptions.forEach(option => {
      option.addEventListener('click', () => {
        if (!isTeamControlManager()) { closeTeamModeDropdown(); return; }
        setTeamModeDropdownValue(option.dataset.value || 'squad20', true);
        closeTeamModeDropdown();
      });
    });

    document.addEventListener('click', event => {
      if (!teamModeDropdown.contains(event.target)) closeTeamModeDropdown();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeTeamModeDropdown();
    });

    teamModeOptions.forEach(item => {
      item.classList.remove('is-active');
      item.setAttribute('aria-selected', 'false');
    });
  }

  function closeTeamModeDropdown() {
    if (!teamModeDropdown || !teamModeTrigger) return;
    teamModeDropdown.classList.remove('is-open');
    teamModeTrigger.setAttribute('aria-expanded', 'false');
  }

  function setTeamModeDropdownValue(value, shouldApply) {
    if (!teamModeDropdown) return;
    const option = teamModeOptions.find(item => item.dataset.value === value);
    if (!option) return;

    teamModeDropdown.dataset.value = value;
    if (teamModeText) teamModeText.textContent = option.textContent.trim();

    teamModeOptions.forEach(item => {
      const isActive = item.dataset.value === value;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });

    if (teamModeSelect) teamModeSelect.value = value;
    if (shouldApply) changeTeamMode(value);
  }

  function bindRerollModeDropdown() {
    if (!rerollModeDropdown || !rerollModeTrigger || !rerollModeList) return;

    rerollModeTrigger.addEventListener('click', () => {
      if (!isTeamControlManager()) { closeRerollModeDropdown(); return; }
      const isOpen = rerollModeDropdown.classList.toggle('is-open');
      rerollModeTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    rerollModeOptions.forEach(option => {
      option.addEventListener('click', () => {
        if (!isTeamControlManager()) { closeRerollModeDropdown(); return; }
        setRerollModeValue(option.dataset.value || 'selected', true);
        closeRerollModeDropdown();
      });
    });

    document.addEventListener('click', event => {
      if (!rerollModeDropdown.contains(event.target)) closeRerollModeDropdown();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeRerollModeDropdown();
    });

    setRerollModeValue(rerollModeDropdown.dataset.value || 'selected', false);
  }

  function closeRerollModeDropdown() {
    if (!rerollModeDropdown || !rerollModeTrigger) return;
    rerollModeDropdown.classList.remove('is-open');
    rerollModeTrigger.setAttribute('aria-expanded', 'false');
  }

  function setRerollModeValue(value, shouldSync) {
    
    if (isRerolling) return;
if (!rerollModeDropdown) return;

    const option = rerollModeOptions.find(item => item.dataset.value === value) || rerollModeOptions[0];
    const nextValue = option ? option.dataset.value : 'selected';
    const nextText = option ? option.textContent.trim() : '지정칸 선택';

    rerollModeDropdown.dataset.value = nextValue;
    if (rerollModeText) rerollModeText.textContent = nextText;

    rerollModeOptions.forEach(item => {
      const isActive = item.dataset.value === nextValue;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });

    if (shouldSync) syncRerollModeSelection();
  }

  function syncRerollModeSelection() {
    const mode = rerollModeSelect ? rerollModeSelect.value : 'selected';

    if (mode === 'selected') {
      state.selected = null;
      state.selectedSlots = [];
      render();
      return;
    }

    if (mode.startsWith('line-')) {
      const slotIndex = Number(mode.split('-')[1]);
      selectSlotLine(slotIndex);
      render();
    }
  }

  function selectSlotLine(slotIndex) {
    state.selectedSlots = state.teams
      .map((team, teamIndex) => ({ teamIndex, slotIndex, playerId: team.slots[slotIndex] }))
      .filter(item => Boolean(item.playerId))
      .map(({ teamIndex, slotIndex }) => ({ teamIndex, slotIndex }));

    state.selected = state.selectedSlots[0] || null;
  }

  
  function rerollSelectedSlots() {
    if (isRerolling) return;

    const targets = (state.selectedSlots || []).filter(({ teamIndex, slotIndex }) => (
      state.teams[teamIndex] && state.teams[teamIndex].slots[slotIndex]
    ));

    if (targets.length < 2) {
      setStatus('리롤할 지정칸을 2개 이상 선택하세요.');
      return;
    }

    const originalIds = targets.map(({ teamIndex, slotIndex }) => state.teams[teamIndex].slots[slotIndex]);
    const finalIds = ensureDifferentOrder(originalIds, shuffleIds(originalIds));
    const REROLL_SPIN_MS = 3000;

    rerollBackupTeams = JSON.parse(JSON.stringify(state.teams));
    clearRerollSchedules();
    isRerolling = true;
    document.body.classList.add('is-rerolling-locked');
    setRerollButtonMode(true);
    setStatus('슬롯머신 리롤 진행 중입니다.');

    const runningSlots = [];

    targets.forEach(({ teamIndex, slotIndex }, index) => {
      const slot = getTeamSlotElement(teamIndex, slotIndex);
      const finalId = finalIds[index];
      if (!slot || !finalId) return;

      // 핵심 수정:
      // 리롤 종료 후 실제 카드 DOM을 다시 갈아끼우면 사용자가 "다 멈춘 뒤 한 칸씩 바뀜"으로 느낀다.
      // 그래서 시작 순간에 실제 슬롯 카드는 이미 최종 결과로 바꿔두고,
      // 그 위를 슬롯머신 릴이 3초 동안 덮는다. 끝날 때는 릴만 제거하므로 별도 교체감이 없다.
      state.teams[teamIndex].slots[slotIndex] = finalId;
      slot.classList.add('is-slot-rolling');
      slot.classList.remove('is-slot-stopped', 'is-slot-relight');
      slot.innerHTML = renderPlayerCard(finalId);

      const reel = document.createElement('div');
      reel.className = 'slot-machine-reel';
      reel.innerHTML = `<div class="slot-machine-item">${escapeHtml(getPlayerName(originalIds[index]))}</div>`;
      slot.appendChild(reel);

      const item = reel.querySelector('.slot-machine-item');
      const spinSpeed = 62 + Math.floor(Math.random() * 34);
      const spinTimer = trackRerollInterval(window.setInterval(() => {
        const nextId = originalIds[Math.floor(Math.random() * originalIds.length)];
        if (item) item.textContent = getPlayerName(nextId);
        reel.classList.remove('is-tick');
        void reel.offsetWidth;
        reel.classList.add('is-tick');
      }, spinSpeed));

      runningSlots.push({ slot, reel, item, finalId });
      reel.dataset.spinTimer = String(spinTimer);
    });

    trackRerollTimeout(window.setTimeout(() => {
      clearRerollSchedules();

      runningSlots.forEach(({ slot, reel, item, finalId }) => {
        if (item) item.textContent = getPlayerName(finalId);
        if (reel) reel.remove();
        slot.classList.remove('is-slot-rolling');
        slot.classList.add('is-slot-stopped', 'is-slot-relight');
      });

      state.selectedSlots = targets.map(({ teamIndex, slotIndex }) => ({ teamIndex, slotIndex }));
      state.selected = state.selectedSlots[state.selectedSlots.length - 1] || null;

      syncSelectedSlotClasses();
      bindPlayerCards();
      renderSummary();
      saveState();

      isRerolling = false;
      rerollBackupTeams = null;
      document.body.classList.remove('is-rerolling-locked');
      setRerollButtonMode(false);
      setStatus(`지정칸 ${targets.length}개 리롤 완료`);
    }, REROLL_SPIN_MS));
  }

  function getTeamSlotElement(teamIndex, slotIndex) {
    return document.querySelector(`.team-slot[data-team-index="${teamIndex}"][data-slot-index="${slotIndex}"]`);
  }

  function shuffleIds(ids) {
    const next = [...ids];

    for (let index = next.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
    }

    return next;
  }

  function ensureDifferentOrder(originalIds, shuffledIds) {
    if (originalIds.length < 2) return shuffledIds;

    const isSameOrder = originalIds.every((id, index) => id === shuffledIds[index]);

    if (!isSameOrder) return shuffledIds;

    const next = [...shuffledIds];
    [next[0], next[1]] = [next[1], next[0]];
    return next;
  }

  function syncSelectedSlotClasses() {
    document.querySelectorAll('.team-slot').forEach(slot => {
      const teamIndex = Number(slot.dataset.teamIndex);
      const slotIndex = Number(slot.dataset.slotIndex);
      const isSelected = Array.isArray(state.selectedSlots) && state.selectedSlots.some(item => (
        item.teamIndex === teamIndex && item.slotIndex === slotIndex
      ));

      slot.classList.toggle('is-selected', isSelected);
    });
  }

function rerollAll() {
    runRerollByMode();
  }

  function openResetBoardConfirmModal() {
    showPklConfirmModal({
      title: '팀구성 보드 초기화',
      message: '티어칸과 팀 박스에 배치된 모든 유저가 삭제됩니다.<br>팀구성 보드를 초기화 하시겠습니까?',
      danger: true,
      confirmText: '예',
      cancelText: '아니오',
      onConfirm: resetBuilder
    });
  }

  function resetBuilder() {
    state = defaultState();
    matchTimeSettingsConfirmed = false;
    if (matchStartTimeGroup) matchStartTimeGroup.querySelectorAll('[data-time-part]').forEach(cell => cell.dataset.value = '');
    if (matchEndTimeGroup) matchEndTimeGroup.querySelectorAll('[data-time-part]').forEach(cell => cell.dataset.value = '');
    saveState();
    setStatus('팀구성 보드를 깨끗이 초기화했습니다.');
    render();
  }

  function hasMatchTimeSettings() {
    return Boolean(matchTimeSettingsConfirmed && String(state.matchStartTime || '').trim() && String(state.matchEndTime || '').trim());
  }
function completeTeams() {
    showPklConfirmModal({
      title: '팀구성 완료',
      message: '현재 팀 박스에 배치된 유저를 시트지에 자동 등록합니다.<br>등록 후 현재 팀구성 보드는 자동으로 초기화됩니다.<br>게임진행 전 시작/종료 타이머를 꼭 확인 해 주시고<br>참가,리롤 입완체크를 끝낸 후 완료 버튼을 눌러주세요.',
      danger: false,
      confirmText: '완료',
      cancelText: '취소',
      onConfirm: () => {
        const result = exportTeamBoardToSheet();
        const importedCount = result && typeof result.count === 'number' ? result.count : Number(result || 0);
        const goSheet = () => { window.location.assign('sheet.html'); };
        const finish = () => {
          resetBuilder();
          setStatus(`팀구성 완료: 시트지에 ${importedCount}명을 등록하고 시트지로 이동합니다.`);
          goSheet();
        };
        if (result && result.remoteSave && typeof result.remoteSave.then === 'function') {
          result.remoteSave.then(finish).catch(() => finish());
        } else {
          finish();
        }
      }
    });
  }

  function exportTeamBoardToSheet() {
    const sheetState = loadSheetStateForTeamExport();
    const exportCfg = getTeamModeConfig(state.teamMode || 'squad10');
    const teams = createSheetTeamsFromTeamBoard(sheetState.teams);
    // 시트지는 점수 입력칸이 항상 [맵선택 + 4명 칸] 구조라서,
    // 듀오/스쿼드 모두 실제 팀박스 1칸 = 시트지 1팀으로 보낸다.
    // mode를 duo로 넘기면 sheet.html이 한 팀을 A/B로 다시 쪼개서
    // 듀오 팀이 비어 보이는 문제가 생긴다.
    sheetState.mode = 'squad';
    sheetState.pklTeamMode = exportCfg.key;
    sheetState.pklTeamCount = exportCfg.teams;
    sheetState.pklTeamSlots = exportCfg.slots;
    sheetState.pklBuddyMode = !!exportCfg.buddy;
    sheetState.selectedTeamId = resolveFirstFilledSheetTeamId(teams) || 'team1';
    sheetState.teams = teams;
    sheetState.rounds = Array.isArray(sheetState.rounds) && sheetState.rounds.length
      ? sheetState.rounds
      : Array.from({ length: 30 }, (_, index) => ({ no: index + 1, map: '', teams: {} }));
    sheetState.feeds = Array.isArray(sheetState.feeds) ? sheetState.feeds : [];
    sheetState.sideBets = Array.isArray(sheetState.sideBets) ? sheetState.sideBets : [];
    sheetState.eventKeys = sheetState.eventKeys && typeof sheetState.eventKeys === 'object' ? sheetState.eventKeys : {};
    sheetState.surrenders = sheetState.surrenders && typeof sheetState.surrenders === 'object' ? sheetState.surrenders : {};
    sheetState.fires = sheetState.fires && typeof sheetState.fires === 'object' ? sheetState.fires : {};
    sheetState.startTime = state.matchStartTime || sheetState.startTime || '';
    sheetState.endTime = state.matchEndTime || sheetState.endTime || '';
    sheetState.updatedFromTeamBoardAt = new Date().toISOString();
    sheetState.teamImportNonce = Date.now();
    sheetState.savedAt = new Date(sheetState.teamImportNonce).toISOString();
    const sheetJson = JSON.stringify(sheetState);
    // Supabase 단일 원본 수술: 팀구성 -> 시트지 전달은 브라우저 디스크 localStorage에 남기지 않는다.
    // 같은 탭 이동 직후 sheet.html이 즉시 읽을 수 있도록 sessionStorage만 임시 전달용으로 사용하고,
    // 실제 운영 원본은 아래 saveSheetStateToSupabaseNow()에서 shared/live_scores에 저장한다.
    try { sessionStorage.setItem(SHEET_STORAGE_KEY, sheetJson); } catch (error) {}
    try { sessionStorage.setItem(TEAM_IMPORT_KEY, sheetJson); } catch (error) {}
    try { window.dispatchEvent(new StorageEvent('storage', { key: SHEET_STORAGE_KEY, newValue: sheetJson })); } catch (error) {}
    try {
      window.dispatchEvent(new CustomEvent('pkl-sheet-teams-imported', { detail: { state: sheetState, teams } }));
    } catch (error) {}
    const remoteSave = saveSheetStateToSupabaseNow(sheetState);
    return {
      count: teams.reduce((sum, team) => sum + team.members.filter(member => member.name).length, 0),
      remoteSave
    };
  }

  function saveSheetStateToSupabaseNow(sheetJson) {
    let sheetState = null;
    try { sheetState = typeof sheetJson === 'string' ? JSON.parse(sheetJson) : sheetJson; } catch (error) { sheetState = null; }
    if (!sheetState || typeof sheetState !== 'object') return Promise.resolve(null);
    const postDataStore = (payload) => fetch('/api/pkl-data-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(res => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json().catch(() => ({ ok: true }));
    });
    const buildTeamExportLiveScoreboardPayload = () => {
      const now = new Date().toISOString();
      const live = {
        version: 4,
        seq: Date.now(),
        updatedAt: now,
        resetNonce: Number(sheetState.resetNonce || 0),
        teamImportNonce: Number(sheetState.teamImportNonce || Date.now()),
        mode: sheetState.mode || 'squad',
        selectedTeamId: sheetState.selectedTeamId || 'team1',
        startTime: sheetState.startTime || '',
        endTime: sheetState.endTime || '',
        teams: Array.isArray(sheetState.teams) ? sheetState.teams : [],
        rounds: Array.isArray(sheetState.rounds) ? sheetState.rounds : [],
        feeds: Array.isArray(sheetState.feeds) ? sheetState.feeds : [],
        eventKeys: sheetState.eventKeys && typeof sheetState.eventKeys === 'object' ? sheetState.eventKeys : {},
        colds: sheetState.colds && typeof sheetState.colds === 'object' ? sheetState.colds : {},
        fires: sheetState.fires && typeof sheetState.fires === 'object' ? sheetState.fires : {},
        fireCancels: sheetState.fireCancels && typeof sheetState.fireCancels === 'object' ? sheetState.fireCancels : {},
        surrenders: sheetState.surrenders && typeof sheetState.surrenders === 'object' ? sheetState.surrenders : {}
      };
      return {
        payload: { version: 1, updatedAt: now, teams: [] },
        live
      };
    };
    const directSave = () => Promise.all([
      postDataStore({ type: 'shared', key: SHEET_STORAGE_KEY, value: sheetState }),
      postDataStore({ type: 'live_scores', id: 'sheet_state', payload: sheetState }),
      postDataStore({ type: 'live_scores', id: 'live_scoreboard', payload: buildTeamExportLiveScoreboardPayload() })
    ]).then(results => results[0]);
    if (window.PKLSupabaseDataSync && typeof window.PKLSupabaseDataSync.setShared === 'function') {
      return window.PKLSupabaseDataSync.setShared(SHEET_STORAGE_KEY, sheetState)
        .then(() => Promise.all([
          postDataStore({ type: 'live_scores', id: 'sheet_state', payload: sheetState }).catch(() => null),
          postDataStore({ type: 'live_scores', id: 'live_scoreboard', payload: buildTeamExportLiveScoreboardPayload() }).catch(() => null)
        ]))
        .catch(directSave);
    }
    if (typeof window.saveSharedData === 'function') {
      try { return Promise.resolve(window.saveSharedData(SHEET_STORAGE_KEY, sheetState)).catch(directSave); } catch (error) {}
    }
    return directSave().catch(() => null);
  }

  function loadSheetStateForTeamExport() {
    // 시트 기존 상태 병합도 localStorage가 아니라 현재 탭의 session 백업만 사용한다.
    // Supabase의 최신 시트 상태는 sheet.html/저장 API가 담당하고, 팀구성 완료 시에는 새 팀 편성을 우선 적용한다.
    try {
      const saved = JSON.parse(sessionStorage.getItem(SHEET_STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') return saved;
    } catch (error) {}
    return {
      mode: 'squad',
      selectedTeamId: 'team1',
      teams: [],
      rounds: Array.from({ length: 30 }, (_, index) => ({ no: index + 1, map: '', teams: {} })),
      feeds: [],
      sideBets: [],
      eventKeys: {},
      surrenders: {},
      fires: {},
      startTime: '',
      endTime: ''
    };
  }

  function createSheetTeamsFromTeamBoard(previousTeams) {
    const oldTeams = Array.isArray(previousTeams) ? previousTeams : [];
    const cfg = getTeamModeConfig(state.teamMode || 'squad10');
    const teamCount = Number(cfg && cfg.teams) || state.teams.length || TEAM_COUNT;
    const slotCount = Number(cfg && cfg.slots) || SLOT_COUNT;
    return Array.from({ length: teamCount }, (_, teamIndex) => {
      const oldTeam = oldTeams[teamIndex] || {};
      return {
        ...oldTeam,
        id: `team${teamIndex + 1}`,
        target: Number(oldTeam.target || 0),
        pklTeamMode: cfg.key,
        pklBuddyIndex: cfg.buddy ? Math.floor(teamIndex / 2) + 1 : null,
        pklBuddyMode: !!cfg.buddy,
        // sheet.html의 점수 입력 헤더는 4칸 고정이다.
        // 듀오 모드는 앞 2칸만 채우고 나머지 2칸은 빈칸으로 둔다.
        members: Array.from({ length: 4 }, (_, slotIndex) => (
          slotIndex < slotCount ? createSheetMemberFromSlot(teamIndex, slotIndex) : { name: '', tier: '', memberTier: '' }
        ))
      };
    });
  }

  function resolveFirstFilledSheetTeamId(teams) {
    const index = Array.isArray(teams)
      ? teams.findIndex(team => Array.isArray(team.members) && team.members.some(member => String(member && member.name || '').trim()))
      : -1;
    return index >= 0 ? `team${index + 1}` : '';
  }

  function createSheetMemberFromSlot(teamIndex, slotIndex) {
    const playerId = state.teams[teamIndex] && state.teams[teamIndex].slots[slotIndex];
    if (!playerId) return { name: '', tier: '', memberTier: '' };
    const player = state.players.find(item => item.id === playerId);
    if (!player) return { name: '', tier: '', memberTier: '' };
    hydratePlayerIdentity(player);
    const displayName = resolvePlayerDisplayName(player);
    const accountUser = resolvePlayerAccountUser(player, displayName);
    const supabaseUser = readSupabaseUsers().find(user => isSameUserIdentity(player, user)) || findSupabaseUserByLooseName(displayName);
    const sourceUser = supabaseUser || accountUser || null;
    const memberTier = String(
      resolveUserTierBadgeValue(sourceUser) ||
      player.memberTier || player.tier || ''
    ).trim();
    return {
      name: displayName,
      nickname: displayName,
      tier: memberTier || player.tier || '',
      memberTier,
      discordId: player.discordId || (sourceUser && (sourceUser.discord_id || sourceUser.discordId)) || '',
      discord_id: player.discordId || (sourceUser && (sourceUser.discord_id || sourceUser.discordId)) || '',
      userUid: player.userUid || (sourceUser && (sourceUser.discord_id || sourceUser.uid || sourceUser.id)) || '',
      accountId: player.accountId || (sourceUser && (sourceUser.id || sourceUser.uid || sourceUser.discord_id)) || '',
      pubgId: player.pubgId || (sourceUser && (sourceUser.pubgId || sourceUser.pubg_id || sourceUser.gameId)) || ''
    };
  }


  function addTestPlayers() {
    const tierFlow = ['tier0', 'tier0', 'tier1', 'tier1', 'tier2', 'tier2', 'tier3', 'tier3', 'tier4', 'beast'];
    const existingTestIds = new Set(state.players.filter(player => String(player.id).startsWith('test-player-')).map(player => player.id));
    const testPlayers = Array.from({ length: 10 }, (_, index) => ({
      id: `test-player-${String(index + 1).padStart(2, '0')}`,
      name: `테스터${index + 1}`,
      tier: tierFlow[index] || 'beast',
      status: 'waiting'
    }));

    let addedCount = 0;
    testPlayers.forEach(player => {
      if (existingTestIds.has(player.id)) return;
      state.players.push(player);
      insertPlayerIntoWaitingTier(player.id, player.tier);
      addedCount += 1;
    });

    setStatus(addedCount ? `테스트 인원 ${addedCount}명을 티어별 대기칸에 추가했습니다.` : '이미 생성된 테스트 인원이 있습니다.');
    render();
  }

  function addWarning() {
    const target = state.selected;
    if (!target) {
      setStatus('지각 경고 처리할 슬롯을 먼저 선택하세요.');
      return;
    }
    const playerId = state.teams[target.teamIndex].slots[target.slotIndex];
    if (!playerId) {
      setStatus('선택한 슬롯이 비어 있어 경고 처리할 수 없습니다.');
      return;
    }
    state.warningLog.push({ playerId, time: new Date().toISOString() });
    setStatus(`${getPlayerName(playerId)}님 지각 경고를 기록했습니다.`);
    render();
  }



  function showRuleConstructionToast(event) {
    if (event) event.preventDefault();
    showToast('준비중', event ? event.currentTarget : null);
  }

  const PKL_TIME_PARTS = {
    period: [
      { value: 'AM', label: 'AM' },
      { value: 'PM', label: 'PM' }
    ],
    hour: Array.from({ length: 12 }, (_, index) => {
      const value = String(index + 1).padStart(2, '0');
      return { value, label: value };
    }),
    minute: Array.from({ length: 60 }, (_, index) => {
      const value = String(index).padStart(2, '0');
      return { value, label: value };
    })
  };

  function fillMatchTimeSelects() {
    const now = new Date();
    if (matchCurrentTime) matchCurrentTime.textContent = formatAmPmTime(now, false);
    setTimeGroupFromValue(matchStartTimeGroup, toTimeInputValue(state.matchStartTime) || toTimeInputValue(now));
    setTimeGroupFromValue(matchEndTimeGroup, toTimeInputValue(state.matchEndTime) || toTimeInputValue(now));
  }

  function toTimeInputValue(value) {
    if (value instanceof Date) {
      return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }

    const text = String(value || '').trim();
    const direct = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (direct) return `${String(Number(direct[1])).padStart(2, '0')}:${direct[2]}`;

    const time12 = text.match(/^(AM|PM)\s+(0?[1-9]|1[0-2]):([0-5]\d)$/i);
    if (!time12) return '';
    let hour = Number(time12[2]);
    if (time12[1].toUpperCase() === 'AM') {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return `${String(hour).padStart(2, '0')}:${time12[3]}`;
  }

  function getTimeGroupParts(group) {
    if (!group) return null;
    const period = group.querySelector('[data-time-part="period"]')?.dataset.value || '';
    const hour = group.querySelector('[data-time-part="hour"]')?.dataset.value || '';
    const minute = group.querySelector('[data-time-part="minute"]')?.dataset.value || '';
    if (!period || !hour || !minute) return null;
    return { period, hour, minute };
  }

  function getTimeGroupMinutes(group) {
    const parts = getTimeGroupParts(group);
    if (!parts) return null;
    return pklTimeToMinutes(parts.period, parts.hour, parts.minute);
  }

  function getTimeGroupValue(group) {
    const parts = getTimeGroupParts(group);
    if (!parts) return '';
    const minutes = pklTimeToMinutes(parts.period, parts.hour, parts.minute);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function setTimeCellValue(cell, value) {
    if (!cell) return;
    const part = cell.dataset.timePart;
    const normalized = normalizeTimeCellValue(part, value, true);
    cell.dataset.value = normalized;
    const button = cell.querySelector('.pkl-time-cell-button');
    if (button) button.querySelector('strong').textContent = normalized || '--';
    const input = cell.querySelector('.pkl-time-cell-input');
    if (input) input.value = normalized;
    cell.querySelectorAll('.pkl-time-option').forEach(option => {
      option.classList.toggle('is-selected', option.dataset.value === normalized);
      option.setAttribute('aria-selected', String(option.dataset.value === normalized));
    });
  }

  function normalizeTimeCellValue(part, value, finalize) {
    const raw = String(value || '').replace(/\D/g, '').slice(0, 2);
    if (part === 'period') return String(value || '').toUpperCase() === 'PM' ? 'PM' : 'AM';
    if (!raw) return '';
    let number = Number(raw);
    if (!Number.isFinite(number)) return '';
    if (part === 'hour') {
      if (finalize) number = Math.min(12, Math.max(1, number));
      else if (number < 1 || number > 12) return raw;
      return String(number).padStart(2, '0');
    }
    if (part === 'minute') {
      if (finalize) number = Math.min(59, Math.max(0, number));
      else if (number > 59) return raw;
      return String(number).padStart(2, '0');
    }
    return raw;
  }

  function setTimeGroupFromValue(group, value) {
    if (!group) return;
    const normalized = toTimeInputValue(value);
    if (!normalized) return;
    const [hourText, minute] = normalized.split(':');
    let hour = Number(hourText);
    const period = hour < 12 ? 'AM' : 'PM';
    if (hour === 0) hour = 12;
    else if (hour > 12) hour -= 12;

    setTimeCellValue(group.querySelector('[data-time-part="period"]'), period);
    setTimeCellValue(group.querySelector('[data-time-part="hour"]'), String(hour).padStart(2, '0'));
    setTimeCellValue(group.querySelector('[data-time-part="minute"]'), minute);
  }

  function closeTimeDropdowns(exceptCell) {
    document.querySelectorAll('.pkl-time-cell.is-open').forEach(cell => {
      if (cell !== exceptCell) {
        cell.classList.remove('is-open');
        const field = cell.closest('.pkl-time-field');
        if (field && !field.querySelector('.pkl-time-cell.is-open')) field.classList.remove('is-dropdown-open');
        const trigger = cell.querySelector('.pkl-time-cell-button, .pkl-time-cell-input');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function openTimeDropdown(cell) {
    if (!cell) return;
    closeTimeDropdowns(cell);
    document.querySelectorAll('#matchTimeModal .pkl-time-field.is-dropdown-open').forEach(field => {
      if (field !== cell.closest('.pkl-time-field')) field.classList.remove('is-dropdown-open');
    });
    const field = cell.closest('.pkl-time-field');
    if (field) field.classList.add('is-dropdown-open');
    cell.classList.add('is-open');
    const trigger = cell.querySelector('.pkl-time-cell-button, .pkl-time-cell-input');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  function buildTimeCell(cell) {
    if (!cell || cell.dataset.timeBuilt === 'true') return;
    const part = cell.dataset.timePart;
    const options = PKL_TIME_PARTS[part] || [];
    const isNumberPart = part === 'hour' || part === 'minute';
    cell.dataset.timeBuilt = 'true';
    cell.innerHTML = isNumberPart ? `
      <input class="pkl-time-cell-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" aria-haspopup="listbox" aria-expanded="false" aria-label="${part === 'hour' ? '시간' : '분'}" placeholder="--">
      <div class="pkl-time-option-panel" role="listbox"></div>
    ` : `
      <button class="pkl-time-cell-button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="오전 오후 선택">
        <strong>--</strong>
      </button>
      <div class="pkl-time-option-panel" role="listbox"></div>
    `;
    const panel = cell.querySelector('.pkl-time-option-panel');
    options.forEach(item => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'pkl-time-option';
      option.dataset.value = item.value;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = item.label;
      option.addEventListener('click', event => {
        event.preventDefault();
        setTimeCellValue(cell, item.value);
        closeTimeDropdowns();
      });
      panel.appendChild(option);
    });

    const button = cell.querySelector('.pkl-time-cell-button');
    if (button) {
      button.addEventListener('click', event => {
        event.preventDefault();
        if (cell.classList.contains('is-open')) closeTimeDropdowns();
        else openTimeDropdown(cell);
      });
    }

    const input = cell.querySelector('.pkl-time-cell-input');
    if (input) {
      input.addEventListener('focus', () => openTimeDropdown(cell));
      input.addEventListener('click', () => openTimeDropdown(cell));
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 2);
        const normalized = normalizeTimeCellValue(part, input.value, false);
        cell.dataset.value = normalized.length === 2 ? normalized : '';
        cell.querySelectorAll('.pkl-time-option').forEach(option => {
          option.classList.toggle('is-selected', option.dataset.value === cell.dataset.value);
          option.setAttribute('aria-selected', String(option.dataset.value === cell.dataset.value));
        });
      });
      input.addEventListener('blur', () => {
        if (input.value) setTimeCellValue(cell, input.value);
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          setTimeCellValue(cell, input.value);
          closeTimeDropdowns();
          input.blur();
        }
      });
    }
  }

  function initMatchTimePickers() {
    document.querySelectorAll('#matchTimeModal .pkl-time-cell').forEach(buildTimeCell);
    if (document.body.dataset.pklTimePickerOutsideBound === 'true') return;
    document.body.dataset.pklTimePickerOutsideBound = 'true';
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest('.pkl-time-cell')) closeTimeDropdowns();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeTimeDropdowns();
    });
  }

  function setTimeSelectsToNow() {
    const nowValue = toTimeInputValue(new Date());
    if (matchStartTimeGroup && !getTimeGroupValue(matchStartTimeGroup)) setTimeGroupFromValue(matchStartTimeGroup, nowValue);
    if (matchEndTimeGroup && !getTimeGroupValue(matchEndTimeGroup)) setTimeGroupFromValue(matchEndTimeGroup, nowValue);
  }

  function injectMatchTimeValidationStyle() {
    if (document.getElementById('pklMatchTimeValidationStyle')) return;
    const style = document.createElement('style');
    style.id = 'pklMatchTimeValidationStyle';
    style.textContent = `
      .pkl-time-modal .modal-head .pkl-time-back-button{
        position:absolute !important;
        right:0 !important;
        top:50% !important;
        transform:translateY(-50%) !important;
        width:40px !important;
        height:40px !important;
        min-width:40px !important;
        border-radius:50% !important;
        border:1px solid rgba(216,180,254,.34) !important;
        background:
          linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.025)),
          rgba(13,10,28,.88) !important;
        color:#f5f3ff !important;
        font-size:25px !important;
        font-weight:900 !important;
        line-height:36px !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        box-shadow:0 0 14px rgba(124,58,237,.14), inset 0 1px 0 rgba(255,255,255,.10) !important;
        cursor:pointer !important;
      }
      .pkl-time-modal .modal-head .pkl-time-back-button:hover{
        border-color:rgba(255,255,255,.66) !important;
        color:#fff !important;
        box-shadow:0 0 18px rgba(255,255,255,.18), inset 0 1px 0 rgba(255,255,255,.14) !important;
      }
      #saveMatchTimeButton.is-time-invalid-shake{
        border-color:rgba(255,82,100,.95) !important;
        color:#fff !important;
        background:
          radial-gradient(circle at 50% 0%,rgba(255,95,118,.46),transparent 68%),
          linear-gradient(180deg,rgba(255,90,112,.98),rgba(144,16,42,.98)) !important;
        box-shadow:
          0 0 24px rgba(255,82,100,.58),
          0 0 44px rgba(255,0,70,.22),
          inset 0 1px 0 rgba(255,255,255,.20) !important;
        animation:pklTimeInvalidShake .62s cubic-bezier(.36,.07,.19,.97) both !important;
      }
      @keyframes pklTimeInvalidShake{
        0%,100%{transform:translateX(0);}
        12%{transform:translateX(-8px) rotate(-.8deg);}
        24%{transform:translateX(8px) rotate(.8deg);}
        36%{transform:translateX(-7px) rotate(-.6deg);}
        48%{transform:translateX(7px) rotate(.6deg);}
        60%{transform:translateX(-4px);}
        72%{transform:translateX(4px);}
      }
    `;
    document.head.appendChild(style);
  }

  function markMatchTimeButtonInvalid() {
    if (!saveMatchTimeButton) return;
    saveMatchTimeButton.classList.remove('is-time-invalid-shake');
    void saveMatchTimeButton.offsetWidth;
    saveMatchTimeButton.classList.add('is-time-invalid-shake');
    setTimeout(() => saveMatchTimeButton.classList.remove('is-time-invalid-shake'), 760);
  }

  function ensureMatchTimeBackButton() {
    if (!matchTimeModal) return;
    const head = matchTimeModal.querySelector('.modal-head');
    if (!head) return;

    const closeButton = head.querySelector('.modal-close');
    if (closeButton) {
      closeButton.classList.add('pkl-time-back-button');
      closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', '시작 종료 설정 닫기');
      return;
    }

    if (head.querySelector('[data-match-time-back]')) return;
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'pkl-time-back-button';
    backButton.setAttribute('data-match-time-back', 'true');
    backButton.textContent = '×';
    backButton.setAttribute('aria-label', '시작 종료 설정 닫기');
    backButton.addEventListener('click', () => closeModal(matchTimeModal));
    head.appendChild(backButton);
  }

  function openMatchTimeModal() {
    injectMatchTimeValidationStyle();
    initMatchTimePickers();
    if (!matchTimeModal) return;
    ensureMatchTimeBackButton();

    fillMatchTimeSelects();
    setTimeSelectsToNow();
    if (matchCurrentTime) matchCurrentTime.textContent = formatAmPmTime(pklTeamNow(), false);
    openModal(matchTimeModal);
  }

  function pklTimeToMinutes(period, hour, minute) {
    let h = Number(hour || 0);
    const m = Number(minute || 0);
    if (String(period || 'AM') === 'AM') {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return h * 60 + m;
  }

function saveMatchTimeSettings() {
    const startMinutes = getTimeGroupMinutes(matchStartTimeGroup);
    const endMinutes = getTimeGroupMinutes(matchEndTimeGroup);

    if (startMinutes === null || endMinutes === null) {
      matchTimeSettingsConfirmed = false;
      updateConfirmModalReadyState();
      markMatchTimeButtonInvalid();
      setStatus('시작/종료 시간을 설정해 주세요.');
      return;
    }


    state.matchStartTime = getTimeGroupValue(matchStartTimeGroup);
    state.matchEndTime = getTimeGroupValue(matchEndTimeGroup);
    matchTimeSettingsConfirmed = true;

    saveState();
    closeTimeDropdowns();
    closeModal(matchTimeModal);
    updateConfirmModalReadyState();
    setStatus(`시작 ${state.matchStartTime} / 종료 ${state.matchEndTime} 설정 완료`);
  }

  function openRerollListModal() {
    if (!rerollListModal) return;
    applyTeamControlAccess();
    ensureRerollRequestState();
    if (isTeamControlManager()) refreshRerollUserAutocomplete();
    renderRerollListModal();
    openModal(rerollListModal);
  }

  const REROLL_TYPES = [
    { key: 'r03', label: '0.3', title: '0.3 리롤' },
    { key: 'r05', label: '0.5', title: '0.5 리롤' },
    { key: 'r07', label: '0.7', title: '0.7 리롤' },
    { key: 'r10', label: '1.0', title: '1.0 리롤' }
  ];

  function ensureRerollRequestState() {
    if (!state.rerollRequests || typeof state.rerollRequests !== 'object' || Array.isArray(state.rerollRequests)) {
      state.rerollRequests = {};
    }
    if (!Array.isArray(state.rerollHiddenKeys)) {
      state.rerollHiddenKeys = [];
    }
    Object.keys(state.rerollRequests).forEach(key => {
      normalizeRerollRequestShape(state.rerollRequests[key]);
    });
  }

  function normalizeRerollRequestShape(request) {
    if (!request || typeof request !== 'object') return request;
    const previousCount = normalizeRerollCount(request.count);
    if (!request.counts || typeof request.counts !== 'object' || Array.isArray(request.counts)) {
      request.counts = {};
    }
    REROLL_TYPES.forEach(type => {
      request.counts[type.key] = normalizeRerollCount(request.counts[type.key]);
    });
    if (previousCount > 0 && getRerollTotalCount(request) <= 0) {
      request.counts.r10 = previousCount;
    }
    request.count = getRerollTotalCount(request);
    request.paid = Boolean(request.paid);
    return request;
  }

  function getRerollTotalCount(request) {
    if (!request || !request.counts || typeof request.counts !== 'object') return normalizeRerollCount(request && request.count);
    return REROLL_TYPES.reduce((sum, type) => sum + normalizeRerollCount(request.counts[type.key]), 0);
  }

  function renderRerollTypeControls(key, request, canManageList) {
    const counts = (request && request.counts) || {};
    return REROLL_TYPES.map(type => {
      const value = normalizeRerollCount(counts[type.key]);
      if (!canManageList) {
        return `<span class="pkl-reroll-type-view ${value > 0 ? 'has-count' : ''}"><b>${escapeHtml(type.label)}</b><em>${value}</em></span>`;
      }
      return `
        <div class="pkl-reroll-type-control" data-reroll-type="${escapeHtml(type.key)}" aria-label="${escapeHtml(type.title)} 횟수">
          <span class="pkl-reroll-type-label">${escapeHtml(type.label)}</span>
          <div class="pkl-reroll-mini-counter">
            <button type="button" data-reroll-action="type-decrease" data-reroll-type="${escapeHtml(type.key)}" aria-label="${escapeHtml(type.title)} 감소">−</button>
            <input type="number" min="0" step="1" inputmode="numeric" value="${value}" data-reroll-type-count data-reroll-type="${escapeHtml(type.key)}" aria-label="${escapeHtml(type.title)} 횟수" />
            <button type="button" data-reroll-action="type-increase" data-reroll-type="${escapeHtml(type.key)}" aria-label="${escapeHtml(type.title)} 증가">＋</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function ensureRerollListStyles() {
    if (document.getElementById('pkl-reroll-type-style')) return;
    const style = document.createElement('style');
    style.id = 'pkl-reroll-type-style';
    style.textContent = `
      #rerollListModal .pkl-reroll-entry{align-items:stretch;gap:14px;}
      #rerollListModal .pkl-reroll-user{min-width:180px;}
      #rerollListModal .pkl-reroll-type-grid{display:grid;grid-template-columns:repeat(4,minmax(92px,1fr));gap:8px;flex:1;min-width:390px;}
      #rerollListModal .pkl-reroll-type-control{display:flex;flex-direction:column;gap:5px;padding:8px;border:1px solid rgba(180,130,255,.22);border-radius:12px;background:rgba(12,8,28,.55);box-shadow:inset 0 0 14px rgba(135,75,255,.08);}
      #rerollListModal .pkl-reroll-type-label{font-size:12px;font-weight:800;letter-spacing:.03em;color:#d8c6ff;text-align:center;line-height:1;}
      #rerollListModal .pkl-reroll-mini-counter{display:grid;grid-template-columns:24px minmax(30px,1fr) 24px;align-items:center;gap:4px;}
      #rerollListModal .pkl-reroll-mini-counter button{width:24px;height:24px;border-radius:8px;border:1px solid rgba(194,149,255,.36);background:rgba(80,45,150,.55);color:#fff;font-weight:900;cursor:pointer;}
      #rerollListModal .pkl-reroll-mini-counter input{width:100%;height:24px;border-radius:8px;border:1px solid rgba(194,149,255,.28);background:rgba(6,5,18,.82);color:#fff;text-align:center;font-weight:800;outline:none;}
      #rerollListModal .pkl-reroll-type-view{display:flex;align-items:center;justify-content:center;gap:5px;min-width:58px;padding:7px 8px;border-radius:10px;background:rgba(12,8,28,.55);border:1px solid rgba(180,130,255,.18);color:#a99bc9;}
      #rerollListModal .pkl-reroll-type-view.has-count{color:#fff;border-color:rgba(180,130,255,.42);box-shadow:0 0 12px rgba(145,80,255,.18);}
      #rerollListModal .pkl-reroll-type-view b{font-size:12px;}
      #rerollListModal .pkl-reroll-type-view em{font-style:normal;font-size:13px;font-weight:900;}
      #rerollListModal .pkl-reroll-total-badge{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:24px;padding:0 9px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:900;color:#fff;}
      #rerollListModal .pkl-reroll-paid-check{min-width:88px;justify-content:center;}
      @media (max-width:1100px){#rerollListModal .pkl-reroll-entry{flex-wrap:wrap;}#rerollListModal .pkl-reroll-type-grid{min-width:100%;grid-template-columns:repeat(2,minmax(120px,1fr));}}
    `;
    document.head.appendChild(style);
  }

  function getTeamSlotParticipants() {
    const seen = new Set();
    const participants = [];
    state.teams.forEach((team, teamIndex) => {
      team.slots.forEach((playerId, slotIndex) => {
        if (!playerId || seen.has(playerId)) return;
        const player = state.players.find(item => item.id === playerId);
        if (!player) return;
        hydratePlayerIdentity(player);
        seen.add(playerId);
        participants.push({
          key: playerId,
          playerId,
          name: resolvePlayerDisplayName(player),
          tierBadge: renderRerollListTierBadge(player),
          teamName: `${teamIndex + 1}팀`,
          slotName: `${slotIndex + 1}번자리`,
          manual: false
        });
      });
    });
    return participants;
  }

  function getRerollListRows() {
    ensureRerollRequestState();

    const hiddenKeys = new Set(state.rerollHiddenKeys || []);
    const teamRows = getTeamSlotParticipants().filter(item => !hiddenKeys.has(item.key));
    const manualRows = Object.entries(state.rerollRequests)
      .filter(([key, request]) => request && request.manual === true && !hiddenKeys.has(key))
      .map(([key, request]) => ({
        key,
        playerId: request.playerId || '',
        name: request.name || key.replace(/^manual:/, ''),
        tierBadge: renderRerollListManualTierBadge(request),
        teamName: '직접 추가',
        slotName: '',
        manual: true
      }));

    const rows = [...teamRows, ...manualRows];

    rows.forEach(item => {
      if (!state.rerollRequests[item.key]) {
        state.rerollRequests[item.key] = {
          id: item.key,
          playerId: item.playerId || '',
          name: item.name,
          count: 0,
          counts: { r03: 0, r05: 0, r07: 0, r10: 0 },
          paid: false,
          manual: Boolean(item.manual)
        };
      }
      state.rerollRequests[item.key].name = item.name;
      state.rerollRequests[item.key].playerId = item.playerId || state.rerollRequests[item.key].playerId || '';
      state.rerollRequests[item.key].tierBadge = item.tierBadge || state.rerollRequests[item.key].tierBadge || '';
      state.rerollRequests[item.key].manual = Boolean(item.manual);
      normalizeRerollRequestShape(state.rerollRequests[item.key]);
    });

    const validVisibleKeys = new Set(rows.map(item => item.key));
    state.rerollHiddenKeys = (state.rerollHiddenKeys || []).filter(key => state.rerollRequests[key] && !validVisibleKeys.has(key));
    return sortRerollListRows(rows);
  }

  function sortRerollListRows(rows) {
    return [...rows].sort((a, b) => {
      const aRequest = state.rerollRequests[a.key] || {};
      const bRequest = state.rerollRequests[b.key] || {};
      const aPaid = Boolean(aRequest.paid);
      const bPaid = Boolean(bRequest.paid);

      if (aPaid !== bPaid) return aPaid ? 1 : -1;

      const nameCompare = String(a.name || '').localeCompare(String(b.name || ''), 'ko', {
        sensitivity: 'base',
        numeric: true
      });
      if (nameCompare !== 0) return nameCompare;

      return String(a.key || '').localeCompare(String(b.key || ''), 'ko', { numeric: true });
    });
  }

  function renderRerollListTierBadge(player) {
    if (!player) return '';
    hydratePlayerIdentity(player);
    return renderPlayerTierBadge(player, resolvePlayerAdminUser(player) || resolvePlayerAccountUser(player, resolvePlayerDisplayName(player)));
  }

  function renderRerollListManualTierBadge(request) {
    const user = findRerollAdminUserByInput(request && (request.pubgId || request.name || request.playerId || request.userUid));
    if (user && window.PKLTierBadge && typeof window.PKLTierBadge.renderForUser === 'function') {
      const html = window.PKLTierBadge.renderForUser(user, { extraClass: 'player-tier member-role-badge' });
      if (html) return html;
    }
    if (request && request.playerId) {
      const player = state.players.find(item => item.id === request.playerId);
      if (player) return renderRerollListTierBadge(player);
    }
    return request && request.tierBadge ? request.tierBadge : '';
  }

  function renderRerollListModal() {
    if (!rerollListEntries) return;
    ensureRerollListStyles();
    const rows = getRerollListRows();
    if (!rows.length) {
      rerollListEntries.innerHTML = '<div class="pkl-reroll-empty">직접 추가된 리롤 사용자가 없습니다.</div>';
      saveState();
      updateConfirmModalReadyState();
      return;
    }

    const canManageList = isTeamControlManager();
    rerollListEntries.innerHTML = rows.map(item => {
      const request = normalizeRerollRequestShape(state.rerollRequests[item.key] || { count: 0, counts: {}, paid: false });
      const position = [item.teamName, item.slotName].filter(Boolean).join(' · ');
      const tierBadge = item.tierBadge || request.tierBadge || '';
      const totalCount = getRerollTotalCount(request);
      return `
        <div class="pkl-reroll-entry ${request.paid ? 'is-paid' : ''} ${canManageList ? '' : 'is-view-only'}" data-reroll-key="${escapeHtml(item.key)}">
          <div class="pkl-reroll-user">
            <div class="pkl-reroll-user-main">
              <strong>${escapeHtml(item.name)}</strong>
              ${tierBadge ? `<span class="pkl-reroll-tier-badge">${tierBadge}</span>` : ''}
              <span class="pkl-reroll-total-badge">합 ${totalCount}</span>
            </div>
            <span class="pkl-reroll-position">${escapeHtml(position)}</span>
          </div>
          <div class="pkl-reroll-type-grid">
            ${renderRerollTypeControls(item.key, request, canManageList)}
          </div>
          ${canManageList ? `
            <label class="pkl-reroll-paid-check">
              <input type="checkbox" data-reroll-paid ${request.paid ? 'checked' : ''} />
              <span>확인완료</span>
            </label>
            <button class="pkl-reroll-remove" type="button" data-reroll-action="remove" aria-label="리롤 목록에서 제거">×</button>
          ` : `
            <span class="pkl-reroll-paid-view ${request.paid ? 'is-paid' : ''}">${request.paid ? '확인완료' : '미확인'}</span>
          `}
        </div>
      `;
    }).join('');

    bindRerollListEntryEvents();
    saveState();
  }

  function bindRerollListEntryEvents() {
    if (!rerollListEntries) return;
    if (!isTeamControlManager()) return;
    rerollListEntries.querySelectorAll('.pkl-reroll-entry').forEach(entry => {
      const key = entry.dataset.rerollKey;
      const paidInput = entry.querySelector('[data-reroll-paid]');

      entry.querySelectorAll('[data-reroll-action]').forEach(button => {
        button.addEventListener('click', () => {
          const action = button.dataset.rerollAction;
          const type = button.dataset.rerollType || '';
          if (action === 'type-increase') updateRerollTypeCount(key, type, 1);
          if (action === 'type-decrease') updateRerollTypeCount(key, type, -1);
          if (action === 'remove') removeRerollListUser(key);
        });
      });

      entry.querySelectorAll('[data-reroll-type-count]').forEach(input => {
        const type = input.dataset.rerollType || '';
        input.addEventListener('change', () => setRerollTypeCount(key, type, input.value));
        input.addEventListener('input', () => setRerollTypeCount(key, type, input.value, true));
      });

      if (paidInput) {
        paidInput.addEventListener('change', () => {
          ensureRerollRequestState();
          if (!state.rerollRequests[key]) return;
          state.rerollRequests[key].paid = paidInput.checked;
          saveState();
          renderRerollListModal();
          updateConfirmModalReadyState();
        });
      }
    });
  }

  function normalizeRerollCount(value) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number) || number < 0) return 0;
    return number;
  }

  function updateRerollTypeCount(key, type, amount) {
    ensureRerollRequestState();
    if (!state.rerollRequests[key] || !REROLL_TYPES.some(item => item.key === type)) return;
    const request = normalizeRerollRequestShape(state.rerollRequests[key]);
    request.counts[type] = Math.max(0, normalizeRerollCount(request.counts[type]) + amount);
    request.count = getRerollTotalCount(request);
    renderRerollListModal();
  }

  function setRerollTypeCount(key, type, value, skipRender) {
    ensureRerollRequestState();
    if (!state.rerollRequests[key] || !REROLL_TYPES.some(item => item.key === type)) return;
    const request = normalizeRerollRequestShape(state.rerollRequests[key]);
    request.counts[type] = normalizeRerollCount(value);
    request.count = getRerollTotalCount(request);
    saveState();
    if (!skipRender) renderRerollListModal();
  }

  function updateRerollCount(key, amount) {
    updateRerollTypeCount(key, 'r10', amount);
  }

  function setRerollCount(key, value, skipRender) {
    setRerollTypeCount(key, 'r10', value, skipRender);
  }


  function getAdminUserDisplayName(user) {
    return String((user && (user.nickname || user.nick || user.name || user.pubgId || user.gameId)) || '').trim();
  }

  function getRerollAdminCandidates() {
    const seen = new Set();
    return readAdminUsers()
      .map(user => ({ user, name: getAdminUserDisplayName(user) }))
      .filter(item => {
        const key = normalizeName(item.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  function refreshRerollUserAutocomplete() {
    if (!rerollUserOptions) return;
    const candidates = getRerollAdminCandidates();
    rerollUserOptions.innerHTML = candidates.map(item => `<option value="${escapeHtml(item.name)}"></option>`).join('');
  }

  function findRerollAdminUserByInput(value) {
    const name = normalizeName(value);
    if (!name) return null;
    return readAdminUsers().find(user => sameName(user, value) || normalizeName(user.pubgId || user.gameId) === name) || null;
  }
  
  function normalizeKoreanSearch(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getKoreanInitials(text) {
    const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    return String(text || '').split('').map(char => {
      const code = char.charCodeAt(0) - 44032;
      if (code < 0 || code > 11171) return char.toLowerCase();
      return CHO[Math.floor(code / 588)] || char;
    }).join('');
  }

  function getAdminRerollUsers() {
    const users = readAdminUsers();
    return users
      .map(user => ({
        user,
        name: String(user.nickname || user.nick || user.name || user.pubgId || '').trim()
      }))
      .filter(item => item.name)
      .filter((item, index, arr) => arr.findIndex(other => other.name === item.name) === index)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  function findAdminRerollUserByName(name) {
    const target = normalizeKoreanSearch(name);
    if (!target) return null;
    return getAdminRerollUsers().find(item => normalizeKoreanSearch(item.name) === target) || null;
  }

  function closeRerollUserSuggestions() {
    if (!rerollUserSuggestBox) return;
    rerollUserSuggestBox.classList.remove('is-open');
    rerollUserSuggestBox.innerHTML = '';
  }

  
  function renderRerollSuggestTierBadge(user) {
    if (window.PKLTierBadge && typeof window.PKLTierBadge.renderForUser === 'function') {
      const html = window.PKLTierBadge.renderForUser(user);
      if (html) return html;
    }

    const tierKey = resolveUserTierKey(user) || 'tier0';
    const tierLabel = resolveUserTierLabel(user) || getTierLabel(tierKey) || '회원';

    if (window.PKLTierBadge && typeof window.PKLTierBadge.render === 'function') {
      const html = window.PKLTierBadge.render(tierKey);
      if (html) return html;
    }

    return `<span class="member-role-badge grade-role-${escapeHtml(tierKey)}">${escapeHtml(tierLabel)}</span>`;
  }

function renderRerollUserSuggestions() {
    if (!rerollUserInput || !rerollUserSuggestBox) return;
    const query = normalizeKoreanSearch(rerollUserInput.value);
    if (!query) {
      closeRerollUserSuggestions();
      return;
    }

    const queryInitials = getKoreanInitials(query);
    const matches = getAdminRerollUsers().filter(item => {
      const name = normalizeKoreanSearch(item.name);
      const initials = getKoreanInitials(name);
      return name.includes(query) || initials.includes(queryInitials);
    }).slice(0, 8);

    if (!matches.length) {
      rerollUserSuggestBox.innerHTML = '<div class="pkl-reroll-suggest-empty">검색된 등록 유저가 없습니다.</div>';
      rerollUserSuggestBox.classList.add('is-open');
      return;
    }

    rerollUserSuggestBox.innerHTML = matches.map(item => {
      const badgeHtml = renderRerollSuggestTierBadge(item.user || {});
      return `<button type="button" class="pkl-reroll-suggest-item" data-name="${escapeHtml(item.name)}">
        <span class="pkl-reroll-suggest-main">
          <span class="pkl-reroll-suggest-name">${escapeHtml(item.name)}</span>
          <span class="pkl-reroll-suggest-badge">${badgeHtml}</span>
        </span>
        <span class="pkl-reroll-suggest-add">선택</span>
      </button>`;
    }).join('');

    rerollUserSuggestBox.querySelectorAll('.pkl-reroll-suggest-item').forEach(button => {
      button.addEventListener('click', () => {
        rerollUserInput.value = button.dataset.name || '';
        closeRerollUserSuggestions();
        rerollUserInput.focus();
      });
    });

    rerollUserSuggestBox.classList.add('is-open');
  }

function addManualRerollUser() {
    if (!isTeamControlManager()) return;
    if (!rerollUserInput) return;
    const name = rerollUserInput.value.trim();
    if (!name) {
      setStatus('리롤 리스트에 추가할 사용자를 검색해 선택하세요.');
      rerollUserInput.focus();
      return;
    }

    const found = findAdminRerollUserByName(name);
    if (!found) {
      setStatus('admin 유저 목록에 등록된 사용자만 리롤 리스트에 추가할 수 있습니다.');
      renderRerollUserSuggestions();
      rerollUserInput.focus();
      return;
    }

    const user = found.user;
    const key = `manual:${user.uid || user.id || user.pubgId || found.name}`;

    if (!state.rerollRequests || typeof state.rerollRequests !== 'object') state.rerollRequests = {};
    if (!state.rerollRequests[key]) {
      state.rerollRequests[key] = {
        id: key,
        name: found.name,
        count: 0,
        counts: { r03: 0, r05: 0, r07: 0, r10: 0 },
        paid: false,
        manual: true,
        userUid: user.uid || user.id || '',
        pubgId: user.pubgId || '',
        tierBadge: renderRerollSuggestTierBadge(user)
      };
    }

    rerollUserInput.value = '';
    closeRerollUserSuggestions();
    renderRerollListModal();
    updateConfirmModalReadyState();
    saveState();
    setStatus(`${found.name}님을 리롤 리스트에 추가했습니다.`);
  }

  function removeRerollListUser(key) {
    ensureRerollRequestState();

    if (state.rerollRequests[key] && state.rerollRequests[key].manual) {
      delete state.rerollRequests[key];
    } else if (key && !state.rerollHiddenKeys.includes(key)) {
      state.rerollHiddenKeys.push(key);
    }

    saveState();
    renderRerollListModal();
    updateConfirmModalReadyState();
  }

  function bindRerollModalFocusGuard(modal) {
    if (!modal || modal.dataset.rerollFocusGuardBound === 'true') return;
    modal.dataset.rerollFocusGuardBound = 'true';

    const editableSelector = '#rerollUserInput, [data-calculator-display], [data-reroll-count], [data-reroll-type-count]';

    modal.addEventListener('pointerdown', event => {
      if (event.target.closest(editableSelector)) return;
      const active = document.activeElement;
      if (active && modal.contains(active) && active.matches(editableSelector)) {
        active.blur();
      }
    }, true);
  }

  function bindRerollCalculatorEvents(calculatorModal) {
    const display = calculatorModal.querySelector('[data-calculator-display]');

    calculatorModal.addEventListener('click', event => {
      if (event.target.closest('[data-calculator-close]')) {
        closeModal(calculatorModal);
        return;
      }

      const valueButton = event.target.closest('[data-calculator-value]');
      if (valueButton) {
        appendCalculatorValue(display, valueButton.dataset.calculatorValue);
        return;
      }

      const actionButton = event.target.closest('[data-calculator-action]');
      if (!actionButton) return;

      const action = actionButton.dataset.calculatorAction;
      if (action === 'clear') display.value = '0';
      if (action === 'backspace') display.value = display.value.length > 1 ? display.value.slice(0, -1) : '0';
      if (action === 'calculate') calculateCalculatorExpression(display);
    });

    if (display) {
      display.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          calculateCalculatorExpression(display);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeModal(calculatorModal);
          return;
        }
        if (/^[0-9+\-*/().%]$/.test(event.key) || ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) return;
        event.preventDefault();
      });
    }
  }

  function appendCalculatorValue(display, value) {
    if (!display) return;
    const current = display.value || '0';
    if (current === '0' && /[0-9.]/.test(value)) {
      display.value = value === '.' ? '0.' : value;
      return;
    }
    display.value = `${current}${value}`;
  }

  function calculateCalculatorExpression(display) {
    if (!display) return;
    const expression = (display.value || '').replace(/÷/g, '/').replace(/×/g, '*').trim();
    if (!expression || !/^[0-9+\-*/().%\s]+$/.test(expression)) {
      display.value = 'Error';
      return;
    }

    try {
      const result = Function(`"use strict"; return (${expression});`)();
      display.value = Number.isFinite(result) ? String(Math.round((result + Number.EPSILON) * 100000000) / 100000000) : 'Error';
    } catch (error) {
      display.value = 'Error';
    }
  }

  function showPklNoticeModal(title, message) {
    let noticeModal = document.getElementById('pklNoticeModal');

    if (!noticeModal) {
      noticeModal = document.createElement('div');
      noticeModal.id = 'pklNoticeModal';
      noticeModal.className = 'modal-layer';
      noticeModal.setAttribute('aria-hidden', 'true');
      noticeModal.innerHTML = `
        <section class="modal-card pkl-notice-modal" role="dialog" aria-modal="true" aria-labelledby="pklNoticeTitle">
          <div class="modal-head">
            <h2 id="pklNoticeTitle"></h2>
            <button class="modal-close" type="button" data-pkl-notice-close>×</button>
          </div>
          <div id="pklNoticeMessage" class="pkl-notice-message"></div>
          <div class="modal-actions">
            <button class="primary-button" type="button" data-pkl-notice-close>확인</button>
          </div>
        </section>
      `;
      document.body.appendChild(noticeModal);
      noticeModal.addEventListener('click', event => {
        if (event.target === noticeModal || event.target.closest('[data-pkl-notice-close]')) closeModal(noticeModal);
      });
    }

    const titleElement = noticeModal.querySelector('#pklNoticeTitle');
    const messageElement = noticeModal.querySelector('#pklNoticeMessage');
    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.innerHTML = message;
    openModal(noticeModal);
  }


  
  function areAllRerollRequestsConfirmed() {
    const rows = getRerollListRows();
    if (!rows.length) return true;
    return rows.every(item => state.rerollRequests[item.key] && state.rerollRequests[item.key].paid);
  }

  function updateConfirmTimeButtonState() {
    const button = document.querySelector('#pklConfirmModal [data-pkl-open-time]');
    if (!button) return;
    const isComplete = hasMatchTimeSettings();
    button.classList.toggle('is-complete', isComplete);
    button.innerHTML = isComplete
      ? '<span class="pkl-tool-check-mark" aria-hidden="true">V</span><span class="pkl-tool-button-label">시작/종료</span>'
      : '<span class="pkl-tool-button-label">시작/종료</span>';
  }

  function updateConfirmRerollButtonState() {
    const button = document.querySelector('#pklConfirmModal [data-pkl-open-check]');
    if (!button) return;
    const isComplete = areAllRerollRequestsConfirmed();
    button.classList.toggle('is-complete', isComplete);
    button.innerHTML = isComplete
      ? '<span class="pkl-tool-check-mark" aria-hidden="true">V</span><span class="pkl-tool-button-label">리스트</span>'
      : '<span class="pkl-tool-button-label">리스트</span>';
  }

  function updateConfirmCompleteButtonState() {
    const confirmModal = document.getElementById('pklConfirmModal');
    const confirmButton = document.querySelector('#pklConfirmModal [data-pkl-confirm-yes]');
    if (!confirmButton) return;

    const isTeamCompleteConfirm = Boolean(confirmModal && confirmModal.classList.contains('is-team-complete-confirm'));
    if (!isTeamCompleteConfirm) {
      confirmButton.disabled = false;
      confirmButton.classList.remove('is-ready');
      confirmButton.removeAttribute('aria-disabled');
      return;
    }

    const isReady = true;
    confirmButton.disabled = !isReady;
    confirmButton.classList.toggle('is-ready', isReady);
    confirmButton.setAttribute('aria-disabled', String(!isReady));
  }

  function updateConfirmModalReadyState() {
    updateConfirmTimeButtonState();
    updateConfirmRerollButtonState();
    updateConfirmCompleteButtonState();
  }


  function showPklConfirmModal({ title, message, danger = false, confirmText = '예', cancelText = '아니오', onConfirm }) {
    let confirmModal = document.getElementById('pklConfirmModal');

    if (!confirmModal) {
      confirmModal = document.createElement('div');
      confirmModal.id = 'pklConfirmModal';
      confirmModal.className = 'modal-layer';
      confirmModal.setAttribute('aria-hidden', 'true');
      confirmModal.innerHTML = `
        <section class="modal-card pkl-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="pklConfirmTitle">
          <div class="modal-head">
            <h2 id="pklConfirmTitle"></h2>
            <button class="modal-close" type="button" data-pkl-confirm-cancel aria-label="확인창 닫기">×</button>
          </div>
          <div id="pklConfirmMessage" class="pkl-confirm-message"></div>
          <div class="pkl-confirm-extra-buttons">
            <button class="pkl-confirm-tool-button pkl-time-tool" type="button" data-pkl-open-time>시작/종료</button>
            <button class="pkl-confirm-tool-button pkl-check-tool" type="button" data-pkl-open-check>리스트</button>
          </div>
          <div class="modal-actions pkl-confirm-actions">
            <button class="primary-button pkl-confirm-yes" type="button" data-pkl-confirm-yes>예</button>
          </div>
        </section>
      `;
      document.body.appendChild(confirmModal);
      confirmModal.addEventListener('click', event => {
        if (event.target === confirmModal || event.target.closest('[data-pkl-confirm-cancel]')) closeModal(confirmModal);
        const timeBtn = event.target.closest('[data-pkl-open-time]');
        if (timeBtn) {
          openMatchTimeModal();
          return;
        }
        const checkBtn = event.target.closest('[data-pkl-open-check]');
        if (checkBtn) {
          openRerollListModal();
          return;
        }
        const confirmButton = event.target.closest('[data-pkl-confirm-yes]');
        if (!confirmButton || confirmButton.disabled) return;
        const handler = confirmModal._pklConfirmHandler;
        closeModal(confirmModal);
        if (typeof handler === 'function') handler();
      });
    }

    if (!document.getElementById('pklConfirmExtraButtonStyle')) {
      const style = document.createElement('style');
      style.id = 'pklConfirmExtraButtonStyle';
      style.textContent = `
        .pkl-confirm-extra-buttons{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:12px;
          margin:16px 0 14px;
        }
        .pkl-confirm-tool-button{
          min-height:48px;
          border-radius:16px;
          color:#f7f4ff;
          font-size:13px;
          font-weight:1000;
          letter-spacing:-.2px;
          border:1px solid rgba(216,180,254,.22);
          background:
            linear-gradient(180deg,rgba(255,255,255,.11),rgba(255,255,255,.025)),
            rgba(10,8,22,.90);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 10px 22px rgba(0,0,0,.28),
            0 0 14px rgba(124,77,255,.10);
        }
        .pkl-confirm-tool-button:hover{
          transform:translateY(-1px);
          border-color:rgba(216,180,254,.38);
          filter:brightness(1.08);
        }
        #pklConfirmModal .pkl-confirm-extra-buttons .pkl-confirm-tool-button.is-complete{
          position:relative !important;
          display:inline-flex !important;
          align-items:center !important;
          justify-content:center !important;
          gap:10px !important;
          overflow:hidden !important;
          min-height:50px !important;
          border:2px solid rgba(255,216,92,.86) !important;
          color:#fff7d2 !important;
          background:
            radial-gradient(circle at 24% -24%,rgba(255,216,92,.32),transparent 48%),
            radial-gradient(circle at 86% 118%,rgba(124,77,255,.22),transparent 54%),
            linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.025)),
            linear-gradient(135deg,rgba(34,27,14,.96),rgba(10,8,20,.96)) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.16),
            inset 0 0 22px rgba(255,216,92,.075),
            0 10px 24px rgba(0,0,0,.36),
            0 0 18px rgba(255,216,92,.28),
            0 0 28px rgba(124,77,255,.14) !important;
          text-shadow:0 0 11px rgba(255,216,92,.30) !important;
        }
        #pklConfirmModal .pkl-confirm-extra-buttons .pkl-confirm-tool-button.is-complete .pkl-tool-check-mark{
          position:relative !important;
          z-index:2 !important;
          display:inline-flex !important;
          align-items:center !important;
          justify-content:center !important;
          flex:0 0 auto !important;
          width:21px !important;
          height:21px !important;
          border-radius:999px !important;
          border:2px solid rgba(255,225,96,.95) !important;
          color:#ffe35f !important;
          background:rgba(255,216,92,.10) !important;
          font-size:12px !important;
          font-weight:1000 !important;
          line-height:1 !important;
          letter-spacing:-.08em !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.22),
            0 0 12px rgba(255,216,92,.52),
            0 0 20px rgba(255,216,92,.24) !important;
          text-shadow:0 0 8px rgba(255,216,92,.9) !important;
        }
        #pklConfirmModal .pkl-confirm-extra-buttons .pkl-confirm-tool-button.is-complete .pkl-tool-button-label{
          position:relative !important;
          z-index:2 !important;
        }
        #pklConfirmModal .pkl-confirm-actions{
          grid-template-columns:1fr !important;
          margin-top:16px !important;
        }
        #pklConfirmModal .pkl-confirm-yes{
          width:100% !important;
          min-height:58px !important;
          border-radius:18px !important;
          font-size:16px !important;
          letter-spacing:.02em !important;
        }
        #pklConfirmModal .pkl-confirm-yes:disabled{
          cursor:not-allowed !important;
          opacity:.42 !important;
          color:rgba(255,255,255,.54) !important;
          border:1px solid rgba(255,255,255,.10) !important;
          background:
            linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018)),
            rgba(7,8,18,.86) !important;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.05) !important;
          filter:none !important;
          transform:none !important;
        }
        #pklConfirmModal .pkl-confirm-yes.is-ready{
          border:2px solid rgba(255,216,92,.78) !important;
          color:#fff7d2 !important;
          background:
            radial-gradient(circle at 50% -28%,rgba(255,216,92,.34),transparent 48%),
            linear-gradient(135deg,rgba(255,196,58,.94),rgba(124,77,255,.82)) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.20),
            0 0 22px rgba(255,216,92,.32),
            0 18px 32px rgba(0,0,0,.38) !important;
        }
`;
      document.head.appendChild(style);
    }

    const isTeamCompleteConfirm = title === '팀구성 완료';
    confirmModal.classList.toggle('is-danger', Boolean(danger));
    confirmModal.classList.toggle('is-team-complete-confirm', isTeamCompleteConfirm);
    confirmModal._pklConfirmHandler = onConfirm;
    const titleElement = confirmModal.querySelector('#pklConfirmTitle');
    const messageElement = confirmModal.querySelector('#pklConfirmMessage');
    const confirmButton = confirmModal.querySelector('[data-pkl-confirm-yes]');
    const cancelButton = confirmModal.querySelector('[data-pkl-confirm-cancel]:not(.modal-close)');
    const extraButtons = confirmModal.querySelector('.pkl-confirm-extra-buttons');
    if (extraButtons) {
      extraButtons.hidden = !isTeamCompleteConfirm;
      extraButtons.style.display = isTeamCompleteConfirm ? 'grid' : 'none';
    }
    if (titleElement) titleElement.textContent = title || '확인';
    if (messageElement) messageElement.innerHTML = message || '';
    if (confirmButton) confirmButton.textContent = confirmText;
    if (cancelButton) cancelButton.textContent = cancelText;
    updateConfirmModalReadyState();
    openModal(confirmModal);
  }

  function saveMemo() {
    state.memo = memoText.value;
    closeModal(memoModal);
    setStatus('메모를 저장했습니다.');
    render();
  }

  function updateMatchTime(key, value) {
    state[key] = value;
    setStatus('경기 시간을 저장했습니다.');
    render();
  }

  function renderSummary() {
    const assigned = state.teams.reduce((sum, team) => sum + team.slots.filter(Boolean).length, 0);
    const total = state.players.length;
    if (boardSummary) boardSummary.textContent = `${assigned}/${total}명 배치됨`;
    if (rerollCheckButton) rerollCheckButton.textContent = '리롤체크';
  }

  function getTeamScore(team) {
    return team.slots.reduce((sum, playerId) => {
      const player = getTeamPlayerById(playerId);
      const tier = player ? TIERS.find(item => item.id === player.tier) : null;
      return sum + (tier ? tier.weight : 0);
    }, 0);
  }

  function getWaitingPlayerIds() {
    return TIERS.flatMap(tier => state.waiting[tier.id]);
  }

  function getPlayerName(playerId) {
    const player = getTeamPlayerById(playerId);
    return player ? resolvePlayerDisplayName(player) : '알 수 없음';
  }

  function getTierLabel(tierId) {
    const tier = TIERS.find(item => item.id === tierId);
    return tier ? tier.label : '기타';
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function toggleSelectedSlot(teamIndex, slotIndex) {
    if (!Array.isArray(state.selectedSlots)) state.selectedSlots = [];
    const index = state.selectedSlots.findIndex(item => item.teamIndex === teamIndex && item.slotIndex === slotIndex);

    if (index >= 0) {
      state.selectedSlots.splice(index, 1);
      return;
    }

    state.selectedSlots.push({ teamIndex, slotIndex });
  }

  function isSlotSelected(teamIndex, slotIndex) {
    if (Array.isArray(state.selectedSlots) && state.selectedSlots.some(item => item.teamIndex === teamIndex && item.slotIndex === slotIndex)) return true;
    return state.selected && state.selected.teamIndex === teamIndex && state.selected.slotIndex === slotIndex;
  }

  function isSelected(teamIndex, slotIndex) {
    return isSlotSelected(teamIndex, slotIndex);
  }



  function clearSlotSelectionFast() {
    state.selected = null;
    state.selectedSlots = [];
    document.querySelectorAll('.team-slot.is-selected').forEach(slot => {
      slot.classList.remove('is-selected');
    });
  }

  let toastTimer = null;

  function showToast(message, anchorElement = null) {
    if (!pklToast) {
      setStatus(message);
      return;
    }

    pklToast.textContent = message;
    pklToast.classList.remove('is-visible');
    pklToast.style.left = '-9999px';
    pklToast.style.top = '-9999px';
    pklToast.style.setProperty('--pkl-toast-arrow-x', '50%');

    requestAnimationFrame(() => {
      if (anchorElement) {
        const rect = anchorElement.getBoundingClientRect();
        const safeGap = 16;
        const bubbleWidth = pklToast.offsetWidth;
        const anchorCenter = rect.left + rect.width / 2;
        const bubbleLeft = Math.min(
          window.innerWidth - bubbleWidth - safeGap,
          Math.max(safeGap, anchorCenter - bubbleWidth / 2)
        );
        const arrowX = Math.min(
          bubbleWidth - 18,
          Math.max(18, anchorCenter - bubbleLeft)
        );

        pklToast.style.left = `${bubbleLeft}px`;
        pklToast.style.top = `${rect.top - 12}px`;
        pklToast.style.setProperty('--pkl-toast-arrow-x', `${arrowX}px`);
      } else {
        pklToast.style.left = '50%';
        pklToast.style.top = '50%';
        pklToast.style.transform = 'translate(-50%, -50%) scale(.94)';
      }

      pklToast.classList.add('is-visible');
      pklToast.setAttribute('aria-hidden', 'false');
    });

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      pklToast.classList.remove('is-visible');
      pklToast.setAttribute('aria-hidden', 'true');
      toastTimer = null;
    }, 1800);
  }

  function setStatus(message) {
    console.info('[PKL 팀편성]', message);
  }

  function openModal(modal) {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function clearDropStyles() {
    document.querySelectorAll('.is-over').forEach(item => item.classList.remove('is-over'));
  }

  
  function formatAmPmTime(date, withSeconds = true) {
    const period = date.getHours() < 12 ? 'AM' : 'PM';
    const hour = String(date.getHours() % 12 || 12).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return withSeconds ? `${period} ${hour}:${minute}:${second}` : `${period} ${hour}:${minute}`;
  }

let pklTeamClockOffsetMs = 0;
let pklTeamClockSyncing = false;
function pklTeamNow() {
    return new Date(Date.now() + pklTeamClockOffsetMs);
  }
function pklTeamSyncServerClock() {
    if (pklTeamClockSyncing) return;
    pklTeamClockSyncing = true;
    const started = Date.now();
    try {
      fetch(location.origin + '/?pkl_clock_sync=' + started, { method: 'HEAD', cache: 'no-store' })
        .then(res => {
          const dateHeader = res && res.headers ? res.headers.get('Date') : '';
          const serverMs = Date.parse(dateHeader || '');
          if (!Number.isNaN(serverMs)) {
            const received = Date.now();
            const approxClientAtServer = started + ((received - started) / 2);
            pklTeamClockOffsetMs = serverMs - approxClientAtServer;
          }
        })
        .catch(() => {})
        .finally(() => { pklTeamClockSyncing = false; });
    } catch (e) {
      pklTeamClockSyncing = false;
    }
  }
function startClock() {
    pklTeamSyncServerClock();
    document.addEventListener("visibilitychange", function(){ if(!document.hidden) pklTeamSyncServerClock(); });
    let lastSecond = '';
    const update = () => {
      const correctedNow = Date.now() + pklTeamClockOffsetMs;
      const sec = String(Math.floor(correctedNow / 1000));
      if (sec !== lastSecond) {
        lastSecond = sec;
        const now = new Date(correctedNow);
        if (currentTime) currentTime.textContent = formatAmPmTime(now, true);
        if (matchCurrentTime) matchCurrentTime.textContent = formatAmPmTime(now, false);
      }
      const delay = 1000 - (correctedNow % 1000) + 8;
      setTimeout(update, Math.max(80, Math.min(1000, delay)));
    };
    update();
  }

  function saveState() {
    const stateJson = JSON.stringify(state);
    if (stateJson === lastSavedTeamStateJson) return;
    lastSavedTeamStateJson = stateJson;
    // sessionStorage 쓰기도 상태가 클 때 마우스/드래그 체감 렉이 될 수 있어 실제 변경 때만 지연 저장한다.
    if (teamStateSaveTimer) clearTimeout(teamStateSaveTimer);
    teamStateSaveTimer = setTimeout(() => {
      try { sessionStorage.setItem(STORAGE_KEY, stateJson); } catch (error) {}
      teamStateSaveTimer = null;
      const snapshot = parseTeamBuilderState(stateJson) || state;
      if (window.PKLSupabaseDataSync && typeof window.PKLSupabaseDataSync.setShared === 'function') {
        window.PKLSupabaseDataSync.setShared(STORAGE_KEY, snapshot).catch(() => directSaveTeamBuilderState(snapshot));
        return;
      }
      directSaveTeamBuilderState(snapshot);
    }, 1400);
  }

  function directSaveTeamBuilderState(nextState) {
    try {
      return fetch('/api/pkl-data-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'shared', key: STORAGE_KEY, value: nextState })
      }).catch(() => null);
    } catch (error) {
      return Promise.resolve(null);
    }
  }

  function parseTeamBuilderState(rawValue) {
    if (!rawValue) return null;
    if (typeof rawValue === 'string') {
      try { return JSON.parse(rawValue); } catch (error) { return null; }
    }
    return rawValue && typeof rawValue === 'object' ? rawValue : null;
  }

  function normalizeTeamBuilderState(saved) {
    try {
      const base = defaultState();
      if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.teams)) return base;

      const validTierIds = new Set(TIERS.map(tier => tier.id));
      const legacyTierMap = {
        challenger: 'tier0',
        master: 'tier0',
        diamond: 'tier1',
        platinum: 'tier2',
        gold: 'tier3',
        silver: 'tier4',
        bronze: 'tier5',
        beast: 'tier5',
        etc: 'tier5'
      };

      const players = saved.players
        .filter(player => !(/^test-player-/i.test(String(player.id || "")) || /테스터|tester/i.test(String(player.name || player.nickname || ""))))
        .map(player => {
          const tier = validTierIds.has(getCanonicalTierId(player.tier)) ? getCanonicalTierId(player.tier) : (legacyTierMap[player.tier] || 'tier5');
          const nextPlayer = { ...player, tier };
          hydratePlayerIdentity(nextPlayer);
          return nextPlayer;
        });

      const cfg = getTeamModeConfig(saved.teamMode || base.teamMode || 'squad20');
      const playerById = new Map(players.map(player => [player.id, player]));
      const teams = Array.from({ length: cfg.teams }, (_, teamIndex) => {
        const savedTeam = saved.teams[teamIndex] || {};
        const slots = Array.from({ length: cfg.slots }, (_, slotIndex) => {
          const playerId = Array.isArray(savedTeam.slots) ? savedTeam.slots[slotIndex] : null;
          return playerById.has(playerId) ? playerId : null;
        });
        return {
          id: `team-${teamIndex + 1}`,
          name: `${teamIndex + 1}팀`,
          ...savedTeam,
          slots
        };
      });

      const placedIds = new Set(teams.flatMap(team => team.slots).filter(Boolean));
      const waiting = TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {});
      const waitingSeen = new Set();
      if (saved.waiting && typeof saved.waiting === 'object') {
        Object.entries(saved.waiting).forEach(([tierId, ids]) => {
          if (!Array.isArray(ids)) return;
          const safeTierId = validTierIds.has(getCanonicalTierId(tierId)) ? getCanonicalTierId(tierId) : 'tier0';
          ids.forEach(playerId => {
            if (waitingSeen.has(playerId) || placedIds.has(playerId) || !playerById.has(playerId)) return;
            waiting[safeTierId].push(playerId);
            waitingSeen.add(playerId);
          });
        });
      }
      players.forEach(player => {
        if (placedIds.has(player.id) || waitingSeen.has(player.id)) return;
        waiting[getCanonicalTierId(player.tier) || 'tier0'].push(player.id);
      });

      return {
        ...base,
        ...saved,
        teamMode: cfg.key,
        players,
        waiting: sortAllWaitingPools(waiting),
        teams,
        selected: null,
        selectedSlots: [],
        rerollRequests: saved.rerollRequests && typeof saved.rerollRequests === 'object' && !Array.isArray(saved.rerollRequests) ? saved.rerollRequests : {},
        rerollHiddenKeys: Array.isArray(saved.rerollHiddenKeys) ? saved.rerollHiddenKeys : []
      };
    } catch (error) {
      return defaultState();
    }
  }

  function loadState() {
    // localStorage 운영 데이터 복구 금지. 현재 탭 session 백업만 초기 렌더 보조로 사용한다.
    try {
      const sessionSaved = parseTeamBuilderState(sessionStorage.getItem(STORAGE_KEY));
      if (sessionSaved) return normalizeTeamBuilderState(sessionSaved);
    } catch (error) {}
    return normalizeTeamBuilderState(null);
  }

  function loadTeamBuilderStateFromSupabaseOnce() {
    if (!window.PKLSupabaseDataSync || typeof window.PKLSupabaseDataSync.getShared !== 'function') {
      return Promise.resolve(state);
    }

    return window.PKLSupabaseDataSync.getShared(STORAGE_KEY).then(remoteState => {
      const parsed = parseTeamBuilderState(remoteState);
      if (parsed && Array.isArray(parsed.players) && Array.isArray(parsed.teams)) {
        state = normalizeTeamBuilderState(parsed);
      }
      return state;
    }).catch(() => state);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  document.addEventListener('contextmenu', function(event) {
    const card = event.target.closest('.team-slot .player-card');
    if (!card) return;
    event.preventDefault();

    const playerId = card.dataset.playerId;
    const player = getTeamPlayerById(playerId);
    if (!player) return;

    removePlayerFromEverywhere(playerId);
    insertPlayerIntoWaitingTier(playerId, getCanonicalTierId(player.tier));
    clearSlotSelectionFast();
    setStatus(`${getPlayerName(playerId)}님을 ${getTierLabel(player.tier)} 대기칸으로 되돌렸습니다.`);
    renderBoardOnlyAndSave();
  });


  document.addEventListener('click', function(e){
    const insideSlot = e.target.closest('.team-slot');
    const interactive = e.target.closest('button, select, input');

    if (insideSlot || interactive) return;

    if (state.selected || (state.selectedSlots && state.selectedSlots.length)){
      state.selected = null;
      state.selectedSlots = [];
      if (typeof syncSelectedSlotClasses === 'function') syncSelectedSlotClasses();
    }
  });


})();
