export default async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Sadece POST kullanılabilir." },
      { status: 405, headers: cors }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY Netlify Function'a ulaşamıyor." },
      { status: 500, headers: cors }
    );
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Geçersiz istek." },
      { status: 400, headers: cors }
    );
  }

  const messages = Array.isArray(body.messages)
    ? body.messages.slice(-20)
    : [];

  if (!messages.length) {
    return Response.json(
      { error: "Mesaj bulunamadı." },
      { status: 400, headers: cors }
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        instructions:
          "Sen kullanıcının kişisel yapay zekâ asistanı JARVIS'sin. Türkçe konuş. Samimi, kısa ve doğal cevaplar ver. Kullanıcı özellikle istemedikçe gereksiz uzun cevaplar verme. Henüz bilgisayara veya telefona doğrudan erişimin olmadığını unutma; varmış gibi davranma.",
        input: messages
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      { error: data?.error?.message || "OpenAI API hatası." },
      { status: response.status, headers: cors }
    );
  }

  let answer = data.output_text;

  if (!answer && Array.isArray(data.output)) {
    const parts = [];

    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c.text === "string") {
            parts.push(c.text);
          }
        }
      }
    }

    answer = parts.join("\n").trim();
  }

  return Response.json(
    { answer: answer || "Cevap boş döndü." },
    { headers: cors }
  );
};