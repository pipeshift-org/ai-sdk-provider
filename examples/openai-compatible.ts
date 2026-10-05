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
  maxOutputTokens: 2048,
});

console.log(text);
