import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const getWeather = tool({
  description: 'Get the current weather for a city',
  inputSchema: z.object({
    city: z.string().describe('The city name, for example "Paris"'),
  }),
  // A stub. Replace with a real weather API call.
  execute: async ({ city }) => ({
    city,
    temperatureCelsius: 18,
    condition: 'partly cloudy',
  }),
});

const result = await generateText({
  model: pipeshift('zai-org/GLM-5.3'),
  tools: { getWeather },
  // Step 1: the model calls the tool. Step 2: it answers using the result.
  stopWhen: stepCountIs(2),
  prompt: 'What is the weather in Paris right now?',
  maxOutputTokens: 1024,
});

for (const step of result.steps) {
  for (const call of step.toolCalls) {
    console.log('Tool call:', call.toolName, JSON.stringify(call.input));
  }
  for (const toolResult of step.toolResults) {
    console.log('Tool result:', JSON.stringify(toolResult.output));
  }
}

console.log();
console.log('Answer:', result.text);
console.log('Steps:', result.steps.length);
