const REQUIRED_RESOURCE_TYPES = ['Patient', 'Composition'];
const VALID_BUNDLE_TYPES = ['document', 'transaction', 'collection'];

export function validateFhirBundle(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['El payload debe ser un objeto JSON válido'] };
  }

  if (payload.resourceType !== 'Bundle') {
    errors.push(`resourceType debe ser "Bundle", se recibió: "${payload.resourceType}"`);
  }

  if (!payload.type) {
    errors.push('El campo "type" es requerido en el Bundle');
  } else if (!VALID_BUNDLE_TYPES.includes(payload.type)) {
    errors.push(`Bundle.type debe ser uno de: ${VALID_BUNDLE_TYPES.join(', ')}`);
  }

  if (!Array.isArray(payload.entry) || payload.entry.length === 0) {
    errors.push('El Bundle debe contener al menos una entrada en "entry"');
  } else {
    payload.entry.forEach((entry, index) => {
      if (!entry.resource) {
        errors.push(`entry[${index}] no tiene el campo "resource"`);
      } else if (!entry.resource.resourceType) {
        errors.push(`entry[${index}].resource no tiene "resourceType"`);
      }
    });

    if (errors.length === 0) {
      const resourceTypes = payload.entry.map((e) => e.resource?.resourceType);
      for (const required of REQUIRED_RESOURCE_TYPES) {
        if (!resourceTypes.includes(required)) {
          errors.push(`El Bundle debe contener un recurso de tipo "${required}"`);
        }
      }
    }
  }

  if (!payload.timestamp && !payload.meta?.lastUpdated) {
    errors.push('El Bundle debe incluir un timestamp');
  }

  return { valid: errors.length === 0, errors };
}

export function extractBundleMetadata(bundle) {
  const patientEntry = bundle.entry?.find((e) => e.resource?.resourceType === 'Patient');
  const patientId = patientEntry?.resource?.id ?? null;

  const compositionEntry = bundle.entry?.find((e) => e.resource?.resourceType === 'Composition');
  const sourceEpsId = compositionEntry?.resource?.author?.[0]?.identifier?.value ?? null;

  return {
    patientId,
    sourceEpsId,
    bundleTimestamp: bundle.timestamp ?? bundle.meta?.lastUpdated ?? new Date().toISOString(),
  };
}