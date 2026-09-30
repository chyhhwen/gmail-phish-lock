// 掃 Gmail 信件內文（.a3s）裡的連結，可疑的就鎖住、標紅。
// 全部在瀏覽器裡判斷，不送任何資料出去。
(function () {
  const BODY_LINKS = '.a3s a[href]:not([data-pg])';

  function lock(a, r) {
    a.setAttribute('data-pg', 'locked');
    a.setAttribute('data-pg-href', r.url);
    a.removeAttribute('href');                 // 沒有 href 就點不出去
    a.removeAttribute('data-saferedirecturl'); // Gmail 自己的轉址也拿掉
    a.removeAttribute('target');
    a.classList.add('pg-locked');
    a.title = '已鎖住：' + r.reasons.join('；')
      + '\n實際網址：' + r.url
      + '\n確定安全的話，按住 Alt 再點可以解鎖';
  }

  function scan() {
    document.querySelectorAll(BODY_LINKS).forEach(a => {
      const r = PG.check(a.getAttribute('href'), a.textContent);
      if (r.bad) lock(a, r);
      else a.setAttribute('data-pg', 'ok');
    });
  }

  // 攔截：捕獲階段先處理，Gmail 的事件拿不到
  function guard(e) {
    const a = e.target.closest && e.target.closest('a.pg-locked');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (e.type === 'click' && e.altKey) {
      const url = a.getAttribute('data-pg-href');
      const msg = '這個連結被判定為可疑：\n\n'
        + a.title.split('\n')[0] + '\n\n實際網址：\n' + url
        + '\n\n確定要開啟嗎？';
      if (window.confirm(msg)) window.open(url, '_blank', 'noopener');
    }
  }
  ['click', 'auxclick', 'mousedown', 'mouseup', 'contextmenu']
    .forEach(t => document.addEventListener(t, guard, true));

  // Gmail 是單頁應用，開信不換頁，要盯著 DOM 變化
  let timer = null;
  new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, 250);
  }).observe(document.body, { childList: true, subtree: true });

  scan();
})();
