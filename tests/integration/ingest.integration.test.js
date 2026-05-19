import { describe, it, expect } from '@jest/globals';
import { validateFhirBundle } from '../../src/services/fhir-validator.js';
import { successResponse, validationErrorResponse } from '../../src/utils/response-helper.js';

// Pruebas de integración: verifican que los módulos trabajen correctamente juntos
// sin conectarse a AWS real (eso requeriría infraestructura desplegada)

const bundleValido = {
  resourceType: 'Bundle',
  type: 'document',
  timestamp: '2026-04-17T10:00:00Z',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: 'paciente-integracion-001',
      },
    },
    {
      resource: {
        resourceType: 'Composition',
        author: [{ identifier: { value: 'EPS-ORIGEN-001' } }],
      },
    },
  ],
};

describe('Integración — validación FHIR + respuesta HTTP', () => {

  it('un Bundle válido debe producir una respuesta 202 correctamente formada', () => {
    // Simula el flujo: validar → construir respuesta exitosa
    const validacion = validateFhirBundle(bundleValido);
    expect(validacion.valid).toBe(true);

    const respuesta = successResponse({
      traslado_id: 'TEST-TRASLADO-001',
      estado: 'EN_COLA',
      mensaje: 'Historia clínica recibida y en proceso de entrega',
      timestamp: new Date().toISOString(),
    });

    expect(respuesta.statusCode).toBe(202);
    const body = JSON.parse(respuesta.body);
    expect(body.traslado_id).toBe('TEST-TRASLADO-001');
    expect(body.estado).toBe('EN_COLA');
  });

  it('un Bundle inválido debe producir una respuesta 400 con los errores detallados', () => {
    const bundleInvalido = { resourceType: 'Bundle', type: 'document' };

    const validacion = validateFhirBundle(bundleInvalido);
    expect(validacion.valid).toBe(false);
    expect(validacion.errors.length).toBeGreaterThan(0);

    const respuesta = validationErrorResponse('Bundle FHIR R4 inválido', validacion.errors);
    expect(respuesta.statusCode).toBe(400);

    const body = JSON.parse(respuesta.body);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('la respuesta de error no debe exponer información técnica interna', () => {
    const respuesta = validationErrorResponse('Error de validación', ['campo requerido']);
    const body = JSON.parse(respuesta.body);

    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('errorMessage');
    expect(body).toHaveProperty('timestamp');
  });

  it('el Bundle debe rechazarse si no tiene recursos Patient ni Composition', () => {
    const bundleSinRecursosClinicos = {
      resourceType: 'Bundle',
      type: 'document',
      timestamp: '2026-04-17T10:00:00Z',
      entry: [
        { resource: { resourceType: 'Observation', id: 'obs-001' } },
      ],
    };

    const validacion = validateFhirBundle(bundleSinRecursosClinicos);
    expect(validacion.valid).toBe(false);
    expect(validacion.errors.some(e => e.includes('Patient'))).toBe(true);
  });

});