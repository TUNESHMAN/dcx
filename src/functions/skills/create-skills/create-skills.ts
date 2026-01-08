import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { CreateSkill } from "../../../dto/create-skills/create-skills";
import { Skill } from "../../../dto/skill/skill";
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
import { IdempotencyConfig } from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
import { makeHandlerIdempotent } from "@aws-lambda-powertools/idempotency/middleware";
import { Pool } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
const [DSQL_ENDPOINT, DSQL_CLUSTER_ARN, IDEMPOTENCY_TABLE_NAME] =
  envVar.getStrings(
    "DSQL_ENDPOINT",
    "DSQL_CLUSTER_ARN",
    "IDEMPOTENCY_TABLE_NAME"
  );
const tracer = new Tracer();
const metrics = new Metrics();

const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: IDEMPOTENCY_TABLE_NAME,
});

const idempotencyConfig = new IdempotencyConfig({
  eventKeyJmesPath: "body",
});

function normalizeName(name: string) {
  return (name ?? "").trim().replace(/\s+/g, " ");
}
const signer = new DsqlSigner({
  hostname: DSQL_ENDPOINT,
  region: "eu-west-2",
});
const pool = new Pool({
  host: DSQL_ENDPOINT,
  port: 5432,
  database: "postgres",
  user: "admin",
  // Every new connection will call this to get a fresh token
  password: async () => signer.getDbConnectAdminAuthToken(),
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// I have had to parse aliases because DSQL doesn't accept json/jsonb types directly
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
    const aliases = (newSkill.aliases ?? []).filter(
      (a) => typeof a === "string" && a.trim().length > 0
    );

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<Skill>(
        `
        INSERT INTO dcx.skills (
          skill_id, name, name_lower, category, status, aliases, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz)
        RETURNING
          skill_id as "skillId",
          name,
          category,
          status,
          aliases,
          created_at as "createdAt",
          updated_at as "updatedAt"
        `,
        [
          skillId,
          nameCanonical,
          nameLower,
          newSkill.category,
          "active",
          JSON.stringify(aliases),
          timestamp,
          timestamp,
        ]
      );
      const row = result.rows[0];
      const skill: Skill = {
        skillId: row.skillId,
        name: row.name,
        category: row.category,
        status: row.status,
        aliases: parseAliases(row.aliases),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      await client.query("COMMIT");
      metrics.addMetric("SkillCreatedSuccessfully", MetricUnit.Count, 1);
      logger.info(`Skill created successfully: ${skillId}`, {
        dsqlClusterArn: DSQL_CLUSTER_ARN,
      });
      return {
        statusCode: 201,
        body: JSON.stringify({
          message: "Skill created successfully",
          skill,
        }),
      };
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (err?.code === "23505") {
        logger.warn("Duplicate skill name attempted", { nameLower });
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
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(errorMessage);
    metrics.addMetric("CreateSkillError", MetricUnit.Count, 1);
    return errorHandler(error);
  }
};

export const handler = middy(createSkillHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(makeHandlerIdempotent({ persistenceStore, config: idempotencyConfig }))
  .use(httpErrorHandler());
