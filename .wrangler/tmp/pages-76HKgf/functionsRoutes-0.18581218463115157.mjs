import { onRequest as __ai_airtable_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-airtable\\functions\\ai-airtable.js"
import { onRequest as __ai_airtable_copy_2_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-airtable\\functions\\ai-airtable copy 2.js"
import { onRequest as __ai_airtable_bestversion_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-airtable\\functions\\ai-airtable-bestversion.js"

export const routes = [
    {
      routePath: "/ai-airtable",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_airtable_js_onRequest],
    },
  {
      routePath: "/ai-airtable copy 2",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_airtable_copy_2_js_onRequest],
    },
  {
      routePath: "/ai-airtable-bestversion",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_airtable_bestversion_js_onRequest],
    },
  ]