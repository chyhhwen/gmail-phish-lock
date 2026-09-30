// 判斷一個連結是否可疑。
// 純函式：不碰 DOM、不連網，所以能在沙盒裡直接用 node 測。
// 名單都放在最上面，改名單不用動判斷邏輯。
(function (root) {
  'use strict';

  const VERSION = '0.2.0';

  // ── 品牌 ──────────────────────────────────────────────
  // official：官方網域，子網域也算
  // cc：「品牌.國碼」也算官方，例如 google.co.jp、amazon.de、shopee.tw
  // sub：名稱夠獨特，藏在網域字串中間也算，例如 ll-pay-pal-i.net
  // fuzzy：差一個字也算，例如 netfiix；太短或像一般英文字的品牌不開
  const BRANDS = {
    paypal: { official: ['paypal.com', 'paypal.me', 'paypalobjects.com',
      'paypal-community.com', 'paypal-communication.com', 'paypalcorp.com'],
      cc: true, sub: true, fuzzy: true },
    apple: { official: ['apple.com', 'apple.co', 'apple.news', 'icloud.com',
      'cdn-apple.com'] },
    icloud: { official: ['icloud.com', 'icloud-content.com', 'apple.com'] },
    microsoft: {
      official: ['microsoft.com', 'microsoftonline.com',
        'microsoftonline-p.com', 'microsoftonline-p.net', 'microsoftonline.cn',
        'microsoft365.com', 'microsoftstore.com', 's-microsoft.com',
        'microsoftazuread-sso.com', 'microsofttranslator.com',
        'microsoftvirtualacademy.com', 'microsofthup.com',
        'microsoftstore.com.cn', 'sharepoint.com', 'onedrive.com',
        'office.com', 'office365.com', 'live.com', 'outlook.com'],
      cc: true, sub: true, fuzzy: true,
    },
    office365: { official: ['office365.com', 'office.com', 'microsoft.com'],
      sub: true },
    outlook: { official: ['outlook.com', 'live.com', 'office.com',
      'office365.com', 'microsoft.com'] },
    onedrive: { official: ['onedrive.com', 'live.com', 'microsoft.com',
      'sharepoint.com'], sub: true },
    sharepoint: { official: ['sharepoint.com', 'sharepointonline.com',
      'microsoft.com'], sub: true },
    google: {
      official: ['google.com', 'googleapis.com', 'googleusercontent.com',
        'google-analytics.com', 'googletagmanager.com',
        'googlesyndication.com', 'googleadservices.com', 'googlevideo.com',
        'googleblog.com', 'withgoogle.com', 'googlemail.com',
        'googledrive.com', 'googlegroups.com', 'googlesource.com',
        'googlecode.com', 'google.org', 'googleplex.com',
        'thinkwithgoogle.com', 'doubleclickbygoogle.com',
        'googletagservices.com', 'googleweblight.com', 'googlezip.net',
        'googlehosted.com', 'googlecommerce.com', 'googlepages.com',
        'googleadsserving.cn', 'googletraveladservices.com'],
      cc: true, sub: true, fuzzy: true,
    },
    gmail: { official: ['gmail.com', 'googlemail.com', 'google.com'],
      sub: true },
    youtube: { official: ['youtube.com', 'youtube-nocookie.com',
      'youtubekids.com'], cc: true, sub: true, fuzzy: true },
    amazon: {
      official: ['amazon.com', 'amazonaws.com', 'amazonaws.cn',
        'amazon-adsystem.com', 'images-amazon.com', 'ssl-images-amazon.com',
        'media-amazon.com', 'amazontrust.com', 'amazonpay.com',
        'amazonvideo.com', 'amazon.jobs', 'amazonservices.com',
        'amazonlocal.com', 'amazonsupply.com', 'amazonsilk.com',
        'amazonbrowserapp.com', 'payments-amazon.com', 'assoc-amazon.com'],
      cc: true, sub: true, fuzzy: true,
    },
    netflix: { official: ['netflix.com', 'netflix.net'],
      sub: true, fuzzy: true },
    facebook: { official: ['facebook.com', 'facebook.net', 'facebookmail.com'],
      sub: true, fuzzy: true },
    instagram: { official: ['instagram.com', 'cdninstagram.com'],
      sub: true, fuzzy: true },
    whatsapp: { official: ['whatsapp.com', 'whatsapp.net'],
      sub: true, fuzzy: true },
    linkedin: { official: ['linkedin.com', 'linkedinlabs.com'],
      sub: true, fuzzy: true },
    dropbox: { official: ['dropbox.com', 'dropboxusercontent.com',
      'dropboxstatic.com', 'dropboxapi.com'], sub: true, fuzzy: true },
    docusign: { official: ['docusign.com', 'docusign.net'],
      sub: true, fuzzy: true },
    adobe: { official: ['adobe.com', 'adobelogin.com', 'adobe.io',
      'adobesign.com', 'adobeconnect.com', 'adobedtm.com', 'adobetag.com',
      'adobesc.com', 'adobecc.com'] },
    yahoo: { official: ['yahoo.com', 'yahoo.net', 'yahooapis.com',
      'yahoo.co.jp', 'yahoodns.net', 'yahoo-mbga.jp', 'yahoo-help.jp',
      'yahoofs.jp', 'yahoomail.com'], cc: true, sub: true },
    shopee: { official: ['shopee.com'], cc: true, sub: true },
    dhl: { official: ['dhl.com'], cc: true },
    fedex: { official: ['fedex.com'], sub: true },
    hsbc: { official: ['hsbc.com'], cc: true },
    // citibank、binance 跟 citybank、finance 只差一個字，不開 fuzzy
    citibank: { official: ['citibank.com', 'citibankonline.com'],
      cc: true, sub: true },
    wellsfargo: { official: ['wellsfargo.com', 'wellsfargoadvisors.com',
      'wellsfargomedia.com', 'wellsfargodealerservices.com',
      'mywellsfargorewards.com'], sub: true, fuzzy: true },
    coinbase: { official: ['coinbase.com'], sub: true, fuzzy: true },
    binance: { official: ['binance.com', 'binance.us'], sub: true },
    metamask: { official: ['metamask.io'], sub: true, fuzzy: true },
    roblox: { official: ['roblox.com'], sub: true, fuzzy: true },
    steamcommunity: { official: ['steamcommunity.com'], sub: true, fuzzy: true },
    steampowered: { official: ['steampowered.com'], sub: true, fuzzy: true },
  };

  // ── 短網址：看不到真正目的地 ───────────────────────────
  const SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 'reurl.cc', 'pse.is', 'lihi.cc', 'lihi1.cc',
    'lihi2.cc', 'lihi3.cc', 'ppt.cc', 'is.gd', 'v.gd', 'rb.gy', 'cutt.ly',
    'shorturl.at', 't.ly', 'tiny.cc', 'bit.do', 's.id', 'goo.su', 'goo.gl',
    'ow.ly', 'buff.ly', 'rebrand.ly', 'short.gy', 'x.gd', 'qrco.de',
    'clck.ru', 's4w.in', 'u.gy', 'lnk.ink', '1url.at',
  ]);

  // ── 免費架站、雲端空間：任何人幾分鐘就能在上面開一個子網域 ──
  const FREE_HOSTS = [
    'vercel.app', 'pages.dev', 'workers.dev', 'github.io', 'gitlab.io',
    'blogspot.com', 'replit.app', 'replit.dev', 'repl.co', 'weebly.com',
    'weeblysite.com', 'wixsite.com', 'framer.app', 'framer.website',
    'framer.media', 'netlify.app', 'firebaseapp.com', 'web.app', 'glitch.me',
    'herokuapp.com', 'onrender.com', 'railway.app', 'fly.dev', 'surge.sh',
    'godaddysites.com', 'square.site', 'squarespace.com', 'azurefd.net',
    'azurewebsites.net', 'appspot.com', 'r2.dev', 'edgeone.dev',
    'edgeone.app', 'mybluehost.me', '000webhostapp.com', 'hostingersite.com',
    'webflow.io', 'carrd.co', 'ngrok-free.app', 'ngrok.io', 'ngrok.app',
    'trycloudflare.com', 'pageshare.ai', 'runpage.dev', 'alwaysdata.net',
    'rf.gd', 'epizy.com', 'infinityfreeapp.com', 'ct.ws', 'wuaze.com',
    'free.nf', '42web.io', 'lovable.app', 'gitbook.io', 'typedream.app',
    'hstn.me', 'tw1.ru', 'contaboserver.net',
  ];
  // 貼一段 HTML 就變成網頁的分享服務，整個網域都算
  const PASTE_HOSTS = ['paste.page', 'sharemyhtml.com'];
  // 平台自己用的子網域（圖片 CDN、客服頁），不是使用者開的
  const PLATFORM_OWNED = new Set(['www', 'static', 'static1', 'cdn', 'support',
    'help', 'hc', 'answers', 'secure', 'login', 'account', 'accounts',
    'promote', 'docs', 'status', 'bp']);

  // 註冊網域名稱本身帶這些字（macro-login.com、xxx-account.com）：
  // 抽樣資料裡釣魚遠多於正常網站；secure、service 正常網站也常用，不放
  const LURE_WORDS = new Set(['login', 'signin', 'logon', 'verify',
    'verification', 'validation', 'confirm', 'account', 'recovery', 'auth',
    'authenticate', 'wallet', 'billing', 'unlock', 'update', 'support']);

  // 雲端儲存空間：放檔案很正常，但直接放「網頁」就很可疑
  const STORAGE_HOSTS = [
    /(^|\.)s3([.-][a-z0-9-]+)*\.amazonaws\.com$/,
    /(^|\.)storage\.googleapis\.com$/,
    /^firebasestorage\.googleapis\.com$/,
    /\.blob\.core\.windows\.net$/,
    /\.web\.core\.windows\.net$/,
    /\.linodeobjects\.com$/,
    /(^|\.)ionoscloud\.com$/,
    /\.digitaloceanspaces\.com$/,
    /\.backblazeb2\.com$/,
    /\.wasabisys\.com$/,
  ];
  const PAGE_PATH = /\.(s?html?|xhtml|svg|php)$/i;
  const IPFS_HOST = /(^|\.)(ipfs\.io|dweb\.link|w3s\.link|cloudflare-ipfs\.com|pinata\.cloud)$/;

  // 常被拿來做釣魚的網域結尾：便宜、審核鬆。
  // 依抽樣資料挑出「釣魚多、正常網站少」的；zip、mov 容易跟副檔名混淆
  const ABUSED_TLDS = new Set([
    'top', 'xyz', 'vip', 'tk', 'ml', 'ga', 'cf', 'gq', 'xin', 'icu', 'cfd',
    'buzz', 'cyou', 'bond', 'sbs', 'qpon', 'monster', 'boats', 'hair', 'quest',
    'casa', 'bar', 'click', 'rest', 'mom', 'autos', 'homes', 'zip', 'mov',
  ]);

  // 連結文字裡要認得出來的網址結尾；ai、md、sh、pl 會跟副檔名撞，不放
  const TEXT_TLDS = 'com|net|org|edu|gov|mil|tw|hk|cn|jp|kr|sg|my|uk|us|de|fr'
    + '|io|co|me|cc|app|dev|info|biz|xyz|top|online|site|shop|store|live'
    + '|cloud|link|asia|ltd|tv|ly|gl|to';
  const TEXT_DOMAIN = new RegExp(
    '(?<![a-z0-9.-])(?:https?:\\/\\/)?'
    + '((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:' + TEXT_TLDS + '))'
    + '(?![a-z0-9-])', 'g');

  const REASON_ERROR = '檢查時發生錯誤，為了安全先鎖住';

  // ── 管理員政策（chrome.storage.managed）─────────────────
  let trusted = [];
  let disabled = new Set();
  let brandList = compileBrands({});

  function configure(cfg) {
    cfg = cfg || {};
    trusted = (cfg.trustedDomains || [])
      .map(d => String(d).toLowerCase().replace(/^\*?\.?/, '').trim())
      .filter(Boolean);
    disabled = new Set(cfg.disabledRules || []);
    brandList = compileBrands(cfg.protectedBrands || {});
  }

  function compileBrands(extra) {
    const all = Object.assign({}, BRANDS);
    const own = new Set(Object.keys(BRANDS));
    for (const name of Object.keys(extra)) {
      const key = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key) continue;
      own.delete(key);
      all[key] = {
        official: [].concat(extra[name] || []).map(d => String(d).toLowerCase()),
        sub: key.length >= 5,
        fuzzy: key.length >= 6,
      };
    }
    return Object.keys(all).map(name => {
      const b = all[name];
      return {
        name,
        sk: skeleton(name),
        official: b.official || [],
        cc: b.cc ? new RegExp('(^|\\.)' + name
          + '\\.(?:(?:com|co|ne|or)\\.)?[a-z]{2}$') : null,
        sub: !!b.sub,
        fuzzy: !!b.fuzzy,
        // 內建品牌才承認「品牌專屬頂級網域」；管理員加的名字可能剛好是
        // 一般人也能註冊的結尾（例如 app、shop），不能算官方
        ownTld: own.has(name),
      };
    });
  }

  // ── 小工具 ────────────────────────────────────────────
  function endsWithDomain(host, d) {
    return host === d || host.endsWith('.' + d);
  }

  function isIp(host) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  }

  // 近似「可註冊網域」：example.com、example.com.tw、someone.github.io
  function baseDomain(host) {
    if (isIp(host)) return host;
    for (const p of FREE_HOSTS) {
      if (host.endsWith('.' + p)) {
        const rest = host.slice(0, -(p.length + 1)).split('.');
        return rest[rest.length - 1] + '.' + p;
      }
    }
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const sld = parts[parts.length - 2];
    const tld = parts[parts.length - 1];
    const cc2 = /^(com|net|org|gov|edu|co|ac|or|ne|go|idv|mil)$/;
    if (tld.length === 2 && cc2.test(sld)) return parts.slice(-3).join('.');
    return parts.slice(-2).join('.');
  }

  // 換成「長得像」的骨架：0→o、1/i/l→l、rn→m、vv→w、cl→d…
  function skeleton(s) {
    return s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd')
      .replace(/0/g, 'o').replace(/[1il]/g, 'l').replace(/3/g, 'e')
      .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
      .replace(/8/g, 'b').replace(/9/g, 'g');
  }

  // 兩個字串是否只差一個字（多、少、換一個，或相鄰兩字對調）
  function within1(a, b) {
    if (a === b) return true;
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;
      return a[i] === b[i + 1] && a[i + 1] === b[i]
        && a.slice(i + 2) === b.slice(i + 2);
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }

  function isOfficial(host, b) {
    // 品牌自己的頂級網域（blog.google、about.microsoft）只有品牌能註冊
    return (b.ownTld && host.endsWith('.' + b.name))
      || b.official.some(d => endsWithDomain(host, d))
      || (b.cc !== null && b.cc.test(host));
  }

  function brandHit(host) {
    const labels = host.split('.');
    const tokens = host.split(/[.-]/).filter(Boolean);
    const joined = labels.map(l => l.replace(/-/g, ''));
    for (const b of brandList) {
      if (isOfficial(host, b)) continue;
      if (tokens.includes(b.name)
        || (b.sub && joined.some(j => j.includes(b.name)))) {
        return '網址冒用「' + b.name + '」，但不是官方網域';
      }
      // 骨架藏在中間只比對 6 個字以上的品牌，避免 sigmalive 被當成 gmail
      const hit = tokens.concat(joined).find(t => skeleton(t) === b.sk
        || (b.sub && b.sk.length >= 6 && skeleton(t).includes(b.sk))
        || (b.fuzzy && t.length >= 5 && within1(t, b.name)));
      if (hit) return '網址「' + hit + '」仿冒「' + b.name + '」';
    }
    return null;
  }

  // 在連結文字裡找出「看起來像網址」的部分
  function textDomains(text) {
    const t = String(text || '').normalize('NFKC')
      .replace(/\p{Cf}/gu, '')
      .replace(/[。｡]/g, '.')
      .toLowerCase();
    const found = [];
    let m;
    TEXT_DOMAIN.lastIndex = 0;
    while ((m = TEXT_DOMAIN.exec(t)) !== null) found.push(m[1]);
    return found;
  }

  // 已知會把真正目的地放在參數裡的轉址服務
  const GOOGLE_HOST = /^(www\.)?google\.(com|(com?\.)?[a-z]{2})$/;
  function unwrap(u) {
    const h = u.hostname;
    let t = null;
    if (GOOGLE_HOST.test(h) && u.pathname === '/url') {
      t = u.searchParams.get('q') || u.searchParams.get('url');
    } else if (GOOGLE_HOST.test(h) && u.pathname.startsWith('/amp/s/')) {
      t = 'https://' + u.pathname.slice(7) + u.search;
    } else if (/^(www\.|m\.)?youtube\.com$/.test(h) && u.pathname === '/redirect') {
      t = u.searchParams.get('q');
    } else if (/^l[m]?\.facebook\.com$/.test(h) && u.pathname === '/l.php') {
      t = u.searchParams.get('u');
    } else if (/(^|\.)safelinks\.protection\.outlook\.com$/.test(h)) {
      t = u.searchParams.get('url');
    }
    if (!t) return null;
    try {
      const x = new URL(t);
      return (x.protocol === 'http:' || x.protocol === 'https:') ? x : null;
    } catch (e) {
      return null;
    }
  }

  // ── 主判斷 ────────────────────────────────────────────
  function check(href, text) {
    try {
      return checkInner(href, text);
    } catch (e) {
      // 判斷程式出錯時一律鎖住，不放行；這裡本身絕不能再丟錯
      let s = '';
      try { s = String(href); } catch (e2) { s = ''; }
      return { bad: true, reasons: [REASON_ERROR], rules: ['error'],
        url: s, target: s };
    }
  }

  function checkInner(href, text) {
    const reasons = [];
    const rules = [];
    const add = (rule, msg) => {
      if (disabled.has(rule)) return;
      if (!reasons.includes(msg)) reasons.push(msg);
      if (!rules.includes(rule)) rules.push(rule);
    };
    const done = (url, target) => ({ bad: reasons.length > 0, reasons, rules,
      url, target });

    let u;
    try {
      u = new URL(href, 'https://mail.google.com/');
    } catch (e) {
      add('scheme', '網址格式異常');
      return done(String(href), String(href));
    }
    if (u.protocol === 'mailto:' || u.protocol === 'tel:') return done(u.href, u.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      add('scheme', '不是一般網頁連結（' + u.protocol + '）');
      return done(u.href, u.href);
    }
    if (u.hostname === 'mail.google.com' && !u.username && !u.password) {
      return done(u.href, u.href);
    }

    // 一路拆開已知的轉址，外層、內層都要檢查
    const chain = [u];
    for (let i = 0; i < 3; i++) {
      const next = unwrap(chain[chain.length - 1]);
      if (!next) break;
      chain.push(next);
    }
    chain.forEach((x, i) => hostRules(x, i > 0 ? '轉址目的地' : '', add));

    const final = chain[chain.length - 1];
    const finalHost = final.hostname.toLowerCase().replace(/\.$/, '');
    for (const td of textDomains(text)) {
      if (baseDomain(td) !== baseDomain(finalHost)) {
        add('mismatch', '文字顯示 ' + td + '，實際前往 ' + finalHost);
        break;
      }
    }
    return done(u.href, final.href);
  }

  function hostRules(x, prefix, add) {
    const host = x.hostname.toLowerCase().replace(/\.$/, '');
    const say = s => (prefix ? prefix + '：' : '') + s;

    if (x.username || x.password) {
      add('userinfo', say('網址用 @ 偽裝，實際前往 ' + host));
    }
    if (trusted.some(d => endsWithDomain(host, d))) return;

    if (isIp(host)) {
      add('ip', say('直接連 IP 位址'));
      return;
    }
    if (host.split('.').some(l => l.startsWith('xn--'))) {
      add('idn', say('網域含非英文字元（可能是仿冒字形）'));
    }
    if (SHORTENERS.has(host.replace(/^www\./, ''))) {
      add('shortener', say('短網址，看不到真正目的地'));
    }
    for (const p of FREE_HOSTS) {
      if (!host.endsWith('.' + p)) continue;
      const sub = host.slice(0, -(p.length + 1));
      if (PLATFORM_OWNED.has(sub) || host.endsWith('.bp.blogspot.com')) break;
      add('freehost', say('架在免費平台 ' + p + '，任何人都能開'));
      break;
    }
    if (PASTE_HOSTS.some(p => endsWithDomain(host, p))) {
      add('freehost', say('網頁分享服務，任何人都能貼一個頁面'));
    }
    if (STORAGE_HOSTS.some(re => re.test(host)) && PAGE_PATH.test(x.pathname)) {
      add('freehost', say('雲端儲存空間上的網頁檔'));
    }
    if (IPFS_HOST.test(host) || x.pathname.startsWith('/ipfs/')) {
      add('freehost', say('分散式儲存（IPFS）上的網頁'));
    }

    const tld = host.slice(host.lastIndexOf('.') + 1);
    if (ABUSED_TLDS.has(tld)) {
      add('tld', say('.' + tld + ' 是常被拿來做釣魚的網域結尾'));
    }

    // 假網域夾在前面：paypal.com.evil.xyz、apple.com-verify.xyz、
    // xxx.gov.in.evil.lol、post-gov-tw.top
    const base = baseDomain(host);
    const front = host.length > base.length
      ? host.slice(0, host.length - base.length - 1) : '';
    const frontTokens = front ? front.split(/[.-]/) : [];
    const baseTokens = base.split('.')[0].split('-');
    const govCc = toks => toks.some((t, i) => t === 'gov'
      && /^[a-z]{2}$/.test(toks[i + 1] || ''));
    if (frontTokens.includes('com')
      || (baseTokens.length > 1 && baseTokens[0] === 'com')
      || govCc(frontTokens) || govCc(baseTokens)) {
      add('fakedomain', say('網址裡夾了假的網域名稱'));
    }

    const lure = baseTokens.find(t => LURE_WORDS.has(t));
    if (lure && baseTokens.length > 1) {
      add('lure', say('網域名稱用了「' + lure + '」這種假登入頁常見的字'));
    }

    const b = brandHit(host);
    if (b) add('brand', say(b));
  }

  const PG = { check, configure, baseDomain, textDomains, skeleton, within1,
    VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = PG;
  else root.PG = PG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
