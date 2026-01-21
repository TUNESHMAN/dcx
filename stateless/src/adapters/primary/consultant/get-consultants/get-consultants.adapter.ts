import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { logger } from "../../../../shared/logger/logger";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { getConsultantsUseCase } from "../../../../use-cases/get-consultants";

const tracer = new Tracer();
const metrics = new Metrics();

function clampInt(
  value: string | undefined,
  def: number,
  min: number,
  max: number
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export const getConsultantsHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const qs = event.queryStringParameters ?? {};

    const page = clampInt(qs.page, 1, 1, 1_000_000);
    const pageSize = clampInt(qs.pageSize, 25, 1, 100);

    const { rows, meta } = await getConsultantsUseCase({
      page,
      pageSize,
      consultancyId: qs.consultancyId?.trim() || undefined,
      status: (qs.status?.trim() as any) || undefined,
      seniority: (qs.seniority?.trim() as any) || undefined,
      availabilityStatus: (qs.availabilityStatus?.trim() as any) || undefined,
      country: qs.country?.trim() || undefined,
      city: qs.city?.trim() || undefined,
      search: qs.search?.trim() || undefined,
      skillId: qs.skillId?.trim() || undefined,
    });

    metrics.addMetric("GetConsultantsSuccess", MetricUnit.Count, 1);

    return {
      statusCode: 200,
      body: JSON.stringify({
        consultants: rows.map((r) => ({
          consultantId: r.consultantId,
          consultancyId: r.consultancyId,
          fullName: r.fullName,
          title: r.title,
          dayRate: r.dayRate,
          seniority: r.seniority,
          status: r.status,
          availability: {
            availabilityStatus: r.availabilityStatus,
            availableFrom: r.availableFrom,
          },
          willingToTravel: r.willingToTravel,
          skillIds: (r as any).skillIds ?? [],
          location: { country: r.country ?? "", city: r.city ?? "" },
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        meta,
      }),
    };
  } catch (error) {
    metrics.addMetric("GetConsultantsError", MetricUnit.Count, 1);
    logger.error("Error fetching consultants", { error });
    return errorHandler(error);
  }
};

export const handler = middy(getConsultantsHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(httpErrorHandler());
