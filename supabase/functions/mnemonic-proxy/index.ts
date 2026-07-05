const LLM_API_URL =
  Deno.env.get("LLM_API_URL") ?? "https://chat.ecnu.edu.cn/open/api/v1/chat/completions";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "ecnu-max";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { warmup?: boolean; word?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.warmup) {
    return json({ status: "warm" });
  }

  if (!LLM_API_KEY) {
    return json({ error: "Missing Supabase secret: LLM_API_KEY" }, 500);
  }

  const word = body.word?.trim();
  if (!word) {
    return json({ error: "Missing word" }, 400);
  }

  const payload = {
    model: body.model?.trim() || LLM_MODEL,
    messages: [
      {
        role: "system",
        content:
          "你是一个幽默、富有想象力的雅思英语老师。为单词提供生动、好记的助记法。可以利用谐音、词根词缀或荒诞画面。必须精简，直接输出助记文本，总字数控制在50字以内。",
      },
      {
        role: "user",
        content: `请为雅思单词 '${word}' 提供一个助记法。`,
      },
    ],
    stream: false,
  };

  let upstream: Response;
  try {
    upstream = await fetch(LLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: "Failed to reach LLM API" }, 502);
  }

  const upstreamData = await readJson(upstream);
  if (!upstream.ok) {
    return json(
      {
        error:
          upstreamData?.error?.message ||
          upstreamData?.message ||
          `LLM API returned ${upstream.status}`,
        upstream: upstreamData,
      },
      upstream.status,
    );
  }

  const mnemonic =
    upstreamData?.choices?.[0]?.message?.content?.trim?.() ||
    upstreamData?.choices?.[0]?.text?.trim?.() ||
    "";

  if (!mnemonic) {
    return json({ error: "LLM API returned empty mnemonic", upstream: upstreamData }, 502);
  }

  return json({ status: "success", mnemonic });
});

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json;charset=utf-8",
    },
  });
}
