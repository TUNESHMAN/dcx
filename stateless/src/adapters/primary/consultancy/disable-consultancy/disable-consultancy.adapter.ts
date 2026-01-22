import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
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
import { Consultancy } from "../../../../dto/consultancy/consultancy";
import { config } from "../../../../config";

import { getConsultancyUseCase } from "../../../../use-cases/get-consultancy";
import { disableConsultancyUseCase } from "../../../../use-cases/disable-consultancy";
import { getConsultancySpecialtySkillIdsUseCase } from "../../../../use-cases/get-consultancy-specialty-skill-ids";

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

type ConsultancyStatusRow = {
  consultancy_id: string;
  status: "active" | "disabled";
};

export const disableConsultancyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const consultancyId = event.pathParameters?.consultancyId?.trim();
    if (!consultancyId) {
      throw new ValidationError("No consultancyId provided in path");
    }

    const existing = await getConsultancyUseCase(consultancyId);

    if (!existing) {
      metrics.addMetric("DisableConsultancyNotFound", MetricUnit.Count, 1);
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Consultancy not found",
          code: "ConsultancyNotFound",
        }),
      };
    }

    const row = existing as ConsultancyStatusRow;

    if (row.status === "disabled") {
      metrics.addMetric(
        "DisableConsultancyAlreadyDisabled",
        MetricUnit.Count,
        1
      );
      return {
        statusCode: 409,
        body: JSON.stringify({
          message: "Consultancy is already disabled",
          code: "ConsultancyAlreadyDisabled",
        }),
      };
    }

    const now = new Date().toISOString();

    await disableConsultancyUseCase(consultancyId, { updatedAt: now });

    const specialtySkillIds = await getConsultancySpecialtySkillIdsUseCase(
      consultancyId
    );
    const consultancy: Partial<Consultancy> = {
      consultancyId,
      status: "disabled",
      specialtySkillIds,
      updatedAt: now,
    };

    metrics.addMetric("DisableConsultancySuccess", MetricUnit.Count, 1);
    logger.info("Consultancy disabled successfully", {
      consultancyId,
      dsqlClusterArn,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Consultancy disabled successfully",
        consultancy,
      }),
    };
  } catch (error) {
    metrics.addMetric("DisableConsultancyError", MetricUnit.Count, 1);
    logger.error("Error disabling consultancy", { error });
    return errorHandler(error);
  }
};

export const handler = middy(disableConsultancyHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(injectLambdaContext(logger))
  .use(httpErrorHandler());
