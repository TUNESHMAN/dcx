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
import { Skill, SkillStatus } from "../../../../dto/skill/skill";
import { config } from "../../../../config";
import { updateSkillUseCase } from "../../../../use-cases/update-skill";
import { getSkillUseCase } from "../../../../use-cases/get-skill";

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

type UpdateSkillPayload = Partial<{
  name: string;
  category: string;
  status: never;
  aliases: never;
}>;

type SkillDbRow = {
  skill_id: string;
  name: string;
  name_lower?: string;
  category: string;
  status: SkillStatus;
  aliases: unknown;
  created_at: string;
  updated_at: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

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

function isPgUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as any).code === "23505"
  );
}

export const updateSkillHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) throw new ValidationError("No payload body");

    const skillId = event.pathParameters?.skillId?.trim();
    if (!skillId) throw new ValidationError("No skillId path parameter");

    const payload = JSON.parse(event.body) as UpdateSkillPayload;

    if ((payload as any).status !== undefined) {
      throw new ValidationError(
        "You cannot update skill status via this endpoint"
      );
    }
    if ((payload as any).aliases !== undefined) {
      throw new ValidationError(
        "You cannot update skill aliases via this endpoint"
      );
    }

    const hasAnyField =
      payload.name !== undefined || payload.category !== undefined;
    if (!hasAnyField) {
      throw new ValidationError("Provide at least one of: name, category");
    }
    const existing = (await getSkillUseCase(skillId)) as SkillDbRow | null;

    if (!existing) {
      metrics.addMetric("UpdateSkillNotFound", MetricUnit.Count, 1);
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Skill not found",
          code: "SkillNotFound",
        }),
      };
    }

    if (existing.status === "deprecated") {
      return {
        statusCode: 409,
        body: JSON.stringify({
          message: "Skill is deprecated and cannot be updated.",
          code: "SkillDeprecated",
        }),
      };
    }
    const updatedAt = new Date().toISOString();

    const updates: {
      name?: string;
      nameLower?: string;
      category?: string;
      updatedAt: string;
    } = { updatedAt };

    if (payload.name !== undefined) {
      const name = normalizeText(payload.name);
      if (!name) throw new ValidationError("name cannot be empty");
      updates.name = name;
      updates.nameLower = name.toLowerCase();
    }

    if (payload.category !== undefined) {
      const category = normalizeText(payload.category);
      if (!category) throw new ValidationError("category cannot be empty");
      updates.category = category;
    }

    try {
      await updateSkillUseCase(skillId, updates);
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        metrics.addMetric("UpdateSkillNameConflict", MetricUnit.Count, 1);
        return {
          statusCode: 409,
          body: JSON.stringify({
            message: "A skill with this name already exists.",
            code: "SkillNameConflict",
          }),
        };
      }
      throw err;
    }
    const updated = (await getSkillUseCase(skillId)) as SkillDbRow | null;

    if (!updated) {
      metrics.addMetric("UpdateSkillNotFound", MetricUnit.Count, 1);
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

    metrics.addMetric("UpdateSkillSuccess", MetricUnit.Count, 1);
    logger.info("Skill updated successfully", {
      dsqlClusterArn,
      skillId,
      updatedFields: Object.keys(payload),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Skill updated successfully",
        skill,
      }),
    };
  } catch (error) {
    metrics.addMetric("UpdateSkillError", MetricUnit.Count, 1);
    logger.error("Error updating skill", { error });
    return errorHandler(error);
  }
};

export const handler = middy(updateSkillHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(injectLambdaContext(logger))
  .use(httpErrorHandler());
