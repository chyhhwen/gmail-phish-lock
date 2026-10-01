#!/usr/bin/env node
// 打包要放上 GitHub Releases 的檔案。不用安裝任何套件，Node 18 以上就能跑：
//
//   node scripts/build-release.js
//
// 產出在 dist/：
//   gmail-phish-lock-extension-v<版本>.zip   插件本體，manifest.json 在最外層
//   SHA256SUMS.txt                           讓下載的人核對檔案
//
// 同一份原始碼，不管在哪台電腦、什麼時候打包，zip 都一模一樣：
// 檔案順序、時間、權限都固定，文字檔一律換成 LF 換行，而且不壓縮
// （不受各平台 zlib 版本影響）。所以任何人都能從 tag 重新打包，
// 核對 SHA256 跟 Release 上的檔案相同。
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');

// 只打包這些類型；其他檔案一出現就停下來，避免把不該公開的東西打包進去
const TEXT = new Set(['.js', '.json', '.css', '.html']);
const BINARY = new Set(['.png']);
// 作業系統自己產生的檔案，直接略過
const JUNK = new Set(['Thumbs.db', 'desktop.ini', '.DS_Store']);

function fail(msg) {
  console.error('打包失敗：' + msg);
  process.exit(1);
}

function listFiles(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (JUNK.has(name)) continue;
    const rel = base ? base + '/' + name : name;
    const st = fs.lstatSync(path.join(dir, name));
    if (st.isSymbolicLink()) fail(rel + ' 是符號連結，不打包');
    if (st.isDirectory()) {
      out.push(...listFiles(path.join(dir, name), rel));
      continue;
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(rel)) {
      fail(rel + '：檔名請只用英文、數字和 . _ -');
    }
    const ext = path.extname(name).toLowerCase();
    if (!TEXT.has(ext) && !BINARY.has(ext)) {
      fail(rel + ' 不是插件會用到的檔案類型。'
        + '確定要打包的話，把副檔名加進 build-release.js');
    }
    out.push(rel);
  }
  return out;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

function readEntry(rel) {
  const buf = fs.readFileSync(path.join(EXT, ...rel.split('/')));
  if (!TEXT.has(path.extname(rel).toLowerCase())) return buf;
  try {
    utf8.decode(buf);
  } catch (e) {
    fail(rel + ' 不是 UTF-8 編碼（可能被存成 Big5），Chrome 會拒絕載入');
  }
  // Windows 上取出的檔案可能是 CRLF；一律換成 LF，跟 Git 裡存的一樣
  return Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

function readJson(rel, data) {
  if (data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) {
    fail(rel + ' 開頭有 BOM，Chrome 可能讀不懂。請存成「UTF-8 無 BOM」');
  }
  try {
    return JSON.parse(data.toString('utf8'));
  } catch (e) {
    return fail(rel + ' 不是有效的 JSON：' + e.message.split('\n')[0]);
  }
}

// ── 最小的 ZIP 寫入器：只用「不壓縮」，所有欄位固定 ──
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (1 << 5) | 1; // 1980-01-01，ZIP 能表示的最早日期
const FILE_MODE = (0o100644 << 16) >>> 0; // 一般檔案，rw-r--r--

function storeZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'ascii');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 解壓需要的版本 2.0
    local.writeUInt16LE(0, 6); // 旗標
    local.writeUInt16LE(0, 8); // 不壓縮
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE((3 << 8) | 20, 4); // 建立平台 Unix，版本 2.0
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // 註解
    cd.writeUInt16LE(0, 34); // 磁碟編號
    cd.writeUInt16LE(0, 36); // 內部屬性
    cd.writeUInt32LE(FILE_MODE, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

// ── 主流程 ──
if (!fs.existsSync(path.join(EXT, 'manifest.json'))) {
  fail('找不到 extension/manifest.json');
}
const entries = listFiles(EXT, '').map(rel => ({ name: rel, data: readEntry(rel) }));
const byName = new Map(entries.map(e => [e.name, e.data]));

for (const e of entries) {
  if (e.name.endsWith('.json')) readJson(e.name, e.data);
}
const manifest = readJson('manifest.json', byName.get('manifest.json'));

const version = String(manifest.version);
if (!/^\d+(\.\d+){0,3}$/.test(version)) {
  fail('manifest.json 的 version 格式不對：' + version);
}
const detect = byName.has('detect.js') ? byName.get('detect.js').toString('utf8') : '';
const m = /const VERSION = '([^']+)'/.exec(detect);
if (!m) fail('detect.js 裡找不到 VERSION');
if (m[1] !== version) {
  fail(`版本號不一致：manifest.json 是 ${version}，detect.js 是 ${m[1]}`);
}

const refs = Object.values(manifest.icons || {});
for (const cs of manifest.content_scripts || []) {
  refs.push(...(cs.js || []), ...(cs.css || []));
}
if (manifest.storage && manifest.storage.managed_schema) {
  refs.push(manifest.storage.managed_schema);
}
for (const r of refs) {
  if (!byName.has(r)) fail('manifest.json 用到 ' + r + '，但 extension/ 裡沒有這個檔案');
}

const zipName = `gmail-phish-lock-extension-v${version}.zip`;
const zip = storeZip(entries);
const sha = crypto.createHash('sha256').update(zip).digest('hex');
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, zipName), zip);
fs.writeFileSync(path.join(DIST, 'SHA256SUMS.txt'), `${sha}  ${zipName}\n`);

console.log(`版本 ${version}，共 ${entries.length} 個檔案：`);
for (const e of entries) console.log(`  ${e.name}（${e.data.length} bytes）`);
console.log(`\n產出：dist/${zipName}`);
console.log(`SHA256：${sha}`);
