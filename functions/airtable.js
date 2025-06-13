export async function onRequest(context) {
  const { request, env } = context;

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
        result = await saveToAirtable(env, data);
        break;

      default:
        return errorResponse(`Unsupported action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: corsHeaders(),
    });

  } catch (err) {
    console.error("Server error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

function errorResponse(message) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status: 400,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
}

async function saveToAirtable(env, data) {
  const { prompt, botAnswer, files = [], fileAttachments = [] } = data;

  const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = env.AIRTABLE_TABLE_NAME || "Prompts";

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing Airtable credentials in environment");
  }

  const cleanBotAnswer = botAnswer?.trim() || "No response";
  const fileCount = files.length;

  const attachments = fileAttachments
    .filter(file => file.url)
    .map(file => ({
      filename: file.name,
      url: file.url,
    }));

  const fields = {
    Prompt: prompt,
    Bot_Answer: cleanBotAnswer,
    Timestamp: new Date().toISOString(),
    File_Count: fileCount,
  };

  if (attachments.length > 0) {
    fields["File_Attachments"] = attachments;
  }

  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }] }),
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
