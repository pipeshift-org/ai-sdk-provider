import { APICallError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPipeshift } from './pipeshift-provider';

const SERVERLESS_URL = 'https://api.pipeshift.com/api/v0/embeddings';
const DEDICATED_HOST = 'https://my-embedder-us-east-1-a1b2c3-private.pipeshift.com';
const DEDICATED_URL = `${DEDICATED_HOST}/v1/embeddings`;
const MODEL_ID = 'my-embedder';

const testValues = ['sunny day at the beach', 'rainy day in the city'];

const server = createTestServer({
  [SERVERLESS_URL]: {},
  [DEDICATED_URL]: {},
});

function prepareJsonResponse(
  url: typeof SERVERLESS_URL | typeof DEDICATED_URL = SERVERLESS_URL,
) {
  server.urls[url].response = {
    type: 'json-value',
    body: {
      object: 'list',
      data: [
        { object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] },
        { object: 'embedding', index: 1, embedding: [0.4, 0.5, 0.6] },
      ],
      model: MODEL_ID,
      usage: { prompt_tokens: 8, total_tokens: 8 },
    },
  };
}

async function captureError(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail');
}

const provider = createPipeshift({ apiKey: 'test-api-key' });

describe('doEmbed', () => {
  beforeEach(() => {
    prepareJsonResponse();
  });

  it('posts input, model and encoding_format to the serverless endpoint', async () => {
    await provider.embeddingModel(MODEL_ID).doEmbed({ values: testValues });

    const call = server.calls[0];
    expect(call.requestUrl).toBe(SERVERLESS_URL);
    expect(call.requestMethod).toBe('POST');
    expect(call.requestHeaders.authorization).toBe('Bearer test-api-key');
    expect(await call.requestBodyJson).toEqual({
      input: testValues,
      model: MODEL_ID,
      encoding_format: 'float',
    });
  });

  it('extracts embeddings and usage', async () => {
    const { embeddings, usage } = await provider
      .embeddingModel(MODEL_ID)
      .doEmbed({ values: testValues });

    expect(embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    expect(usage).toEqual({ tokens: 8 });
  });

  it('sends requests for a dedicated deployment to <modelURL>/v1/embeddings', async () => {
    prepareJsonResponse(DEDICATED_URL);

    await createPipeshift({ apiKey: 'test-api-key', modelURL: DEDICATED_HOST })
      .embeddingModel(MODEL_ID)
      .doEmbed({ values: testValues });

    expect(server.calls[0].requestUrl).toBe(DEDICATED_URL);
  });

  it('maps a detail 404 to an APICallError', async () => {
    server.urls[SERVERLESS_URL].response = {
      type: 'error',
      status: 404,
      body: JSON.stringify({ detail: 'Model deployment not found' }),
    };

    const error = await captureError(
      provider.embeddingModel(MODEL_ID).doEmbed({ values: testValues }),
    );

    expect(APICallError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      message: 'Model deployment not found',
      statusCode: 404,
    });
  });
});
