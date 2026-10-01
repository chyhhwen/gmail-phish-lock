// 單元測試：只把網址當字串判斷，不連網。
// 執行：unshare -n -- node tests/unit.js
const PG = require('../extension/detect.js');

let fail = 0;
let n = 0;
function t(desc, href, text, want, cfg) {
  PG.configure(cfg || {});
  const r = PG.check(href, text);
  n++;
  const ok = r.bad === want;
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + (r.bad ? '鎖' : '--') + ' '
    + desc + (r.reasons.length ? '  | ' + r.reasons.join('；') : ''));
}

console.log('── 正常連結要放行');
t('PayPal 官方', 'https://www.paypal.com/signin', '登入', false);
t('Google 台灣', 'https://www.google.com.tw/search?q=a', '搜尋', false);
t('Google 日本（國碼）', 'https://www.google.co.jp/', 'Google', false);
t('Google 自己的頂級網域', 'https://blog.google/products/', '部落格', false);
t('微軟登入', 'https://login.microsoftonline.com/', '登入', false);
t('公司 SharePoint', 'https://contoso.sharepoint.com/sites/hr', '人事', false);
t('Amazon 德國', 'https://www.amazon.de/', 'Amazon', false);
t('Blogger 圖片 CDN', 'https://1.bp.blogspot.com/a.jpg', '圖', false);
t('Squarespace 客服', 'https://support.squarespace.com/', '說明', false);
t('名字像 apple 的餐廳', 'https://www.applebees.com/', '菜單', false);
t('S3 上的 PDF', 'https://b.s3.amazonaws.com/report.pdf', '報告', false);
t('文字與網址同網域', 'https://shop.example.com/x', 'https://shop.example.com', false);
t('文字是子網域', 'https://news.example.com.tw/a', 'example.com.tw', false);
t('文字是檔名 pdf', 'https://drive.google.com/file/1', 'report.pdf', false);
t('文字是 Node.js', 'https://nodejs.org/', 'Node.js', false);
t('文字是 logo.ai', 'https://drive.google.com/file/2', 'logo.ai', false);
t('mailto', 'mailto:a@b.com', 'a@b.com', false);
t('Gmail 自己', 'https://mail.google.com/mail/u/0/#inbox', '收件匣', false);
t('政府網站', 'https://www.mvdis.gov.tw/', '監理服務網', false);
t('日本 so-net', 'https://www.so-net.ne.jp/', 'So-net', false);
t('Google 轉址到正常網站', 'https://www.google.com/url?q=https://example.com/', 'x', false);

console.log('── 釣魚連結要鎖');
t('品牌冒用', 'https://paypal-secure.example/login', '立即驗證', true);
t('品牌拆成連字號', 'https://ll-pay-pal-i.example/', '點此', true);
t('換字 paypa1', 'https://paypa1.example/', '點此', true);
t('換字 micros0ft', 'https://micros0ft-support.example/', '重設密碼', true);
t('i 換成 l：robiox', 'https://www.robiox.example/games/1', '遊戲', true);
t('差一個字 netfliix', 'https://netfliix.example/', '帳號', true);
t('IP 位址', 'http://192.168.10.5/login', '登入', true);
t('十進位 IP', 'http://3232238085/login', '登入', true);
t('西里爾字母 а', 'https://аpple.example/id', 'Apple ID', true);
t('@ 偽裝', 'https://www.google.com@evil.example/', '文件', true);
t('.zip 跟除號斜線', 'https://github.com∕k8s∕archive∕@v1.zip', '下載', true);
t('短網址', 'https://bit.ly/3abc', '查看包裹', true);
t('javascript:', 'javascript:alert(1)', '點我', true);
t('data:', 'data:text/html,<h1>x</h1>', '點我', true);
t('免費平台 vercel', 'https://pg-test-account.vercel.app/', '驗證', true);
t('免費平台 pages.dev', 'https://pg-test.pages.dev/b', '文件', true);
t('雲端空間上的網頁', 'https://b.s3.us-east-2.amazonaws.com/x.html', '文件', true);
t('Firebase 空間上的網頁',
  'https://firebasestorage.googleapis.com/v0/b/x/o/login.html?alt=media', '登入', true);
