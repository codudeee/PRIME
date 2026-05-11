(function(){
  "use strict";
  if(window.PKLModal && window.pklAlert && window.pklConfirm) return;

  function ensureModal(){
    var modal=document.getElementById("pklGlobalModal");
    if(modal) return modal;
    var style=document.createElement("style");
    style.id="pklGlobalModalStyle";
    style.textContent=`
#pklGlobalModal{position:fixed;inset:0;z-index:999999;display:none;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at 50% 0%,rgba(168,85,247,.18),transparent 38%),rgba(0,0,0,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
#pklGlobalModal.open{display:flex}
.pkl-global-modal-card{position:relative;width:min(440px,calc(100vw - 40px));border-radius:24px;border:1px solid rgba(216,180,254,.38);background:linear-gradient(145deg,rgba(255,255,255,.11),rgba(255,255,255,.035) 18%,transparent 34%),radial-gradient(circle at 50% 0%,rgba(168,85,247,.28),transparent 48%),linear-gradient(180deg,rgba(24,12,46,.96),rgba(7,7,17,.98));box-shadow:0 34px 110px rgba(0,0,0,.82),0 0 0 1px rgba(255,255,255,.07) inset,0 1px 0 rgba(255,255,255,.18) inset,0 -28px 70px rgba(88,28,135,.18) inset,0 0 44px rgba(168,85,247,.22);overflow:hidden;text-align:center;color:#fff;padding:26px 24px 22px}
.pkl-global-modal-card:before{content:"";position:absolute;left:42px;right:42px;top:0;height:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.92),rgba(216,180,254,.94),rgba(168,85,247,.9),transparent);box-shadow:0 0 24px rgba(216,180,254,.48)}
.pkl-global-modal-kicker{margin-bottom:8px;color:#c4b5fd;font-size:11px;font-weight:1000;letter-spacing:2.6px;text-transform:uppercase;text-shadow:0 0 16px rgba(168,85,247,.55)}
.pkl-global-modal-title{margin:0;color:#fff;font-size:20px;font-weight:1000;letter-spacing:-.4px;text-shadow:0 0 18px rgba(168,85,247,.34)}
.pkl-global-modal-message{margin:15px 0 0;color:rgba(248,244,255,.84);font-size:14px;font-weight:850;line-height:1.65;white-space:pre-line;word-break:keep-all}
.pkl-global-modal-actions{display:flex;justify-content:center;gap:10px;margin-top:22px}
.pkl-global-modal-actions button{height:42px;min-width:96px;padding:0 18px;border-radius:13px;border:1px solid rgba(229,213,255,.24);background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.035));color:#fff;font-size:13px;font-weight:1000;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.13),0 12px 28px rgba(0,0,0,.30)}
.pkl-global-modal-ok{border-color:rgba(168,85,247,.64)!important;background:linear-gradient(135deg,rgba(124,58,237,.72),rgba(28,12,54,.96))!important;color:#f3e8ff!important;box-shadow:0 0 18px rgba(168,85,247,.24),inset 0 1px 0 rgba(255,255,255,.16)!important}
.pkl-global-modal-cancel{border-color:rgba(248,113,113,.42)!important;background:linear-gradient(135deg,rgba(127,29,29,.46),rgba(35,10,16,.96))!important;color:#fee2e2!important}
`;
    document.head.appendChild(style);
    modal=document.createElement("div");
    modal.id="pklGlobalModal";
    modal.innerHTML='<div class="pkl-global-modal-card" role="dialog" aria-modal="true"><div class="pkl-global-modal-kicker">PKL SYSTEM</div><h2 class="pkl-global-modal-title"></h2><div class="pkl-global-modal-message"></div><div class="pkl-global-modal-actions"><button type="button" class="pkl-global-modal-ok">확인</button><button type="button" class="pkl-global-modal-cancel">취소</button></div></div>';
    document.body.appendChild(modal);
    return modal;
  }

  function openModal(options){
    options=options||{};
    return new Promise(function(resolve){
      var modal=ensureModal();
      var title=modal.querySelector(".pkl-global-modal-title");
      var msg=modal.querySelector(".pkl-global-modal-message");
      var ok=modal.querySelector(".pkl-global-modal-ok");
      var cancel=modal.querySelector(".pkl-global-modal-cancel");
      title.textContent=options.title||"알림";
      msg.textContent=options.message||"";
      ok.textContent=options.ok||"확인";
      cancel.textContent=options.cancel||"취소";
      cancel.style.display=options.mode==="confirm"?"":"none";
      function close(value){
        modal.classList.remove("open");
        ok.onclick=null;
        cancel.onclick=null;
        modal.onclick=null;
        resolve(value);
      }
      ok.onclick=function(){close(true)};
      cancel.onclick=function(){close(false)};
      modal.onclick=function(e){if(e.target===modal && options.mode!=="confirm") close(false)};
      modal.classList.add("open");
      ok.focus({preventScroll:true});
    });
  }

  window.PKLModal={open:openModal};
  window.pklAlert=function(message,title){return openModal({mode:"alert",message:String(message||""),title:title||"알림",ok:"확인"});};
  window.pklConfirm=function(message,title){return openModal({mode:"confirm",message:String(message||""),title:title||"처리 확인",ok:"확인",cancel:"취소"});};
})();
