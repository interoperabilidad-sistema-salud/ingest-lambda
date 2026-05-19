import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

const QUEUE_URL = process.env.SQS_DELIVERY_QUEUE_URL;

export async function publishTrasladoToQueue(trasladoMetadata) {
  const message = {
    traslado_id: trasladoMetadata.trasladoId,
    eps_origen: trasladoMetadata.epsOrigen,
    eps_destino: trasladoMetadata.epsDestino,
    s3_evidence_key: trasladoMetadata.s3EvidenceKey,
    payload_hash: trasladoMetadata.payloadHash,
    enqueued_at: new Date().toISOString(),
    schema_version: '1.0',
  };

  const result = await sqsClient.send(new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(message),
    MessageAttributes: {
      epsOrigen: { DataType: 'String', StringValue: trasladoMetadata.epsOrigen },
      epsDestino: { DataType: 'String', StringValue: trasladoMetadata.epsDestino },
    },
  }));

  return result.MessageId;
}