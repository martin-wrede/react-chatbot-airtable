
// functions/airtable.js

export async function onRequest(context) {
  const { request, env } = context;
  
  console.log("=== Airtable Function Called ===");
  console.log("Method:", request.method);
  
  // ✅ CORS Preflight Handling
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
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

    const { action, data } = parsedBody;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing 'action' field" }),
        {
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        }
      );
    }

    let result;

    switch (action) {
      case 'save':
        if (!data || !data.prompt) {
          return new Response(
            JSON.stringify({ error: "Missing required data for save action" }),
            {
              status: 400,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              },
            }
          );
        }
        result = await saveRecord(env, data.prompt, data.botAnswer, data.files || []);
        break;

      case 'update':
        if (!data || !data.recordId || !data.botAnswer) {
          return new Response(
            JSON.stringify({ error: "Missing required data for update action" }),
            {
              status: 400,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              },
            }
          );
        }
        result = await updateRecord(env, data.recordId, data.botAnswer);
        break;

      case 'getChatHistory':
        const maxRecords = data?.maxRecords || 100;
        result = await getChatHistory(env, maxRecords);
        break;

      case 'getRecord':
        if (!data || !data.recordId) {
          return new Response(
            JSON.stringify({ error: "Missing recordId for getRecord action" }),
            {
              status: 400,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              },
            }
          );
        }
        result = await getRecord(env, data.recordId);
        break;

      case 'deleteRecord':
        if (!data || !data.recordId) {
          return new Response(
            JSON.stringify({ error: "Missing recordId for deleteRecord action" }),
            {
              status: 400,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              },
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
            },
          }
        );
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
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
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

// ✅ Save a new record to Airtable
async function saveRecord(env, originalMessage, botAnswer, files) {
  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials");
  }

  // Clean up bot answer - remove any potential formatting issues
  const cleanBotAnswer = botAnswer?.replace(/\n\s*\n/g, '\n').trim() || "No response generated";

  const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
  
  const recordData = {
    records: [
      {
        fields: {
          "Prompt": originalMessage,
          "Bot_Answer": cleanBotAnswer,
          "Timestamp": new Date().toISOString(),
          "File_Count": files.length,
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

// ✅ Update an existing record with bot answer
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

// ✅ Get a single record by ID
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
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Airtable Fetch Error:", response.status, errorText);
    throw new Error(`Airtable Fetch Error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log("Airtable fetch successful");
  
  // Format the record for easier use
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

// ✅ Delete a record by ID
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
      "Content-Type": "application/json",
    },
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

// ✅ Retrieve chat history from Airtable
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
    botAnswer: record.fields.Bot_Answer,
    timestamp: record.fields.Timestamp,
    hasFiles: record.fields.Has_Files || false,
    fileCount: record.fields.File_Count || 0,
    createdTime: record.createdTime
  }));
  
  return formattedRecords;
}
