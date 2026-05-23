import { ulid } from 'ulidx';
import { validateFhirBundle, extractBundleMetadata } from '../services/fhir-validator.js';
import { saveAuditRecord, AUDIT_STATUS } from '../services/dynamo-client.js';
import { saveEvidenceToS3 } from '../services/s3-client.js';
import { publishTrasladoToQueue } from '../services/sqs-client.js';
import { logger } from '../utils/logger.js';
import {
  successResponse,
  validationErrorResponse,
  internalErrorResponse,
  serviceUnavailableResponse,
} from '../utils/response-helper.js';

const getQueueName = () => {
  const url = process.env.SQS_DELIVERY_QUEUE_URL ?? '';
  return url.split('/').filter(Boolean).pop() ?? '';
};

export const handler = async (event, context) => {
  const correlationId = context.awsRequestId;
  const receivedAt = new Date().toISOString();
  const startMs = Date.now();
  const auditId = ulid();

  const writeAudit = async (status, extras = {}) => {
    const processedAt = new Date().toISOString();
    const record = {
      id: auditId,
      timestamp: processedAt,
      messageId: extras.messageId ?? '',
      status,
      queueName: getQueueName(),
      processingTimeMs: Date.now() - startMs,
      receivedAt,
      processedAt,
      receiveCount: 1,
    };
    if (status === AUDIT_STATUS.FAILED && extras.payload !== undefined) {
      record.payload = extras.payload;
    }
    if (extras.errorMessage) record.errorMessage = extras.errorMessage;
    if (extras.errorStack) record.errorStack = extras.errorStack;

    try {
      await saveAuditRecord(record);
    } catch (err) {
      logger.error('Failed to save audit record', {
        correlationId,
        auditId,
        errorMessage: err.message,
      });
    }
  };

  logger.info('Transfer processing started', { correlationId });

  if (process.env.MODO_MANTENIMIENTO === 'true') {
    logger.warn('System is under maintenance', { correlationId });
    return serviceUnavailableResponse();
  }

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

  const epsDestino = event.headers?.['x-eps-destino'] ?? event.headers?.['X-EPS-Destino'];
  if (!epsDestino) {
    return validationErrorResponse('El header X-EPS-Destino es requerido');
  }

  const epsOrigen = event.requestContext?.authorizer?.epsId
    ?? event.headers?.['x-eps-origen']
    ?? 'EPS_SOURCE_UNIDENTIFIED';

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

  const bundleMetadata = extractBundleMetadata(payload);

  logger.info('FHIR Bundle validated, starting registration', {
    correlationId,
    auditId,
    epsOrigen,
    epsDestino,
    patientId: bundleMetadata.patientId,
  });

  try {
    const { s3Key, payloadHash } = await saveEvidenceToS3(auditId, epsOrigen, payload);
    logger.info('Evidence saved to S3', { correlationId, auditId, s3Key });

    const messageId = await publishTrasladoToQueue({
      trasladoId: auditId,
      epsOrigen,
      epsDestino,
      s3EvidenceKey: s3Key,
      payloadHash,
    });

    await writeAudit(AUDIT_STATUS.IN_QUEUE, { messageId });
    logger.info('Transfer successfully queued', { correlationId, auditId, messageId });

    return successResponse({
      transfer_id: auditId,
      status: AUDIT_STATUS.IN_QUEUE,
      message: 'Historia clínica recibida y en proceso de entrega',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Error processing transfer', {
      correlationId,
      auditId,
      errorMessage: error.message,
      errorName: error.name,
    });

    await writeAudit(AUDIT_STATUS.FAILED, {
      payload,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    return internalErrorResponse(correlationId);
  }
};
