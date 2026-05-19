import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const TRASLADO_ESTADOS = {
  RECIBIDO: 'RECIBIDO',
  EN_COLA: 'EN_COLA',
  ENTREGADO: 'ENTREGADO',
  FALLIDO: 'FALLIDO',
};

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

export async function createTrasladoRecord({
  trasladoId,
  epsOrigen,
  epsDestino,
  patientId,
  payloadHash,
  s3EvidenceKey,
}) {
  const timestamp = new Date().toISOString();

  const item = {
    traslado_id: trasladoId,
    estado: TRASLADO_ESTADOS.RECIBIDO,
    eps_origen: epsOrigen,
    eps_destino: epsDestino,
    patient_id: patientId,
    payload_hash: payloadHash,
    s3_evidence_key: s3EvidenceKey,
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: '1.0',
    ttl: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 3600),
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: 'attribute_not_exists(traslado_id)',
  }));

  return item;
}

export async function updateTrasladoEstado(trasladoId, nuevoEstado, extras = {}) {
  const timestamp = new Date().toISOString();

  const updateParts = ['#estado = :estado', 'updated_at = :updated'];
  const expressionValues = {
    ':estado': nuevoEstado,
    ':updated': timestamp,
  };
  const expressionNames = { '#estado': 'estado' };

  Object.entries(extras).forEach(([key, value], index) => {
    updateParts.push(`#extra${index} = :extra${index}`);
    expressionNames[`#extra${index}`] = key;
    expressionValues[`:extra${index}`] = value;
  });

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { traslado_id: trasladoId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));
}