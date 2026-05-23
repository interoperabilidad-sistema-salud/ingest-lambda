import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mocks de los servicios externos — la Lambda no debe conectarse a AWS real en las pruebas
jest.unstable_mockModule('../../src/services/fhir-validator.js', () => ({
  validateFhirBundle: jest.fn(),
  extractBundleMetadata: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/dynamo-client.js', () => ({
  saveAuditRecord: jest.fn(),
  AUDIT_STATUS: {
    RECEIVED: 'RECEIVED',
    IN_QUEUE: 'IN_QUEUE',
    DELIVERED: 'DELIVERED',
    FAILED: 'FAILED',
  },
}));

jest.unstable_mockModule('../../src/services/s3-client.js', () => ({
  saveEvidenceToS3: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/sqs-client.js', () => ({
  publishTrasladoToQueue: jest.fn(),
}));

// Evento base de API Gateway para reusar en las pruebas
const makeEvent = (overrides = {}) => ({
  body: JSON.stringify({
    resourceType: 'Bundle',
    type: 'document',
    timestamp: '2026-04-17T10:00:00Z',
    entry: [
      { resource: { resourceType: 'Patient', id: 'p-123' } },
      { resource: { resourceType: 'Composition', author: [{ identifier: { value: 'EPS001' } }] } },
    ],
  }),
  headers: {
    'x-eps-destino': 'EPS002',
    'x-eps-origen': 'EPS001',
  },
  requestContext: {},
  ...overrides,
});

const makeContext = () => ({ awsRequestId: 'test-correlation-id-123' });

describe('Lambda Ingest — handler', () => {
  let handler;
  let validateFhirBundle;
  let extractBundleMetadata;
  let saveEvidenceToS3;
  let saveAuditRecord;
  let publishTrasladoToQueue;

  beforeEach(async () => {
    // Importa los módulos mockeados antes de cada prueba
    const validatorModule = await import('../../src/services/fhir-validator.js');
    const dynamoModule = await import('../../src/services/dynamo-client.js');
    const s3Module = await import('../../src/services/s3-client.js');
    const sqsModule = await import('../../src/services/sqs-client.js');
    const handlerModule = await import('../../src/handlers/ingest.js');

    handler = handlerModule.handler;
    validateFhirBundle = validatorModule.validateFhirBundle;
    extractBundleMetadata = validatorModule.extractBundleMetadata;
    saveEvidenceToS3 = s3Module.saveEvidenceToS3;
    saveAuditRecord = dynamoModule.saveAuditRecord;
    publishTrasladoToQueue = sqsModule.publishTrasladoToQueue;

    // Configura los mocks con respuestas exitosas por defecto
    validateFhirBundle.mockReturnValue({ valid: true, errors: [] });
    extractBundleMetadata.mockReturnValue({ patientId: 'p-123', epsOrigenId: 'EPS001' });
    saveEvidenceToS3.mockResolvedValue({ s3Key: 'traslados/EPS001/2026/04/test.json', payloadHash: 'abc123' });
    saveAuditRecord.mockResolvedValue({});
    publishTrasladoToQueue.mockResolvedValue('sqs-msg-id-456');
  });

  // ✅ Happy path
  it('debe responder 202 cuando el Bundle FHIR es válido', async () => {
    const response = await handler(makeEvent(), makeContext());
    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    console.log(body);
    expect(body.status).toBe('IN_QUEUE');
    expect(body.transfer_id).toBeDefined();
  });

  // ❌ Body vacío
  it('debe responder 400 si el body está vacío', async () => {
    const response = await handler({ ...makeEvent(), body: null }, makeContext());
    expect(response.statusCode).toBe(400);
  });

  // ❌ JSON inválido
  it('debe responder 400 si el body no es JSON válido', async () => {
    const response = await handler({ ...makeEvent(), body: 'esto no es json{{{' }, makeContext());
    expect(response.statusCode).toBe(400);
  });

  // ❌ Header faltante
  it('debe responder 400 si falta el header X-EPS-Destino', async () => {
    const response = await handler(
      { ...makeEvent(), headers: { 'x-eps-origen': 'EPS001' } },
      makeContext()
    );
    expect(response.statusCode).toBe(400);
  });

  // ❌ Bundle FHIR inválido
  it('debe responder 400 si el Bundle FHIR no es válido', async () => {
    validateFhirBundle.mockReturnValue({ valid: false, errors: ['Falta resourceType'] });
    const response = await handler(makeEvent(), makeContext());
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.details).toContain('Falta resourceType');
  });

  // ❌ Error interno
  it('debe responder 500 si S3 lanza un error inesperado', async () => {
    saveEvidenceToS3.mockRejectedValue(new Error('S3 no disponible'));
    const response = await handler(makeEvent(), makeContext());
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    // No debe exponer el mensaje de error interno
    expect(body).not.toHaveProperty('errorMessage');
  });

  // 🔧 Modo mantenimiento
  it('debe responder 503 si el modo mantenimiento está activo', async () => {
    process.env.MODO_MANTENIMIENTO = 'true';
    const response = await handler(makeEvent(), makeContext());
    expect(response.statusCode).toBe(503);
    process.env.MODO_MANTENIMIENTO = 'false';
  });

});