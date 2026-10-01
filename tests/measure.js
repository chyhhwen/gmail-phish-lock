// 量 detect.js 的偵測率（釣魚網址）與誤判率（熱門正常網域）
// 用法：unshare -n -- node tests/measure.js
// 資料不附在套件裡，請自行放進 tests/data/（見 README「重現數字」）
// 只把網址當字串處理，不做任何連線；請在 unshare -n 裡執行。
const fs = require('fs');
const path = require('path');
const PG = require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'extension', 'detect.js')));
const D = path.join(__dirname, 'data');

function lines(f) {
  return fs.readFileSync(path.join(D, f), 'utf8')
    .split('\n').map(s => s.trim()).filter(Boolean);
}

function ruleOf(r) {
  return r.rules ? r.rules : r.reasons.map(s => s.replace(/「[^」]*」|\S+\.\S+/g, '…'));
}

function recall(name, urls) {
  let bad = 0;
  const why = {};
  const byBase = new Map();
  const misses = [];
  for (const u of urls) {
    const r = PG.check(u, '');
    let host = '';
    try { host = new URL(u).hostname; } catch (e) { /* 解析失敗 */ }
    const base = host ? PG.baseDomain(host) : u;
    if (!byBase.has(base)) byBase.set(base, false);
    if (r.bad) {
      bad++;
      byBase.set(base, true);
      for (const k of new Set(ruleOf(r))) why[k] = (why[k] || 0) + 1;
    } else misses.push(u);
  }
  const n = urls.length;
  const nb = byBase.size;
  const bb = [...byBase.values()].filter(Boolean).length;
  console.log(`\n[偵測率] ${name}`);
  console.log(`   以網址計：${bad}/${n} = ${(100 * bad / n).toFixed(1)}%`);
  console.log(`   以網域計：${bb}/${nb} = ${(100 * bb / nb).toFixed(1)}%`
    + '（同一波攻擊只算一次）');
  Object.entries(why).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`   ${String(v).padStart(6)}  ${k}`));
  return misses;
}

function fp(name, domains, showRules) {
  let bad = 0;
  const why = {};
  const ex = {};
  for (const d of domains) {
    let hit = null;
    // 清單裡本來就是子網域的，不要再硬加 www.
    const urls = ['https://' + d + '/'];
    const n = d.split('.').length;
    const plain = n === 2
      || (n === 3 && /\.(com|net|org|co|ac|or|ne|go|gov|edu)\.[a-z]{2}$/.test(d));
    if (plain) urls.push('https://www.' + d + '/');
    for (const u of urls) {
      const r = PG.check(u, '');
      if (r.bad) { hit = r; break; }
    }
    if (!hit) continue;
    bad++;
    for (const k of new Set(ruleOf(hit))) {
      why[k] = (why[k] || 0) + 1;
      (ex[k] = ex[k] || []).push(d + '  ← ' + hit.reasons.join('；'));
    }
  }
  const n = domains.length;
  console.log(`\n[誤判率] ${name}: ${bad}/${n} = ${(100 * bad / n).toFixed(2)}%`);
  Object.entries(why).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`   ${String(v).padStart(6)}  ${k}`));
  for (const k of showRules || []) {
    console.log(`   ── ${k} 的例子`);
    (ex[k] || []).slice(0, 60).forEach(e => console.log('     ' + e));
  }
}

const show = (process.argv[3] || '').split(',').filter(Boolean);
const op = lines('openphish.txt');
const pdb = lines('pdb_active.txt');
const top = lines('top100k.txt');
const odns = lines('opendns_top.txt');

recall('OpenPhish 目前清單（300 筆）', op);
recall('Phishing.Database ACTIVE 抽樣（59,215 筆）', pdb);
fp('Alexa 前 10 萬網域（2016）', top, show);
fp('OpenDNS 前 1 萬網域', odns, show);
