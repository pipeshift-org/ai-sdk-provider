# Pipeshift Provider for the AI SDK

`@pipeshift-org/ai-sdk-provider` connects the [Vercel AI SDK](https://ai-sdk.dev) to [Pipeshift](https://pipeshift.com). It covers the serverless model APIs and dedicated deployments. You can use Pipeshift models with `generateText`, `streamText`, tool calling, structured output and embeddings.

## Installation

```bash
npm install @pipeshift-org/ai-sdk-provider ai
```

The package needs Node.js 22 or later and `zod` 3.25.76+ or 4.1.8+ as a peer dependency.

## Setup

Create an API key in the Pipeshift dashboard and set it in your environment:

```bash
export PIPESHIFT_API_KEY=your-api-key
```

Import the default `pipeshift` instance. It reads `PIPESHIFT_API_KEY` and calls the serverless API at `https://api.pipeshift.com/api/v0`.

```ts
import { pipeshift } from '@pipeshift-org/ai-sdk-provider';

const model = pipeshift('zai-org/GLM-5.3');
```

Use `createPipeshift` when you need other settings, such as an explicit key or extra headers:

```ts
import { createPipeshift } from '@pipeshift-org/ai-sdk-provider';

const pipeshift = createPipeshift({
  apiKey: process.env.MY_PIPESHIFT_KEY,
  headers: { 'X-Request-Source': 'my-app' },
});
```

See [Provider settings](#provider-settings) for every option.

## Text generation

```ts
import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText } from 'ai';

const { text } = await generateText({
  model: pipeshift('zai-org/GLM-5.3'),
  prompt: 'Write a haiku about a GPU cluster at night.',
});

console.log(text);
```

All four serverless models reason before they answer, and reasoning tokens count toward `maxOutputTokens`. If you set a low limit, the model can run out of tokens before it writes any text. In that case `finishReason` is `length`. A haiku from GLM-5.3 used about 1,600 reasoning tokens in our tests.

## Streaming

```ts
import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { streamText } from 'ai';

const result = streamText({
  model: pipeshift('deepseek-ai/DeepSeek-V4.1-Flash'),
  prompt: 'Explain what a KV cache does in LLM inference.',
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}

console.log(await result.usage);
```

The provider requests token usage on streams, so `result.usage` is filled in when the stream ends.

## Tool calling

Define tools with `tool()` and set `stopWhen` so the model gets a second step to answer from the tool result.

```ts
import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: pipeshift('zai-org/GLM-5.3'),
  tools: {
    getWeather: tool({
      description: 'Get the current weather for a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, temperatureCelsius: 18 }),
    }),
  },
  stopWhen: stepCountIs(2),
  prompt: 'What is the weather in Paris right now?',
});

console.log(result.text);
```

## Reasoning models

All four serverless models (`zai-org/GLM-5.3`, `zai-org/GLM-5.2`, `deepseek-ai/DeepSeek-V4.1-Flash` and `Qwen/Qwen3.8-Max`) return their reasoning separately from the answer. The AI SDK exposes it in three places:

- `result.finalStep.reasoningText` holds the reasoning from `generateText`. In AI SDK 7, `result.reasoningText` still works but is deprecated.
- `reasoning-delta` parts appear in `streamText`'s `fullStream`.
- `usage.outputTokenDetails.reasoningTokens` holds the reasoning token count.

```ts
import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText } from 'ai';

const result = await generateText({
  model: pipeshift('deepseek-ai/DeepSeek-V4.1-Flash'),
  prompt: 'A bat and a ball cost 1.10. The bat costs 1.00 more than the ball. What does the ball cost?',
});

console.log(result.finalStep.reasoningText);
console.log(result.text);
console.log(result.usage.outputTokenDetails.reasoningTokens);
```

When streaming, read reasoning and text from `fullStream`:

```ts
for await (const part of result.fullStream) {
  if (part.type === 'reasoning-delta') process.stdout.write(part.text);
  if (part.type === 'text-delta') process.stdout.write(part.text);
}
```

## Structured output

`Output.object` works with the serverless API in JSON mode. Keep these points in mind:

- The provider sends `response_format: { type: 'json_object' }`. The schema itself is not sent, so name each field in the prompt. The AI SDK still validates the reply against your schema.
- The AI SDK logs a warning that the `responseFormat` schema is not supported. This is expected in JSON mode.
- Reasoning models think before they write the JSON. Leave room for both. A 256 token limit cut the JSON off in our tests. 1024 worked.
- The serverless API rejects `response_format: { type: 'json_schema' }` with HTTP 400 today. That is why `supportsStructuredOutputs` defaults to `false`.

```ts
import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model: pipeshift('zai-org/GLM-5.3'),
  output: Output.object({
    schema: z.object({
      name: z.string(),
      servings: z.number(),
      ingredients: z.array(z.string()),
    }),
  }),
  prompt:
    'Give me a pancake recipe as JSON with the fields "name" (string), ' +
    '"servings" (number) and "ingredients" (array of strings).',
  maxOutputTokens: 1024,
});

console.log(output);
```

If you run a dedicated deployment whose engine accepts JSON schema, set `supportsStructuredOutputs: true` in `createPipeshift`. The provider then sends the schema with the request.

## Dedicated deployments

Each dedicated deployment has its own host, for example `https://my-model-us-east-1-a1b2c3-private.pipeshift.com`. Pass that host as `modelURL`. The provider sends requests to `/v1/chat/completions` and `/v1/embeddings` on it. You can paste the URL with or without `/v1` and with or without a trailing slash.

Use the deployment's served model name as the model id. It defaults to the deployment name, and the deployment page shows it.

```ts
import { createPipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText } from 'ai';

const pipeshift = createPipeshift({
  modelURL: 'https://my-model-us-east-1-a1b2c3-private.pipeshift.com',
});

const { text } = await generateText({
  model: pipeshift('my-model'),
  prompt: 'Say hello.',
});
```

The provider sends `PIPESHIFT_API_KEY` (or `apiKey`) to the deployment as a Bearer token.

## Embeddings

Serve an embedding model on a dedicated deployment, then create the model with `embeddingModel` and call `embed` or `embedMany`.

```ts
import { createPipeshift } from '@pipeshift-org/ai-sdk-provider';
import { embed, embedMany } from 'ai';

const pipeshift = createPipeshift({
  modelURL: 'https://my-embedder-us-east-1-a1b2c3-private.pipeshift.com',
});
const model = pipeshift.embeddingModel('my-embedder');

const { embedding } = await embed({
  model,
  value: 'sunny day at the beach',
});

const { embeddings } = await embedMany({
  model,
  values: ['sunny day at the beach', 'rainy afternoon in the city'],
});
```

## Provider settings

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `apiKey` | `string` | `process.env.PIPESHIFT_API_KEY` | API key, sent as a Bearer token. |
| `baseURL` | `string` | `https://api.pipeshift.com/api/v0` | Base URL of the serverless API. Exported as `DEFAULT_BASE_URL`. |
| `modelURL` | `string` | none | Host of a dedicated deployment. When set, requests go to `<modelURL>/v1` and `baseURL` is ignored. |
| `headers` | `Record<string, string>` | none | Extra headers for every request. |
| `fetch` | `FetchFunction` | global `fetch` | Custom fetch, for example to intercept requests in tests. |
| `supportsStructuredOutputs` | `boolean` | `false` | Send `response_format: json_schema` for structured output. Set `true` only for a deployment whose engine accepts it. |

## Model ids

These serverless chat models are available today:

- `zai-org/GLM-5.3`
- `zai-org/GLM-5.2`
- `deepseek-ai/DeepSeek-V4.1-Flash`
- `Qwen/Qwen3.8-Max`

Pipeshift has no model listing endpoint. Find current ids in the Pipeshift dashboard. The `PipeshiftChatModelId` type lists the ids above for editor completion, and any other string is accepted.

An unknown id fails with an `APICallError` whose message is `Model deployment not found` (status 404). A bad key fails with `Invalid API KEY provided: ...` (status 401).

## Using `@ai-sdk/openai-compatible` directly

Pipeshift's API is OpenAI compatible, so the generic provider from the AI SDK also works:

```bash
npm install @ai-sdk/openai-compatible ai
```

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const pipeshift = createOpenAICompatible({
  name: 'pipeshift',
  baseURL: 'https://api.pipeshift.com/api/v0',
  apiKey: process.env.PIPESHIFT_API_KEY,
});

const { text } = await generateText({
  model: pipeshift('zai-org/GLM-5.3'),
  prompt: 'Hello',
});
```

Use the generic provider if you already depend on it and only need serverless chat. This package adds the default base URL, the `PIPESHIFT_API_KEY` env var, `modelURL` handling for dedicated deployments, and clear error messages from both Pipeshift error formats.

## Examples

The [`examples/`](./examples) folder has one script per feature. To run them from a clone of this repo:

```bash
npm install
npm run build
cp .env.example .env   # then add your PIPESHIFT_API_KEY
npm run example -- examples/generate-text.ts
```

| File | Shows |
| --- | --- |
| `generate-text.ts` | `generateText` with usage and finish reason |
| `stream-text.ts` | `streamText` with `textStream` |
| `tool-call.ts` | A weather tool with `stopWhen: stepCountIs(2)` |
| `structured-output.ts` | `Output.object` in JSON mode |
| `reasoning.ts` | Reasoning text and reasoning token count |
| `dedicated-deployment.ts` | `modelURL` with a served model name |
| `embeddings.ts` | `embed` and `embedMany` on a dedicated deployment |
| `openai-compatible.ts` | The generic `@ai-sdk/openai-compatible` provider |

`dedicated-deployment.ts` and `embeddings.ts` need `PIPESHIFT_DEPLOYMENT_URL` and `PIPESHIFT_DEPLOYMENT_MODEL` in `.env`. Without them, they print a message and exit.

## License

[Apache-2.0](./LICENSE)
