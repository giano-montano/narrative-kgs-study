// Proxy a Groq: arma el mismo prompt que run.py y devuelve el stream SSE tal cual.
import data from "../public/data.json";

const MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const CONDITIONS = ["texto", "json_objeto", "json_estricto"];
const STORIES = new Map(data.stories.map((s) => [s.id, s]));

function systemPrompt(condition) {
  const fmt = condition === "texto" ? data.prompts.format_text : data.prompts.format_json;
  return data.prompts.instructions + "\n\n" + fmt;
}

function responseFormat(condition) {
  // tabla de la sección 3 de PROYECTO.md
  if (condition === "texto") return null;
  if (condition === "json_objeto") return { type: "json_object" };
  return { type: "json_schema", json_schema: { name: "graph", strict: true, schema: data.schema } };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function extract(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "cuerpo inválido" }, 400);
  }
  const { story_id, model, condition } = body;
  const story = STORIES.get(story_id);
  if (!story || !MODELS.includes(model) || !CONDITIONS.includes(condition)) {
    return json({ error: "historia, modelo o condición no permitidos" }, 400);
  }

  if (env.LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") || "anon";
    const { success } = await env.LIMITER.limit({ key: ip });
    if (!success) {
      return json({ error: "Demasiadas extracciones seguidas desde tu red. Espera un minuto." }, 429, { "retry-after": "60" });
    }
  }

  // constantes del experimento: temperatura 1.0, reasoning_effort low, una llamada
  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt(condition) },
      { role: "user", content: story.sentences.join(" ") },
    ],
    temperature: 1.0,
    reasoning_effort: "low",
    stream: true,
  };
  const fmt = responseFormat(condition);
  if (fmt) payload.response_format = fmt;

  const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    let message = text;
    try {
      message = JSON.parse(text).error?.message || text;
    } catch {}
    const retry = upstream.headers.get("retry-after");
    return json({ error: message, groq_status: upstream.status }, upstream.status,
      retry ? { "retry-after": retry } : {});
  }

  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/extract" && request.method === "POST") return extract(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "no encontrado" }, 404);
    return env.ASSETS.fetch(request);
  },
};
