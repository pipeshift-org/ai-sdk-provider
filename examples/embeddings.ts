import { createPipeshift } from '@pipeshift-org/ai-sdk-provider';
import { cosineSimilarity, embed, embedMany } from 'ai';

// Embeddings run on a dedicated deployment that serves an embedding model.
const modelURL = process.env.PIPESHIFT_DEPLOYMENT_URL ?? '';
const modelName = process.env.PIPESHIFT_DEPLOYMENT_MODEL ?? '';

if (modelURL === '' || modelName === '') {
  console.log(
    'Skipped: set PIPESHIFT_DEPLOYMENT_URL and PIPESHIFT_DEPLOYMENT_MODEL to run this example.',
  );
  process.exit(0);
}

const pipeshift = createPipeshift({ modelURL });
const model = pipeshift.embeddingModel(modelName);

const { embedding } = await embed({
  model,
  value: 'sunny day at the beach',
});
console.log('Single embedding, dimensions:', embedding.length);

const { embeddings } = await embedMany({
  model,
  values: [
    'sunny day at the beach',
    'rainy afternoon in the city',
    'snowy night in the mountains',
  ],
});
console.log('Batch embeddings:', embeddings.length);
console.log(
  'Similarity of the first two:',
  cosineSimilarity(embeddings[0], embeddings[1]).toFixed(4),
);
