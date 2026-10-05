# Changelog

## 0.1.0

First release.

- `createPipeshift()` and a default `pipeshift` instance built on `@ai-sdk/openai-compatible`.
- Serverless model APIs at `https://api.pipeshift.com/api/v0` by default, with the API key read from `PIPESHIFT_API_KEY`.
- `modelURL` option for dedicated deployments. The provider appends `/v1` and sends chat and embedding requests to the deployment host.
- Chat models with streaming, tool calls and reasoning output. Usage is requested on streams.
- Embedding models through `embeddingModel()`.
- Pipeshift error responses, in both the OpenAI envelope and the gateway `detail` envelope, are mapped to readable `APICallError` messages.
- `supportsStructuredOutputs` setting, off by default because the serverless API does not accept `json_schema` response formats yet.
