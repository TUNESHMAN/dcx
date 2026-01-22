import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { logger } from "../../../../shared/logger/logger";
import { config } from "../../../../config";
import { getConsultanciesUseCase } from "../../../../use-cases/get-consultancies";

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

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

export const getConsultanciesHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const qs = event.queryStringParameters ?? {};

    const page = clampInt(qs.page, 1, 1, 1_000_000);
    const pageSize = clampInt(qs.pageSize, 25, 1, 100);

    const status = qs.status?.trim();
    const country = qs.country?.trim();
    const city = qs.city?.trim();
    const region = qs.region?.trim();
    const search = qs.search?.trim();
    const skillId = qs.skillId?.trim();

    const result = await getConsultanciesUseCase({
      page,
      pageSize,
      status,
      country,
      city,
      region,
      search,
      skillId,
    });

    metrics.addMetric("GetConsultanciesSuccess", MetricUnit.Count, 1);
    logger.info("Consultancies fetched successfully", {
      dsqlClusterArn,
      returned: result.rows.length,
      meta: result.meta,
      filters: {
        status: status || null,
        country: country || null,
        city: city || null,
        region: region || null,
        search: search || null,
        skillId: skillId || null,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        consultancies: result.rows,
        meta: result.meta,
      }),
    };
  } catch (error) {
    metrics.addMetric("GetConsultanciesError", MetricUnit.Count, 1);
    logger.error("Error fetching consultancies", { error });
    return errorHandler(error);
  }
};

export const handler = middy(getConsultanciesHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(injectLambdaContext(logger))
  .use(httpErrorHandler());
