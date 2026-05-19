import { describe, it, expect } from '@jest/globals';
import {
  successResponse,
  validationErrorResponse,
  internalErrorResponse,
  serviceUnavailableResponse,
} from '../../src/utils/response-helper.js';

describe('response-helper', () => {

  it('successResponse debe devolver statusCode 202', () => {
    const resp = successResponse({ traslado_id: 'abc123' });
    expect(resp.statusCode).toBe(202);
    const body = JSON.parse(resp.body);
    expect(body.traslado_id).toBe('abc123');
  });

  it('validationErrorResponse debe devolver statusCode 400', () => {
    const resp = validationErrorResponse('Error de validación', ['campo requerido']);
    expect(resp.statusCode).toBe(400);
    const body = JSON.parse(resp.body);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toHaveLength(1);
  });

  it('internalErrorResponse no debe exponer detalles técnicos', () => {
    const resp = internalErrorResponse('req-123');
    expect(resp.statusCode).toBe(500);
    const body = JSON.parse(resp.body);
    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('errorMessage');
    expect(body.correlationId).toBe('req-123');
  });

  it('serviceUnavailableResponse debe devolver statusCode 503', () => {
    const resp = serviceUnavailableResponse();
    expect(resp.statusCode).toBe(503);
    const body = JSON.parse(resp.body);
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
  });

});