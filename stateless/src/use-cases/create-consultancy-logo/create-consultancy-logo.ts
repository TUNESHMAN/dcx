import { presignPutObject } from "../../adapters/secondary/s3-adapter/s3-adapter";
import { logger } from "../../shared/logger/logger";

export type CreateConsultancyLogoInput = {
  bucketName: string;
  cdnDomain: string;
  key: string;
  contentType: string;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
};

export type CreateConsultancyLogoResult = {
  key: string;
  url: string;
  uploadUrl: string;
};

export const createConsultancyLogoUseCase = async (
  input: CreateConsultancyLogoInput
): Promise<CreateConsultancyLogoResult> => {
  logger.info("Creating consultancy logo upload URL", {
    key: input.key,
    contentType: input.contentType,
    bucketName: input.bucketName,
  });

  const uploadUrl = await presignPutObject({
    bucketName: input.bucketName,
    key: input.key,
    contentType: input.contentType,
    expiresInSeconds: input.expiresInSeconds ?? 600,
    metadata: input.metadata,
  });

  const url = `https://${input.cdnDomain}/${input.key}`;

  return {
    key: input.key,
    url,
    uploadUrl,
  };
};
