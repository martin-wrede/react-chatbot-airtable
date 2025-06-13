var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../.wrangler/tmp/bundle-FJepXC/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// ai.js
async function onRequest(context) {
  const { request, env } = context;
  console.log("=== AI Function Called ===");
  console.log("Method:", request.method);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
  try {
    const body = await request.text();
    console.log("Raw request body length:", body.length);
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Empty request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    console.log("Request contains files:", parsedBody.files?.length || 0);
    console.log("Request contains file attachments:", parsedBody.fileAttachments?.length || 0);
    console.log("Message length:", parsedBody.message?.length || 0);
    const { message, messages = [], files = [] } = parsedBody;
    if (!message) {
      return new Response(
        JSON.stringify({ error: "Missing 'message' field" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    let systemPrompt = "Du bist ein hilfsreicher AI-Assistent. Antworte h\xF6flich und informativ auf Deutsch.";
    if (files.length > 0) {
      systemPrompt += ` 
      
WICHTIG: Der Benutzer hat ${files.length} Textdatei(en) hochgeladen. Diese Dateien sind im Nachrichteninhalt unter "[Uploaded Files Context:]" zu finden. 
- Lies und analysiere den Inhalt dieser Dateien sorgf\xE4ltig
- Beziehe dich direkt auf den Dateiinhalt in deinen Antworten
- Wenn der Benutzer Fragen zu den Dateien stellt, zitiere relevante Teile daraus
- Best\xE4tige explizit, dass du die Dateien gelesen hast`;
    }
    const chatMessages = [
      {
        role: "system",
        content: systemPrompt
      }
    ];
    if (messages.length > 0) {
      const historyMessages = messages.slice(0, -1).map((msg) => ({
        role: msg.role,
        content: msg.content
      }));
      chatMessages.push(...historyMessages);
    }
    chatMessages.push({
      role: "user",
      content: message
    });
    console.log("=== DEBUG: Final message to OpenAI ===");
    console.log("System prompt:", systemPrompt);
    console.log("Total messages:", chatMessages.length);
    console.log("Current message preview:", message.substring(0, 500) + "...");
    console.log("=====================================");
    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.VITE_APP_OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: chatMessages,
        max_tokens: files.length > 0 ? 2e3 : 1e3,
        // More tokens when files are involved
        temperature: 0.7
      })
    });
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("OpenAI API Error:", apiResponse.status, errorText);
      if (errorText.includes("context_length_exceeded")) {
        return new Response(JSON.stringify({
          error: "Die hochgeladenen Dateien sind zu gro\xDF. Bitte verwende kleinere Dateien oder teile sie auf.",
          choices: [{
            message: {
              content: "Entschuldigung, die hochgeladenen Dateien sind zu gro\xDF f\xFCr die Verarbeitung. Bitte verwende kleinere Dateien oder teile sie in mehrere kleinere Dateien auf."
            }
          }]
        }), {
          status: 200,
          // Return 200 so frontend handles it normally
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      throw new Error(`OpenAI API Error: ${apiResponse.status} - ${errorText}`);
    }
    const data = await apiResponse.json();
    console.log("OpenAI Response received successfully");
    const botAnswer = data.choices?.[0]?.message?.content || "Entschuldigung, ich konnte keine Antwort generieren.";
    console.log("Response mentions files:", botAnswer.toLowerCase().includes("datei"));
    try {
      await saveToAirtable(env, message, botAnswer, files, parsedBody.fileAttachments);
      console.log("Successfully saved to Airtable with bot answer");
    } catch (airtableError) {
      console.error("Airtable save failed:", airtableError);
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("Error in AI function:", error);
    return new Response(JSON.stringify({
      error: error.message,
      choices: [{
        message: {
          content: "Entschuldigung, es gab einen technischen Fehler. Bitte versuche es erneut."
        }
      }]
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
__name(onRequest, "onRequest");
async function saveToAirtable(env, originalMessage, botAnswer, files, fileAttachments = []) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }
  let userPrompt = originalMessage;
  if (originalMessage.includes("[Uploaded Files Context:]")) {
    userPrompt = originalMessage.split("\n\n[Uploaded Files Context:]")[0];
  }
  const cleanBotAnswer = botAnswer.replace(/\n\s*\n/g, "\n").trim();
  let airtableAttachments = [];
  if (fileAttachments && fileAttachments.length > 0) {
    console.log("Processing file attachments:", fileAttachments.length);
    for (const file of fileAttachments) {
      try {
        const base64Content = btoa(file.content);
        const dataUrl = `data:${file.type || "text/plain"};base64,${base64Content}`;
        const attachment = {
          filename: file.name,
          url: dataUrl
        };
        airtableAttachments.push(attachment);
        console.log(`Prepared attachment: ${file.name} (${file.content.length} chars)`);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }
  }
  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
  const fields = {
    "Prompt": userPrompt,
    "Bot_Answer": cleanBotAnswer,
    "Timestamp": (/* @__PURE__ */ new Date()).toISOString(),
    "File_Count": files.length
  };
  if (airtableAttachments.length > 0) {
    fields["File_Attachments"] = airtableAttachments;
  }
  const recordData = {
    records: [{ fields }]
  };
  console.log("Saving to Airtable:", {
    url: airtableUrl,
    promptLength: userPrompt.length,
    botAnswerLength: cleanBotAnswer.length,
    hasFiles: files.length > 0,
    hasAttachments: airtableAttachments.length > 0
  });
  const response = await fetch(airtableUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(recordData)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable API Error:", response.status, errorText);
    throw new Error(`Airtable API Error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  console.log("Airtable save successful:", result);
  return result;
}
__name(saveToAirtable, "saveToAirtable");

// ai-airtable.js
async function onRequest2(context) {
  const { request, env } = context;
  console.log("=== AI Function Called ===");
  console.log("Method:", request.method);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
  try {
    const body = await request.text();
    console.log("Raw request body length:", body.length);
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Empty request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    console.log("Request contains files:", parsedBody.files?.length || 0);
    console.log("Message length:", parsedBody.message?.length || 0);
    const { message, messages = [], files = [] } = parsedBody;
    if (!message) {
      return new Response(
        JSON.stringify({ error: "Missing 'message' field" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    let systemPrompt = "Du bist ein hilfsreicher AI-Assistent. Antworte h\xF6flich und informativ auf Deutsch.";
    if (files.length > 0) {
      systemPrompt += ` 
      
WICHTIG: Der Benutzer hat ${files.length} Textdatei(en) hochgeladen. Diese Dateien sind im Nachrichteninhalt unter "[Uploaded Files Context:]" zu finden. 
- Lies und analysiere den Inhalt dieser Dateien sorgf\xE4ltig
- Beziehe dich direkt auf den Dateiinhalt in deinen Antworten
- Wenn der Benutzer Fragen zu den Dateien stellt, zitiere relevante Teile daraus
- Best\xE4tige explizit, dass du die Dateien gelesen hast`;
    }
    const chatMessages = [
      {
        role: "system",
        content: systemPrompt
      }
    ];
    if (messages.length > 0) {
      const historyMessages = messages.slice(0, -1).map((msg) => ({
        role: msg.role,
        content: msg.content
      }));
      chatMessages.push(...historyMessages);
    }
    chatMessages.push({
      role: "user",
      content: message
    });
    console.log("=== DEBUG: Final message to OpenAI ===");
    console.log("System prompt:", systemPrompt);
    console.log("Total messages:", chatMessages.length);
    console.log("Current message preview:", message.substring(0, 500) + "...");
    console.log("=====================================");
    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.VITE_APP_OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: chatMessages,
        max_tokens: files.length > 0 ? 2e3 : 1e3,
        // More tokens when files are involved
        temperature: 0.7
      })
    });
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("OpenAI API Error:", apiResponse.status, errorText);
      if (errorText.includes("context_length_exceeded")) {
        return new Response(JSON.stringify({
          error: "Die hochgeladenen Dateien sind zu gro\xDF. Bitte verwende kleinere Dateien oder teile sie auf.",
          choices: [{
            message: {
              content: "Entschuldigung, die hochgeladenen Dateien sind zu gro\xDF f\xFCr die Verarbeitung. Bitte verwende kleinere Dateien oder teile sie in mehrere kleinere Dateien auf."
            }
          }]
        }), {
          status: 200,
          // Return 200 so frontend handles it normally
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      throw new Error(`OpenAI API Error: ${apiResponse.status} - ${errorText}`);
    }
    const data = await apiResponse.json();
    console.log("OpenAI Response received successfully");
    const botAnswer = data.choices?.[0]?.message?.content || "Entschuldigung, ich konnte keine Antwort generieren.";
    console.log("Response mentions files:", botAnswer.toLowerCase().includes("datei"));
    try {
      await saveToAirtable2(env, message, botAnswer, files);
      console.log("Successfully saved to Airtable with bot answer");
    } catch (airtableError) {
      console.error("Airtable save failed:", airtableError);
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("Error in AI function:", error);
    return new Response(JSON.stringify({
      error: error.message,
      choices: [{
        message: {
          content: "Entschuldigung, es gab einen technischen Fehler. Bitte versuche es erneut."
        }
      }]
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
__name(onRequest2, "onRequest");
async function saveToAirtable2(env, originalMessage, botAnswer, files) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }
  let userPrompt = originalMessage;
  if (originalMessage.includes("[Uploaded Files Context:]")) {
    userPrompt = originalMessage.split("\n\n[Uploaded Files Context:]")[0];
  }
  const cleanBotAnswer = botAnswer.replace(/\n\s*\n/g, "\n").trim();
  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
  const recordData = {
    records: [
      {
        fields: {
          "Prompt": userPrompt,
          "Bot_Answer": cleanBotAnswer,
          "Timestamp": (/* @__PURE__ */ new Date()).toISOString(),
          // Optional: Add metadata fields
          //    "Has_Files": files.length > 0,
          "File_Count": files.length
          //   "Response_Length": cleanBotAnswer.length,
          //   "Prompt_Length": userPrompt.length
        }
      }
    ]
  };
  console.log("Saving to Airtable:", {
    url: airtableUrl,
    promptLength: userPrompt.length,
    botAnswerLength: cleanBotAnswer.length,
    hasFiles: files.length > 0
  });
  const response = await fetch(airtableUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(recordData)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable API Error:", response.status, errorText);
    throw new Error(`Airtable API Error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  console.log("Airtable save successful:", result);
  return result;
}
__name(saveToAirtable2, "saveToAirtable");

// airtable.js
async function onRequest3(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const body = await request.json();
    const { action, data } = body;
    if (!action) {
      return errorResponse("Missing 'action' field");
    }
    let result;
    switch (action) {
      case "save":
        if (!data?.prompt) {
          return errorResponse("Missing 'prompt' in data");
        }
        result = await saveToAirtable3(env, data);
        break;
      default:
        return errorResponse(`Unsupported action: ${action}`);
    }
    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: corsHeaders()
    });
  } catch (err) {
    console.error("Server error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
__name(onRequest3, "onRequest");
function errorResponse(message) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status: 400,
    headers: corsHeaders()
  });
}
__name(errorResponse, "errorResponse");
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };
}
__name(corsHeaders, "corsHeaders");
async function saveToAirtable3(env, data) {
  const { prompt, botAnswer, files = [], fileAttachments = [] } = data;
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials in environment");
  }
  const cleanBotAnswer = botAnswer?.trim() || "No response";
  const fileCount = files.length;
  const attachments = fileAttachments.filter((file) => file.url).map((file) => ({
    filename: file.name,
    url: file.url
  }));
  const fields = {
    Prompt: prompt,
    Bot_Answer: cleanBotAnswer,
    Timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    File_Count: fileCount
  };
  if (attachments.length > 0) {
    fields["File_Attachments"] = attachments;
  }
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ records: [{ fields }] })
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable API error:", errorText);
    throw new Error(`Airtable error: ${response.status}`);
  }
  const result = await response.json();
  console.log("Saved to Airtable:", result);
  return result;
}
__name(saveToAirtable3, "saveToAirtable");

