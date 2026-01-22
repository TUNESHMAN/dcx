import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { envVar, logger } from "@leighton-digital/lambda-toolkit";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { ValidationError } from "../../../../errors/validation-error";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { ConsultancyLogo } from "../../../../dto/consultancy/consultancy-logo";
import { schemaValidator } from "../../../../shared/schema-validator/schema-validator";
import { schema } from "./consultancy-logo-upload-schema";
import { createConsultancyLogoUseCase } from "../../../../use-cases/create-consultancy-logo";

const tracer = new Tracer();
const metrics = new Metrics();

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
    if (!event.body) throw new ValidationError("No payload body");

    const payload = JSON.parse(event.body) as ConsultancyLogo;
    schemaValidator(schema, payload);

    const contentType = (payload.contentType ?? "").trim();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Unsupported contentType",
          allowed: Array.from(ALLOWED_CONTENT_TYPES),
        }),
      };
    }

    const fileName = sanitizeFileName(payload.fileName ?? "logo");
    const uploadId = `logo_${randomUUID()}`;

    // temp path until consultancy is created
    const key = `consultancies/logos/tmp/${uploadId}/${fileName}`;

    const { url, uploadUrl } = await createConsultancyLogoUseCase({
      bucketName: LOGO_BUCKET_NAME,
      cdnDomain: LOGO_CDN_DOMAIN,
      key,
      contentType,
      expiresInSeconds: 600,
      metadata: { uploadId },
    });

    metrics.addMetric("ConsultancyLogoUploadUrlIssued", MetricUnit.Count, 1);

    return {
      statusCode: 201,
      body: JSON.stringify({
        key,
        url,
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