t('IPFS', 'https://ipfs.io/ipfs/bafy123/index.html', '文件', true);
t('網頁分享服務', 'https://paste.page/abc', '文件', true);
t('高風險結尾 .top', 'https://pg-test-notice.top/', '包裹', true);
t('假網域夾在前面', 'https://paypal.com.evil-site.example/', '登入', true);
t('com- 開頭', 'https://www.apple.com-verify.example/', '登入', true);
t('冒充 .gov.tw', 'https://mvdis-gov-tw.example/fine', '罰單', true);
t('冒充 .gov.in', 'https://dc.pg-test.gov.in.example.lol/crs', '證書', true);
t('假登入字眼', 'https://macro-login.example/', '登入', true);
t('xxx-account', 'https://steam-account.example/', '帳號', true);

console.log('── 轉址');
t('外層是假 Google（審查找到的漏洞）',
  'https://google.evil.example/url?q=https://www.google.com/', '點此', true);
t('Google 轉址到釣魚站', 'https://www.google.com/url?q=https://paypal-verify.example', 'x', true);
t('Google AMP 轉址到釣魚站', 'https://www.google.com/amp/s/paypal-verify.top/', 'x', true);
t('Facebook 轉址到釣魚站', 'https://l.facebook.com/l.php?u=https://bit.ly/x', 'x', true);

console.log('── 文字顯示的網址跟實際不同');
t('一般', 'https://esun-login.example/', 'www.esunbank.com.tw', true);
t('文字前後有字', 'https://esun-login.example/', '請登入 https://www.esunbank.com.tw 查看', true);
t('全形句點', 'https://esun-login.example/', 'www．esunbank．com．tw', true);
t('中文句號', 'https://esun-login.example/', 'www。esunbank。com。tw', true);
t('夾零寬字元', 'https://esun-login.example/', 'www.esun​bank.com.tw', true);
t('夾方向控制字元', 'https://esun-login.example/', 'www.esunbank.com.tw‎', true);
t('全形英文字', 'https://esun-login.example/', 'ｗｗｗ.ｅｓｕｎｂａｎｋ.ｃｏｍ.ｔｗ', true);

console.log('── 管理員政策');
t('信任網域：短網址放行', 'https://bit.ly/3abc', '看這裡', false,
  { trustedDomains: ['bit.ly'] });
t('信任網域：不影響 @ 偽裝', 'https://bit.ly@evil.example/', '看這裡', true,
  { trustedDomains: ['bit.ly'] });
t('保護公司品牌', 'https://acmecorp-hr.example/', '薪資單', true,
  { protectedBrands: { acmecorp: ['acmecorp.com.tw'] } });
t('公司品牌仿冒', 'https://acrnecorp.example/', '薪資單', true,
  { protectedBrands: { acmecorp: ['acmecorp.com.tw'] } });
t('公司官方網域放行', 'https://hr.acmecorp.com.tw/', '薪資單', false,
  { protectedBrands: { acmecorp: ['acmecorp.com.tw'] } });
t('管理員品牌名撞到一般結尾，不能當官方', 'https://pg-test.shop/', '買', true,
  { protectedBrands: { shop: ['shop.com.tw'] } });
t('關掉短網址規則', 'https://bit.ly/3abc', '看這裡', false,
  { disabledRules: ['shortener'] });

console.log('── 出錯時一律鎖住');
t('href 不是字串', { toString() { throw new Error('x'); } }, '點', true);

PG.configure({});
console.log(`\n${n - fail}/${n} 通過`);
process.exit(fail ? 1 : 0);
