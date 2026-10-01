// 端對端測試：用真的 Chromium 載入插件，對「假的 Gmail 頁面」實際點擊。
//
// 沙盒措施：
//   1. 所有請求都被攔下來，假頁面由測試程式直接回應，不會連到任何網站
//   2. 必須在沒有網路的 namespace 裡執行（見 tests/run-e2e.sh）
//   3. Chromium 用一般使用者身分執行，保留它自己的沙盒
//   4. 測試用的「釣魚網址」都是 .example 保留網域，不存在於網路上
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');

const EXT = path.resolve(__dirname, '..', 'extension');
const CHROME_WRAPPER = path.join(__dirname, '.chrome-as-user.sh');
const POLICY_DIR = '/etc/chromium/policies/managed';
const POLICY_FILE = path.join(POLICY_DIR, 'pg-e2e.json');
const RUN_AS = process.env.RUN_AS || 'claude';
const MSG = 'FMfcgzQbfLpcDrSzVrMzmxzWkxwKmfGK';
const VERSION = require(path.join(EXT, 'manifest.json')).version;

let pass = 0;
let fail = 0;
function ok(desc, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS ' : 'FAIL ') + desc + (extra ? '  | ' + extra : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 假的 Gmail 頁面 ─────────────────────────────────────
const GMAIL_SIM = `<script>
  // 模擬 Gmail：按下時換成 data-saferedirecturl，點擊時記錄導頁
  window.__nav = [];
  document.addEventListener('mousedown', e => {
    const a = e.target.closest && e.target.closest('a');
    if (a && a.dataset.saferedirecturl) a.setAttribute('href', a.dataset.saferedirecturl);
  });
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a');
    if (a && a.getAttribute('href')) window.__nav.push(a.getAttribute('href'));
  });
</script>`;

const LINKS = `
  <p><a id="safe" href="https://www.google.com/" target="_blank">Google 首頁</a></p>
  <p><a id="phish" href="https://paypal-secure.example/login"
        data-saferedirecturl="https://www.google.com/url?q=https://paypal-secure.example/login"
        style="color:#1a73e8 !important; text-decoration:none !important">登入 PayPal</a></p>
  <p><a id="bypass" href="https://google.evil.example/url?q=https://www.google.com/">共用文件</a></p>
  <p><a id="mismatch" href="https://esun-bank.example/">www.esunbank.com.tw</a></p>
  <p><a id="img" href="https://pg-test-invoice.vercel.app/"><img alt="立即查看"
        width="120" height="30" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a></p>
  <p><a id="acme" href="https://acmecorp-payroll.example/">薪資單</a></p>`;

function page(body, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body>${body}${GMAIL_SIM}</body></html>`;
}

const PAGES = {
  main: page(`<div role="main"><div data-message-id="#msg-f:1">
      <div class="a3s aiL" id="m1">${LINKS}</div></div></div>
    <a id="outside" href="https://paypal-secure.example/ui">Gmail 介面上的連結</a>`, '信件 - Gmail'),
  // 開了信（網址有信件 ID、有 data-message-id），但找不到 .a3s：模擬 Gmail 改版
  broken: page(`<div role="main"><div data-message-id="#msg-f:2">
      <div class="new-body-class">${LINKS}</div></div></div>`, '改版後 - Gmail'),
  // 收件匣列表，沒開信
  inbox: page('<div role="main"><table><tr><td>一封信</td></tr></table></div>', '收件匣 - Gmail'),
  // 「顯示完整郵件」獨立頁面：沒有 .a3s，整頁都是信件內容
  standalone: page(`<div class="maincontent">${LINKS}</div>`, '完整郵件 - Gmail'),
};

function pickPage(u) {
  if (u.searchParams.get('view') === 'lg') return PAGES.standalone;
  return PAGES[u.searchParams.get('t') || 'main'] || PAGES.main;
}

// ── 啟動帶插件的 Chromium ──────────────────────────────
function writeWrapper() {
  // 以一般使用者身分執行 Chromium，保留它自己的沙盒
  fs.writeFileSync(CHROME_WRAPPER, '#!/bin/sh\n'
    + `exec setpriv --reuid=${RUN_AS} --regid=${RUN_AS} --init-groups `
    + `env HOME=/home/${RUN_AS} /opt/google/chrome/chrome "$@"\n`, { mode: 0o755 });
}

async function launch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-e2e-'));
  execFileSync('chown', ['-R', RUN_AS + ':' + RUN_AS, dir]);
  const requests = [];
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: CHROME_WRAPPER,
    headless: false,
    args: ['--headless=new', '--disable-extensions-except=' + EXT,
      '--load-extension=' + EXT, '--no-first-run', '--disable-gpu'],
  });
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    requests.push(u.href);
    if (u.hostname === 'mail.google.com') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pickPage(u) });
    }
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title>' });
  });
  return { ctx, dir, requests };
}

function extensionId(dir) {
  for (const f of ['Secure Preferences', 'Preferences']) {
    const p = path.join(dir, 'Default', f);
    if (!fs.existsSync(p)) continue;
    const settings = (JSON.parse(fs.readFileSync(p, 'utf8')).extensions || {}).settings || {};
    for (const [id, s] of Object.entries(settings)) if (s.path === EXT) return id;
  }
  return null;
}

const state = (pg, id) => pg.evaluate(id => {
  const a = document.getElementById(id);
  const prev = a.previousElementSibling;
  return {
    pg: a.getAttribute('data-pg'),
    href: a.getAttribute('href'),
    badge: !!(prev && prev.hasAttribute('data-pg-badge')),
    color: getComputedStyle(a).color,
  };
}, id);

const hits = (reqs, host) => reqs.filter(r => new URL(r).hostname === host).length;

async function waitFor(pg, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await pg.evaluate(fn, arg)) return true;
    await sleep(100);
  }
  return false;
}
const policyIs = v => document.documentElement.getAttribute('data-pg-policy') === v;

// ── 第一輪：沒有政策（預設值） ────────────────────────
async function roundDefault() {
  console.log('── 預設設定');
  const { ctx, dir, requests } = await launch();
  const pg = await ctx.newPage();
  const t0 = Date.now();
  await pg.goto(`https://mail.google.com/mail/u/0/?t=main#inbox/${MSG}`);
  const scanned = await waitFor(pg, () =>
    document.getElementById('safe').getAttribute('data-pg') === 'ok', null, 3000);
  ok('瀏覽器剛開的第一個分頁：不等政策就先掃完', scanned, (Date.now() - t0) + 'ms');
  ok('主控台看得到版本', await pg.evaluate(v =>
    document.documentElement.getAttribute('data-pg-version') === v, VERSION), VERSION);
  ok('政策讀取完成（這輪沒有政策）', await waitFor(pg, policyIs, 'none'));

  for (const id of ['phish', 'bypass', 'mismatch', 'img']) {
    const s = await state(pg, id);
    ok(`「${id}」被鎖住、href 已拿掉、旁邊有標籤`, s.pg === 'locked' && s.href === null && s.badge,
      JSON.stringify(s));
  }
  const ph = await state(pg, 'phish');
  ok('信件自己寫的藍色 !important 被蓋成紅色', ph.color === 'rgb(198, 40, 40)', ph.color);
  const safe = await state(pg, 'safe');
  ok('正常連結沒被鎖', safe.pg === 'ok' && safe.href === 'https://www.google.com/');
  const out = await state(pg, 'outside');
  ok('信件內文以外的 Gmail 介面連結不動', out.pg === null && out.href !== null);
  const acme = await state(pg, 'acme');
  ok('沒設公司品牌時，acmecorp-payroll 不鎖', acme.pg === 'ok');

  const before = requests.length;
  await pg.click('#phish');
  await pg.click('#phish', { button: 'middle' });
  await pg.dblclick('#phish');
  await sleep(500);
  ok('點擊、中鍵、雙擊鎖住的連結：沒有任何請求送出',
    hits(requests, 'paypal-secure.example') === 0 && requests.length === before);
  ok('Gmail 的點擊處理程式收不到事件', (await pg.evaluate(() => window.__nav.length)) === 0);
  ok('頁面沒有被導走', pg.url().includes('mail.google.com'));

  const race = await pg.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'https://paypal-verify.example/';
    a.textContent = '剛插入馬上點';
    document.querySelector('.a3s').appendChild(a);
    a.click();
    return { pg: a.getAttribute('data-pg'), href: a.getAttribute('href') };
  });
  await sleep(300);
  ok('連結插入後同一瞬間就被點：當場檢查並擋下',
    race.pg === 'locked' && race.href === null && hits(requests, 'paypal-verify.example') === 0,
    JSON.stringify(race));

  const readd = await pg.evaluate(async () => {
    const a = document.getElementById('phish');
    a.setAttribute('href', 'https://paypal-secure.example/login');
    a.click();
    await new Promise(r => setTimeout(r, 100));
    return a.getAttribute('href');
  });
  await sleep(200);
  ok('有程式把 href 加回去：馬上又被拿掉，點擊也被擋',
    readd === null && hits(requests, 'paypal-secure.example') === 0);

  await pg.evaluate(() => {
    const d = document.createElement('div');
    d.className = 'a3s';
    d.innerHTML = '<a id="late" href="https://login-paypal.example/">新信裡的連結</a>';
    document.querySelector('[role=main]').appendChild(d);
  });
  await sleep(600);
  ok('之後才載入的信件也會被掃到', (await state(pg, 'late')).pg === 'locked');

  const popup = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await pg.click('#safe');
  const np = await popup;
  await sleep(300);
  ok('正常連結點得開', np !== null && hits(requests, 'www.google.com') >= 1);
  if (np) await np.close();

  // Alt + 點擊：先取消、再確定
  let dialogs = [];
  pg.on('dialog', d => {
    dialogs.push({ type: d.type(), msg: d.message() });
    if (dialogs.length === 1) d.dismiss(); else d.accept();
  });
  await pg.click('#phish', { modifiers: ['Alt'] });
  await sleep(400);
  ok('Alt + 點擊跳出確認視窗，裡面有原因和實際網址',
    dialogs[0] && dialogs[0].type === 'confirm'
    && dialogs[0].msg.includes('paypal') && dialogs[0].msg.includes('paypal-secure.example'));
  ok('按取消：沒有送出請求', hits(requests, 'paypal-secure.example') === 0);
  const popup2 = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await pg.click('#phish', { modifiers: ['Alt'] });
  const np2 = await popup2;
  await sleep(400);
  ok('按確定：才在新分頁開啟（請求被測試攔下，沒有真的連出去）',
    np2 !== null && hits(requests, 'paypal-secure.example') === 1);
  if (np2) await np2.close();

  // 失效偵測
  const broken = await ctx.newPage();
  const inbox = await ctx.newPage();
  await Promise.all([
    broken.goto(`https://mail.google.com/mail/u/0/?t=broken#inbox/${MSG}`),
    inbox.goto('https://mail.google.com/mail/u/0/?t=inbox#inbox'),
  ]);
  await sleep(6000);
  const banner = await broken.evaluate(() => {
    const b = document.querySelector('[data-pg-banner="dom"]');
    return b ? b.textContent : null;
  });
  ok('開了信卻找不到信件內文：畫面上跳出「保護可能失效」警告', !!banner, banner || '');
  ok('只是在收件匣列表：不會誤報',
    (await inbox.evaluate(() => !document.querySelector('[data-pg-banner]'))));

  // 「顯示完整郵件」獨立頁面
  const sa = await ctx.newPage();
  await sa.goto('https://mail.google.com/mail/u/0/?ui=2&ik=x&view=lg&permmsgid=msg-f:1');
  await sleep(800);
  ok('「顯示完整郵件」頁面也會鎖', (await state(sa, 'phish')).pg === 'locked'
    && (await state(sa, 'safe')).pg === 'ok');

  const id = extensionId(dir);
  await ctx.close();
  return id;
}

