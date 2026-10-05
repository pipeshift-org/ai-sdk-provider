import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  type ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type EmbeddingModelV4,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { PipeshiftChatModelId } from './pipeshift-chat-options';
import type { PipeshiftEmbeddingModelId } from './pipeshift-embedding-options';
import { VERSION } from './version';

/**
 * Base URL of the serverless model APIs. The SDK appends `/chat/completions`
 * and `/embeddings` to it.
 */
export const DEFAULT_BASE_URL = 'https://api.pipeshift.com/api/v0';

// Pipeshift answers with two error envelopes. Engine errors come back in the
// OpenAI shape, `{"error":{"message":...}}`. Routing and validation errors come
// from the gateway as `{"detail":...}`, where detail is either a string
// ("Model deployment not found") or a list of field errors.
const pipeshiftErrorSchema = z.union([
  z.object({
    error: z.union([
      z.string(),
      z.object({
        message: z.string(),
        type: z.string().nullish(),
        param: z.any().nullish(),
        code: z.union([z.string(), z.number()]).nullish(),
      }),
    ]),
  }),
  z.object({
    detail: z.union([
      z.string(),
      z.array(
        z.object({
          msg: z.string(),
          loc: z.array(z.union([z.string(), z.number()])).nullish(),
        }),
      ),
    ]),
  }),
]);

export type PipeshiftErrorData = z.infer<typeof pipeshiftErrorSchema>;

const pipeshiftErrorStructure: ProviderErrorStructure<PipeshiftErrorData> = {
  errorSchema: pipeshiftErrorSchema,
  errorToMessage: data => {
    if ('error' in data) {
      return typeof data.error === 'string' ? data.error : data.error.message;
    }
    if (typeof data.detail === 'string') {
      return data.detail;
    }
    return data.detail
      .map(item =>
        item.loc?.length ? `${item.loc.join('.')}: ${item.msg}` : item.msg,
      )
      .join('; ');
  },
};

export interface PipeshiftProviderSettings {
  /**
   * Pipeshift API key. Defaults to the `PIPESHIFT_API_KEY` environment
   * variable.
   */
  apiKey?: string;

  /**
   * Base URL of the serverless model APIs.
   * Default: `https://api.pipeshift.com/api/v0`.
   */
  baseURL?: string;

  /**
   * URL of a dedicated deployment, as shown on its deployment page, for
   * example `https://my-model-us-east-1-a1b2c3-private.pipeshift.com`.
   * When set, chat and embedding requests go to this host under `/v1`
   * instead of the serverless APIs. Pass the deployment's served model name
   * as the model id.
   */
  modelURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. Use it to intercept requests, or to provide
   * a fetch for testing.
   */
  fetch?: FetchFunction;

  /**
   * Whether the target accepts `response_format: { type: 'json_schema' }`.
   * Default `false`: structured output then runs in JSON mode
   * (`json_object`), the schema is not sent, and the prompt must describe the
   * fields you want. Set `true` for a dedicated deployment whose engine
   * accepts JSON schema.
   */
  supportsStructuredOutputs?: boolean;
}

export interface PipeshiftProvider extends ProviderV4 {
  /**
   * Creates a chat model for text generation.
   */
  (modelId: PipeshiftChatModelId): LanguageModelV4;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId: PipeshiftChatModelId): LanguageModelV4;

  /**
   * Creates a language model for text generation. Alias for `chatModel`.
   */
  languageModel(modelId: PipeshiftChatModelId): LanguageModelV4;

  /**
   * Creates an embedding model.
   */
  embeddingModel(modelId: PipeshiftEmbeddingModelId): EmbeddingModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: PipeshiftEmbeddingModelId): EmbeddingModelV4;
}

// A dedicated deployment serves the OpenAI-compatible routes under /v1 on its
// own host. Accept the host with or without that suffix, and with or without
// a trailing slash, so what is pasted from the deployment page just works.
function dedicatedBaseURL(modelURL: string): string {
  const url = withoutTrailingSlash(modelURL) ?? modelURL;
  return url.endsWith('/v1') ? url : `${url}/v1`;
}

export function createPipeshift(
  options: PipeshiftProviderSettings = {},
): PipeshiftProvider {
  const baseURL = options.modelURL
    ? dedicatedBaseURL(options.modelURL)
    : (withoutTrailingSlash(options.baseURL) ?? DEFAULT_BASE_URL);

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'PIPESHIFT_API_KEY',
          description: 'Pipeshift API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk-pipeshift/${VERSION}`,
    );

  const getCommonModelConfig = (modelType: 'chat' | 'embedding') => ({
    provider: `pipeshift.${modelType}`,
    url: ({ path }: { path: string }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
    errorStructure: pipeshiftErrorStructure,
  });

  const createChatModel = (modelId: PipeshiftChatModelId) =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      ...getCommonModelConfig('chat'),
      // Ask for usage on streams; without stream_options.include_usage the
      // final chunk carries no token counts.
      includeUsage: true,
      supportsStructuredOutputs: options.supportsStructuredOutputs ?? false,
    });

  const createEmbeddingModel = (modelId: PipeshiftEmbeddingModelId) =>
    new OpenAICompatibleEmbeddingModel(modelId, {
      ...getCommonModelConfig('embedding'),
    });

  const provider = (modelId: PipeshiftChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.chatModel = createChatModel;
  provider.languageModel = createChatModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

/**
 * Default Pipeshift provider instance, using the serverless model APIs and
 * the `PIPESHIFT_API_KEY` environment variable.
 */
export const pipeshift = createPipeshift();
