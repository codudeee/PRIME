(function(){
  "use strict";

  const STORAGE_KEY = "pklPatchNotes_v2";

  let notes = [];
  let selected = 0;
  let editingIndex = null;
  let loaded = false;
  let loading = false;

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
    renderLoading();
    loadNotesFromSupabase();
  }

  function normalizeNotes(value){
    return Array.isArray(value) ? value.filter(note => note && typeof note === "object") : [];
  }

  async function requestShared(method, body){
    if(method === "GET"){
      const res = await fetch("/api/pkl-data-store?type=shared&key=" + encodeURIComponent(STORAGE_KEY), {
        method:"GET",
        cache:"no-store",
        headers:{"Accept":"application/json","Cache-Control":"no-store"}
      });
      if(!res.ok) throw new Error("패치노트 불러오기 실패 " + res.status);
      return await res.json();
    }
    const res = await fetch("/api/pkl-data-store", {
      method:"POST",
      cache:"no-store",
      headers:{"Content-Type":"application/json","Accept":"application/json","Cache-Control":"no-store"},
      body:JSON.stringify(body)
    });
    if(!res.ok) throw new Error("패치노트 저장 실패 " + res.status);
    return await res.json();
  }

  async function loadNotesFromSupabase(){
    if(loading) return;
    loading = true;
    try{
      const data = await requestShared("GET");
      const item = data && data.item;
      notes = normalizeNotes(item && Object.prototype.hasOwnProperty.call(item,"value") ? item.value : []);
      selected = notes.length ? Math.min(selected, notes.length - 1) : 0;
      loaded = true;
      render();
    }catch(e){
      loaded = true;
      notes = [];
      renderLoadError();
    }finally{
      loading = false;
    }
  }

  async function saveNotes(){
    const normalized = normalizeNotes(notes);
    await requestShared("POST", {type:"shared", key:STORAGE_KEY, value:normalized});
  }

  function renderLoading(){
    setText(els.patchHeroVersion, "-");
    setText(els.patchHeroDate, "");
    setText(els.patchHeroTitle, "패치노트 불러오는 중");
    setText(els.patchMainVersion, "-");
    setText(els.patchMainTitle, "패치노트 불러오는 중");
    setText(els.patchMainDate, "");
    if(els.patchVersionList) els.patchVersionList.innerHTML = '<div class="patch-empty">Supabase에서 패치노트를 불러오는 중입니다.</div>';
    if(els.patchDetailList) els.patchDetailList.innerHTML = '<div class="patch-empty">잠시만 기다려주세요.</div>';
  }

  function renderLoadError(){
    setText(els.patchHeroVersion, "-");
    setText(els.patchHeroDate, "");
    setText(els.patchHeroTitle, "패치노트 불러오기 실패");
    setText(els.patchMainVersion, "-");
    setText(els.patchMainTitle, "패치노트 불러오기 실패");
    setText(els.patchMainDate, "");
    if(els.patchVersionList) els.patchVersionList.innerHTML = '<div class="patch-empty">Supabase 연결을 확인해주세요. 기본값/로컬값으로 복구하지 않습니다.</div>';
    if(els.patchDetailList) els.patchDetailList.innerHTML = '<div class="patch-empty">저장된 값을 덮어쓰지 않기 위해 빈값 저장이나 기본값 복원을 하지 않았습니다.</div>';
  }

  function isPatchAdmin(){
    return !!(window.PKLRoleSystem && typeof window.PKLRoleSystem.currentAccessRole === "function" && window.PKLRoleSystem.currentAccessRole() === "admin");
  }
  function denyPatchAdmin(){
    if(window.PKLRoleSystem && typeof window.PKLRoleSystem.showAccessModal === "function") window.PKLRoleSystem.showAccessModal("관리자만 패치노트를 수정할 수 있습니다.", "권한 제한");
  }

  function stopPatchEditorEventBubble(){
    [els.patchEditorModal, els.patchInputVersion, els.patchInputDate, els.patchInputTitle, els.patchInputItems].forEach(el => {
      if(!el) return;
      el.addEventListener("click", ev => {
        if(ev.target && ev.target.closest && ev.target.closest('input,textarea,.pkl-patch-modal-card')) ev.stopPropagation();
      }, false);
      el.addEventListener("wheel", ev => {
        if(ev.target && ev.target.closest && ev.target.closest('textarea')) ev.stopPropagation();
      }, {passive:true});
    });
    if(els.patchInputItems){
      els.patchInputItems.style.overflowY = "auto";
      els.patchInputItems.style.touchAction = "auto";
    }
  }

  function bindEvents(){
    stopPatchEditorEventBubble();
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
    setTimeout(() => els.patchInputTitle?.focus({preventScroll:true}), 30);
  }

  function closeEditor(){
    els.patchEditorModal?.classList.remove("open");
    els.patchEditorModal?.setAttribute("aria-hidden","true");
  }

  async function saveEditor(){
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
    try{
      await saveNotes();
      closeEditor();
      render();
    }catch(e){
      if(window.PKLRoleSystem && typeof window.PKLRoleSystem.showAccessModal === "function") window.PKLRoleSystem.showAccessModal("Supabase 저장에 실패했습니다. 기존 값을 덮어쓰지 않았습니다.", "저장 실패");
    }
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

  async function deleteSelected(){
    if(!isPatchAdmin()){ denyPatchAdmin(); return; }
    if(!notes.length) return;
    const before = notes.slice();
    const beforeSelected = selected;
    notes.splice(selected, 1);
    selected = notes.length ? Math.max(0, selected - 1) : 0;
    try{
      await saveNotes();
      closeConfirm();
      render();
    }catch(e){
      notes = before;
      selected = beforeSelected;
      if(window.PKLRoleSystem && typeof window.PKLRoleSystem.showAccessModal === "function") window.PKLRoleSystem.showAccessModal("Supabase 삭제 저장에 실패했습니다. 기존 값을 유지합니다.", "삭제 실패");
    }
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
      .map(note => String(note.version || "").trim().replace(/^v/i,""))
      .filter(v => /^\d+\.\d+$/.test(v))
      .map(v => {
        const parts = v.split(".").map(n => parseInt(n, 10));
        return (parts[0] || 0) * 10 + (parts[1] || 0);
      });
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `v${Math.floor(next / 10)}.${next % 10}`;
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