// airtable copy.js
async function onRequest4(context) {
  const { request, env } = context;
  console.log("=== Airtable Function Called ===");
  console.log("Method:", request.method);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  try {
    const body = await request.text();
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Empty request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    const { action, data } = parsedBody;
    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing 'action' field" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    let result;
    switch (action) {
      case "save":
        if (!data || !data.prompt) {
          return new Response(
            JSON.stringify({ error: "Missing required data for save action" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
        result = await saveRecord(env, data.prompt, data.botAnswer, data.files || []);
        break;
      case "update":
        if (!data || !data.recordId || !data.botAnswer) {
          return new Response(
            JSON.stringify({ error: "Missing required data for update action" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
        result = await updateRecord(env, data.recordId, data.botAnswer);
        break;
      case "getChatHistory":
        const maxRecords = data?.maxRecords || 100;
        result = await getChatHistory(env, maxRecords);
        break;
      case "getRecord":
        if (!data || !data.recordId) {
          return new Response(
            JSON.stringify({ error: "Missing recordId for getRecord action" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
        result = await getRecord(env, data.recordId);
        break;
      case "deleteRecord":
        if (!data || !data.recordId) {
          return new Response(
            JSON.stringify({ error: "Missing recordId for deleteRecord action" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
        result = await deleteRecord(env, data.recordId);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
    }
    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("Error in Airtable function:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
__name(onRequest4, "onRequest");
async function saveRecord(env, originalMessage, botAnswer, files) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }
  const cleanBotAnswer = botAnswer?.replace(/\n\s*\n/g, "\n").trim() || "No response generated";
  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
  const recordData = {
    records: [
      {
        fields: {
          "Prompt": originalMessage,
          "Bot_Answer": cleanBotAnswer,
          "Timestamp": (/* @__PURE__ */ new Date()).toISOString(),
          "File_Count": files.length
        }
      }
    ]
  };
  console.log("Saving to Airtable:", {
    url: airtableUrl,
    promptLength: originalMessage.length,
    botAnswerLength: cleanBotAnswer.length,
    hasFiles: files.length > 0
  });
  const response = await fetch(airtableUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(recordData)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable API Error:", response.status, errorText);
    throw new Error(`Airtable API Error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  console.log("Airtable save successful:", result);
  return result;
}
__name(saveRecord, "saveRecord");
async function updateRecord(env, recordId, botAnswer) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }
  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const updateData = {
    fields: {
      "Bot_Answer": botAnswer,
      "Response_Length": botAnswer.length,
      "Updated_At": (/* @__PURE__ */ new Date()).toISOString()
    }
  };
  const response = await fetch(airtableUrl, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(updateData)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable Update Error:", response.status, errorText);
    throw new Error(`Airtable Update Error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  console.log("Airtable update successful:", result);
  return result;
}
__name(updateRecord, "updateRecord");
async function getRecord(env, recordId) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }
  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const response = await fetch(airtableUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable Fetch Error:", response.status, errorText);
    throw new Error(`Airtable Fetch Error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  console.log("Airtable fetch successful");
  const formattedRecord = {
    id: result.id,
    prompt: result.fields.Prompt,
    botAnswer: result.fields.Bot_Answer,
    timestamp: result.fields.Timestamp,
    hasFiles: result.fields.Has_Files || false,
    fileCount: result.fields.File_Count || 0,
    createdTime: result.createdTime
  };
  return formattedRecord;
}
__name(getRecord, "getRecord");
async function deleteRecord(env, recordId) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }
  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const response = await fetch(airtableUrl, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable Delete Error:", response.status, errorText);
    throw new Error(`Airtable Delete Error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  console.log("Airtable delete successful:", result);
  return result;
}
__name(deleteRecord, "deleteRecord");
async function getChatHistory(env, maxRecords = 100) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }
  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
  const params = new URLSearchParams({
    maxRecords: maxRecords.toString(),
    sort: JSON.stringify([{ field: "Timestamp", direction: "desc" }])
  });
  const response = await fetch(`${airtableUrl}?${params}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable Fetch Error:", response.status, errorText);
    throw new Error(`Airtable Fetch Error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  console.log(`Retrieved ${result.records.length} records from Airtable`);
  const formattedRecords = result.records.map((record) => ({
    id: record.id,
    prompt: record.fields.Prompt,
    botAnswer: record.fields.Bot_Answer,
    timestamp: record.fields.Timestamp,
    hasFiles: record.fields.Has_Files || false,
    fileCount: record.fields.File_Count || 0,
    createdTime: record.createdTime
  }));
  return formattedRecords;
}
__name(getChatHistory, "getChatHistory");

// ../.wrangler/tmp/pages-XcTOjt/functionsRoutes-0.4940470647160833.mjs
var routes = [
  {
    routePath: "/ai",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/ai-airtable",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/airtable",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/airtable copy",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  }
];

// C:/Users/marti/AppData/Roaming/npm/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// C:/Users/marti/AppData/Roaming/npm/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// C:/Users/marti/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// C:/Users/marti/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-FJepXC/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// C:/Users/marti/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-FJepXC/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.13142374365704934.mjs.map
