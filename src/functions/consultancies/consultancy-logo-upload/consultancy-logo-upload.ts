import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { envVar, logger } from "@leighton-digital/lambda-toolkit";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { ValidationError } from "../../../errors/validation-error";
import { errorHandler } from "../../../shared/error-handler/error-handler";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConsultancyLogo } from "../../../dto/consultancy/consultancy-logo";
import { schemaValidator } from "../../../shared/schema-validator/schema-validator";
import { schema } from "./consultancy-logo-upload-schema";
const tracer = new Tracer();
const metrics = new Metrics();
const s3 = new S3Client({});

const [LOGO_BUCKET_NAME, LOGO_CDN_DOMAIN] = envVar.getStrings(
  "LOGO_BUCKET_NAME",
  "LOGO_CDN_DOMAIN"
);

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function sanitizeFileName(name: string): string {
  const cleaned = (name ?? "logo").replace(/[/\\]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "logo";
}

export const consultancyLogoUploadHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      throw new ValidationError("No payload body");
    }

    const logoBody = JSON.parse(event.body) as ConsultancyLogo;
    schemaValidator(schema, logoBody);
    const contentType = (logoBody.contentType ?? "").trim();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Unsupported contentType",
          allowed: Array.from(ALLOWED_CONTENT_TYPES),
        }),
      };
    }
    const fileName = sanitizeFileName(logoBody.fileName ?? "logo");
    const uploadId = `logo_${randomUUID()}`;

    // temp path until consultancy is created. I am saving logo to s3 immediately it is uploaded not waiting for the submit button.
    const key = `consultancies/logos/tmp/${uploadId}/${fileName}`;

    const persistLogo = new PutObjectCommand({
      Bucket: LOGO_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      Metadata: { uploadId },
    });
    const uploadUrl = await getSignedUrl(s3, persistLogo, { expiresIn: 600 });
    const cdnDomain = `https://${LOGO_CDN_DOMAIN}/${key}`;
    // const url = `https://${LOGO_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;

    metrics.addMetric("ConsultancyLogoUploadUrlIssued", MetricUnit.Count, 1);
    return {
      statusCode: 201,
      body: JSON.stringify({
        key,
        url: cdnDomain,
        uploadUrl,
      }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error(msg);
    metrics.addMetric("ConsultancyLogoUploadUrlError", MetricUnit.Count, 1);
    return errorHandler(error);
  }
};

export const handler = middy(consultancyLogoUploadHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(httpErrorHandler());
