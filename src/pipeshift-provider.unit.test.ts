import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import { NoSuchModelError } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createPipeshift } from './pipeshift-provider';

const ChatModelMock = OpenAICompatibleChatLanguageModel as unknown as Mock;
const EmbeddingModelMock = OpenAICompatibleEmbeddingModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => {
  const createMockConstructor = () =>
    vi.fn().mockImplementation(function (
      this: any,
      modelId: string,
      config: any,
    ) {
      this.modelId = modelId;
      this.config = config;
    });

  return {
    OpenAICompatibleChatLanguageModel: createMockConstructor(),
    OpenAICompatibleEmbeddingModel: createMockConstructor(),
  };
});

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  };
});

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

function lastChatConfig() {
  return ChatModelMock.mock.calls.at(-1)![1];
}

function lastEmbeddingConfig() {
  return EmbeddingModelMock.mock.calls.at(-1)![1];
}

function chatUrl(options: Parameters<typeof createPipeshift>[0]) {
  createPipeshift(options).chatModel('zai-org/GLM-5.3');
  return lastChatConfig().url({
    path: '/chat/completions',
    modelId: 'zai-org/GLM-5.3',
  });
}

describe('createPipeshift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('default options', () => {
    it('loads the key from PIPESHIFT_API_KEY and sends it as a bearer token', () => {
      createPipeshift().chatModel('zai-org/GLM-5.3');

      const headers = lastChatConfig().headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'PIPESHIFT_API_KEY',
        description: 'Pipeshift API key',
      });
      expect(headers.authorization).toBe('Bearer mock-api-key');
    });

    it('uses the pipeshift.chat and pipeshift.embedding provider ids', () => {
      const provider = createPipeshift();
      provider.chatModel('zai-org/GLM-5.3');
      provider.embeddingModel('my-embedder');

      expect(lastChatConfig().provider).toBe('pipeshift.chat');
      expect(lastEmbeddingConfig().provider).toBe('pipeshift.embedding');
    });

    it('adds the ai-sdk-pipeshift user agent suffix', () => {
      createPipeshift().chatModel('zai-org/GLM-5.3');

      expect(lastChatConfig().headers()['user-agent']).toContain(
        'ai-sdk-pipeshift/0.0.0-test',
      );
    });

    it('always requests usage on chat models', () => {
      createPipeshift().chatModel('zai-org/GLM-5.3');

      expect(lastChatConfig().includeUsage).toBe(true);
    });

    it('does not claim structured output support by default', () => {
      createPipeshift().chatModel('zai-org/GLM-5.3');

      expect(lastChatConfig().supportsStructuredOutputs).toBe(false);
    });
  });

  describe('custom options', () => {
    it('passes apiKey, headers and fetch through', () => {
      const customFetch = vi.fn();
      const provider = createPipeshift({
        apiKey: 'custom-key',
        headers: { 'Custom-Header': 'value' },
        fetch: customFetch,
      });
      provider.chatModel('zai-org/GLM-5.3');
      provider.embeddingModel('my-embedder');

      for (const config of [lastChatConfig(), lastEmbeddingConfig()]) {
        expect(config.headers()['custom-header']).toBe('value');
        expect(config.fetch).toBe(customFetch);
      }

      expect(loadApiKey).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'custom-key' }),
      );
    });

    it('sets supportsStructuredOutputs when asked', () => {
      createPipeshift({ supportsStructuredOutputs: true }).chatModel(
        'zai-org/GLM-5.3',
      );

      expect(lastChatConfig().supportsStructuredOutputs).toBe(true);
    });
  });

  describe('url', () => {
    it('targets the serverless API by default', () => {
      expect(chatUrl({})).toBe(
        'https://api.pipeshift.com/api/v0/chat/completions',
      );
    });

    it('honours a custom baseURL', () => {
      expect(chatUrl({ baseURL: 'https://custom.example.com/api' })).toBe(
        'https://custom.example.com/api/chat/completions',
      );
    });

    it('strips a trailing slash from a custom baseURL', () => {
      expect(chatUrl({ baseURL: 'https://custom.example.com/api/' })).toBe(
        'https://custom.example.com/api/chat/completions',
      );
    });

    describe('modelURL', () => {
      const host = 'https://my-model-us-east-1-a1b2c3-private.pipeshift.com';

      it('appends /v1 to a bare host', () => {
        expect(chatUrl({ modelURL: host })).toBe(
          `${host}/v1/chat/completions`,
        );
      });

      it('appends /v1 to a host with a trailing slash', () => {
        expect(chatUrl({ modelURL: `${host}/` })).toBe(
          `${host}/v1/chat/completions`,
        );
      });

      it('does not double /v1 when the host already ends with it', () => {
        expect(chatUrl({ modelURL: `${host}/v1` })).toBe(
          `${host}/v1/chat/completions`,
        );
        expect(chatUrl({ modelURL: `${host}/v1/` })).toBe(
          `${host}/v1/chat/completions`,
        );
      });

      it('takes precedence over baseURL', () => {
        expect(
          chatUrl({ modelURL: host, baseURL: 'https://custom.example.com' }),
        ).toBe(`${host}/v1/chat/completions`);
      });

      it('applies to embedding models too', () => {
        createPipeshift({ modelURL: host }).embeddingModel('my-embedder');

        expect(
          lastEmbeddingConfig().url({
            path: '/embeddings',
            modelId: 'my-embedder',
          }),
        ).toBe(`${host}/v1/embeddings`);
      });
    });
  });

  describe('model factories', () => {
    it.each(['chatModel', 'languageModel'] as const)(
      '%s constructs a chat model with the given id',
      method => {
        const model = createPipeshift()[method]('zai-org/GLM-5.3');

        expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
        expect(ChatModelMock).toHaveBeenCalledWith(
          'zai-org/GLM-5.3',
          expect.objectContaining({ provider: 'pipeshift.chat' }),
        );
      },
    );

    it('constructs a chat model when the provider is called directly', () => {
      const model = createPipeshift()('deepseek-ai/DeepSeek-V4.1-Flash');

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(ChatModelMock).toHaveBeenCalledWith(
        'deepseek-ai/DeepSeek-V4.1-Flash',
        expect.anything(),
      );
    });

    it.each(['embeddingModel', 'textEmbeddingModel'] as const)(
      '%s constructs an embedding model with the given id',
      method => {
        const model = createPipeshift()[method]('my-embedder');

        expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
        expect(EmbeddingModelMock).toHaveBeenCalledWith(
          'my-embedder',
          expect.objectContaining({ provider: 'pipeshift.embedding' }),
        );
      },
    );

    it('throws NoSuchModelError for image models', () => {
      const provider = createPipeshift();

      expect(() => provider.imageModel('any-model')).toThrow(NoSuchModelError);
    });

    it('declares specification version v4', () => {
      expect(createPipeshift().specificationVersion).toBe('v4');
    });
  });
});
