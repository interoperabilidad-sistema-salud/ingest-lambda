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

  logger.info('Transfer processing started', { correlationId });

  // Check maintenance mode
  if (process.env.MODO_MANTENIMIENTO === 'true') {
    logger.warn('System is under maintenance', { correlationId });
    return serviceUnavailableResponse();
  }

  // Parse request body
  let payload;
  try {
    const rawBody = event.body;
    if (!rawBody) {
      return validationErrorResponse('El body del request está vacío');
    }
    payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    logger.warn('Request body is not valid JSON', { correlationId });
    return validationErrorResponse('El body debe ser JSON válido');
  }

  // Extract destination EPS from header
  const epsDestino = event.headers?.['x-eps-destino'] ?? event.headers?.['X-EPS-Destino'];
  if (!epsDestino) {
    return validationErrorResponse('El header X-EPS-Destino es requerido');
  }

  // Extract source EPS
  const epsOrigen = event.requestContext?.authorizer?.epsId
    ?? event.headers?.['x-eps-origen']
    ?? 'EPS_SOURCE_UNIDENTIFIED';

  // Validate FHIR R4 Bundle
  const strictValidation = process.env.FHIR_STRICT_VALIDATION !== 'false';
  const validationResult = validateFhirBundle(payload);

  if (!validationResult.valid && strictValidation) {
    logger.warn('Invalid FHIR Bundle received', {
      correlationId,
      epsOrigen,
      errors: validationResult.errors,
    });
    return validationErrorResponse('Bundle FHIR R4 inválido', validationResult.errors);
  }

  // Generate unique transfer ID
  const trasladoId = ulid();
  const bundleMetadata = extractBundleMetadata(payload);

  logger.info('FHIR Bundle validated, starting registration', {
    correlationId,
    trasladoId,
    epsOrigen,
    epsDestino,
    patientId: bundleMetadata.patientId,
  });

  try {
    // Save evidence to S3
    const { s3Key, payloadHash } = await saveEvidenceToS3(trasladoId, epsOrigen, payload);
    logger.info('Evidence saved to S3', { correlationId, trasladoId, s3Key });

    // Register in DynamoDB
    await createTrasladoRecord({
      trasladoId,
      epsOrigen,
      epsDestino,
      patientId: bundleMetadata.patientId,
      payloadHash,
      s3EvidenceKey: s3Key,
    });
    logger.info('Transfer registered in DynamoDB', { correlationId, trasladoId });

    // Publish to SQS for async delivery
    const messageId = await publishTrasladoToQueue({
      trasladoId,
      epsOrigen,
      epsDestino,
      s3EvidenceKey: s3Key,
      payloadHash,
    });

    // Update status to queued
    await updateTrasladoEstado(trasladoId, TRASLADO_ESTADOS.EN_COLA, {
      sqs_message_id: messageId,
    });

    logger.info('Transfer successfully queued', { correlationId, trasladoId, messageId });

    // Respond to source EPS
    return successResponse({
      transfer_id: trasladoId,
      status: TRASLADO_ESTADOS.EN_COLA,
      message: 'Historia clínica recibida y en proceso de entrega',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Error processing transfer', {
      correlationId,
      trasladoId,
      errorMessage: error.message,
      errorName: error.name,
    });

    return internalErrorResponse(correlationId);
  }
};