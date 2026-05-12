(() => {
  const STORAGE_KEY = 'pklTeamBuilderState.v1';

  const TIERS = [
    { id: 'tier0', label: '0티어', weight: 6, badgeClass: 'grade-role-tier0' },
    { id: 'tier1', label: '1티어', weight: 5, badgeClass: 'grade-role-tier1' },
    { id: 'tier2', label: '2티어', weight: 4, badgeClass: 'grade-role-tier2' },
    { id: 'tier3', label: '3티어', weight: 3, badgeClass: 'grade-role-tier3' },
    { id: 'tier4', label: '4티어', weight: 2, badgeClass: 'grade-role-tier4' },
    { id: 'beast', label: '짐승', weight: 1, badgeClass: 'grade-role-beast' }
  ];

  const TEAM_COUNT = 20;
  const SLOT_COUNT = 4;
  const ADMIN_STORAGE_KEY = 'pklAdminState_v3';
  const ACCOUNT_STORAGE_KEY = 'pklUsers';
  const JOIN_WAITLIST_STORAGE_KEY = 'pklJoinWaitList';
  const JOIN_RECRUIT_STATE_STORAGE_KEY = 'pklJoinRecruitState';
  const SHEET_STORAGE_KEY = 'PKL_EFFICIENT_MATCH_SHEET_LIVE_SYNC_V1';

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
    rerollHiddenKeys: []
  });

  let state = loadState();
  let draggedPlayerId = null;

  function pklTeamCanEdit(){
    return !!(window.PKLRoleSystem && typeof window.PKLRoleSystem.currentHasRole === "function" && window.PKLRoleSystem.currentHasRole("operator"));
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
  const rerollModeOptions = Array.from(document.querySelectorAll('.pkl-custom-select-option'));
  const rerollModeSelect = {
    get value() {
      return rerollModeDropdown ? rerollModeDropdown.dataset.value || 'selected' : 'selected';
    },
    set value(nextValue) {
      setRerollModeValue(nextValue || 'selected', false);
    }
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    fillTierSelect();
    bindControls();
    bindNewPlayerTierDropdown();
    bindRerollModeDropdown();
    fillMatchTimeSelects();
    syncJoinWaitListIntoTeamBoard(true);
    syncPlayersWithUserSources();
    render();
    startClock();
    bindUserSyncEvents();
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

    if (saveMemoButton) saveMemoButton.addEventListener('click', saveMemo);
    if (savePlayerButton) savePlayerButton.addEventListener('click', addPlayer);
    if (ruleButton) ruleButton.addEventListener('click', showRuleConstructionToast);
    if (startButton) startButton.addEventListener('click', openMatchTimeModal);
    if (saveMatchTimeButton) saveMatchTimeButton.addEventListener('click', saveMatchTimeSettings);
    if (rerollListButton) rerollListButton.addEventListener('click', openRerollListModal);
    if (addRerollUserButton) addRerollUserButton.addEventListener('click', addManualRerollUser);
    if (rerollUserInput) {
      rerollUserInput.addEventListener('focus', refreshRerollUserAutocomplete);
      rerollUserInput.addEventListener('input', refreshRerollUserAutocomplete);
      rerollUserInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') addManualRerollUser();
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
    if (addTestPlayersButton) addTestPlayersButton.addEventListener('click', openPlayerModal);
    document.getElementById('resetButton').addEventListener('click', openResetBoardConfirmModal);
    document.getElementById('rerollAllButton').addEventListener('click', runRerollByMode);
    document.getElementById('completeButton').addEventListener('click', completeTeams);
    const loadWaitingButton = document.getElementById('loadWaitingButton');
    if (loadWaitingButton) {
      loadWaitingButton.addEventListener('click', loadCurrentJoinWaitingList);
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
    hydratePlayersForDisplayOnly();
    renderTierPools();
    renderTeams();
    renderSummary();
    saveState();
  }

  function renderTierPools() {
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

  function renderTeams() {
    teamGrid.innerHTML = state.teams.map((team, teamIndex) => {
      const slots = team.slots.map((playerId, slotIndex) => `
        <div class="team-slot ${isSlotSelected(teamIndex, slotIndex) ? 'is-selected' : ''}" data-drop-type="slot" data-team-index="${teamIndex}" data-slot-index="${slotIndex}" aria-label="${team.name} ${slotIndex + 1}번자리">
          ${playerId ? renderPlayerCard(playerId) : '<div class="empty-slot">비어있음</div>'}
        </div>
      `).join('');

      return `
        <section class="team-card">
          <div class="team-head">
            <span class="team-name">${team.name}</span>
          </div>
          <div class="slot-list">${slots}</div>
        </section>
      `;
    }).join('');

    bindDropZones();
    bindPlayerCards();
    bindSlotSelection();
  }

  function renderPlayerCard(playerId) {
    const player = state.players.find(item => item.id === playerId);
    if (!player) return '';
    hydratePlayerIdentity(player);
    const displayName = resolvePlayerDisplayName(player);
    const accountUser = resolvePlayerAccountUser(player, displayName);
    const tierBadge = renderPlayerTierBadge(player, accountUser);
    return `
      <div class="player-card" draggable="true" data-player-id="${player.id}">
        <span class="player-name">${escapeHtml(displayName)}</span>
        ${tierBadge}
      </div>
    `;
  }

  function bindPlayerCards() {
    document.querySelectorAll('.player-card').forEach(card => {
      card.draggable = pklTeamCanEdit();

      card.ondragstart = event => {
        if(!pklTeamCanEdit()){ event.preventDefault(); pklTeamDeny(); return; }
        
        if (isRerolling) { event.preventDefault(); return; }
draggedPlayerId = card.dataset.playerId;
        event.dataTransfer.setData('text/plain', draggedPlayerId);
        event.dataTransfer.effectAllowed = 'move';
      };

      card.ondragend = () => {
        suppressNextClick = true;
        draggedPlayerId = null;
        clearDropStyles();
        setTimeout(() => { suppressNextClick = false; }, 80);
      };
    });
  }

  function bindDropZones() {
    document.querySelectorAll('[data-drop-type]').forEach(zone => {
      zone.ondragover = event => {
        
        if (isRerolling) return;
event.preventDefault();
        zone.classList.add('is-over');
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
        render();
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
        render();
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
    insertPlayerIntoWaitingTier(playerId, player.tier);
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
    const users = readAccountUsers();
    const name = player.name;
    const tierLabel = getTierLabel(tier);
    const existingIndex = users.findIndex(user => isSameUserIdentity(player, user) || sameName(user, name));

    const nextUser = existingIndex >= 0 ? { ...users[existingIndex] } : {
      id: player.userUid || `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      uid: player.userUid || '',
      nickname: name,
      name,
      status: 'approved',
      role: 'member',
      isTemporary: true
    };

    nextUser.uid = nextUser.uid || player.userUid || '';
    nextUser.id = nextUser.id || player.userUid || player.id;
    nextUser.pubgId = nextUser.pubgId || player.pubgId || '';
    nextUser.nickname = nextUser.nickname || name;
    nextUser.name = nextUser.name || nextUser.nickname || name;
    if (!resolveUserTierKey(nextUser) || resolveUserTierKey(nextUser) === 'none') {
      nextUser.tier = tier;
      nextUser.grade = tierLabel;
      nextUser.memberTier = tierLabel;
      nextUser.memberGrade = tierLabel;
      nextUser.pklTier = tierLabel;
    }
    nextUser.updatedAt = new Date().toISOString();

    if (existingIndex >= 0) {
      users[existingIndex] = nextUser;
    } else {
      users.push(nextUser);
    }

    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(users));
    if (window.PKLTierBadge && typeof window.PKLTierBadge.syncStorage === 'function') window.PKLTierBadge.syncStorage();
  }


  function bindUserSyncEvents() {
    /* 2차 청소: storage 이벤트 기반 팀구성 전체 재렌더 금지. */
    // join 대기자 정보는 팀구성 페이지 진입/관리자 직접 불러오기 때만 반영한다.
    // 실시간 이벤트마다 팀구성 전체 렌더를 돌리면 렉이 생기므로 자동 갱신은 막는다.
    window.addEventListener('pkl-role-data-updated', () => {
      hydratePlayersForDisplayOnly();
      renderTierPools();
      renderTeams();
      renderSummary();
      saveState();
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
    return String(readJoinRecruitState().state || '').toLowerCase() === 'closed';
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
      const saved = JSON.parse(localStorage.getItem(JOIN_WAITLIST_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      return [];
    }
  }

  function getJoinWaitItemKey(item) {
    if (!item) return '';
    return String(item.userId || item.uid || item.key || item.accountId || item.id || item.pubgId || item.name || item.nickname || '').trim();
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
    const identitySeed = accountUser || adminUser || item;
    return state.players.find(player => isSameUserIdentity(player, identitySeed)) ||
      state.players.find(player => sameName(player, (adminUser && (adminUser.nickname || adminUser.nick || adminUser.name)) || item.name || item.nickname));
  }

  function loadCurrentJoinWaitingList() {
    showPklConfirmModal({
      title: '대기자 불러오기',
      message: '현재 등록되어있는 대기자 명단을 불러오시겠습니까?',
      danger: false,
      confirmText: '예',
      cancelText: '아니오',
      onConfirm: () => {
        syncJoinWaitListIntoTeamBoard(true);
        syncPlayersWithUserSources();
        renderTierPools();
        renderTeams();
        renderSummary();
        saveState();
        setStatus('현재 등록되어있는 대기자 명단을 팀구성 대기칸으로 불러왔습니다.');
      }
    });
  }

  function syncJoinWaitListIntoTeamBoard(forceLoad) {
    if (!forceLoad && isJoinRecruitClosed()) return;
    const joinList = readJoinWaitList().filter(item => {
      const adminUser = findAdminUserForJoinItem(item);
      const accountUser = findAccountUserForJoinItem(item, adminUser);
      return !isPrisonerForJoin(adminUser) && !isPrisonerForJoin(accountUser) && !isPrisonerForJoin(item);
    });
    /* join 대기 명단은 pklJoinState/current가 원본이다. team 페이지는 읽기/분류만 하고 대기 명단을 다시 저장하지 않는다. */
    const activeKeys = new Set();

    joinList.forEach(item => {
      const adminUser = findAdminUserForJoinItem(item);
      const accountUser = findAccountUserForJoinItem(item, adminUser);
      const identity = getJoinWaitItemKey(accountUser || adminUser || item);
      if (identity) activeKeys.add(identity);

      const displayName = (adminUser && (adminUser.nickname || adminUser.nick || adminUser.name)) || item.name || item.nickname || (accountUser && (accountUser.nickname || accountUser.nick || accountUser.name)) || '참가자';
      const tier = resolveUserTierKey(accountUser) !== 'none' ? resolveUserTierKey(accountUser) : (resolveUserTierKey(item) !== 'none' ? resolveUserTierKey(item) : 'tier0');
      const player = findPlayerForJoinItem(item, adminUser, accountUser);

      if (player) {
        player.source = player.source || 'joinWaitList';
        player.joinWaitKey = identity || player.joinWaitKey || '';
        player.userUid = player.userUid || (adminUser && (adminUser.uid || adminUser.id)) || (accountUser && (accountUser.uid || accountUser.id)) || item.userId || item.uid || item.key || '';
        player.accountId = player.accountId || (accountUser && (accountUser.id || accountUser.uid)) || (adminUser && (adminUser.id || adminUser.uid)) || item.userId || item.uid || item.key || '';
        player.pubgId = player.pubgId || (adminUser && (adminUser.pubgId || adminUser.gameId)) || item.pubgId || (accountUser && (accountUser.pubgId || accountUser.gameId)) || '';
        player.name = displayName;
        player.tier = TIERS.some(t => t.id === tier) ? tier : player.tier;
        if (!isPlayerPlacedInTeam(player.id)) {
          insertPlayerIntoWaitingTier(player.id, player.tier);
        }
        return;
      }

      const id = `join-wait-${identity || Date.now() + '-' + Math.random().toString(16).slice(2)}`;
      const nextPlayer = {
        id,
        name: displayName,
        tier: TIERS.some(t => t.id === tier) ? tier : 'tier0',
        status: 'waiting',
        source: 'joinWaitList',
        joinWaitKey: identity || '',
        userUid: (adminUser && (adminUser.uid || adminUser.id)) || (accountUser && (accountUser.uid || accountUser.id)) || item.userId || item.uid || item.key || '',
        accountId: (accountUser && (accountUser.id || accountUser.uid)) || (adminUser && (adminUser.id || adminUser.uid)) || item.userId || item.uid || item.key || '',
        pubgId: (adminUser && (adminUser.pubgId || adminUser.gameId)) || item.pubgId || (accountUser && (accountUser.pubgId || accountUser.gameId)) || ''
      };
      state.players.push(nextPlayer);
      insertPlayerIntoWaitingTier(nextPlayer.id, nextPlayer.tier);
    });

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

  function syncPlayersWithUserSources() {
    state.players.forEach(player => {
      hydratePlayerIdentity(player);
      const displayName = resolvePlayerDisplayName(player);
      const accountUser = resolvePlayerAccountUser(player, displayName);
      const syncedTier = resolvePlayerPklTier(player, accountUser);
      if (syncedTier) player.tier = syncedTier;
    });
    syncWaitingPoolsWithPlayerTiers();
  }

  function resolvePlayerPklTier(player, accountUser) {
    const user = accountUser || resolvePlayerAccountUser(player, resolvePlayerDisplayName(player));
    const tierKey = user ? resolveUserTierKey(user) : 'none';
    return TIERS.some(item => item.id === tierKey) ? tierKey : '';
  }

  function syncWaitingPoolsWithPlayerTiers() {
    const nextWaiting = TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {});
    const seen = new Set();

    Object.entries(state.waiting || {}).forEach(([currentTierId, ids]) => {
      if (!Array.isArray(ids)) return;
      const safeTierId = TIERS.some(tier => tier.id === currentTierId) ? currentTierId : 'tier0';
      ids.forEach(playerId => {
        if (!playerId || seen.has(playerId)) return;
        const player = state.players.find(item => item.id === playerId);
        if (!player) return;
        nextWaiting[safeTierId].push(playerId);
        seen.add(playerId);
      });
    });

    state.waiting = sortAllWaitingPools(nextWaiting);
  }

  function insertPlayerIntoWaitingTier(playerId, tierId) {
    const safeTierId = TIERS.some(tier => tier.id === tierId) ? tierId : 'tier0';
    if (!state.waiting || typeof state.waiting !== 'object') state.waiting = TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {});
    TIERS.forEach(tier => {
      if (!Array.isArray(state.waiting[tier.id])) state.waiting[tier.id] = [];
      state.waiting[tier.id] = state.waiting[tier.id].filter(id => id !== playerId);
    });
    state.waiting[safeTierId].push(playerId);
    state.waiting = sortAllWaitingPools(state.waiting);
  }

  function sortAllWaitingPools(waiting) {
    const nextWaiting = TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {});
    TIERS.forEach(tier => {
      const ids = Array.isArray(waiting && waiting[tier.id]) ? waiting[tier.id] : [];
      nextWaiting[tier.id] = sortWaitingIdsForTier(ids, tier.id);
    });
    return nextWaiting;
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
    const player = state.players.find(item => item.id === playerId);
    if (!player) return normalizeTierDetail('tier0');
    const displayName = resolvePlayerDisplayName(player);
    const accountUser = resolvePlayerAccountUser(player, displayName);
    return resolvePlayerTierDetail(player, accountUser);
  }

  function resolvePlayerTierDetail(player, accountUser) {
    const user = accountUser || resolvePlayerAccountUser(player, resolvePlayerDisplayName(player));
    const sources = user ? getUserTierFields(user) : [];
    sources.push(player.tier);
    for (const source of sources) {
      const detail = normalizeTierDetail(source);
      if (detail.id !== 'none') return detail;
    }
    return normalizeTierDetail('tier0');
  }

  function getUserTierFields(user) {
    if (!user) return [];
    return [user.memberTier];
  }

  function getTierNumericIndex(tierId) {
    if (tierId === 'beast') return 5;
    const match = String(tierId || '').match(/^tier([0-4])$/);
    return match ? Number(match[1]) : Number.NaN;
  }

  function normalizeTierDetail(value) {
    const id = normalizeTierKey(value);
    if (id === 'none') return { id: 'none', originalIndex: Number.POSITIVE_INFINITY, subOrder: 3 };
    const text = String(value || '').replace(/\s+/g, '').toLowerCase();
    let subOrder = 3;
    if (/[상上]/.test(text) || /high|upper|top/.test(text)) subOrder = 0;
    else if (/[중中]/.test(text) || /mid|middle/.test(text)) subOrder = 1;
    else if (/[하下]/.test(text) || /low|lower|bottom/.test(text)) subOrder = 2;
    return { id, originalIndex: getTierNumericIndex(id), subOrder };
  }


  function createLinkedPlayerRecord({ id, name, tier, linkedUser }) {
    const player = { id, name, tier, status: 'waiting' };
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
    const adminUser = resolvePlayerAdminUser(player);
    const accountUser = resolvePlayerAccountUser(player, adminUser ? adminUser.nickname : player.name);
    const linkedUser = adminUser || accountUser;
    if (!linkedUser) return player;

    player.userUid = player.userUid || linkedUser.uid || linkedUser.id || '';
    player.accountId = player.accountId || linkedUser.id || linkedUser.uid || '';
    player.pubgId = player.pubgId || linkedUser.pubgId || linkedUser.gameId || '';
    player.name = linkedUser.nickname || linkedUser.nick || linkedUser.name || player.name;
    return player;
  }

  function resolvePlayerDisplayName(player) {
    const adminUser = resolvePlayerAdminUser(player);
    if (adminUser) return adminUser.nickname || adminUser.nick || adminUser.name || player.name;
    return player.name || '알 수 없음';
  }

  function renderPlayerTierBadge(player, accountUser) {
    const user = accountUser || resolvePlayerAccountUser(player, resolvePlayerDisplayName(player));

    if (user && window.PKLTierBadge && typeof window.PKLTierBadge.renderForUser === 'function') {
      const html = window.PKLTierBadge.renderForUser(user, { extraClass: 'player-tier member-role-badge' });
      if (html) return html;
    }

    if (window.PKLTierBadge && typeof window.PKLTierBadge.render === 'function') {
      const html = window.PKLTierBadge.render(player.tier, { extraClass: 'player-tier member-role-badge' });
      if (html) return html;
    }

    return '';
  }

  function resolvePlayerAdminUser(player) {
    const users = readAdminUsers();
    return users.find(user => isSameUserIdentity(player, user)) || users.find(user => sameName(user, player.name)) || null;
  }

  function resolvePlayerAccountUser(player, displayName) {
    const users = readAccountUsers();
    return users.find(user => isSameUserIdentity(player, user)) || users.find(user => sameName(user, displayName || player.name)) || null;
  }

  function findAdminUserByNickname(name) {
    return readAdminUsers().find(user => sameName(user, name)) || null;
  }

  function findAccountUserByName(name) {
    return readAccountUsers().find(user => sameName(user, name)) || null;
  }

  function readAdminUsers() {
    try {
      const saved = JSON.parse(localStorage.getItem(ADMIN_STORAGE_KEY) || 'null');
      return saved && Array.isArray(saved.users) ? saved.users : [];
    } catch (error) {
      return [];
    }
  }

  function readAccountUsers() {
    try {
      const saved = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      return [];
    }
  }

  function isSameUserIdentity(a, b) {
    if (!a || !b) return false;
    const uidA = a.userUid || a.uid || a.userId || a.accountId || a.key || a.id || '';
    const uidB = b.uid || b.userUid || b.userId || b.accountId || b.key || b.id || '';
    if (uidA && uidB && uidA === uidB) return true;
    const pubgA = a.pubgId || a.gameId || '';
    const pubgB = b.pubgId || b.gameId || '';
    return !!(pubgA && pubgB && pubgA === pubgB);
  }

  function sameName(user, name) {
    const target = normalizeName(name);
    if (!target || !user) return false;
    return [user.nickname, user.nick, user.name].some(value => normalizeName(value) === target);
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

    const koreanTier = compact.match(/([0-4])티어/);
    if (koreanTier) return `tier${koreanTier[1]}`;

    const idMatch = normalizedCompact.match(/^tier([0-4])(high|mid|low|상|중|하)?$/);
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

  function bindRerollModeDropdown() {
    if (!rerollModeDropdown || !rerollModeTrigger || !rerollModeList) return;

    rerollModeTrigger.addEventListener('click', () => {
      const isOpen = rerollModeDropdown.classList.toggle('is-open');
      rerollModeTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    rerollModeOptions.forEach(option => {
      option.addEventListener('click', () => {
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
    const stopOrder = shuffleIds(targets.map((_, index) => index));
    const locked = new Set();
    let completedSlots = 0;

    const finishRerollIfComplete = () => {
      if (completedSlots !== targets.length) return;

      isRerolling = false;
      rerollBackupTeams = null;
      clearRerollSchedules();
      document.body.classList.remove('is-rerolling-locked');
      setRerollButtonMode(false);
      state.selectedSlots = targets.map(({ teamIndex, slotIndex }) => ({ teamIndex, slotIndex }));
      state.selected = state.selectedSlots[state.selectedSlots.length - 1] || null;
      setStatus(`지정칸 ${targets.length}개 리롤 완료`);
      saveState();
      syncSelectedSlotClasses();
    };

    rerollBackupTeams = JSON.parse(JSON.stringify(state.teams));
    clearRerollSchedules();
    isRerolling = true;
    document.body.classList.add('is-rerolling-locked');
    setRerollButtonMode(true);
    setStatus('슬롯머신 리롤 진행 중입니다.');

    targets.forEach(({ teamIndex, slotIndex }, index) => {
      const slot = getTeamSlotElement(teamIndex, slotIndex);
      if (!slot) return;

      slot.classList.add('is-slot-rolling');
      slot.classList.remove('is-slot-stopped');

      const oldReel = slot.querySelector('.slot-machine-reel');
      if (oldReel) oldReel.remove();

      const reel = document.createElement('div');
      reel.className = 'slot-machine-reel';
      reel.innerHTML = `<div class="slot-machine-item">${escapeHtml(getPlayerName(originalIds[index]))}</div>`;
      slot.appendChild(reel);

      const item = reel.querySelector('.slot-machine-item');
      const spinSpeed = 72 + Math.floor(Math.random() * 38);
      const spinTimer = trackRerollInterval(window.setInterval(() => {
        const nextId = originalIds[Math.floor(Math.random() * originalIds.length)];
        item.textContent = getPlayerName(nextId);
        reel.classList.remove('is-tick');
        void reel.offsetWidth;
        reel.classList.add('is-tick');
      }, spinSpeed));

      reel.dataset.spinTimer = String(spinTimer);
    });

    stopOrder.forEach((targetIndex, orderIndex) => {
      const __baseDelay = 2500;
      const __slotFlowDuration = 900;
      const stopDelay = __baseDelay + (orderIndex * __slotFlowDuration);

      trackRerollTimeout(window.setTimeout(() => {
        const target = targets[targetIndex];
        const slot = getTeamSlotElement(target.teamIndex, target.slotIndex);
        if (!slot) return;

        const finalId = finalIds[targetIndex];
        const reel = slot.querySelector('.slot-machine-reel');
        const spinTimer = reel ? Number(reel.dataset.spinTimer) : 0;
        if (spinTimer) window.clearInterval(spinTimer);

        state.teams[target.teamIndex].slots[target.slotIndex] = finalId;
        locked.add(targetIndex);

        if (reel) {
          reel.classList.add('is-final-pass');
          reel.classList.add('is-near-final');
          reel.classList.add('is-decelerating');

          const item = reel.querySelector('.slot-machine-item');
          const finalName = getPlayerName(finalId);
          const slowSteps = [70, 105, 150, 220, 320, 470, 650, 860, 1120, 1450, 1850];
          let passCount = 0;

          const runFinalPass = () => {
            if (!item) return;

            const nearEnd = passCount >= slowSteps.length - 5;
            const teaseFinal = passCount === slowSteps.length - 5 || passCount === slowSteps.length - 3 || passCount >= slowSteps.length - 1;
            const randomId = originalIds[Math.floor(Math.random() * originalIds.length)];
            const passId = nearEnd && teaseFinal ? finalId : randomId;

            item.textContent = passId === finalId ? finalName : getPlayerName(passId);

            reel.classList.remove('is-final-pass-tick');
            void reel.offsetWidth;
            reel.classList.add('is-final-pass-tick');

            passCount += 1;

            if (passCount < slowSteps.length) {
              window.setTimeout(runFinalPass, slowSteps[passCount]);
              return;
            }

            reel.classList.remove('is-tick');
            reel.classList.remove('is-decelerating');
            reel.classList.add('is-final-stop');
          };

          window.setTimeout(runFinalPass, slowSteps[0]);
        }

        trackRerollTimeout(window.setTimeout(() => {
          const liveSlot = getTeamSlotElement(target.teamIndex, target.slotIndex);
          if (!liveSlot) return;

          liveSlot.classList.remove('is-slot-rolling');
          liveSlot.classList.add('is-slot-stopped');
          liveSlot.classList.add('is-slot-relight');
          liveSlot.innerHTML = renderPlayerCard(finalId);
          bindPlayerCards();

          window.setTimeout(() => {
            const doneSlot = getTeamSlotElement(target.teamIndex, target.slotIndex);
            if (doneSlot) { doneSlot.classList.remove('is-slot-stopped'); doneSlot.classList.remove('is-slot-relight'); }
          }, 430);

          completedSlots += 1;
          finishRerollIfComplete();
        }, 900));
      }, stopDelay));
    });
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
        resetBuilder();
        setStatus(`팀구성 완료: 시트지에 ${importedCount}명을 등록하고 시트지로 이동합니다.`);
        const goSheet = () => { window.location.href = 'sheet.html'; };
        if (result && result.remoteSave && typeof result.remoteSave.finally === 'function') {
          let moved = false;
          const moveOnce = () => { if (moved) return; moved = true; goSheet(); };
          result.remoteSave.finally(() => setTimeout(moveOnce, 80));
          setTimeout(moveOnce, 1800);
        } else {
          setTimeout(goSheet, 250);
        }
      }
    });
  }

  function exportTeamBoardToSheet() {
    const sheetState = loadSheetStateForTeamExport();
    const teams = createSheetTeamsFromTeamBoard(sheetState.teams);
    sheetState.mode = sheetState.mode || 'squad';
    sheetState.selectedTeamId = sheetState.selectedTeamId || 'team1';
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
    const sheetJson = JSON.stringify(sheetState);
    localStorage.setItem(SHEET_STORAGE_KEY, sheetJson);
    window.dispatchEvent(new StorageEvent('storage', { key: SHEET_STORAGE_KEY, newValue: sheetJson }));
    try {
      window.dispatchEvent(new CustomEvent('pkl-sheet-teams-imported', { detail: { state: sheetState, teams } }));
    } catch (error) {}
    const remoteSave = saveSheetStateToSupabaseNow(sheetJson);
    return {
      count: teams.reduce((sum, team) => sum + team.members.filter(member => member.name).length, 0),
      remoteSave
    };
  }

  function saveSheetStateToSupabaseNow(sheetJson) {
    // PKL 2026-05-10: 팀 편성 완료 시 시트 전체 상태를 Supabase 공유문서에 직접 PATCH하지 않는다.
    // 시트 전달은 같은 브라우저 localStorage만 사용하고, 실제 실시간 공유는 sheet.html의 pklLiveScoreboard/current만 사용한다.
    return Promise.resolve(null);
  }

  function loadSheetStateForTeamExport() {
    try {
      const saved = JSON.parse(localStorage.getItem(SHEET_STORAGE_KEY) || 'null');
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
    return Array.from({ length: TEAM_COUNT }, (_, teamIndex) => {
      const oldTeam = oldTeams[teamIndex] || {};
      return {
        ...oldTeam,
        id: `team${teamIndex + 1}`,
        target: Number(oldTeam.target || 0),
        members: Array.from({ length: SLOT_COUNT }, (_, slotIndex) => createSheetMemberFromSlot(teamIndex, slotIndex))
      };
    });
  }

  function createSheetMemberFromSlot(teamIndex, slotIndex) {
    const playerId = state.teams[teamIndex] && state.teams[teamIndex].slots[slotIndex];
    if (!playerId) return { name: '', tier: '', memberTier: '' };
    const player = state.players.find(item => item.id === playerId);
    if (!player) return { name: '', tier: '', memberTier: '' };
    hydratePlayerIdentity(player);
    const displayName = resolvePlayerDisplayName(player);
    const accountUser = resolvePlayerAccountUser(player, displayName);
    const memberTier = accountUser && accountUser.memberTier ? String(accountUser.memberTier).trim() : '';
    return {
      name: displayName,
      tier: memberTier || player.tier || '',
      memberTier,
      userUid: player.userUid || (accountUser && (accountUser.uid || accountUser.id)) || '',
      accountId: player.accountId || (accountUser && (accountUser.id || accountUser.uid)) || '',
      pubgId: player.pubgId || (accountUser && (accountUser.pubgId || accountUser.gameId)) || ''
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
    ensureRerollRequestState();
    refreshRerollUserAutocomplete();
    renderRerollListModal();
    openModal(rerollListModal);
  }

  function ensureRerollRequestState() {
    if (!state.rerollRequests || typeof state.rerollRequests !== 'object' || Array.isArray(state.rerollRequests)) {
      state.rerollRequests = {};
    }
    if (!Array.isArray(state.rerollHiddenKeys)) {
      state.rerollHiddenKeys = [];
    }
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
          paid: false,
          manual: Boolean(item.manual)
        };
      }
      state.rerollRequests[item.key].name = item.name;
      state.rerollRequests[item.key].playerId = item.playerId || state.rerollRequests[item.key].playerId || '';
      state.rerollRequests[item.key].tierBadge = item.tierBadge || state.rerollRequests[item.key].tierBadge || '';
      state.rerollRequests[item.key].manual = Boolean(item.manual);
      state.rerollRequests[item.key].count = normalizeRerollCount(state.rerollRequests[item.key].count);
      state.rerollRequests[item.key].paid = Boolean(state.rerollRequests[item.key].paid);
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
    const rows = getRerollListRows();
    if (!rows.length) {
      rerollListEntries.innerHTML = '<div class="pkl-reroll-empty">직접 추가된 리롤 사용자가 없습니다.</div>';
      saveState();
      updateConfirmModalReadyState();
      return;
    }

    rerollListEntries.innerHTML = rows.map(item => {
      const request = state.rerollRequests[item.key] || { count: 0, paid: false };
      const position = [item.teamName, item.slotName].filter(Boolean).join(' · ');
      const tierBadge = item.tierBadge || request.tierBadge || '';
      return `
        <div class="pkl-reroll-entry ${request.paid ? 'is-paid' : ''}" data-reroll-key="${escapeHtml(item.key)}">
          <div class="pkl-reroll-user">
            <div class="pkl-reroll-user-main">
              <strong>${escapeHtml(item.name)}</strong>
              ${tierBadge ? `<span class="pkl-reroll-tier-badge">${tierBadge}</span>` : ''}
            </div>
            <span class="pkl-reroll-position">${escapeHtml(position)}</span>
          </div>
          <div class="pkl-reroll-count-control" aria-label="${escapeHtml(item.name)} 리롤 횟수">
            <button type="button" data-reroll-action="decrease" aria-label="리롤 횟수 감소">−</button>
            <input type="number" min="0" step="1" inputmode="numeric" value="${normalizeRerollCount(request.count)}" data-reroll-count aria-label="리롤 횟수" />
            <button type="button" data-reroll-action="increase" aria-label="리롤 횟수 증가">＋</button>
          </div>
          <label class="pkl-reroll-paid-check">
            <input type="checkbox" data-reroll-paid ${request.paid ? 'checked' : ''} />
            <span>확인완료</span>
          </label>
          <button class="pkl-reroll-remove" type="button" data-reroll-action="remove" aria-label="리롤 목록에서 제거">×</button>
        </div>
      `;
    }).join('');

    bindRerollListEntryEvents();
    saveState();
  }

  function bindRerollListEntryEvents() {
    if (!rerollListEntries) return;
    rerollListEntries.querySelectorAll('.pkl-reroll-entry').forEach(entry => {
      const key = entry.dataset.rerollKey;
      const countInput = entry.querySelector('[data-reroll-count]');
      const paidInput = entry.querySelector('[data-reroll-paid]');

      entry.querySelectorAll('[data-reroll-action]').forEach(button => {
        button.addEventListener('click', () => {
          const action = button.dataset.rerollAction;
          if (action === 'increase') updateRerollCount(key, 1);
          if (action === 'decrease') updateRerollCount(key, -1);
          if (action === 'remove') removeRerollListUser(key);
        });
      });

      if (countInput) {
        countInput.addEventListener('change', () => setRerollCount(key, countInput.value));
        countInput.addEventListener('input', () => setRerollCount(key, countInput.value, true));
      }

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

  function updateRerollCount(key, amount) {
    ensureRerollRequestState();
    if (!state.rerollRequests[key]) return;
    state.rerollRequests[key].count = Math.max(0, normalizeRerollCount(state.rerollRequests[key].count) + amount);
    renderRerollListModal();
  }

  function setRerollCount(key, value, skipRender) {
    ensureRerollRequestState();
    if (!state.rerollRequests[key]) return;
    state.rerollRequests[key].count = normalizeRerollCount(value);
    saveState();
    if (!skipRender) renderRerollListModal();
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

    const editableSelector = '#rerollUserInput, [data-calculator-display], [data-reroll-count]';

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

    const isReady = hasMatchTimeSettings() && areAllRerollRequestsConfirmed();
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
      const player = state.players.find(item => item.id === playerId);
      const tier = player ? TIERS.find(item => item.id === player.tier) : null;
      return sum + (tier ? tier.weight : 0);
    }, 0);
  }

  function getWaitingPlayerIds() {
    return TIERS.flatMap(tier => state.waiting[tier.id]);
  }

  function getPlayerName(playerId) {
    const player = state.players.find(item => item.id === playerId);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
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
        bronze: 'beast',
        etc: 'beast'
      };

      const players = saved.players
        .filter(player => !(/^test-player-/i.test(String(player.id || "")) || /테스터|tester/i.test(String(player.name || player.nickname || ""))))
        .map(player => {
          const tier = validTierIds.has(player.tier) ? player.tier : (legacyTierMap[player.tier] || 'beast');
          const nextPlayer = { ...player, tier };
          hydratePlayerIdentity(nextPlayer);
          return nextPlayer;
        });

      const playerById = new Map(players.map(player => [player.id, player]));
      const teams = base.teams.map((team, teamIndex) => {
        const savedTeam = saved.teams[teamIndex] || {};
        const slots = Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
          const playerId = Array.isArray(savedTeam.slots) ? savedTeam.slots[slotIndex] : null;
          return playerById.has(playerId) ? playerId : null;
        });
        return { ...team, ...savedTeam, id: team.id, name: team.name, slots };
      });

      const placedIds = new Set(teams.flatMap(team => team.slots).filter(Boolean));
      const waiting = TIERS.reduce((map, tier) => ({ ...map, [tier.id]: [] }), {});
      const waitingSeen = new Set();
      if (saved.waiting && typeof saved.waiting === 'object') {
        Object.entries(saved.waiting).forEach(([tierId, ids]) => {
          if (!Array.isArray(ids)) return;
          const safeTierId = validTierIds.has(tierId) ? tierId : 'tier0';
          ids.forEach(playerId => {
            if (waitingSeen.has(playerId) || placedIds.has(playerId) || !playerById.has(playerId)) return;
            waiting[safeTierId].push(playerId);
            waitingSeen.add(playerId);
          });
        });
      }
      players.forEach(player => {
        if (placedIds.has(player.id) || waitingSeen.has(player.id)) return;
        waiting[player.tier].push(player.id);
      });

      return {
        ...base,
        ...saved,
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  document.addEventListener('contextmenu', function(event) {
    event.preventDefault();

    const card = event.target.closest('.team-slot .player-card');
    if (!card) return;

    const playerId = card.dataset.playerId;
    const player = state.players.find(item => item.id === playerId);
    if (!player) return;

    removePlayerFromEverywhere(playerId);
    insertPlayerIntoWaitingTier(playerId, player.tier);
    clearSlotSelectionFast();
    setStatus(`${getPlayerName(playerId)}님을 ${getTierLabel(player.tier)} 대기칸으로 되돌렸습니다.`);
    render();
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
