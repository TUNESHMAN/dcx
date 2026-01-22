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
import { archiveConsultantUseCase } from "../../../../use-cases/archive-consultant";

type ConsultantStatus = "active" | "archived";

type ConsultantStatusRow = {
  consultant_id: string;
  status: ConsultantStatus;
};

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

export const archiveConsultantHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const consultantId = event.pathParameters?.consultantId?.trim();
    if (!consultantId) {
      throw new ValidationError("No consultantId path parameter");
    }

    const consultant = (await getConsultantUseCase(
      consultantId
    )) as unknown as ConsultantStatusRow | null;

    if (!consultant) {
      metrics.addMetric("ArchiveConsultantNotFound", MetricUnit.Count, 1);
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Consultant not found",
          code: "ConsultantNotFound",
        }),
      };
    }

    if (consultant.status === "archived") {
      metrics.addMetric(
        "ArchiveConsultantAlreadyArchived",
        MetricUnit.Count,
        1
      );
      return {
        statusCode: 409,
        body: JSON.stringify({
          message: "Consultant is already archived.",
          code: "ConsultantArchived",
        }),
      };
    }

    const now = new Date().toISOString();

    await archiveConsultantUseCase(consultantId, { updatedAt: now });

    metrics.addMetric("ArchiveConsultantSuccess", MetricUnit.Count, 1);
    logger.info("Consultant archived successfully", {
      consultantId,
      dsqlClusterArn,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Consultant archived successfully",
        consultantId,
        archivedAt: now,
      }),
    };
  } catch (error) {
    metrics.addMetric("ArchiveConsultantError", MetricUnit.Count, 1);
    logger.error("Error archiving consultant", { error });
    return errorHandler(error);
  }
};

export const handler = middy(archiveConsultantHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(httpErrorHandler());
