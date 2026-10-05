import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText } from 'ai';

const { text, usage, finishReason } = await generateText({
  model: pipeshift('zai-org/GLM-5.3'),
  prompt: 'Write a haiku about a GPU cluster at night.',
  maxOutputTokens: 2048,
});

console.log(text);
console.log();
console.log('Finish reason:', finishReason);
console.log('Usage:', usage);
