import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
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

const tracer = new Tracer();
const metrics = new Metrics({
  serviceName: "dcx-service",
  namespace: "dcx-service",
});
const client = new DynamoDBClient();

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
    const nameLower = newSkill.name.toLowerCase();
    const timestamp = new Date().toISOString();

    const skillItem: SkillDbItem = {
      ...newSkill,
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
    const putCommand = new PutItemCommand({
      TableName: "digital-capability-exchange",
      Item: marshall(skillItem, { removeUndefinedValues: true }),
      //   I am checking to ensure that no existing skill with the same PK and SK exists before inserting a new one.
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    });
    await client.send(putCommand);
    metrics.addMetric("SkillCreatedSuccessfully", MetricUnit.Count, 1);
    logger.info(`Skill created successfully: ${skillId}`);
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Skill created successfully",
        skill: skillItem,
      }),
    };
  } catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) errorMessage = error.message;
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
