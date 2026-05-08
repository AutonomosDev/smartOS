// Re-exports para que otros packages workspace consuman la capa de datos.
export { db, pool } from "./db/client.js";
export * as schema from "./db/schema/index.js";
export { agentActions } from "./db/schema/agent-actions.js";
export { chatMensajes, chatSesiones } from "./db/schema/chat-sesiones.js";
