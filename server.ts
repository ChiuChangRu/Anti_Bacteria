import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API endpoint for generating tailored documents and consulting
app.post("/api/generate", async (req, res) => {
  try {
    const { type, catheterMaterial, coatingType, artificialUrineFormula, bacterialStrain, flowRate, institution, extraNotes, prompt, history } = req.body;

    let systemInstruction = "";
    let userPrompt = "";

    if (type === "protocol") {
      systemInstruction = "You are an expert bio-medical engineer specialized in urological medical devices and dynamic bladder models (in vitro bladder models). Write in professional Traditional Chinese (Taiwan, 繁體中文). Format the output with clear Markdown headers, tables, and lists. Use scientific terms accurately.";
      userPrompt = `請為一個新型導尿管，設計一份「抗結痂 (anti-encrustation) 動態人工膀胱模型 (Dynamic Bladder Model)」的測試協議 (Protocol)。
這份協議應參考國際事實標準 McCoy 團隊 (Queen's University Belfast) 與 University of Dundee 的研究協議。

【基本參數資訊】：
1. 導尿管基底材質: ${catheterMaterial || "Silicone 或 Latex"}
2. 表面改質或塗層設計: ${coatingType || "親水性/抗菌塗層/無"}
3. 人工尿液配方類型: ${artificialUrineFormula || "標準高鈣鎂離子配方 (含高濃度 Urea, Calcium, Magnesium)"}
4. 菌株選擇: ${bacterialStrain || "Proteus mirabilis (奇異變形桿菌) ATCC 29213 / ATCC 49565"}
5. 尿液流速: ${flowRate || "0.5 mL/min"}
6. 額外補充說明或測試指標需求: ${extraNotes || "無特殊備註"}

請提供一份結構完整的實驗協議草案，包含以下章節：
- **一、測試目的與學術背景說明** (提及 Proteus mirabilis 產生 urease 分解尿素釋放氨, 使 pH 上升, 誘發 struvite 與 apatite 結晶之機理，以及為何選擇此動態模型)
- **二、人工尿液配方調配比例與配料表** (請列出詳細的化學成分如 Urea, CaCl2, MgSO4, Na2HPO4, NaCl 等及其目標濃度)
- **三、動態人工膀胱裝置示意架構與管路設定** (包含儲液瓶、蠕動幫浦、溫控37度腔體、導尿管插植、廢液收集與流速控制)
- **四、試驗執行步驟** (接種菌液、開始流速、定時pH監測、終點判讀與取樣)
- **五、判讀指標與對照組設定** (Mean time to blockage 阻塞時間、結晶乾燥重量、SEM表面分析等，必須明列與上市對照組如 Arrow 或傳統導管之比較)`;
    } else if (type === "letter") {
      systemInstruction = "You are a professional medical device R&D executive. Write a formal outsourcing inquiry letter (委外測試詢問信) in Traditional Chinese (Taiwan, 繁體中文) directed to Taiwanese research labs (such as PIDC, ITRI, SGS, or University Urology labs). Use an expert, respectful, and clear business tone.";
      userPrompt = `請撰寫一封發送給台灣檢測機構【${institution || "塑膠中心生醫驗證部 / 工研院生醫所"}】的「抗結痂動態測試委外客製化開發詢問信」。

【相關背景資訊】：
- 我們的研發醫材：${catheterMaterial || "新型高分子"} 導尿管，表面採用了 ${coatingType || "專利抗結痂改質技術"}。
- 我們希望進行的測試核心：
  1. 動態人工膀胱模型 (模擬 Proteus mirabilis 感染導致尿液鹼化與鈣鎂結晶 struvite/apatite 沉積)。
  2. 評估指標：導尿管阻塞時間 (Time to blockage)、管腔內結晶量、表面細菌貼附度。
  3. 測試條件：人工尿液配方、流速約為 ${flowRate || "0.5"} mL/min、菌株為 ${bacterialStrain || "Proteus mirabilis"}。
- 委託目的：由於該檢測非標準 ISO 項目，希望與機構討論「客製化委託測試」或「共同開發測試平台」的可能性。
- 額外註記：${extraNotes || "無"}

請生成一封格式完整、專業得體且排版精美的委外詢問信。信件中應明確提出：
- 說明我們的產品與抗結痂特色
- 說明本案需要的動態膀胱結晶模型規格與文獻來源 (如 McCoy / Dundee 團隊發表的方法)
- 列出具體詢問事項 (1. 貴處是否具備類似的動態流動培養設備或蠕動幫浦系統？ 2. 若由我們提供人工尿液配方與操作 SOP，貴處是否能承接客製委託？ 3. 預估的時程與費用估算流程？ 4. 是否需簽署 NDA？)
- 留下專業、有禮的結尾。`;
    } else if (type === "regulatory") {
      systemInstruction = "You are an experienced regulatory affairs (RA) consultant specializing in TFDA (Taiwan FDA) and US FDA medical device clearance for urological catheters and antimicrobials. Write in professional Traditional Chinese (Taiwan, 繁體中文). Do not use placeholders, be specific, detailed, and structured.";
      userPrompt = `請撰寫一份針對「抗結痂/抗菌塗層導尿管」送件 TFDA（台灣食藥署）與 US FDA 的法規送件與臨床前測試策略分析。

【醫材規格與設計】：
- 基材材質：${catheterMaterial || "Silicone/Latex"}
- 塗層/改質原理：${coatingType || "抗結痂技術"}
- 預期用途：降低長期留置導尿管之尿道結痂結晶與阻塞風險

請提供專業的策略指引，包含以下章節：
- **一、TFDA 與 US FDA 管理分類級別判定** (說明此類有塗層或特殊宣稱之導尿管，在 TFDA 與 US FDA 屬於幾類醫材、可能對應的品項代碼如 FDA 的 EZD / FRL 等，以及是否涉及抗菌藥物宣稱之藥物-醫材組合產品判定)
- **二、臨床前非臨床功能性評估 (Non-clinical Performance testing) 要求**
  - 詳細說明如何以「文獻引用的方法學 (如 McCoy/Dundee 協議) + 自建/委外動態模型數據」進行宣稱支持
  - 說明對照組 (Predicate Device) 比較的黃金準則 (如與既有上市抗結痂導尿管 Arrow 進行 head-to-head 比較數據)
- **三、其他應補強之安全性評估 (ISO 10993 等)** (除了抗結痂，塗層溶出物溶析物分析、細胞毒性、致敏性、刺激性、急性全身毒性、尿道局部植入試驗等，特別是塗層是否會因尿液沖刷脫落)
- **四、送件文件 (Submission Dossier) 撰寫要點與審查應答建議** (針對 TFDA 查驗登記與 FDA 510(k) 關於「抗結痂功效宣稱 (Anti-encrustation claim)」的文字修辭與數據呈現限制)`;
    } else {
      // General consulting chat helper
      systemInstruction = "You are 'Anti-Encrustation Research & RA Specialist', a scientific and regulatory advisor for medical devices. You specialize in urological biomaterials, urinary catheter encrustation mechanisms, artificial urine chemistry, and TFDA/FDA regulations. Answer in detail, professionally, and in Traditional Chinese (Taiwan, 繁體中文). Keep a constructive, scientific, and precise tone.";
      
      const historyText = (history || []).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join("\n");
      userPrompt = `${historyText}\nUser: ${prompt || "請介紹導尿管抗結痂測試中，人工尿液 (Artificial Urine) 的關鍵離子濃度調配考量，以及 Proteus mirabilis 扮演的角色。"}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ success: true, text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error in backend:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error during content generation." });
  }
});

// ── DMAIC3 失效調查系統：AI 推理端點 ──
// DMAIC3.html 於連線模式呼叫此端點取得工程級推理；離線/失敗時前端自動退回規則引擎模擬。
// 設計原則：繁體中文、資深醫療器材品質/法規工程觀點、不臆測（資訊不足即說明缺口）。
const DMAIC_SYSTEM =
  "你是資深醫療器材品質工程師（ISO 13485 / CAPA / 失效分析 / V&V / 法規），" +
  "以工程判斷回答，繁體中文、精確、可執行，不寫漂亮空話。" +
  "嚴禁編造：資訊不足時明確指出證據缺口與待補項目，不得虛構數據、標準條號或結論。" +
  "所有推論須與提供的問卷、AI 調查發現、證據來源一致。";

app.post("/api/dmaic", async (req, res) => {
  try {
    const { task, context } = req.body || {};
    if (task === "ping") return res.json({ success: true, text: "ok" });

    const ctx = JSON.stringify(context ?? {}, null, 2);
    let instruction = "";
    let wantJson = false;

    if (task === "summary") {
      // 問卷 + AI 互動調查發現 → 問題釐清與收斂摘要
      instruction =
        "根據以下器材資訊、問卷回答與 AI 互動調查發現，寫一段 150–220 字的「問題釐清與收斂摘要」：" +
        "說明問題如何/何時發生、目前收斂到哪些因子方向、以及尚待釐清的證據缺口。" +
        "不要逐條複述問卷，不要編造未提供的資訊。\n\n資料：\n" + ctx;
    } else if (task === "rootcause") {
      // 針對每個根因，補上工程佐證、信心度說明與缺口
      wantJson = true;
      instruction =
        "以下為初步根因清單（含勾選陳述、支持/缺口證據、信心度分數）。" +
        "請針對每一項補上工程佐證說明。只能引用提供的證據，不得新增未提供的事實。" +
        '嚴格回傳 JSON 陣列，格式：[{"id":"RCx","rationale":"為何此因子可能為貢獻因（1-2句）","gap":"最關鍵待補證據（1句，若已充分則寫\\"—\\"）"}]。' +
        "只回傳 JSON，不要其他文字。\n\n資料：\n" + ctx;
    } else if (task === "report") {
      // 最終報告的結論與追溯性敘述
      instruction =
        "根據以下根因（含 FMEA RPN 與 pending 待釐清標記）、驗證計畫，寫報告「結論」段落（150–220 字）：" +
        "指出依現有證據最可能之『已確認』貢獻根因（RPN 高者優先，排除 pending 待釐清項目），" +
        "說明 pending 因子為何僅列為待釐清而非確認根因（避免臆測），" +
        "並敘明結案前須先完成哪些高優先驗證以補齊證據缺口。不得編造。\n\n資料：\n" + ctx;
    } else {
      return res.status(400).json({ success: false, error: "unknown task" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: instruction,
      config: {
        systemInstruction: DMAIC_SYSTEM,
        temperature: 0.3,
        ...(wantJson ? { responseMimeType: "application/json" } : {}),
      },
    });
    res.json({ success: true, text: response.text });
  } catch (error: any) {
    console.error("DMAIC3 AI Error:", error);
    res.status(500).json({ success: false, error: error.message || "AI error" });
  }
});

// Vite server connection (development or production static server)
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