// ── 第二輪：管理員政策 ────────────────────────────────
async function roundPolicy(id) {
  console.log('── 管理員政策（extension id: ' + id + '）');
  fs.mkdirSync(POLICY_DIR, { recursive: true });
  fs.writeFileSync(POLICY_FILE, JSON.stringify({ '3rdparty': { extensions: { [id]: {
    allowUserUnlock: false,
    trustedDomains: ['paypal-secure.example'],
    protectedBrands: { acmecorp: ['acmecorp.com.tw'] },
  } } } }));
  try {
    const { ctx, requests } = await launch();
    const pg = await ctx.newPage();
    await pg.goto(`https://mail.google.com/mail/u/0/?t=main#inbox/${MSG}`);
    const early = await state(pg, 'phish');
    ok('政策還沒讀到時：先用最嚴格的預設鎖住', early.pg === 'locked', JSON.stringify(early));
    ok('政策讀取完成', await waitFor(pg, policyIs, 'managed'));
    const after = await state(pg, 'phish');
    ok('政策生效後：信任網域的連結解除鎖定、href 和原本樣式都還原',
      after.pg === 'ok' && after.href === 'https://paypal-secure.example/login'
      && !after.badge && after.color === 'rgb(26, 115, 232)', JSON.stringify(after));
    ok('公司品牌仿冒被鎖', (await state(pg, 'acme')).pg === 'locked');
    const dialogs = [];
    pg.on('dialog', d => { dialogs.push(d.type()); d.accept(); });
    const popup = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
    await pg.click('#mismatch', { modifiers: ['Alt'] });
    const np = await popup;
    await sleep(300);
    ok('不允許自行解鎖：只跳提示、不能開啟',
      dialogs[0] === 'alert' && np === null && hits(requests, 'esun-bank.example') === 0,
      JSON.stringify(dialogs));
    await ctx.close();
  } finally {
    fs.rmSync(POLICY_FILE, { force: true });
  }
}

(async () => {
  writeWrapper();
  try {
    const id = await roundDefault();
    if (id) await roundPolicy(id);
    else ok('讀到插件 ID（政策測試需要）', false);
  } catch (e) {
    ok('測試執行', false, e.stack);
  } finally {
    fs.rmSync(CHROME_WRAPPER, { force: true });
  }
  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail ? 1 : 0);
})();
