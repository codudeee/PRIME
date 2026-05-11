
window.PKL_OPTIMIZE = {
  PAGE_SIZE: 20,
  SEARCH_DEBOUNCE: 350,
  MAX_RECENT_MATCHES: 20,
  ADMIN_FETCH_LIMIT: 20,
};

window.pklDebounce = function(fn, delay = 350){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
};
