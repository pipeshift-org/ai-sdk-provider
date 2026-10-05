import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { streamText } from 'ai';

const result = streamText({
  model: pipeshift('deepseek-ai/DeepSeek-V4.1-Flash'),
  prompt: 'Explain in three sentences what a KV cache does in LLM inference.',
  maxOutputTokens: 512,
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}

console.log();
console.log();
console.log('Usage:', await result.usage);
