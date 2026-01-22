import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { ValidationError } from "../../../../errors/validation-error";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { logger } from "../../../../shared/logger/logger";
import { config } from "../../../../config";
import { getConsultantUseCase } from "../../../../use-cases/get-consultant";
import { deleteConsultantUseCase } from "../../../../use-cases/delete-consultant";

type ConsultantStatus = "active" | "archived";

type ConsultantStatusRow = {
  consultant_id: string;
  status: ConsultantStatus;
};

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

export const deleteConsultantHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const consultantId = event.pathParameters?.consultantId?.trim();
    if (!consultantId)
      throw new ValidationError("No consultantId path parameter");

    // existence check
    const consultant = (await getConsultantUseCase(
      consultantId
    )) as unknown as ConsultantStatusRow | null;

    if (!consultant) {
      metrics.addMetric("DeleteConsultantNotFound", MetricUnit.Count, 1);
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Consultant not found",
          code: "ConsultantNotFound",
        }),
      };
    }

    await deleteConsultantUseCase(consultantId);

    metrics.addMetric("DeleteConsultantSuccess", MetricUnit.Count, 1);
    logger.info("Consultant hard deleted successfully", {
      consultantId,
      dsqlClusterArn,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Consultant deleted successfully",
      }),
    };
  } catch (error) {
    metrics.addMetric("DeleteConsultantError", MetricUnit.Count, 1);
    logger.error("Error deleting consultant", { error });
    return errorHandler(error);
  }
};

export const handler = middy(deleteConsultantHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(httpErrorHandler());
