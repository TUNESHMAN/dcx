import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { IdempotencyConfig } from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
import { makeHandlerIdempotent } from "@aws-lambda-powertools/idempotency/middleware";
import { CreateSkill } from "../../../../dto/create-skills/create-skills";
import { ValidationError } from "../../../../errors/validation-error";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { logger } from "../../../../shared/logger/logger";
import { schemaValidator } from "../../../../shared/schema-validator/schema-validator";
import { schema } from "./create-skill-schema";
import { config } from "../../../../config";
import { createSkillUseCase } from "../../../../use-cases/create-skill";

const tracer = new Tracer();
const metrics = new Metrics();

const idempotencyTable = config.get("idempotency.tableName");
const dsqlClusterArn = config.get("dsql.clusterArn");

const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: idempotencyTable,
});

const idempotencyConfig = new IdempotencyConfig({
  eventKeyJmesPath: "body",
});

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeAliases(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a) => typeof a === "string")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

function isPgUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as any).code === "23505"
  );
}

export const createSkillHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) throw new ValidationError("No payload body");

    const payload = JSON.parse(event.body) as CreateSkill;
    schemaValidator(schema, payload);

    const now = new Date().toISOString();
    const skillId = `sk_${randomUUID()}`;

    const name = normalizeText(payload.name);
    const category = normalizeText(payload.category);
    if (!name) throw new ValidationError("name is required");
    if (!category) throw new ValidationError("category is required");

    const nameLower = name.toLowerCase();
    const aliases = normalizeAliases(payload.aliases);

    try {
      await createSkillUseCase({
        skillId,
        name,
        nameLower,
        category,
        status: "active",
        aliases,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        metrics.addMetric("CreateSkillNameConflict", MetricUnit.Count, 1);
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

    metrics.addMetric("SkillCreatedSuccessfully", MetricUnit.Count, 1);
    logger.info("Skill created successfully", {
      dsqlClusterArn,
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Skill created successfully",
      }),
    };
  } catch (error) {
    metrics.addMetric("CreateSkillError", MetricUnit.Count, 1);
    logger.error("Error creating skill", { error });
    return errorHandler(error);
  }
};

export const handler = middy(createSkillHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(makeHandlerIdempotent({ persistenceStore, config: idempotencyConfig }))
  .use(httpErrorHandler());
