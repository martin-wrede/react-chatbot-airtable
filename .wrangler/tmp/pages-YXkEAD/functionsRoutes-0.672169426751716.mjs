import { onRequest as __ai_airtable_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-airtable\\functions\\ai-airtable.js"

export const routes = [
    {
      routePath: "/ai-airtable",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_airtable_js_onRequest],
    },
  ]