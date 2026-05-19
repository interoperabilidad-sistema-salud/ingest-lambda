import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

const BUCKET_NAME = process.env.S3_EVIDENCE_BUCKET;

export async function saveEvidenceToS3(trasladoId, epsOrigen, payload) {
  const payloadString = JSON.stringify(payload);

  const payloadHash = createHash('sha256').update(payloadString).digest('hex');

  const now = new Date();
  const s3Key = `traslados/${epsOrigen}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${trasladoId}.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: payloadString,
    ContentType: 'application/fhir+json',
    Metadata: {
      'traslado-id': trasladoId,
      'eps-origen': epsOrigen,
      'payload-hash': payloadHash,
      'schema-version': '1.0',
    },
    ServerSideEncryption: 'aws:kms',
  }));

  return { s3Key, payloadHash };
}