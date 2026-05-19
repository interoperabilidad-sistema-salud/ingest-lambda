const HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
};

export function successResponse(body) {
  return {
    statusCode: 202,
    headers: HEADERS,
    body: JSON.stringify(body),
  };
}

export function validationErrorResponse(message, details = []) {
  return {
    statusCode: 400,
    headers: HEADERS,
    body: JSON.stringify({
      error: 'VALIDATION_ERROR',
      message,
      details,
      timestamp: new Date().toISOString(),
    }),
  };
}

export function internalErrorResponse(correlationId) {
  return {
    statusCode: 500,
    headers: HEADERS,
    body: JSON.stringify({
      error: 'INTERNAL_ERROR',
      message: 'Error interno del sistema. Por favor reintente.',
      correlationId,
      timestamp: new Date().toISOString(),
    }),
  };
}

export function serviceUnavailableResponse() {
  return {
    statusCode: 503,
    headers: HEADERS,
    body: JSON.stringify({
      error: 'SERVICE_UNAVAILABLE',
      message: 'El servicio está en mantenimiento. Intente más tarde.',
    }),
  };
}