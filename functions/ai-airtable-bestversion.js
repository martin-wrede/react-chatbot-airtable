// functions/ai-airtable.js

export async function onRequest(context) {
  const { request, env } = context;
  
  console.log("=== AI Function Called ===");
  console.log("Method:", request.method);
  
  // ✅ CORS Preflight Handling
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // ✅ Only accept POST
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), { 
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
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
          },
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
          },
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
          },
        }
      );
    }

    // ✅ Enhanced system prompt for file handling
    let systemPrompt = "Du bist ein hilfsreicher AI-Assistent. Antworte höflich und informativ auf Deutsch.";
    
    if (files.length > 0) {
      systemPrompt += ` 
      
WICHTIG: Der Benutzer hat ${files.length} Textdatei(en) hochgeladen. Diese Dateien sind im Nachrichteninhalt unter "[Uploaded Files Context:]" zu finden. 
- Lies und analysiere den Inhalt dieser Dateien sorgfältig
- Beziehe dich direkt auf den Dateiinhalt in deinen Antworten
- Wenn der Benutzer Fragen zu den Dateien stellt, zitiere relevante Teile daraus
- Bestätige explizit, dass du die Dateien gelesen hast`;
    }

    // ✅ Prepare messages for OpenAI Chat API
    const chatMessages = [
      {
        role: "system",
        content: systemPrompt
      }
    ];

    // Add conversation history (excluding the current message to avoid duplication)
    if (messages.length > 0) {
      // Only add messages that aren't the current one
      const historyMessages = messages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      chatMessages.push(...historyMessages);
    }

    // Add the current message (which includes file content)
    chatMessages.push({
      role: "user",
      content: message
    });

    console.log("=== DEBUG: Final message to OpenAI ===");
    console.log("System prompt:", systemPrompt);
    console.log("Total messages:", chatMessages.length);
    console.log("Current message preview:", message.substring(0, 500) + "...");
    console.log("=====================================");

    // ✅ Send request to OpenAI Chat API with increased max_tokens for file responses
    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.VITE_APP_OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: chatMessages,
        max_tokens: files.length > 0 ? 2000 : 1000, // More tokens when files are involved
        temperature: 0.7,
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("OpenAI API Error:", apiResponse.status, errorText);
      
      // Check for context length error
      if (errorText.includes("context_length_exceeded")) {
        return new Response(JSON.stringify({ 
          error: "Die hochgeladenen Dateien sind zu groß. Bitte verwende kleinere Dateien oder teile sie auf.",
          choices: [{
            message: {
              content: "Entschuldigung, die hochgeladenen Dateien sind zu groß für die Verarbeitung. Bitte verwende kleinere Dateien oder teile sie in mehrere kleinere Dateien auf."
            }
          }]
        }), {
          status: 200, // Return 200 so frontend handles it normally
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      
      throw new Error(`OpenAI API Error: ${apiResponse.status} - ${errorText}`);
    }

    const data = await apiResponse.json();
    console.log("OpenAI Response received successfully");
    
    // Get the AI response content
    const botAnswer = data.choices?.[0]?.message?.content || "Entschuldigung, ich konnte keine Antwort generieren.";
    
    // Log if the response mentions files
    console.log("Response mentions files:", botAnswer.toLowerCase().includes("datei"));

    // ✅ Save to Airtable with both prompt and bot answer
    try {
      await saveToAirtable(env, message, botAnswer, files);
      console.log("Successfully saved to Airtable with bot answer");
    } catch (airtableError) {
      console.error("Airtable save failed:", airtableError);
      // Continue with AI response even if Airtable fails
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
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
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

// ✅ Enhanced Airtable Integration Function with Bot Answer
async function saveToAirtable(env, originalMessage, botAnswer, files) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }

  // Extract just the user's original prompt (without file content)
  let userPrompt = originalMessage;
  
  // If message contains file context, extract only the original prompt
  if (originalMessage.includes("[Uploaded Files Context:]")) {
    userPrompt = originalMessage.split("\n\n[Uploaded Files Context:]")[0];
  }

  // Clean up bot answer - remove any potential formatting issues
  const cleanBotAnswer = botAnswer.replace(/\n\s*\n/g, '\n').trim();

  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
  
  const recordData = {
    records: [
      {
        fields: {
          "Prompt": userPrompt,
          "Bot Answer": cleanBotAnswer,
          "Timestamp": new Date().toISOString(),
          // Optional: Add metadata fields
      //    "Has_Files": files.length > 0,
          "File_Count": files.length,
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
      "Content-Type": "application/json",
    },
    body: JSON.stringify(recordData),
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

// ✅ Optional: Function to update an existing record with bot answer
async function updateAirtableRecord(env, recordId, botAnswer) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }

  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  
  const updateData = {
    fields: {
      "Bot Answer": botAnswer,
      "Response_Length": botAnswer.length,
      "Updated_At": new Date().toISOString()
    }
  };

  const response = await fetch(airtableUrl, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateData),
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

// ✅ Optional: Function to retrieve chat history from Airtable
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
    sort: JSON.stringify([{ field: "Timestamp", direction: "desc" }]),
  });

  const response = await fetch(`${airtableUrl}?${params}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable Fetch Error:", response.status, errorText);
    throw new Error(`Airtable Fetch Error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`Retrieved ${result.records.length} records from Airtable`);
  
  // Format the records for easier use
  const formattedRecords = result.records.map(record => ({
    id: record.id,
    prompt: record.fields.Prompt,
    botAnswer: record.fields['Bot Answer'],
    timestamp: record.fields.Timestamp,
    hasFiles: record.fields.Has_Files || false,
    fileCount: record.fields.File_Count || 0,
    createdTime: record.createdTime
  }));
  
  return formattedRecords;
}