// 掃 Gmail 信件裡的連結，可疑的就鎖住、標紅。
// 全部在瀏覽器裡判斷，不送任何資料出去。
(function () {
  'use strict';

  // 一般畫面只掃信件內文（.a3s）。「顯示完整郵件」「列印」這類 ?view=
  // 獨立頁面整頁都是信件內容，所以整頁都掃
  const STANDALONE = /[?&]view=/.test(location.search);
  const LINKS = STANDALONE
    ? 'a[href], area[href]'
    : '.a3s a[href], .a3s area[href]';

  // 開信時網址最後一段是信件 ID
  const MSG_ID = /\/(FMfcg[A-Za-z0-9]{10,}|[0-9a-f]{16})(\?|$)/;
  const MSG_NODE = '[data-message-id], [data-legacy-message-id]';

  const LOCK_STYLE = [
    ['color', '#c62828'], ['background-color', '#ffebee'],
    ['outline', '2px solid #c62828'], ['cursor', 'not-allowed'],
    ['text-decoration', 'underline wavy #c62828'],
  ];
  const BADGE_STYLE = [
    ['display', 'inline-block'], ['visibility', 'visible'], ['opacity', '1'],
    ['position', 'static'], ['margin', '0 4px 0 0'], ['padding', '0 4px'],
    ['border-radius', '3px'], ['background', '#c62828'], ['color', '#fff'],
    ['font', 'bold 12px/1.6 sans-serif'], ['white-space', 'nowrap'],
  ];

  // 政策讀到之前先用最嚴格的預設：一律鎖、不能自行解鎖。
  // 不等政策就開始掃：瀏覽器剛開的第一個分頁，讀政策可能要好幾秒
  let allowUnlock = false;
  const loaded = typeof PG !== 'undefined';
  const SAVED_ATTRS = ['href', 'data-saferedirecturl', 'target', 'ping',
    'style', 'title'];

  // 讓 IT 在主控台確認插件有在跑、政策有沒有生效
  const root = document.documentElement;
  root.setAttribute('data-pg-version', loaded ? PG.VERSION : 'error');
  root.setAttribute('data-pg-policy', 'loading');

  function styleAll(el, list) {
    for (const [k, v] of list) el.style.setProperty(k, v, 'important');
  }

  function inScope(a) {
    return STANDALONE || !!a.closest('.a3s');
  }

  function lock(a, r) {
    // 先記下原本的屬性，政策更新後如果要解除才還得回去
    if (!a.hasAttribute('data-pg-saved')) {
      const saved = {};
      for (const k of SAVED_ATTRS) {
        if (a.hasAttribute(k)) saved[k] = a.getAttribute(k);
      }
      a.setAttribute('data-pg-saved', JSON.stringify(saved));
    }
    a.setAttribute('data-pg', 'locked');
    a.setAttribute('data-pg-href', r.url);
    a.setAttribute('data-pg-target', r.target);
    a.setAttribute('data-pg-why', r.reasons.join('；'));
    unlink(a);
    a.classList.add('pg-locked');
    a.title = '已鎖住：' + r.reasons.join('；') + '\n實際網址：' + r.target;
    // 信件自己的 CSS 可能想把紅色蓋掉，直接寫在元素上並加 !important
    styleAll(a, LOCK_STYLE);
    a.querySelectorAll('*').forEach(el => {
      if (!el.hasAttribute('data-pg-style')) {
        el.setAttribute('data-pg-style', el.getAttribute('style') || '');
      }
      el.style.setProperty('color', '#c62828', 'important');
    });
    // 旁邊再插一個自己的標籤：就算連結被信件樣式藏起來也看得到
    const prev = a.previousElementSibling;
    if (!prev || !prev.hasAttribute('data-pg-badge')) {
      const badge = document.createElement('span');
      badge.setAttribute('data-pg-badge', '1');
      badge.textContent = '🔒 可疑連結已鎖住';
      styleAll(badge, BADGE_STYLE);
      a.parentNode.insertBefore(badge, a);
    }
  }

  // 解除鎖定，還原成原本的樣子（只在政策更新、重新判斷時用）
  function restore(a) {
    let saved = {};
    try {
      saved = JSON.parse(a.getAttribute('data-pg-saved') || '{}');
    } catch (e) { /* 壞掉就不還原屬性，下面重新判斷時還是會鎖 */ }
    a.classList.remove('pg-locked');
    a.removeAttribute('style');
    a.removeAttribute('title');
    for (const [k, v] of Object.entries(saved)) a.setAttribute(k, v);
    a.querySelectorAll('[data-pg-style]').forEach(el => {
      const s = el.getAttribute('data-pg-style');
      if (s) el.setAttribute('style', s); else el.removeAttribute('style');
      el.removeAttribute('data-pg-style');
    });
    const prev = a.previousElementSibling;
    if (prev && prev.hasAttribute('data-pg-badge')) prev.remove();
    for (const k of ['data-pg', 'data-pg-href', 'data-pg-target', 'data-pg-why',
      'data-pg-saved', 'data-pg-checked']) {
      a.removeAttribute(k);
    }
  }

  // 拿掉所有能讓瀏覽器或 Gmail 帶人過去的屬性
  function unlink(a) {
    for (const k of ['href', 'data-saferedirecturl', 'target', 'ping']) {
      a.removeAttribute(k);
    }
  }

  function processLink(a) {
    const href = a.getAttribute('href');
    let r;
    try {
      r = PG.check(href, a.textContent);
    } catch (e) {
      // 判斷程式沒載入或出錯：鎖住，不放行
      r = { bad: true, reasons: ['檢查時發生錯誤，為了安全先鎖住'],
        url: href, target: href };
      showBanner('error', '釣魚連結鎖發生錯誤，目前一律先鎖住連結。請通知 IT。');
    }
    if (r.bad) {
      lock(a, r);
    } else {
      a.setAttribute('data-pg', 'ok');
      a.setAttribute('data-pg-checked', href);
    }
  }

  function scan() {
    document.querySelectorAll(LINKS).forEach(a => {
      if (!a.hasAttribute('data-pg')) processLink(a);
    });
    health();
  }

  // ── 失效偵測：開了信卻找不到信件內文，就明講保護失效 ──
  let healthTimer = null;
  function messageOpen() {
    return MSG_ID.test(location.hash) || !!document.querySelector(MSG_NODE);
  }
  function health() {
    if (!loaded) {
      showBanner('load', '釣魚連結鎖沒有正確載入，目前沒有保護。請通知 IT。');
      return;
    }
    if (STANDALONE) return;
    if (!messageOpen() || document.querySelector('.a3s')) {
      clearTimeout(healthTimer);
      healthTimer = null;
      hideBanner('dom');
      return;
    }
    if (healthTimer) return;
    healthTimer = setTimeout(() => {
      healthTimer = null;
      if (messageOpen() && !document.querySelector('.a3s')) {
        showBanner('dom', '釣魚連結鎖找不到信件內容，可能因為 Gmail 改版而失效。'
          + '這段期間請特別小心信裡的連結，並通知 IT。');
      }
    }, 5000);
  }

  function showBanner(id, text) {
    if (!document.body) return;
    let el = document.querySelector('[data-pg-banner="' + id + '"]');
    if (el) return;
    el = document.createElement('div');
    el.setAttribute('data-pg-banner', id);
    el.setAttribute('role', 'alert');
    el.textContent = '⚠️ ' + text;
    styleAll(el, [['position', 'fixed'], ['left', '16px'], ['bottom', '16px'],
      ['z-index', '2147483647'], ['max-width', '420px'], ['padding', '12px 16px'],
      ['background', '#b71c1c'], ['color', '#fff'], ['border-radius', '8px'],
      ['font', '14px/1.5 sans-serif'], ['box-shadow', '0 4px 16px rgba(0,0,0,.3)'],
      ['display', 'block'], ['visibility', 'visible'], ['opacity', '1']]);
    document.body.appendChild(el);
  }

  function hideBanner(id) {
    const el = document.querySelector('[data-pg-banner="' + id + '"]');
    if (el) el.remove();
  }

  // ── 攔截點擊：在 window 的捕獲階段、比 Gmail 早註冊 ──
  function onPointer(e) {
    const t = e.target;
    const a = t && t.closest ? t.closest('a, area') : null;
    if (!a || !inScope(a)) return;
    // 還沒掃到、或掃完後網址被改過：當場補檢查
    const href = a.getAttribute('href');
    if (href !== null && (!a.hasAttribute('data-pg')
      || a.getAttribute('data-pg-checked') !== href)) {
      a.removeAttribute('data-pg');
      processLink(a);
    }
    if (a.getAttribute('data-pg') !== 'locked') return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type === 'click' && e.altKey) askUnlock(a);
  }

  function askUnlock(a) {
    const why = a.getAttribute('data-pg-why');
    const target = a.getAttribute('data-pg-target');
    if (!allowUnlock) {
      window.alert('這個連結被判定為可疑，已依公司政策鎖住，不能自行開啟。\n\n'
        + why + '\n\n實際網址：\n' + target
        + '\n\n如果確定是正常連結，請聯絡 IT。');
      return;
    }
    const ok = window.confirm('這個連結被判定為可疑：\n\n' + why
      + '\n\n實際網址：\n' + target + '\n\n確定要開啟嗎？');
    if (ok) window.open(target, '_blank', 'noopener,noreferrer');
  }

  ['click', 'auxclick', 'mousedown', 'mouseup', 'dblclick']
    .forEach(type => window.addEventListener(type, onPointer, true));

  // ── 盯著 DOM：新開的信、被加回來的 href ──
  let timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, 150);
  }

  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type !== 'attributes') continue;
      const a = m.target;
      const state = a.getAttribute('data-pg');
      if (state === 'locked' && a.hasAttribute('href')) unlink(a);
      else if (state === 'ok'
        && a.getAttribute('href') !== a.getAttribute('data-pg-checked')) {
        a.removeAttribute('data-pg');
      }
    }
    schedule();
  }).observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['href'],
  });
  window.addEventListener('hashchange', schedule);
  document.addEventListener('DOMContentLoaded', scan);

  // ── 管理員政策：讀到或更新後，已經判斷過的連結全部重新判斷 ──
  function applyPolicy(policy) {
    policy = policy || {};
    try {
      if (loaded) PG.configure(policy);
    } catch (e) { /* 政策格式錯就維持預設值 */ }
    allowUnlock = policy.allowUserUnlock !== false;
    root.setAttribute('data-pg-policy',
      Object.keys(policy).length ? 'managed' : 'none');
    // 同一段同步程式裡「還原 → 重新判斷」，中間不會有點擊插進來
    document.querySelectorAll('[data-pg]').forEach(a => {
      if (a.getAttribute('data-pg') === 'locked') restore(a);
      else a.removeAttribute('data-pg');
      processLink(a);
    });
    scan();
  }

  function readPolicy() {
    try {
      chrome.storage.managed.get(null, items => {
        applyPolicy(chrome.runtime.lastError ? {} : items);
      });
    } catch (e) {
      applyPolicy({});
    }
  }

  readPolicy();
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'managed') readPolicy();
    });
  } catch (e) { /* 沒有 storage 權限時就只讀一次 */ }
})();
