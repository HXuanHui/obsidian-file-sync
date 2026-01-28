# Obsidian File Sync Plugin

> [English](README.md) | 繁體中文

一個用於將 Obsidian vault 中的檔案同步到指定目錄的插件。支援所有檔案類型、檔案篩選和批次選擇功能。

## 功能特色

- 目的地設定：指定檔案要被複製的目標目錄（支援資料夾選擇器）
- 檔案選擇：使用勾選框選擇需要同步的檔案
- 手動儲存：新增「Save」按鈕，避免每次勾選都重新渲染介面
- 記憶選擇：插件會記住已儲存的檔案選擇
- 檔案類型篩選：可按檔案類型（.md, .png, .pdf 等）篩選
- 智慧批次選擇：
  - 統合切換按鈕 - 未全選時顯示「Select All」，全選後顯示「Deselect All」
- 資料夾管理：
  - 樹狀結構顯示 - 子資料夾顯示在父資料夾下方並自動縮排
  - 可折疊/展開資料夾
  - 智慧切換按鈕 - 根據當前狀態顯示「Expand」或「Collapse」
  - 資料夾層級勾選框 - 一鍵選擇整個資料夾（含子資料夾）內的所有檔案
  - 支援 indeterminate 狀態（部分檔案被選擇時）
- 手動儲存：新增「Save」按鈕於畫面下方，避免每次勾選都重新渲染介面
- 滾動位置保持：重新渲染時自動恢復滾動位置，不會跳回頂部
- 記憶選擇：插件會記住已儲存的檔案選擇
- 保持結構：同步時維持原有的資料夾結構
- 支援所有檔案類型：.md, .png, .jpg, .pdf, .txt, .docx, .xlsx 等
- 錯誤記錄：同步錯誤會記錄到插件資料夾的 `sync-errors.log` 檔案

## 安裝方式

### 方法一：手動安裝

1. 在您的 vault 中找到 `.obsidian/plugins/` 資料夾
2. 建立一個名為 `file-sync-plugin` 的資料夾
3. 將以下檔案複製到該資料夾中：
   - `main.js`
   - `manifest.json`
   - `styles.css`
4. 重新啟動 Obsidian
5. 前往「設定」→「社區插件」→ 確保「安全模式」已關閉
6. 在「已安裝插件」列表中啟用「File Sync Plugin」

### 方法二：從原始碼編譯

```bash
# 進入插件目錄
cd obsidian-file-sync-plugin

# 安裝相依套件
npm install

# 編譯插件
npm run build

# 編譯後的檔案會在根目錄產生 main.js
```

或者，從 [Release 頁面](https://github.com/HXuanHui/obsidian-file-sync-plugin/releases) 下載安裝插件。

## 使用方式

### 1. 設定目的地路徑

1. 開啟「設定」→「File Sync Plugin」
2. 在「Destination Path」輸入目標目錄路徑，或點擊「Browse」按鈕選擇資料夾
   - 例如：`D:\文件\destination` 或 `C:\Backup\notes`

### 2. 選擇要同步的檔案

1. 使用「File Type Filter」下拉選單篩選檔案類型
   - 選項：All Files, .md, .png, .jpg, .pdf, .txt
2. 資料夾操作：
   - 檔案以樹狀結構顯示，子資料夾會縮排在父資料夾下方
   - 點擊資料夾名稱旁的箭頭圖示（▶/▼）可折疊/展開個別資料夾
   - 使用智慧切換按鈕快速管理所有資料夾：
     - 當大部分資料夾展開時，顯示「Collapse」
     - 當大部分資料夾收合時，顯示「Expand」
   - 勾選資料夾旁的勾選框可選擇該資料夾及所有子資料夾內的檔案
   - 資料夾勾選框支援三種狀態：
     - 勾選：所有檔案都被選擇
     - 未勾選：沒有檔案被選擇
     - 半勾選（indeterminate）：部分檔案被選擇
3. 使用勾選框選擇個別檔案
4. 或使用智慧批次選擇按鈕：
   - 未全選時顯示「Select All」- 選擇所有符合篩選的檔案
   - 全選後顯示「Deselect All」- 清除所有選擇
5. **點擊畫面下方的「Save」按鈕儲存您的選擇**
   - 按鈕會在有未儲存變更時高亮顯示
   - 檔案計數會顯示「(unsaved changes)」提示
   - 重新渲染時會自動保持滾動位置，不會跳回頂部

### 3. 執行同步

點擊左側邊欄的 Sync 圖示即可執行同步。

插件會：
- 驗證目的地路徑是否存在
- 複製已儲存選擇的檔案到目的地
- 維持原有的資料夾結構
- 顯示同步進度和結果通知
- 如有錯誤，記錄到 `sync-errors.log` 檔案

## 錯誤記錄

同步過程中的錯誤會記錄在插件資料夾的 `sync-errors.log` 檔案中，位置為：
```
<你的 vault>/.obsidian/plugins/file-sync-plugin/sync-errors.log
```

每次同步會附加時間戳記和錯誤詳情。

## 注意事項

- 此插件僅支援桌面版 Obsidian（需要檔案系統存取權限）
- 請確保目的地路徑有足夠的儲存空間
- 同步會覆蓋目的地的同名檔案
- 支援包含中文字元的檔案名稱和路徑
- 記得點擊「Save」按鈕儲存檔案選擇，否則不會執行同步

## 技術細節

- **開發語言**：TypeScript
- **建置工具**：esbuild
- **最低 Obsidian 版本**：0.15.0
- **作者**：HXuanHui

## 開發

```bash
# 開發模式（自動重新編譯）
npm run dev

# 建置生產版本
npm run build

# Lint 檢查
npm run lint
```

## 授權

此插件基於 Obsidian Sample Plugin 開發。

## 問題回報

如有問題或建議，請在 GitHub 建立 Issue。

## 截圖

（未來可新增設定介面截圖）

## 更新日誌

### v1.0.0
- 初始版本發布
- 支援檔案篩選和批次選擇
- 樹狀結構顯示資料夾層級
- 可折疊資料夾與資料夾層級勾選（含子資料夾）
- 智慧切換按鈕（Select All/Deselect All、Expand/Collapse）
- Save 按鈕位於畫面下方
- 手動儲存模式避免介面閃爍
- 滾動位置保持功能
- 錯誤記錄功能
