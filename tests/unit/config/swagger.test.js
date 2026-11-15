import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { loadSwaggerSpec, setupSwagger } from '../../../src/config/swagger.js';

describe('Config: swagger.js (Especificação OpenAPI 3.0)', () => {
  it('deve carregar e validar a estrutura do arquivo swagger.yaml', () => {
    const spec = loadSwaggerSpec();
    assert.equal(spec.openapi, '3.0.3');
    assert.equal(spec.info.title, 'Pulsar Payments API');
    assert.ok(spec.paths['/auth/register']);
    assert.ok(spec.paths['/auth/login']);
    assert.ok(spec.paths['/accounts']);
    assert.ok(spec.paths['/transactions']);
    assert.ok(spec.paths['/transactions/{id}/refund']);
    assert.ok(spec.paths['/webhooks']);
    assert.ok(spec.paths['/webhooks/test']);
    assert.ok(spec.components.securitySchemes.bearerAuth);
  });

  it('deve registrar as rotas /api-docs e /api-docs.json na aplicação Express', () => {
    const app = express();
    assert.doesNotThrow(() => setupSwagger(app));
  });
});

