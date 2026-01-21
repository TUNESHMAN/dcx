import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { logger } from "../../../../shared/logger/logger";
import { config } from "../../../../config";
import { Skill } from "../../../../dto/skill/skill";
import { getSkillsUseCase, SkillRow } from "../../../../use-cases/get-skills";

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

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

export const getSkillsHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const qs = event.queryStringParameters ?? {};

    const page = clampInt(qs.page, 1, 1, 1_000_000);
    const pageSize = clampInt(qs.pageSize, 25, 1, 100);

    const status = qs.status?.trim();
    const category = qs.category?.trim();
    const search = qs.search?.trim();

    const result = await getSkillsUseCase({
      page,
      pageSize,
      status,
      category,
      search,
    });

    const skills: Skill[] = (result.rows ?? []).map((r: SkillRow) => ({
      skillId: r.skill_id,
      name: r.name,
      category: r.category,
      status: r.status as any,
      aliases: parseAliases(r.aliases),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    metrics.addMetric("GetSkillsSuccess", MetricUnit.Count, 1);
    logger.info("Skills fetched successfully", {
      dsqlClusterArn,
      page,
      pageSize,
      total: result.meta.total,
      returned: skills.length,
      filters: {
        status: status || null,
        category: category || null,
        search: search || null,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        skills,
        meta: result.meta,
      }),
    };
  } catch (error) {
    metrics.addMetric("GetSkillsFailure", MetricUnit.Count, 1);
    logger.error("Error fetching skills", { error });
    return errorHandler(error);
  }
};

export const handler = middy(getSkillsHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(injectLambdaContext(logger))
  .use(httpErrorHandler());
