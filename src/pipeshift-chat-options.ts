// Serverless model ids, from the Pipeshift catalogue on 2026-10-05 and
// verified live. All of them return reasoning content. The ones marked
// "vision" also accept image input. The list is a convenience for editor
// completion; any other id is accepted, and a dedicated deployment takes its
// served model name.
export type PipeshiftChatModelId =
  | 'Qwen/Qwen3.8-Flash' // vision
  | 'Qwen/Qwen3.8-Max' // vision
  | 'deepseek-ai/DeepSeek-V4.1-Flash' // vision
  | 'deepseek-ai/DeepSeek-V4-Flash'
  | 'deepseek-ai/DeepSeek-V4-Pro'
  | 'moonshotai/Kimi-K3' // vision
  | 'zai-org/GLM-5.3'
  | 'zai-org/GLM-5.2'
  | (string & {});
