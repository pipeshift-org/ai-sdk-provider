import { pipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const recipeSchema = z.object({
  name: z.string(),
  servings: z.number(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

const { output, usage } = await generateText({
  model: pipeshift('zai-org/GLM-5.3'),
  output: Output.object({ schema: recipeSchema }),
  // The serverless API runs in JSON mode and does not receive the schema,
  // so the prompt names every field.
  prompt:
    'Give me a simple pancake recipe as JSON with these fields: ' +
    '"name" (string), "servings" (number), "ingredients" (array of strings), ' +
    '"steps" (array of strings). Keep it short.',
  // Reasoning models think before they write the JSON. Leave room for both.
  maxOutputTokens: 1024,
});

console.log(output);
console.log();
console.log('Usage:', usage);
