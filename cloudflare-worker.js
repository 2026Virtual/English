const DEFAULT_API_URL = "https://chat.ecnu.edu.cn/open/api/v1/chat/completions";
const DEFAULT_MODEL = "ecnu-max";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET") {
      return json({ status: "ok" });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!env.API_KEY) {
      return json({ error: "Worker secret API_KEY is missing" }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const word = typeof body.word === "string" ? body.word.trim() : "";
    if (!word && !Array.isArray(body.messages)) {
      return json({ error: "Missing word" }, 400);
    }

    const upstreamPayload = Array.isArray(body.messages)
      ? {
          ...body,
          model: body.model || env.MODEL_NAME || DEFAULT_MODEL,
          stream: false,
        }
      : buildMnemonicPayload(word, body.model || env.MODEL_NAME || DEFAULT_MODEL);

    const apiUrl = env.API_URL || DEFAULT_API_URL;
    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.API_KEY}`,
      },
      body: JSON.stringify(upstreamPayload),
    });

    const upstreamText = await upstream.text();
    let upstreamData;
    try {
      upstreamData = upstreamText ? JSON.parse(upstreamText) : {};
    } catch {
      upstreamData = { raw: upstreamText };
    }

    if (!upstream.ok) {
      return json(
        {
          error:
            upstreamData?.error?.message ||
            upstreamData?.message ||
            `Upstream returned ${upstream.status}`,
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
      return json({ error: "Upstream returned empty mnemonic", upstream: upstreamData }, 502);
    }

    return json({ status: "success", mnemonic });
  },
};

function buildMnemonicPayload(word, model) {
  return {
    model,
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
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json;charset=utf-8",
    },
  });
}
