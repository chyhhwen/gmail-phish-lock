// 判斷一個連結是否可疑。純函式，不碰 DOM，方便用 node 測。
(function (root) {
  // 品牌 → 官方網域。網址裡出現品牌字樣、卻不是這些網域，就算冒用。
  const BRANDS = {
    paypal: ['paypal.com'],
    apple: ['apple.com', 'icloud.com'],
    microsoft: ['microsoft.com', 'microsoftonline.com', 'live.com',
      'office.com', 'outlook.com', 'office365.com'],
    outlook: ['outlook.com', 'live.com', 'office.com'],
    office365: ['office.com', 'office365.com', 'microsoft.com'],
    google: ['google.com', 'google.com.tw', 'gmail.com', 'youtube.com'],
    gmail: ['gmail.com', 'google.com'],
    amazon: ['amazon.com', 'amazon.co.jp'],
    netflix: ['netflix.com'],
    facebook: ['facebook.com', 'fb.com'],
    instagram: ['instagram.com'],
    dropbox: ['dropbox.com'],
    docusign: ['docusign.com', 'docusign.net'],
  };

  // 短網址：看不到真正目的地
  const SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 'reurl.cc', 'pse.is', 'lihi.cc', 'lihi1.cc',
    'is.gd', 'ppt.cc', 'rb.gy', 'cutt.ly', 'shorturl.at', 'goo.su', 't.ly',
  ]);

  // 連結文字「看起來像網址」時才比對；避免 report.pdf、Node.js 被誤判
  const TEXT_TLDS = 'com|net|org|tw|io|co|gov|edu|me|cc|app|info|xyz|top|'
    + 'jp|cn|hk|uk|us|biz|online|site|shop';
  const TEXT_URL_RE = new RegExp(
    '^(https?:\\/\\/|www\\.)\\S+$|^([a-z0-9-]+\\.)+(' + TEXT_TLDS + ')(\\/\\S*)?$',
    'i');

  // 近似「可註冊網域」：example.com / example.com.tw
  function baseDomain(host) {
    const p = host.split('.');
    if (p.length <= 2) return host;
    const sld = p[p.length - 2];
    const tld = p[p.length - 1];
    const cc2 = /^(com|net|org|gov|edu|co|ac|or|ne|go|idv|mil)$/;
    if (tld.length === 2 && cc2.test(sld)) return p.slice(-3).join('.');
    return p.slice(-2).join('.');
  }

  function isOfficial(host, domains) {
    return domains.some(d => host === d || host.endsWith('.' + d));
  }

  // 把 0→o、1→l 這類換字還原，抓 paypa1、micros0ft
  function normalize(t) {
    return t.replace(/0/g, 'o').replace(/[1!|]/g, 'l').replace(/3/g, 'e')
      .replace(/5/g, 's').replace(/rn/g, 'm').replace(/vv/g, 'w');
  }

  function cleanText(s) {
    return (s || '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim();
  }

  function check(href, text) {
    const reasons = [];
    let url;
    try {
      url = new URL(href, 'https://mail.google.com/');
    } catch (e) {
      return { bad: true, reasons: ['網址格式異常'], url: href };
    }

    // 拆開 google.com/url?q=... 的轉址包裝
    if (/^(www\.)?google\.[a-z.]+$/.test(url.hostname) && url.pathname === '/url') {
      const q = url.searchParams.get('q') || url.searchParams.get('url');
      if (q) { try { url = new URL(q); } catch (e) { /* 保持原樣 */ } }
    }

    const proto = url.protocol;
    if (proto === 'mailto:' || proto === 'tel:') {
      return { bad: false, reasons, url: url.href };
    }
    if (proto !== 'http:' && proto !== 'https:') {
      reasons.push('不是一般網頁連結（' + proto + '）');
      return { bad: true, reasons, url: url.href };
    }

    const host = url.hostname.toLowerCase();
    if (host === 'mail.google.com') return { bad: false, reasons, url: url.href };

    if (url.username || url.password) {
      reasons.push('網址用 @ 偽裝，實際前往 ' + host);
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) {
      reasons.push('直接連 IP 位址');
    }
    if (host.split('.').some(l => l.startsWith('xn--'))) {
      reasons.push('網域含非英文字元（可能是仿冒字形）');
    }
    if (SHORTENERS.has(host)) {
      reasons.push('短網址，看不到真正目的地');
    }

    const tokens = host.split(/[.-]/);
    for (const brand in BRANDS) {
      if (isOfficial(host, BRANDS[brand])) continue;
      const hit = tokens.find(t => t === brand || normalize(t) === brand);
      if (hit) {
        reasons.push(hit === brand
          ? '網址冒用「' + brand + '」，但不是官方網域'
          : '網址「' + hit + '」仿冒「' + brand + '」');
      }
    }

    const t = cleanText(text);
    if (TEXT_URL_RE.test(t)) {
      try {
        const tu = new URL(/^https?:\/\//i.test(t) ? t : 'http://' + t);
        const th = tu.hostname.toLowerCase();
        if (baseDomain(th) !== baseDomain(host)) {
          reasons.push('文字顯示 ' + th + '，實際前往 ' + host);
        }
      } catch (e) { /* 文字不是網址，略過 */ }
    }

    return { bad: reasons.length > 0, reasons, url: url.href };
  }

  const PG = { check, baseDomain };
  if (typeof module !== 'undefined' && module.exports) module.exports = PG;
  else root.PG = PG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
