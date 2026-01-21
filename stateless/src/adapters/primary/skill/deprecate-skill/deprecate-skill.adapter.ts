import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { Skill, SkillStatus } from "../../../../dto/skill/skill";
import { ValidationError } from "../../../../errors/validation-error";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { logger } from "../../../../shared/logger/logger";
import { config } from "../../../../config";
import { getSkillUseCase } from "../../../../use-cases/get-skill";
import { deprecateSkillUseCase } from "../../../../use-cases/deprecate-skill";

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

type SkillDbRow = {
  skill_id: string;
  name: string;
  category: string;
  status: SkillStatus;
  aliases: unknown;
  created_at: string;
  updated_at: string;
};

function parseAliases(aliases: unknown): string[] {
  if (Array.isArray(aliases))
    return aliases.filter((x) => typeof x === "string");
  if (typeof aliases === "string") {
    try {
      const parsed = JSON.parse(aliases);
      return Array.isArray(parsed)
        ? parsed.filter((x) => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const deprecateSkillHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const skillId = event.pathParameters?.skillId?.trim();
    if (!skillId) throw new ValidationError("No skillId provided in path");

    const existing = (await getSkillUseCase(skillId)) as SkillDbRow | null;

    if (!existing) {
      metrics.addMetric("DeprecateSkillNotFound", MetricUnit.Count, 1);
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Skill not found",
          code: "SkillNotFound",
        }),
      };
    }
    if (existing.status === "deprecated") {
      const skill: Skill = {
        skillId: existing.skill_id,
        name: existing.name,
        category: existing.category,
        status: existing.status,
        aliases: parseAliases(existing.aliases),
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      };

      metrics.addMetric("DeprecateSkillAlreadyDeprecated", MetricUnit.Count, 1);

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Skill deprecated successfully",
          skill,
        }),
      };
    }

    const updatedAt = new Date().toISOString();

    // ✅ Business action (no SQL here)
    await deprecateSkillUseCase(skillId, updatedAt);

    // Fetch updated record for response
    const updated = (await getSkillUseCase(skillId)) as SkillDbRow | null;

    // Extremely rare: deleted between update and refetch
    if (!updated) {
      metrics.addMetric(
        "DeprecateSkillNotFoundAfterUpdate",
        MetricUnit.Count,
        1
      );
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Skill not found",
          code: "SkillNotFound",
        }),
      };
    }

    const skill: Skill = {
      skillId: updated.skill_id,
      name: updated.name,
      category: updated.category,
      status: updated.status,
      aliases: parseAliases(updated.aliases),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };

    metrics.addMetric("DeprecateSkillSuccess", MetricUnit.Count, 1);
    logger.info("Skill deprecated successfully", {
      dsqlClusterArn,
      skillId,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Skill deprecated successfully",
        skill,
      }),
    };
  } catch (error) {
    metrics.addMetric("DeprecateSkillError", MetricUnit.Count, 1);
    logger.error("Error deprecating skill", { error });
    return errorHandler(error);
  }
};

export const handler = middy(deprecateSkillHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(injectLambdaContext(logger))
  .use(httpErrorHandler());
