import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { APICallError, LoadAPIKeyError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPipeshift } from './pipeshift-provider';

const SERVERLESS_URL = 'https://api.pipeshift.com/api/v0/chat/completions';
const DEDICATED_HOST = 'https://my-model-us-east-1-a1b2c3-private.pipeshift.com';
const DEDICATED_URL = `${DEDICATED_HOST}/v1/chat/completions`;
const MODEL_ID = 'zai-org/GLM-5.3';

const PROMPT: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const server = createTestServer({
  [SERVERLESS_URL]: {},
  [DEDICATED_URL]: {},
});

function chatCompletion({
  content = 'Hi there!',
  reasoningContent,
  usage = { prompt_tokens: 4, completion_tokens: 30, total_tokens: 34 },
}: {
  content?: string;
  reasoningContent?: string;
  usage?: Record<string, unknown>;
} = {}) {
  return {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1760000000,
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          ...(reasoningContent != null
            ? { reasoning_content: reasoningContent }
            : {}),
        },
        finish_reason: 'stop',
      },
    ],
    usage,
  };
}

function prepareJsonResponse(
  url: typeof SERVERLESS_URL | typeof DEDICATED_URL = SERVERLESS_URL,
) {
  server.urls[url].response = { type: 'json-value', body: chatCompletion() };
}

async function captureError(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail');
}

async function readStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const parts: T[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

const provider = createPipeshift({ apiKey: 'test-api-key' });

describe('doGenerate', () => {
  beforeEach(() => {
    prepareJsonResponse();
  });

  it('posts the model id and messages to the serverless chat endpoint', async () => {
    await provider.chatModel(MODEL_ID).doGenerate({ prompt: PROMPT });

    const call = server.calls[0];
    expect(call.requestUrl).toBe(SERVERLESS_URL);
    expect(call.requestMethod).toBe('POST');
    expect(await call.requestBodyJson).toMatchObject({
      model: MODEL_ID,
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('sends the bearer key and the user agent suffix', async () => {
    await provider.chatModel(MODEL_ID).doGenerate({ prompt: PROMPT });

    const call = server.calls[0];
    expect(call.requestHeaders.authorization).toBe('Bearer test-api-key');
    expect(call.requestUserAgent).toContain('ai-sdk-pipeshift/0.1.0');
  });

  it('returns reasoning_content as a reasoning part next to the text', async () => {
    server.urls[SERVERLESS_URL].response = {
      type: 'json-value',
      body: chatCompletion({
        content: 'The answer is 4.',
        reasoningContent: 'Two plus two is four.',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 30,
          total_tokens: 40,
          completion_tokens_details: { reasoning_tokens: 20 },
        },
      }),
    };

    const { content, usage } = await provider
      .chatModel(MODEL_ID)
      .doGenerate({ prompt: PROMPT });

    // @ai-sdk/openai-compatible emits the text part before the reasoning part.
    expect(content).toEqual([
      { type: 'text', text: 'The answer is 4.' },
      { type: 'reasoning', text: 'Two plus two is four.' },
    ]);
    expect(usage.inputTokens.total).toBe(10);
    expect(usage.outputTokens).toMatchObject({
      total: 30,
      text: 10,
      reasoning: 20,
    });
  });

  describe('JSON response format with a schema', () => {
    const schema = {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    } as const;

    it('falls back to json_object and warns by default', async () => {
      const { warnings } = await provider.chatModel(MODEL_ID).doGenerate({
        prompt: PROMPT,
        responseFormat: { type: 'json', schema },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'responseFormat',
        }),
      );
    });

    it('sends json_schema when supportsStructuredOutputs is true', async () => {
      await createPipeshift({
        apiKey: 'test-api-key',
        supportsStructuredOutputs: true,
      })
        .chatModel(MODEL_ID)
        .doGenerate({
          prompt: PROMPT,
          responseFormat: { type: 'json', schema, name: 'weather' },
        });

      const body = await server.calls[0].requestBodyJson;
      expect(body.response_format).toEqual({
        type: 'json_schema',
        json_schema: { schema, strict: true, name: 'weather' },
      });
    });
  });

  describe('errors', () => {
    it.each([
      {
        name: 'OpenAI-style error object',
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'Unknown error',
            type: 'upstream_error',
            param: 'upstream',
          },
        },
        message: 'Unknown error',
      },
      {
        name: 'string error',
        status: 400,
        body: { error: 'some string' },
        message: 'some string',
      },
      {
        name: 'string detail',
        status: 404,
        body: { detail: 'Model deployment not found' },
        message: 'Model deployment not found',
      },
      {
        name: 'validation detail list',
        status: 422,
        body: {
          detail: [
            {
              type: 'missing',
              loc: ['body', 'messages'],
              msg: 'Field required',
              input: {},
            },
            { type: 'value_error', loc: [], msg: 'Bad value' },
          ],
        },
        message: 'body.messages: Field required; Bad value',
      },
    ])('maps the $name envelope to an APICallError', async testCase => {
      server.urls[SERVERLESS_URL].response = {
        type: 'error',
        status: testCase.status,
        body: JSON.stringify(testCase.body),
      };

      const error = await captureError(
        provider.chatModel(MODEL_ID).doGenerate({ prompt: PROMPT }),
      );

      expect(APICallError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        message: testCase.message,
        statusCode: testCase.status,
      });
    });
  });

  it('sends requests for a dedicated deployment to <modelURL>/v1/chat/completions', async () => {
    prepareJsonResponse(DEDICATED_URL);

    await createPipeshift({ apiKey: 'test-api-key', modelURL: DEDICATED_HOST })
      .chatModel('my-model')
      .doGenerate({ prompt: PROMPT });

    expect(server.calls[0].requestUrl).toBe(DEDICATED_URL);
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'my-model',
    });
  });

  describe('without an API key', () => {
    let savedKey: string | undefined;

    beforeEach(() => {
      savedKey = process.env.PIPESHIFT_API_KEY;
      delete process.env.PIPESHIFT_API_KEY;
    });

    afterEach(() => {
      if (savedKey !== undefined) process.env.PIPESHIFT_API_KEY = savedKey;
    });

    it('throws LoadAPIKeyError when the request is made', async () => {
      // Creating the provider and model must not throw; the key is read lazily.
      const model = createPipeshift().chatModel(MODEL_ID);

      const error = await captureError(model.doGenerate({ prompt: PROMPT }));

      expect(LoadAPIKeyError.isInstance(error)).toBe(true);
      expect(server.calls).toHaveLength(0);
    });
  });
});

