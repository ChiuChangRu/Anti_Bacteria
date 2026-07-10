/**
 * DMAIC3 失效調查系統 — Cloudflare Worker 後端(Claude Fable 5)
 * ---------------------------------------------------------------------------
 * 實作與 server.ts 完全相同的 /api/dmaic 合約,供 DMAIC3.html 於連線模式呼叫。
 * 前端偵測不到本後端時會自動退回規則引擎模擬(🟡),因此本 Worker 是「加值」而非必要。
 *
 * 合約:POST  body {task, context} → {success, text}
 *   task=ping      → {success:true, text:"ok"}（不呼叫模型）
 *   task=summary   → 150–220 字問題釐清與收斂摘要
 *   task=rootcause → JSON 陣列 [{id,rationale,gap}]（只加工程敘述,不改結構/信心度）
 *   task=report    → 150–220 字可追溯結論段落
 *
 * 模型:claude-fable-5（規格:本專案為 Claude Fable 5 設計,深度推理優先）
 *   - Fable 5 思考恆開:不送 thinking 參數(送 {type:"disabled"} 會 400)。
 *   - 不送 temperature/top_p/top_k（Fable 5 會 400）。
 *   - 以 output_config.effort 控制推理深度。
 *   - 內建 refusal 處理 + server-side fallback 到 claude-opus-4-8。
 *   - 注意:Fable 5 需組織設定 30 天資料保留(非 ZDR),否則所有請求 400。
 *
 * 部署:
 *   wrangler secret put ANTHROPIC_API_KEY
 *   route 綁到與前端同網域的 /api/dmaic（免 CORS);或另設網域並將
 *   DMAIC3.html 的 AI.base 指向本 Worker URL（本檔已附 CORS 供跨網域使用）。
 */

interface Env {
  ANTHROPIC_API_KEY: string;
}

const MODEL = "claude-fable-5";
const FALLBACK_MODEL = "claude-opus-4-8"; // Fable 5 若被安全分類器拒答,同一請求改由此模型接手

const DMAIC_SYSTEM =
  "你是資深醫療器材品質工程師（ISO 13485 / CAPA / 失效分析 / V&V / 法規），" +
  "以工程判斷回答,繁體中文、精確、可執行,不寫漂亮空話。" +
  "嚴禁編造:資訊不足時明確指出證據缺口與待補項目,不得虛構數據、標準條號或結論。" +
  "所有推論須與提供的問卷、AI 調查發現、證據來源一致。";

// 每個 task 的指令與參數(與 server.ts 對齊,確保兩後端行為一致)
function buildTask(
  task: string,
  ctx: string,
): { instruction: string; wantJson: boolean; maxTokens: number } | null {
  if (task === "summary") {
    return {
      wantJson: false,
      maxTokens: 1200,
      instruction:
        "根據以下器材資訊、問卷回答與 AI 互動調查發現,寫一段 150–220 字的「問題釐清與收斂摘要」:" +
        "說明問題如何/何時發生、目前收斂到哪些因子方向、以及尚待釐清的證據缺口。" +
        "不要逐條複述問卷,不要編造未提供的資訊。\n\n資料:\n" +
        ctx,
    };
  }
  if (task === "rootcause") {
    return {
      wantJson: true,
      maxTokens: 3000,
      instruction:
        "以下為初步根因清單(含勾選陳述、支持/缺口證據、信心度分數)。" +
        "請針對每一項補上工程佐證說明。只能引用提供的證據,不得新增未提供的事實。" +
        '嚴格回傳 JSON 陣列,格式:[{"id":"RCx","rationale":"為何此因子可能為貢獻因（1-2句）","gap":"最關鍵待補證據（1句,若已充分則寫\\"—\\"）"}]。' +
        "只回傳 JSON,不要其他文字。\n\n資料:\n" +
        ctx,
    };
  }
  if (task === "report") {
    return {
      wantJson: false,
      maxTokens: 1200,
      instruction:
        "根據以下根因(含 FMEA RPN 與 pending 待釐清標記)、驗證計畫,寫報告「結論」段落(150–220 字):" +
        "指出依現有證據最可能之『已確認』貢獻根因(RPN 高者優先,排除 pending 待釐清項目)," +
        "說明 pending 因子為何僅列為待釐清而非確認根因(避免臆測)," +
        "並敘明結案前須先完成哪些高優先驗證以補齊證據缺口。不得編造。\n\n資料:\n" +
        ctx,
    };
  }
  return null;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return json({ success: false, error: "method not allowed" }, 405);

    let task: string, context: unknown;
    try {
      const body = (await req.json()) as { task?: string; context?: unknown };
      task = body.task ?? "";
      context = body.context ?? {};
    } catch {
      return json({ success: false, error: "invalid json body" }, 400);
    }

    // 連線探測:不呼叫模型
    if (task === "ping") return json({ success: true, text: "ok" });

    const built = buildTask(task, JSON.stringify(context, null, 2));
    if (!built) return json({ success: false, error: "unknown task" }, 400);

    if (!env.ANTHROPIC_API_KEY) {
      // 未設金鑰:回非 200,讓前端退回規則引擎模擬,而不是壞掉
      return json({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          // server-side fallback:Fable 5 被安全分類器拒答時,同一請求改由 fallback 模型接手
          "anthropic-beta": "server-side-fallback-2026-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: built.maxTokens,
          system: DMAIC_SYSTEM,
          // 深度推理優先;若 Worker 遇到平台 wall-clock 上限,可降為 "medium"
          output_config: { effort: "high" },
          fallbacks: [{ model: FALLBACK_MODEL }],
          messages: [{ role: "user", content: built.instruction }],
          // 不送 thinking(Fable 5 恆開;送 disabled 會 400)、不送 temperature（會 400）
        }),
      });

      if (!r.ok) {
        const errText = await r.text();
        return json({ success: false, error: `anthropic ${r.status}: ${errText.slice(0, 300)}` }, 502);
      }

      const data = (await r.json()) as {
        stop_reason?: string;
        content?: Array<{ type: string; text?: string }>;
      };

      // Fable 5 可能回 HTTP 200 但 stop_reason:"refusal"（安全分類器拒答);
      // 整條 fallback 鏈都拒答才會走到這裡 → 回非 200,前端退回規則引擎。
      if (data.stop_reason === "refusal") {
        return json({ success: false, error: "model refused (safety classifier)" }, 502);
      }

      // 收集所有 text 區塊(可能夾帶 fallback 標記區塊,忽略之)
      const text = (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("")
        .trim();

      if (!text) return json({ success: false, error: "empty response" }, 502);
      return json({ success: true, text });
    } catch (e: any) {
      return json({ success: false, error: e?.message || "worker error" }, 500);
    }
  },
};
