import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText } from 'ai';

const result = await generateText({
  model: pipeshift('deepseek-ai/DeepSeek-V4.1-Flash'),
  prompt: 'A bat and a ball cost 1.10 in total. The bat costs 1.00 more than the ball. How much does the ball cost?',
  maxOutputTokens: 1024,
});

console.log('Reasoning:');
console.log(result.finalStep.reasoningText);
console.log();
console.log('Answer:');
console.log(result.text);
console.log();
console.log(
  'Reasoning tokens:',
  result.usage.outputTokenDetails.reasoningTokens,
);
