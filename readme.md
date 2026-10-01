# 釣魚連結鎖 for Gmail v0.2.1

把 Gmail 信件裡的可疑連結鎖住並標成紅色。所有判斷都在瀏覽器裡完成，不連網、不送出任何資料。非 Google 官方產品。

它是防釣魚的**最後一層**：只看連結本身，只在電腦版 Chrome 有效。安全金鑰、Gmail 伺服器端過濾、Safe Browsing 這些前面的防線還是要做。

## 資料夾

| 路徑 | 內容 |
|---|---|
| `extension/` | 插件本體，Chrome 載入這個資料夾 |
| `store-listing/` | 上架素材與步驟，從 `PUBLISH.md` 開始看 |
| `tests/unit.js` | 判斷規則的單元測試 |
| `tests/e2e.js`、`tests/run-e2e.sh` | 用真的 Chromium 對假 Gmail 頁面實際點擊 |
| `tests/measure.js` | 量偵測率與誤判率（資料不附，見「重現數字」） |

## v0.2.1

- 加上圖示，名稱改成「釣魚連結鎖 for Gmail」，避免被誤認為 Google 官方產品
- 新增 `store-listing/`：上架用的圖片、隱私權政策、商店文字與步驟
- 判斷邏輯與 v0.2.0 相同

## v0.1 → v0.2 修了什麼

安全審查找到的問題：

| 嚴重度 | 問題 | 修法 |
|---|---|---|
| 高 | **轉址繞過**：`google.evil.example/url?q=https://www.google.com/` 會被放行，因為只檢查了參數裡的網址 | 只拆開真正的 Google／YouTube／Facebook／Outlook 轉址，外層和內層都檢查 |
| 高 | **默默失效**：Gmail 改版、`.a3s` 不見時，什麼都不鎖也沒人知道 | 開了信卻找不到信件內文，5 秒後畫面左下角跳出紅色警告 |
| 高 | 判斷程式出錯時的「一律鎖住」本身也會出錯 | 錯誤處理改成絕不再丟錯，出錯就鎖 |
| 中 | 連結剛出現就被點，會搶在掃描之前 | 點擊當下補檢查；攔截改在 `window` 捕獲階段、頁面載入最早時註冊 |
| 中 | 網頁程式把 `href` 加回去，連結又能點 | 盯著 `href` 變化，加回去就立刻拿掉 |
| 中 | 連結文字用全形句點、零寬字元、方向控制字元，就能躲過「文字和網址不同」 | 先正規化文字；網址前後有其他字也抓得到 |
| 中 | 信件自己的 CSS 可以把紅色蓋回藍色 | 用行內 `!important` 上色，旁邊另外插一個標籤 |
| 中 | 超過 102KB 被截斷的信，按「顯示完整郵件」開的獨立頁面不會被掃 | `?view=` 頁面整頁都掃 |
| 低 | `paypai`、`micros0ft`、`robiox` 這類換字抓不到；`google.co.jp` 被誤鎖 | 字形骨架比對、差一個字比對；品牌國碼網域算官方 |

新增的偵測規則，都用下方的真實資料量過才加：

| 規則代號 | 抓什麼 |
|---|---|
| `freehost` | 免費架站平台的子網域（vercel.app、pages.dev、github.io…）、雲端空間上的網頁檔、IPFS |
| `tld` | 常被拿來做釣魚的網域結尾（.top、.xyz、.icu…） |
| `fakedomain` | 夾在前面的假網域：`paypal.com.evil.xyz`、`apple.com-verify.info`、`mvdis-gov-tw.cc` |
| `lure` | 註冊網域名稱帶 `login`、`account`、`verify` 這類字 |

## 實測數字

測試都在沒有網路的沙盒裡跑，釣魚網址只當字串比對，沒有連過去。

| | v0.1 | v0.2 |
|---|---|---|
| **偵測率**：OpenPhish 公開清單（2026-09-30，300 筆） | 0.7% | **49.0%** |
| 　同上，扣掉同一波攻擊的 108 筆 | — | 76.0% |
| **偵測率**：Phishing.Database ACTIVE 抽樣（59,215 筆） | 20.7% | **47.4%** |
| **誤判率**：Alexa 前 10 萬網域（2016） | 0.31% | 0.57% |
| **誤判率**：OpenDNS 前 1 萬網域 | 0.96% | 0.25% |

**沒辦法量到的部分：**

- 正常網域清單是 2016 年的，.app、.shop 這類較新的網域結尾在當時還很少，所以 `tld` 規則的誤判可能被低估。
- 「電子報追蹤連結」的誤判沒辦法量，因為手上沒有正常商務信件的資料。這類信常見文字寫 `www.某某.com`、實際卻連到 `click.mailchimp.com`。
- 抓不到的大多是**被入侵的正常網站**、**全新註冊的普通網域**，以及 Google 協作平台、Google 表單上的釣魚頁。這些只能靠 Safe Browsing、DNS 過濾這類有即時情資的防線。

## 自己先試

1. Chrome 網址列打 `chrome://extensions`
2. 打開右上角的「開發人員模式」
3. 按「載入未封裝項目」，選 **`extension`** 資料夾（不是外層資料夾）
4. 重新整理 Gmail

