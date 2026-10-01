#!/bin/sh
# 在沒有網路的 namespace 裡跑端對端測試。
# 需要 root（建立 namespace、寫測試用的 Chromium 政策檔）。
set -e
cd "$(dirname "$0")/.."
command -v setpriv >/dev/null
exec unshare -n -- env \
  PLAYWRIGHT="${PLAYWRIGHT:-playwright-core}" \
  node tests/e2e.js
