export default async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: cors
    });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Sadece POST kullanılabilir." },
      { status: 405, headers: cors }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY bulunamadı." },
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

  // --------------------------------
  // JARVIS HAFIZA SİSTEMİ
  // --------------------------------

  let memories = [];

  if (supabaseUrl && supabaseKey) {
    try {
      const memoryResponse = await fetch(
        `${supabaseUrl}/rest/v1/memories?select=memory,created_at&user_id=eq.default&order=created_at.desc&limit=50`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`
          }
        }
      );

      if (memoryResponse.ok) {
        memories = await memoryResponse.json();
      }
    } catch {
      // Hafıza sistemi çalışmazsa JARVIS normal şekilde devam eder.
      memories = [];
    }
  }

  // Son kullanıcı mesajını bul
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");

  const userText =
    typeof lastUserMessage?.content === "string"
      ? lastUserMessage.content.trim()
      : "";

  // "hatırla:" komutu
  const rememberMatch = userText.match(
    /^(?:hatırla|unutma|bunu hatırla)\s*[:,-]?\s*(.+)$/i
  );

  if (rememberMatch && supabaseUrl && supabaseKey) {
    const memoryText = rememberMatch[1].trim();

    if (memoryText) {
      try {
        const saveResponse = await fetch(
          `${supabaseUrl}/rest/v1/memories`,
          {
            method: "POST",
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal"
            },
            body: JSON.stringify({
              user_id: "default",
              memory: memoryText
            })
          }
        );

        if (saveResponse.ok) {
          return Response.json(
            {
              answer: `Tamam. Bunu hafızama kaydettim: ${memoryText}`
            },
            { headers: cors }
          );
        }
      } catch {
        // Hafıza kaydedilemezse normal AI yanıtına devam edilir.
      }
    }
  }

  // Hafızaları JARVIS'e aktar
  let memoryText = "";

  if (memories.length) {
    memoryText = memories
      .map((item) => `- ${item.memory}`)
      .join("\n");
  }

  // --------------------------------
  // OPENAI
  // --------------------------------

  const instructions = `
Sen kullanıcının kişisel yapay zekâ asistanı JARVIS'sin.

Türkçe konuş.
Kısa, doğal ve yardımcı cevaplar ver.
Kullanıcı sana soru sorduğunda mümkün olduğunca doğru bilgi ver.
Gerektiğinde internet üzerinden güncel bilgi araştır.

Kullanıcının kalıcı hafızası aşağıdadır:

${memoryText || "Henüz kayıtlı bir hafıza yok."}

Bu hafızayı konuşma sırasında gerektiğinde kullan.
Hafızada olmayan bilgileri varmış gibi uydurma.
`;

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

        instructions,

        tools: [
          {
            type: "web_search"
          }
        ],

        input: messages
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      {
        error:
          data?.error?.message ||
          "OpenAI API hatası."
      },
      {
        status: response.status,
        headers: cors
      }
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
    {
      answer: answer || "Cevap boş döndü."
    },
    {
      headers: cors
    }
  );
};
