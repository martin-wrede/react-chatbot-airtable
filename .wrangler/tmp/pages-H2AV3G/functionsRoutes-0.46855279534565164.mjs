import { onRequest as __ai_airtable_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-airtable\\functions\\ai-airtable.js"
import { onRequest as __ai_airtable_mitbotanswer_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-airtable\\functions\\ai-airtable-mitbotanswer.js"
import { onRequest as __ai_airtable_start_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-airtable\\functions\\ai-airtable-start.js"

export const routes = [
    {
      routePath: "/ai-airtable",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_airtable_js_onRequest],
    },
  {
      routePath: "/ai-airtable-mitbotanswer",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_airtable_mitbotanswer_js_onRequest],
    },
  {
      routePath: "/ai-airtable-start",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_airtable_start_js_onRequest],
    },
  ]