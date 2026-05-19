import { ulid } from 'ulid';
import { validateFhirBundle, extractBundleMetadata } from '../services/fhir-validator.js';
import { createTrasladoRecord, updateTrasladoEstado, TRASLADO_ESTADOS } from '../services/dynamo-client.js';
import { saveEvidenceToS3 } from '../services/s3-client.js';
import { publishTrasladoToQueue } from '../services/sqs-client.js';
import { logger } from '../utils/logger.js';
import {
  successResponse,
  validationErrorResponse,
  internalErrorResponse,
  serviceUnavailableResponse,
} from '../utils/response-helper.js';

export const handler = async (event, context) => {
  const correlationId = context.awsRequestId;

  logger.info('Inicio de procesamiento de traslado', { correlationId });

  // Verificar modo mantenimiento
  if (process.env.MODO_MANTENIMIENTO === 'true') {
    logger.warn('Sistema en modo mantenimiento', { correlationId });
    return serviceUnavailableResponse();
  }

  // Parsear el body
  let payload;
  try {
    const rawBody = event.body;
    if (!rawBody) {
      return validationErrorResponse('El body del request está vacío');
    }
    payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    logger.warn('Body del request no es JSON válido', { correlationId });
    return validationErrorResponse('El body debe ser JSON válido');
  }

  // Extraer EPS destino del header
  const epsDestino = event.headers?.['x-eps-destino'] ?? event.headers?.['X-EPS-Destino'];
  if (!epsDestino) {
    return validationErrorResponse('El header X-EPS-Destino es requerido');
  }

  // Extraer EPS origen
  const epsOrigen = event.requestContext?.authorizer?.epsId
    ?? event.headers?.['x-eps-origen']
    ?? 'EPS_ORIGEN_NO_IDENTIFICADA';

  // Validar el Bundle FHIR R4
  const strictValidation = process.env.FHIR_STRICT_VALIDATION !== 'false';
  const validationResult = validateFhirBundle(payload);

  if (!validationResult.valid && strictValidation) {
    logger.warn('Bundle FHIR inválido', {
      correlationId,
      epsOrigen,
      errores: validationResult.errors,
    });
    return validationErrorResponse('Bundle FHIR R4 inválido', validationResult.errors);
  }

  // Generar ID único del traslado
  const trasladoId = ulid();
  const bundleMetadata = extractBundleMetadata(payload);

  logger.info('Bundle FHIR validado, iniciando registro', {
    correlationId,
    trasladoId,
    epsOrigen,
    epsDestino,
    patientId: bundleMetadata.patientId,
  });

  try {
    // Guardar evidencia en S3
    const { s3Key, payloadHash } = await saveEvidenceToS3(trasladoId, epsOrigen, payload);
    logger.info('Evidencia guardada en S3', { correlationId, trasladoId, s3Key });

    // Registrar en DynamoDB
    await createTrasladoRecord({
      trasladoId,
      epsOrigen,
      epsDestino,
      patientId: bundleMetadata.patientId,
      payloadHash,
      s3EvidenceKey: s3Key,
    });
    logger.info('Traslado registrado en DynamoDB', { correlationId, trasladoId });

    // Publicar en SQS
    const messageId = await publishTrasladoToQueue({
      trasladoId,
      epsOrigen,
      epsDestino,
      s3EvidenceKey: s3Key,
      payloadHash,
    });

    // Actualizar estado a EN_COLA
    await updateTrasladoEstado(trasladoId, TRASLADO_ESTADOS.EN_COLA, {
      sqs_message_id: messageId,
    });

    logger.info('Traslado encolado exitosamente', { correlationId, trasladoId, messageId });

    // Responder a la EPS origen
    return successResponse({
      traslado_id: trasladoId,
      estado: TRASLADO_ESTADOS.EN_COLA,
      mensaje: 'Historia clínica recibida y en proceso de entrega',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Error procesando traslado', {
      correlationId,
      trasladoId,
      errorMessage: error.message,
      errorName: error.name,
    });

    return internalErrorResponse(correlationId);
  }
};