describe('doStream', () => {
  function sse(data: unknown) {
    return `data: ${JSON.stringify(data)}\n\n`;
  }

  function chunk(delta: Record<string, unknown>, extra = {}) {
    return sse({
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1760000000,
      model: MODEL_ID,
      choices: [{ index: 0, delta, finish_reason: null }],
      ...extra,
    });
  }

  beforeEach(() => {
    server.urls[SERVERLESS_URL].response = {
      type: 'stream-chunks',
      chunks: [
        chunk({ role: 'assistant', reasoning_content: 'Thinking' }),
        chunk({ reasoning_content: ' hard.' }),
        chunk({ content: 'Hello' }),
        chunk({ content: ', world!' }),
        sse({
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1760000000,
          model: MODEL_ID,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }),
        sse({
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1760000000,
          model: MODEL_ID,
          choices: [],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 12,
            total_tokens: 17,
            completion_tokens_details: { reasoning_tokens: 8 },
          },
        }),
        'data: [DONE]\n\n',
      ],
    };
  });

  it('asks for a stream with usage included', async () => {
    const { stream } = await provider
      .chatModel(MODEL_ID)
      .doStream({ prompt: PROMPT });
    await readStream(stream);

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: MODEL_ID,
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('emits reasoning-delta and text-delta parts and the final usage', async () => {
    const { stream } = await provider
      .chatModel(MODEL_ID)
      .doStream({ prompt: PROMPT });
    const parts: LanguageModelV4StreamPart[] = await readStream(stream);

    const deltas = parts
      .filter(p => p.type === 'reasoning-delta' || p.type === 'text-delta')
      .map(p => [p.type, (p as { delta: string }).delta]);
    expect(deltas).toEqual([
      ['reasoning-delta', 'Thinking'],
      ['reasoning-delta', ' hard.'],
      ['text-delta', 'Hello'],
      ['text-delta', ', world!'],
    ]);

    const finish = parts.find(p => p.type === 'finish');
    expect(finish).toMatchObject({
      usage: {
        inputTokens: { total: 5 },
        outputTokens: { total: 12, text: 4, reasoning: 8 },
      },
    });
  });
});