## 部署給全公司

用 Google 管理控制台強制安裝，同仁就不能停用或移除。完整步驟與要貼的文字在 `store-listing/PUBLISH.md`，大致流程：

1. **上架**：用公司網域的帳號，在 Chrome 線上應用程式商店把插件發佈成**只限自己網域**的私人項目。上架後會拿到正式的插件 ID，之後的政策都要用這個 ID。
2. **強制安裝**：管理控制台 → 裝置 → Chrome → 應用程式和擴充功能 → 使用者和瀏覽器 → 選插件 → 安裝政策選「強制安裝」。
3. **設定政策**：同一個畫面的「Policy for extensions」欄位貼 JSON（見下一節）。

## 管理員政策

| 設定 | 說明 | 未設定時 |
|---|---|---|
| `allowUserUnlock` | `false`：同仁不能自行開啟被鎖的連結，只能找 IT | `true`：按住 Alt 點擊、確認後可開啟 |
| `trustedDomains` | 這些網域（含子網域）的連結不鎖 | 無 |
| `protectedBrands` | 品牌名稱對應官方網域，冒用就鎖。**建議放公司自己和往來銀行** | 只有內建的國際品牌 |
| `disabledRules` | 關掉某些規則，代號見上表與 `extension/schema.json` | 全部開啟 |

管理控制台的「Policy for extensions」欄位，**每個值都要包一層 `{"Value": …}`**。少了這層，政策會默默不生效：

```json
{
  "allowUserUnlock": { "Value": false },
  "trustedDomains": { "Value": ["acmecorp.com.tw"] },
  "protectedBrands": {
    "Value": { "acmecorp": ["acmecorp.com.tw", "acmecorp.com"] }
  }
}
```

用 Windows 群組原則、Jamf 這類 MDM 設定時，值**不要**包 `{"Value": …}`。

政策在瀏覽器執行中更新也會生效。已經判斷過的連結會全部重新判斷，不用重開瀏覽器。

## 驗證：部署之後、全面啟用之前

在一位同仁的電腦上照順序檢查，每一步都要對才往下走。

**1. 政策有沒有送到瀏覽器**

打開 `chrome://policy`，在插件的區塊看到你設的值，狀態為「OK」。

**2. 插件有沒有在跑、政策有沒有吃進去**

在 Gmail 分頁按 F12 開 Console，逐行貼上：

```
document.documentElement.dataset.pgVersion
document.documentElement.dataset.pgPolicy
```

第一行必須印出 `'0.2.1'`，第二行必須印出 `'managed'`。

如果第二行是 `'none'`，代表插件沒收到政策，通常是少了 `{"Value": …}`。如果是 `'loading'`，等幾秒再試一次。

**3. 實際效果**

寄一封信給自己，內文放這行：

```
https://paypal-secure.example/login
```

`.example` 是保留網域，網路上不存在，點到也不會連到任何地方。打開信之後：

- 連結要變紅、前面有「🔒 可疑連結已鎖住」標籤
- 點下去沒有反應
- 如果設了 `allowUserUnlock: false`，按住 Alt 點擊只會跳出提示，不能開啟
- 畫面左下角**不應該**出現紅色警告。如果出現，代表這台電腦上的 Gmail 版面跟插件認得的不同，請回報

## 測試

**所有測試一律在沙盒裡跑**：沒有網路的 namespace（`unshare -n`）或斷網的容器。

```
unshare -n -- node tests/unit.js
sh tests/run-e2e.sh
```

`run-e2e.sh` 需要 root、Chromium、`playwright-core` 和 `setpriv`。它的做法是：

- Chromium 以一般使用者身分執行，保留它自己的沙盒
- 所有請求都被攔下，由測試程式回應假頁面
- 測試用的政策檔寫在 `/etc/chromium/policies/managed/`，跑完就刪掉

## 重現數字

`tests/measure.js` 會讀 `tests/data/` 底下的檔案。資料不附在套件裡，因為裡面是還在運作的釣魚網址。要重現時請在沙盒裡下載：

| 檔名 | 來源 |
|---|---|
| `openphish.txt` | github.com/openphish/public_feed 的 `feed.txt` |
| `pdb_active.txt` | github.com/Phishing-Database/Phishing.Database 的 `phishing-links-ACTIVE/phishing-links-ACTIVE1.txt` |
| `top100k.txt` | github.com/zer0h/top-1000000-domains 的 `top-100000-domains` |
| `opendns_top.txt` | github.com/opendns/public-domain-lists 的 `opendns-top-domains.txt` |

```
unshare -n -- node tests/measure.js
```

## 已知限制

- 只在電腦版 Chrome 有效，手機 Gmail App 完全沒有保護。
- 依賴 Gmail 的 `.a3s` 版面。改版時會跳警告，但警告本身靠「網址裡的信件 ID」或 `data-message-id` 判斷有沒有開信；這兩個也一起改掉的話，就會默默失效。
- 附件裡的連結、圖片裡的 QR code 都看不到。
- 真的 Gmail 頁面沒有在沙盒裡測過，只測了模擬頁面。請務必照「驗證」一節在真實環境確認。
