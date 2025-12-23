import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DynamoDBClient,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";
import { CreateSkill } from "../../../dto/create-skills/create-skills";
import { SkillDbItem } from "../../../dto/skill/skill";
import { marshall } from "@aws-sdk/util-dynamodb";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { ValidationError } from "../../../errors/validation-error";
import { errorHandler } from "../../../shared/error-handler/error-handler";
import { logger } from "../../../shared/logger/logger";
import { schemaValidator } from "../../../shared/schema-validator/schema-validator";
import { schema } from "./create-skills-schema";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { envVar } from "@leighton-digital/lambda-toolkit";
const TABLE_NAME = envVar.getString("TABLE_NAME");
const tracer = new Tracer();
const metrics = new Metrics();
const client = new DynamoDBClient();

function normalizeName(name: string) {
  return (name ?? "").trim().replace(/\s+/g, " ");
}

export const createSkillHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      throw new ValidationError("No payload body");
    }

    const newSkill = JSON.parse(event.body) as CreateSkill;
    schemaValidator(schema, newSkill);
    const skillId = `sk_${randomUUID()}`;
    // Normalize name by trimming whitespace. Also canonicalize name for uniqueness.
    const nameCanonical = normalizeName((newSkill as CreateSkill).name);
    const nameLower = nameCanonical.toLowerCase();
    const timestamp = new Date().toISOString();

    const skillItem: SkillDbItem = {
      ...newSkill,
      name: nameCanonical,
      PK: "SKILL",
      SK: `SKILL#${skillId}`,
      entityType: "Skill",
      status: "active",
      aliases: (newSkill.aliases ?? []).filter(
        (a) => typeof a === "string" && a.trim().length > 0
      ),
      skillId,
      nameLower,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // To ensure uniqueness of skill names, we create a SkillNameGuard item

    // Name guard item keyed by normalized lowercase name
    const skillNameGuardItem = {
      PK: "SKILL#NAME",
      SK: `NAME#${nameLower}`,
      entityType: "SkillNameGuard",
      skillId,
      createdAt: timestamp,
    };

    const putDataToDynamoDB = new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: marshall(skillNameGuardItem, { removeUndefinedValues: true }),
            ConditionExpression: "attribute_not_exists(PK)", // uniqueness
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: marshall(skillItem, { removeUndefinedValues: true }),
            ConditionExpression:
              "attribute_not_exists(PK) AND attribute_not_exists(SK)", // no overwrite
          },
        },
      ],
    });

    await client.send(putDataToDynamoDB);
    metrics.addMetric("SkillCreatedSuccessfully", MetricUnit.Count, 1);
    logger.info(`Skill created successfully: ${skillId}`);
    const { PK, SK, entityType, ...skillResponse } = skillItem;
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Skill created successfully",
        skill: skillResponse,
      }),
    };
  } catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) errorMessage = error.message;

    const isConditional =
      (error as any)?.name === "TransactionCanceledException";
    if (isConditional) {
      logger.warn("Duplicate skill name attempted", { error: errorMessage });
      metrics.addMetric("CreateSkillNameConflict", MetricUnit.Count, 1);
      return {
        statusCode: 409,
        body: JSON.stringify({
          message: "A skill with this name already exists.",
          code: "SkillNameConflict",
        }),
      };
    }

    logger.error(errorMessage);
    metrics.addMetric("CreateSkillError", MetricUnit.Count, 1);

    return errorHandler(error);
  }
};
export const handler = middy(createSkillHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(httpErrorHandler());
