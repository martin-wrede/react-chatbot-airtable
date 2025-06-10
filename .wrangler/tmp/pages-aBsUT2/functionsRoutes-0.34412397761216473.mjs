import { onRequest as __ai_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-main\\functions\\ai.js"
import { onRequest as __ai_copy_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-main\\functions\\ai copy.js"
import { onRequest as __ai2_js_onRequest } from "D:\\Documents\\CODING\\JAVASCRIPT\\react-chatbot-main\\functions\\ai2.js"

export const routes = [
    {
      routePath: "/ai",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_js_onRequest],
    },
  {
      routePath: "/ai copy",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai_copy_js_onRequest],
    },
  {
      routePath: "/ai2",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ai2_js_onRequest],
    },
  ]