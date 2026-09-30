# Gmail 釣魚連結鎖

Chrome 擴充功能（Manifest V3）。把 Gmail 信件裡的可疑連結鎖住並標成紅色，點了也不會開。
所有判斷都在本機進行，不連網、不送出任何資料。

## 運作方式

- 只掃信件內文（`.a3s`）裡的連結；「顯示完整郵件」「列印」等 `?view=` 獨立頁面則整頁都掃。
- 可疑連結會被拿掉 `href`、`data-saferedirecturl`、`target`、`ping`，加上紅框、波浪底線，前面插一個「🔒 可疑連結已鎖住」標籤；滑鼠移上去可看到原因與實際網址。
- 點擊在 `window` 的捕獲階段攔截，比 Gmail 自己的處理更早；尚未掃到或 `href` 被改過的連結會在點擊當下補檢查。
- 會拆開已知的轉址（Google `/url`、Google AMP、YouTube `/redirect`、Facebook `l.php`、Outlook Safe Links），外層與目的地都檢查。
- 判斷程式出錯時一律鎖住，不放行。
- 開了信卻找不到信件內文超過 5 秒（可能是 Gmail 改版），或判斷程式沒載入，畫面左下角會跳出紅色警告。

### 解鎖

按住 **Alt** 點擊被鎖的連結：

- 政策允許自行解鎖（預設）：跳出確認視窗，確定後在新分頁開啟實際網址。
- 政策不允許：只顯示原因與網址，請使用者聯絡 IT。

政策讀取完成前，一律視為「不允許解鎖」。

## 判斷規則

| 代號 | 說明 |
|---|---|
| `scheme` | 不是 http/https 連結，或網址格式異常（`mailto:`、`tel:` 不鎖） |
| `userinfo` | 網址用 `@` 偽裝，例如 `https://paypal.com@evil.xyz` |
| `ip` | 直接連 IP 位址 |
| `idn` | 網域含非英文字元（`xn--`，可能是仿冒字形） |
| `shortener` | 短網址（bit.ly、reurl.cc、lihi.cc…） |
| `freehost` | 免費架站平台的使用者子網域、網頁分享服務、雲端儲存上的網頁檔、IPFS |
| `tld` | 常被濫用的網域結尾（.top、.xyz、.icu、.zip…） |
| `fakedomain` | 網址裡夾了假網域，例如 `paypal.com.evil.xyz`、`post-gov-tw.top` |
| `lure` | 網域名稱帶 login、verify、account 等假登入頁常見的字 |
| `brand` | 網址冒用或仿冒知名品牌（含 0→o、rn→m 等形近字、差一個字），但不是官方網域 |
| `mismatch` | 連結文字顯示的網域和實際前往的網域不同 |

內建名單（品牌、短網址、免費平台、網域結尾等）都放在 `detect.js` 最上方，改名單不用動判斷邏輯。

## 安裝

1. 開啟 `chrome://extensions`，打開右上角「開發人員模式」。
2. 按「載入未封裝項目」，選這個資料夾。
3. 重新整理 Gmail。

企業大量部署請打包後透過 Chrome 政策（`ExtensionInstallForcelist`）強制安裝。

## 管理員政策

透過 `chrome.storage.managed` 設定，欄位定義見 `schema.json`。政策更新後，已經判斷過的連結會全部重新判斷。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `allowUserUnlock` | boolean | 是否允許使用者按 Alt 點擊自行開啟。未設定視為 `true` |
| `trustedDomains` | string[] | 信任的網域（含子網域），這些連結不會被鎖。`userinfo` 規則仍會檢查 |
| `protectedBrands` | object | 自訂要保護的品牌 → 官方網域，例如 `{"acme": ["acme.com.tw"]}` |
| `disabledRules` | string[] | 要關閉的規則代號（見上表） |

範例：

```json
{
  "allowUserUnlock": false,
  "trustedDomains": ["company.com.tw"],
  "protectedBrands": { "company": ["company.com.tw", "company.com"] },
  "disabledRules": ["tld"]
}
```

Windows 可寫在登錄檔
`HKLM\Software\Policies\Google\Chrome\3rdparty\extensions\<擴充功能 ID>\policy`
下，或用 GPO / Google 管理控制台派送。

## 確認是否生效

在 Gmail 頁面的開發者工具主控台執行：

```js
document.documentElement.dataset.pgVersion  // 版本號；'error' 表示判斷程式沒載入
document.documentElement.dataset.pgPolicy   // 'loading' | 'managed' | 'none'
```

被鎖的連結帶有 `data-pg="locked"`，原因在 `data-pg-why`。

## 測試

`detect.js` 是純函式，不碰 DOM，可以直接用 Node 測：

```js
const PG = require('./detect.js');
PG.check('https://paypal.com.evil.xyz/login', '點此登入');
// { bad: true, reasons: [...], rules: ['tld', 'fakedomain', 'brand'], ... }
```

## 檔案

| 檔案 | 用途 |
|---|---|
| `manifest.json` | 擴充功能設定 |
| `detect.js` | 判斷連結是否可疑（純函式、內建名單） |
| `content.js` | 掃描 Gmail DOM、鎖連結、攔截點擊、讀政策、失效警告 |
| `styles.css` | 被鎖連結的備援樣式 |
| `schema.json` | 管理員政策欄位定義 |

