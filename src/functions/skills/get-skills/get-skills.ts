import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { errorHandler } from "../../../shared/error-handler/error-handler";
import { logger } from "../../../shared/logger/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { envVar } from "@leighton-digital/lambda-toolkit";
import { Pool } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { Skill } from "../../../dto/skill/skill";
const tracer = new Tracer();
const metrics = new Metrics();
const [DSQL_ENDPOINT, DSQL_CLUSTER_ARN] = envVar.getStrings(
  "DSQL_ENDPOINT",
  "DSQL_CLUSTER_ARN"
);
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

export const getSkillsHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const client = await pool.connect();
  try {
    try {
      const queryString = event.queryStringParameters ?? {};

      const page = clampInt(queryString.page, 1, 1, 1_000_000);
      const pageSize = clampInt(queryString.pageSize, 25, 1, 100);
      const offset = (page - 1) * pageSize;

      const countResult = await client.query<{ total: string }>(
        `SELECT COUNT(*)::text as total  FROM dcx.skills`
      );
      const total = Number(countResult.rows?.[0]?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (total > 0 && page > totalPages) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            skills: [] as Skill[],
            meta: { page, pageSize, total, totalPages },
          }),
        };
      }
      const res = await client.query<Skill>(
        `
        SELECT
        skill_id as "skillId",
        name,
        category,
        status,
        aliases,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from dcx.skills
      ORDER BY name asc, skill_id asc
      LIMIT $1 OFFSET $2
      `,
        [pageSize, offset]
      );

      const skills: Skill[] = (res.rows ?? []).map((skill) => ({
        skillId: skill.skillId,
        name: skill.name,
        category: skill.category,
        status: skill.status,
        aliases: skill.aliases,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      }));
      metrics.addMetric("GetSkillsSuccess", MetricUnit.Count, 1);
      logger.info(`Skills fetched successfully`, {
        dsqlClusterArn: DSQL_CLUSTER_ARN,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          skills,
          meta: { page, pageSize, total, totalPages },
        }),
      };
    } catch (error) {
      metrics.addMetric("GetSkillsFailure", MetricUnit.Count, 1);
      logger.error("Error fetching skills", { error });
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logger.error(errorMessage);
    metrics.addMetric("CreateSkillError", MetricUnit.Count, 1);
    return errorHandler(err);
  }
};

export const handler = middy(getSkillsHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(injectLambdaContext(logger))
  .use(httpErrorHandler());
