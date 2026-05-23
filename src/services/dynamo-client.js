import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

export const AUDIT_STATUS = {
  RECEIVED: 'RECEIVED',
  IN_QUEUE: 'IN_QUEUE',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
};

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = 'interop-sgsss-transfers-dev';

export async function saveAuditRecord(record) {
  const item = {
    transfer_id: record.id,
    timestamp: record.timestamp,
    messageId: record.messageId,
    status: record.status,
    queueName: record.queueName,
    processingTimeMs: record.processingTimeMs,
    receivedAt: record.receivedAt,
    processedAt: record.processedAt,
    receiveCount: record.receiveCount,
  };

  if (record.payload !== undefined) item.payload = record.payload;
  if (record.errorMessage !== undefined) item.errorMessage = record.errorMessage;
  if (record.errorStack !== undefined) item.errorStack = record.errorStack;

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
  }));

  return item;
}
