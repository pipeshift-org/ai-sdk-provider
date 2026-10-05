import { createPipeshift } from '@pipeshift-org/ai-sdk-provider';
import { generateText } from 'ai';

// The deployment URL and served model name are on the deployment page.
const modelURL = process.env.PIPESHIFT_DEPLOYMENT_URL ?? '';
const modelName = process.env.PIPESHIFT_DEPLOYMENT_MODEL ?? '';

if (modelURL === '' || modelName === '') {
  console.log(
    'Skipped: set PIPESHIFT_DEPLOYMENT_URL and PIPESHIFT_DEPLOYMENT_MODEL to run this example.',
  );
  process.exit(0);
}

const pipeshift = createPipeshift({ modelURL });

const { text, usage } = await generateText({
  model: pipeshift(modelName),
  prompt: 'Say hello from a dedicated deployment in one sentence.',
  maxOutputTokens: 256,
});

console.log(text);
console.log();
console.log('Usage:', usage);
