import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const loadSwaggerSpec = () => {
  const swaggerPath = path.resolve(__dirname, '../docs/swagger.yaml');
  const fileContents = fs.readFileSync(swaggerPath, 'utf8');
  return yaml.load(fileContents);
};

export const setupSwagger = (app) => {
  const swaggerDocument = loadSwaggerSpec();

  app.get('/api-docs.json', (_req, res) => {
    res.status(200).json(swaggerDocument);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'Pulsar Payments API - Docs',
      swaggerOptions: {
        persistAuthorization: true
      }
    })
  );
};

export default setupSwagger;

