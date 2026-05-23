import { describe, it, expect } from '@jest/globals';
import { validateFhirBundle, extractBundleMetadata } from '../../src/services/fhir-validator.js';

const validBundle = {
  resourceType: 'Bundle',
  type: 'document',
  timestamp: '2026-04-17T10:00:00Z',
  entry: [
    {
      resource: {
        resourceType: 'Composition',
        author: [{ identifier: { value: 'EPS001' } }],
      },
    },
    {
      resource: {
        resourceType: 'Patient',
        id: 'patient-123',
      },
    },
  ],
};

describe('validateFhirBundle', () => {

  it('debe aceptar un Bundle FHIR R4 bien formado', () => {
    const result = validateFhirBundle(validBundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('debe rechazar un payload nulo', () => {
    const result = validateFhirBundle(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('debe rechazar si resourceType no es Bundle', () => {
    const result = validateFhirBundle({ ...validBundle, resourceType: 'Patient' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('resourceType'))).toBe(true);
  });

  it('debe rechazar un Bundle sin entries', () => {
    const result = validateFhirBundle({ ...validBundle, entry: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('entry'))).toBe(true);
  });

  it('debe rechazar si falta el recurso Patient', () => {
    const bundleSinPaciente = {
      ...validBundle,
      entry: [{ resource: { resourceType: 'Composition' } }],
    };
    const result = validateFhirBundle(bundleSinPaciente);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Patient'))).toBe(true);
  });

  it('debe rechazar un Bundle.type no permitido', () => {
    const result = validateFhirBundle({ ...validBundle, type: 'message' });
    expect(result.valid).toBe(false);
  });

  it('debe rechazar si no tiene timestamp', () => {
    const { timestamp, ...sinTimestamp } = validBundle;
    const result = validateFhirBundle(sinTimestamp);
    expect(result.valid).toBe(false);
  });

});

describe('extractBundleMetadata', () => {

  it('debe extraer el patientId correctamente', () => {
    const metadata = extractBundleMetadata(validBundle);
    expect(metadata.patientId).toBe('patient-123');
  });

  it('debe extraer el epsOrigenId correctamente', () => {
    const metadata = extractBundleMetadata(validBundle);
    expect(metadata.sourceEpsId).toBe('EPS001');
  });

  it('debe devolver null si no hay Patient en las entries', () => {
    const bundleSinPaciente = {
      ...validBundle,
      entry: [{ resource: { resourceType: 'Composition' } }],
    };
    const metadata = extractBundleMetadata(bundleSinPaciente);
    expect(metadata.patientId).toBeNull();
  });

});