// Serverless model ids, verified against https://api.pipeshift.com/api/v0 on
// 2026-10-05. The list is a convenience for editor completion; any other id is
// accepted, and a dedicated deployment takes its served model name.
export type PipeshiftChatModelId =
  | 'zai-org/GLM-5.3'
  | 'zai-org/GLM-5.2'
  | 'deepseek-ai/DeepSeek-V4.1-Flash'
  | 'Qwen/Qwen3.8-Max'
  | (string & {});
