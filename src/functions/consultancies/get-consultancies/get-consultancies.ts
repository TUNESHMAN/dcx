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
import { Consultancy } from "../../../dto/consultancy/consultancy";
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

type ConsultancyRow = {
  consultancyId: string;
  name: string;
  aboutUs: string;
  website: string;
  status: string;

  country: string;
  city: string;
  region: string;
  timezone: string;

  logoKey: string;
  logoUrl: string;
  logoContentType: string;

  createdAt: string;
  updatedAt: string;
};
type SpecialtyRow = {
  consultancyId: string;
  skillId: string;
};

export const getConsultanciesHandler = async (
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
        `SELECT COUNT(*)::text as total FROM dcx.consultancies`
      );
      const total = Number(countResult.rows?.[0]?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (total > 0 && page > totalPages) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            consultancies: [] as Consultancy[],
            meta: { page, pageSize, total, totalPages },
          }),
        };
      }
      const res = await client.query<ConsultancyRow>(
        `SELECT 
        consultancy_id as "consultancyId",
        name,
        about_us,
        website,
        status,
        country,
        city,
        region,
        timezone,
        logo_key as "logoKey",
        logo_url as "logoUrl",
        logo_content_type as "logoContentType",
        logo_updated_at as "logoUpdatedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
         FROM dcx.consultancies
         ORDER BY name
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      );
      const rows = res.rows ?? [];
      const consultancyIds = rows.map((row) => row.consultancyId);
      const specialtyByConsultancy = new Map<string, string[]>();

      if (consultancyIds.length > 0) {
        const specialtiesRes = await client.query<SpecialtyRow>(
          `
        select
          consultancy_id as "consultancyId",
          skill_id as "skillId"
        from dcx.consultancy_specialty_skills
        where consultancy_id = any($1::text[])
        `,
          [consultancyIds]
        );

        for (const row of specialtiesRes.rows ?? []) {
          const list = specialtyByConsultancy.get(row.consultancyId) ?? [];
          list.push(row.skillId);
          specialtyByConsultancy.set(row.consultancyId, list);
        }
      }

      const consultancies: Consultancy[] = (res.rows ?? []).map(
        (consultancy) => ({
          consultancyId: consultancy.consultancyId,
          name: consultancy.name,
          aboutUs: consultancy.aboutUs,
          website: consultancy.website,
          status: consultancy.status as any,
          location: {
            country: consultancy.country ?? "",
            city: consultancy.city ?? "",
            region: consultancy.region ?? "",
            timezone: consultancy.timezone ?? "",
          },
          logo: {
            key: consultancy.logoKey ?? "",
            url: consultancy.logoUrl ?? "",
            contentType: consultancy.logoContentType ?? "",
          },
          specialtySkillIds:
            specialtyByConsultancy.get(consultancy.consultancyId) ?? [],
          createdAt: consultancy.createdAt,
          updatedAt: consultancy.updatedAt,
        })
      );
      metrics.addMetric("GetConsultanciesSuccess", MetricUnit.Count, 1);
      logger.info(`Consultancies fetched successfully`, {
        dsqlClusterArn: DSQL_CLUSTER_ARN,
        returned: consultancies.length,
        total,
        totalPages,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          consultancies,
          meta: { page, pageSize, total, totalPages },
        }),
      };
    } catch (error) {
      metrics.addMetric("GetConsultanciesFailure", MetricUnit.Count, 1);
      logger.error("Error fetching consultancies", { error });
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logger.error(errorMessage);
    metrics.addMetric("GetConsultanciesError", MetricUnit.Count, 1);
    return errorHandler(err);
  }
};

export const handler = middy(getConsultanciesHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(injectLambdaContext(logger))
  .use(httpErrorHandler());
