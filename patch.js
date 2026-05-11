(function(){
  "use strict";

  const STORAGE_KEY = "pklPatchNotes_v2";
  const BACKUP_KEY = STORAGE_KEY + "_backup";
  const seedNotes = [
    {
      version:"v3.2",
      title:"랭크 시스템 개편",
      date:"2026.05.07",
      summary:"티어 배지 · TOP KILLER · 검색 속도 개선",
      live:true,
      items:[
        {tag:"NEW", title:"티어 배지 디자인 리뉴얼", lines:["배지 크기 및 정렬 최적화","가독성 향상"]},
        {tag:"IMPROVE", title:"TOP KILLER UI 개선", lines:["닉네임 간격 최적화","랭킹 디자인 개선"]},
        {tag:"FIX", title:"일부 UI 오류 수정", lines:["모바일 레이아웃 수정","스크롤 이슈 수정"]}
      ]
    },
    {
      version:"v3.1",
      title:"검색 기능 개선",
      date:"2026.04.16",
      summary:"전적검색 반응 속도 및 검색 안정성 개선",
      live:false,
      items:[
        {tag:"IMPROVE", title:"검색 결과 표시 개선", lines:["닉네임 검색 정확도 향상","결과 카드 간격 최적화"]},
        {tag:"FIX", title:"검색 오류 수정", lines:["빈 검색어 처리 개선","일부 유저 누락 현상 수정"]}
      ]
    },
    {
      version:"v3.0",
      title:"시즌 3 시작",
      date:"2026.03.28",
      summary:"PKL 시즌 3 데이터 및 티어 기준 적용",
      live:false,
      items:[
        {tag:"NEW", title:"시즌 3 오픈", lines:["신규 시즌 랭킹 초기화","참가 데이터 기준 갱신"]},
        {tag:"IMPROVE", title:"페이지 UI 정리", lines:["메인 카드 디자인 조정","모바일 기본 대응"]}
      ]
    }
  ];

  let notes = loadNotes();
  let selected = 0;
  let editingIndex = null;

  const $ = (id) => document.getElementById(id);
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init(){
    [
      "patchVersionList","patchHeroVersion","patchHeroDate","patchHeroTitle","patchHeroSummary",
      "patchMainVersion","patchMainTitle","patchMainDate","patchDetailList",
      "patchAddBtnSide","patchEditBtn","patchDeleteBtn",
      "patchEditorModal","patchConfirmModal","patchModalTitle","patchModalClose",
      "patchInputVersion","patchInputDate","patchInputTitle","patchInputItems",
      "patchCancelBtn","patchSaveBtn","patchConfirmCancel","patchConfirmDelete"
    ].forEach(id => els[id] = $(id));

    bindEvents();
    render();
  }

    const reloadFromShared = () => {
      const fresh = loadNotes();
      if(!fresh) return;
      notes = fresh;
      if(selected < 0 || selected >= notes.length) selected = 0;
      render();
    };
    window.addEventListener("pkl-data-updated", e => {
      if(e && e.detail && e.detail.key === STORAGE_KEY) reloadFromShared();
    });
    window.addEventListener("pkl-sync-ready", () => setTimeout(reloadFromShared, 80));
    window.addEventListener("storage", e => {
      if(e && e.key === STORAGE_KEY) reloadFromShared();
    });
  }

  function normalizeNotes(value){
    return Array.isArray(value) ? value.filter(note => note && typeof note === "object") : null;
  }

  function loadNotes(){
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(BACKUP_KEY);
    if(raw !== null){
      try{
        const stored = normalizeNotes(JSON.parse(raw));
        if(stored) return stored;
      }catch(e){}
    }
    return seedNotes.map(note => ({...note, items:Array.isArray(note.items)?note.items.map(item=>({...item, lines:Array.isArray(item.lines)?item.lines.slice():[]})):[]}));
  }

  function saveNotes(){
    const normalized = normalizeNotes(notes) || [];
    const text = JSON.stringify(normalized);
    localStorage.setItem(STORAGE_KEY, text);
    localStorage.setItem(BACKUP_KEY, text);
    try{
      if(window.PKLDataSync && typeof window.PKLDataSync.setShared === "function"){
        window.PKLDataSync.setShared(STORAGE_KEY, normalized);
      }else if(typeof window.saveSharedData === "function"){
        window.saveSharedData(STORAGE_KEY, normalized);
      }
    }catch(e){}
  }


  function isPatchAdmin(){
    return !!(window.PKLRoleSystem && typeof window.PKLRoleSystem.currentAccessRole === "function" && window.PKLRoleSystem.currentAccessRole() === "admin");
  }
  function denyPatchAdmin(){
    if(window.PKLRoleSystem && typeof window.PKLRoleSystem.showAccessModal === "function") window.PKLRoleSystem.showAccessModal("관리자만 패치노트를 수정할 수 있습니다.", "권한 제한");
  }

  function bindEvents(){
    els.patchAddBtnSide?.addEventListener("click", () => openEditor("add"));
    els.patchEditBtn?.addEventListener("click", () => openEditor("edit"));
    els.patchDeleteBtn?.addEventListener("click", openConfirm);
    els.patchModalClose?.addEventListener("click", closeEditor);
    els.patchCancelBtn?.addEventListener("click", closeEditor);
    els.patchSaveBtn?.addEventListener("click", saveEditor);
    els.patchConfirmCancel?.addEventListener("click", closeConfirm);
    els.patchConfirmDelete?.addEventListener("click", deleteSelected);
    els.patchEditorModal?.addEventListener("click", e => { if(e.target === els.patchEditorModal) closeEditor(); });
    els.patchConfirmModal?.addEventListener("click", e => { if(e.target === els.patchConfirmModal) closeConfirm(); });
    document.addEventListener("keydown", e => {
      if(e.key === "Escape"){
        closeEditor();
        closeConfirm();
      }
    });
  }

  function render(){
    if(selected < 0 || selected >= notes.length) selected = 0;
    renderVersions();
    renderCurrent();
  }

  function renderVersions(){
    if(!els.patchVersionList) return;
    if(!notes.length){
      els.patchVersionList.innerHTML = '<div class="patch-empty">등록된 패치노트가 없습니다.</div>';
      return;
    }
    els.patchVersionList.innerHTML = notes.map((note, index) => `
      <button class="patch-version-card ${index === selected ? "active" : ""}" type="button" data-index="${index}">
        <div class="patch-version-card-top">
          <h3>${escapeHtml(note.version)}</h3>
          ${note.live ? "<b>LIVE</b>" : ""}
        </div>
        <p>${escapeHtml(note.title)}</p>
        <span>${escapeHtml(note.date)}</span>
      </button>
    `).join("");

    els.patchVersionList.querySelectorAll(".patch-version-card").forEach(btn => {
      btn.addEventListener("click", () => {
        selected = Number(btn.dataset.index || 0);
        render();
      });
    });
  }

  function renderCurrent(){
    const note = notes[selected];
    if(!note){
      setText(els.patchHeroVersion, "-");
      setText(els.patchHeroDate, "");
      setText(els.patchHeroTitle, "등록된 패치노트가 없습니다");
      setText(els.patchMainVersion, "-");
      setText(els.patchMainTitle, "등록된 패치노트가 없습니다");
      setText(els.patchMainDate, "");
      if(els.patchDetailList) els.patchDetailList.innerHTML = '<div class="patch-empty">새 패치노트를 작성하면 이곳에 표시됩니다.</div>';
      return;
    }

    setText(els.patchHeroVersion, note.version);
    setText(els.patchHeroDate, note.date);
    setText(els.patchHeroTitle, note.title);
    setText(els.patchMainVersion, note.version);
    setText(els.patchMainTitle, note.title);
    setText(els.patchMainDate, note.date);

    if(!els.patchDetailList) return;
    const items = Array.isArray(note.items) ? note.items : [];
    if(!items.length){
      els.patchDetailList.innerHTML = '<div class="patch-empty">등록된 패치 내용이 없습니다.</div>';
      return;
    }

    els.patchDetailList.innerHTML = items.map(item => `
      <article class="patch-item">
        <div class="patch-tag ${escapeHtml(item.tag || "NEW")}">${escapeHtml(item.tag || "NEW")}</div>
        <div class="patch-info">
          <ul>${itemLines(item).map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        </div>
      </article>
    `).join("");
  }

  function openEditor(mode){
    if(!isPatchAdmin()){ denyPatchAdmin(); return; }
    editingIndex = mode === "edit" ? selected : null;
    const note = editingIndex === null ? emptyNote() : notes[editingIndex];
    setText(els.patchModalTitle, editingIndex === null ? "패치노트 작성" : "패치노트 수정");
    els.patchInputVersion.value = note.version || "";
    els.patchInputDate.value = editingIndex === null ? todayText() : (note.date || todayText());
    els.patchInputTitle.value = note.title || "";
    els.patchInputItems.value = itemsToText(note.items || []);
    els.patchEditorModal?.classList.add("open");
    els.patchEditorModal?.setAttribute("aria-hidden","false");
    setTimeout(() => els.patchInputTitle?.focus(), 30);
  }

  function closeEditor(){
    els.patchEditorModal?.classList.remove("open");
    els.patchEditorModal?.setAttribute("aria-hidden","true");
  }

  function saveEditor(){
    if(!isPatchAdmin()){ denyPatchAdmin(); return; }
    const note = {
      version: els.patchInputVersion.value.trim() || nextPatchVersion(),
      date: editingIndex === null ? todayText() : (els.patchInputDate.value.trim() || todayText()),
      title: els.patchInputTitle.value.trim() || "패치노트",
      summary: "",
      live: editingIndex === null ? true : !!notes[editingIndex]?.live,
      items: textToItems(els.patchInputItems.value)
    };

    if(editingIndex === null){
      notes.forEach(n => n.live = false);
      note.live = true;
      notes.unshift(note);
      selected = 0;
    }else{
      notes[editingIndex] = note;
      selected = editingIndex;
    }
    saveNotes();
    closeEditor();
    render();
  }

  function openConfirm(){
    if(!isPatchAdmin()){ denyPatchAdmin(); return; }
    els.patchConfirmModal?.classList.add("open");
    els.patchConfirmModal?.setAttribute("aria-hidden","false");
  }

  function closeConfirm(){
    els.patchConfirmModal?.classList.remove("open");
    els.patchConfirmModal?.setAttribute("aria-hidden","true");
  }

  function deleteSelected(){
    if(!isPatchAdmin()){ denyPatchAdmin(); return; }
    if(!notes.length) return;
    notes.splice(selected, 1);
    selected = notes.length ? Math.max(0, selected - 1) : 0;
    saveNotes();
    closeConfirm();
    render();
  }

  function emptyNote(){
    return {version:nextPatchVersion(), date:todayText(), title:"", summary:"", live:false, items:[
      {tag:"NEW", title:"", lines:["",""]},
      {tag:"IMPROVE", title:"", lines:["",""]},
      {tag:"FIX", title:"", lines:["",""]}
    ]};
  }

  function itemLines(item){
    const lines = [];
    if(item?.title) lines.push(item.title);
    (item?.lines || []).forEach(line => {
      if(String(line || "").trim()) lines.push(String(line).trim());
    });
    return lines.length ? lines : [""];
  }

  function itemsToText(items){
    const ordered = ["NEW","IMPROVE","FIX"];
    const source = Array.isArray(items) ? items : [];
    const byTag = tag => source.find(item => String(item?.tag || "").toUpperCase() === tag);
    return ordered.map(tag => {
      const lines = itemLines(byTag(tag) || {tag, lines:["",""]});
      const body = lines.length ? lines.map(line => `- ${line}`).join("\n") : "- \n- ";
      return `[${tag}]\n${body}`;
    }).join("\n\n");
  }

  function textToItems(text){
    const result = [];
    let current = null;
    String(text || "").split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if(!line) return;
      const head = line.match(/^\[(NEW|IMPROVE|FIX)\]$/i);
      if(head){
        current = {tag:head[1].toUpperCase(), title:"", lines:[]};
        result.push(current);
        return;
      }
      if(!current) return;
      const body = line.replace(/^[-•]\s*/, "").trim();
      if(body) current.lines.push(body);
    });
    ["NEW","IMPROVE","FIX"].forEach(tag => {
      if(!result.some(item => item.tag === tag)) result.push({tag, title:"", lines:[]});
    });
    return result;
  }

  function nextPatchVersion(){
    const numbers = notes
      .map(note => String(note.version || "").trim())
      .filter(v => /^\d+\.\d$/.test(v))
      .map(v => {
        const parts = v.split(".").map(n => parseInt(n, 10));
        return parts[0] * 10 + parts[1];
      });
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `${Math.floor(next / 10)}.${next % 10}`;
  }

  function todayText(){
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
  }

  function setText(el, value){ if(el) el.textContent = value || ""; }

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  }
})();
