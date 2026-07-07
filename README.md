<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/62242bc5-572a-46a2-a27c-b7e3733800e5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## DMAIC3 失效調查系統（`DMAIC3.html`）

`DMAIC3.html` 是一個獨立、可離線開啟的單檔應用（不需建置、不需 API 金鑰即可以模擬模式運行），
整合 DMAIC2 的調查工作流骨幹與 DMAIC 的實用元件，重新設計為 8 階段可追溯流程：

問題定義 → 動態問卷 → AI 互動調查 → 證據彙整（內部＋510k/MAUDE/ISO/文獻）→
魚骨圖與根因（8 因子＋信心度）→ 風險排序（FMEA/RPN）→ 驗證計畫（假設↔失效↔風險）→ 可追溯報告。

設計原則：單一 `STATE` 貫穿全流程（脈絡保存）、每個結論標示信心度與證據來源（可追溯）、
資訊不足時明確標記「待釐清」而非臆測（不編造）。

### 兩種執行模式

- **模擬模式（🟡）**：用瀏覽器直接開啟 `DMAIC3.html`（免建置、免金鑰）。AI 追問、因子辨識、
  摘要與報告結論皆由內建規則引擎產生，離線可用。
- **AI 連線模式（🟢）**：`npm run dev` 後開啟 <http://localhost:3000/DMAIC3.html>（需設定 `GEMINI_API_KEY`）。
  調查收斂摘要、根因工程佐證、報告結論改由後端 `/api/dmaic`（`server.ts`）的模型產生工程級推理；
  連線失敗時自動退回模擬模式。

無論哪種模式，**問卷選項與魚骨因子的選擇都由規則引擎決定**（保證每個發現 1:1 對應到可追溯的因子選項），
模型僅負責敘述性推理與佐證，不改動結構化結論，避免破壞追溯鏈。
