import { config } from "../../../config";
import { logger } from "../../../shared/logger/logger";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const s3Client = new S3Client();

const region = config.get("aws.region");

export type PresignPutObjectInput = {
  bucketName: string;
  key: string;
  contentType: string;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
};

export async function presignPutObject(
  input: PresignPutObjectInput
): Promise<string> {
  const expiresIn = input.expiresInSeconds ?? 600;

  const cmdInput = {
    Bucket: input.bucketName,
    Key: input.key,
    ContentType: input.contentType,
    Metadata: input.metadata,
  };

  try {
    const command = new PutObjectCommand(cmdInput);
    const url = await getSignedUrl(s3Client, command, { expiresIn });

    logger.info("Presigned S3 PUT URL issued", {
      bucketName: input.bucketName,
      key: input.key,
      expiresInSeconds: expiresIn,
    });

    return url;
  } catch (error) {
    logger.error("Error presigning S3 PUT URL", {
      error,
      bucketName: input.bucketName,
      key: input.key,
    });
    throw error;
  }
}

export type UploadItem = {
  content: string | Buffer | Uint8Array;
  contentType: string;
  filename: string;
};

export type UploadItemsToS3Input = {
  bucketName: string;
  baseKey: string;
  items: UploadItem[];
};

export async function uploadItemsToS3(
  input: UploadItemsToS3Input
): Promise<string[]> {
  const { bucketName, baseKey, items } = input;

  try {
    logger.info("Uploading items to S3", { bucketName, count: items.length });

    const urls = await Promise.all(
      items.map(async (item) => {
        const key = `${baseKey}/${item.filename}`.replace(/\/+/g, "/");

        const putCommand = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: item.content,
          ContentType: item.contentType,
        });

        await s3Client.send(putCommand);

        // NOTE: This is the S3 virtual-hosted style URL (not CloudFront/CDN).
        // If you use a CDN domain, construct that in the use-case instead.
        return `https://${bucketName}.s3.amazonaws.com/${key}`;
      })
    );

    logger.info("S3 upload complete", { bucketName, uploaded: urls.length });
    return urls;
  } catch (error) {
    logger.error("Error uploading items to S3", { error, bucketName, baseKey });
    throw error;
  }
}
