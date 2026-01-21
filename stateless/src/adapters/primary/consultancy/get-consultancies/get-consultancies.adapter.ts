// import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
// import middy from "@middy/core";
// import httpErrorHandler from "@middy/http-error-handler";
// import { Tracer } from "@aws-lambda-powertools/tracer";
// import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
// import { errorHandler } from "../../../shared/error-handler/error-handler";
// import { logger } from "../../../shared/logger/logger";
// import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
// import { envVar } from "@leighton-digital/lambda-toolkit";
// import { Pool } from "pg";
// import { DsqlSigner } from "@aws-sdk/dsql-signer";
// import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
// import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
// import { Consultancy } from "../../../dto/consultancy/consultancy";
// const tracer = new Tracer();
// const metrics = new Metrics();
// const [DSQL_ENDPOINT, DSQL_CLUSTER_ARN] = envVar.getStrings(
//   "DSQL_ENDPOINT",
//   "DSQL_CLUSTER_ARN"
// );
// const signer = new DsqlSigner({
//   hostname: DSQL_ENDPOINT,
//   region: "eu-west-2",
// });
// const pool = new Pool({
//   host: DSQL_ENDPOINT,
//   port: 5432,
//   database: "postgres",
//   user: "admin",
//   // Every new connection will call this to get a fresh token
//   password: async () => signer.getDbConnectAdminAuthToken(),
//   ssl: { rejectUnauthorized: true },
//   max: 5,
//   idleTimeoutMillis: 30_000,
//   connectionTimeoutMillis: 5_000,
// });

// function clampInt(
//   value: string | undefined,
//   def: number,
//   min: number,
//   max: number
// ) {
//   const n = Number(value);
//   if (!Number.isFinite(n)) return def;
//   return Math.max(min, Math.min(max, Math.floor(n)));
// }

// type ConsultancyRow = {
//   consultancyId: string;
//   name: string;
//   aboutUs: string;
//   website: string;
//   status: string;

//   country: string;
//   city: string;
//   region: string;
//   timezone: string;

//   logoKey: string | null;
//   logoUrl: string | null;
//   logoContentType: string | null;

//   createdAt: string;
//   updatedAt: string;
// };

// type SpecialtyRow = {
//   consultancyId: string;
//   skillId: string;
// };

// type SkillSummaryRow = {
//   skillId: string;
//   name: string;
//   category: string;
//   status: string;
// };

// type SkillSummary = {
//   skillId: string;
//   name: string;
//   category: string;
//   status: string;
// };

// type ConsultancyResponse = Consultancy & {
//   specialtySkills: SkillSummary[];
// };
// export const getConsultanciesHandler = async (
//   event: APIGatewayProxyEvent
// ): Promise<APIGatewayProxyResult> => {
//   const client = await pool.connect();
//   try {
//     try {
//       const queryString = event.queryStringParameters ?? {};
//       //   Pagination
//       const page = clampInt(queryString.page, 1, 1, 1_000_000);
//       const pageSize = clampInt(queryString.pageSize, 25, 1, 100);
//       const offset = (page - 1) * pageSize;
//       //   Filters
//       const status = queryString.status?.trim();
//       const country = queryString.country?.trim();
//       const city = queryString.city?.trim();
//       const region = queryString.region?.trim();
//       const search = queryString.search?.trim();
//       const skillId = queryString.skillId?.trim();

//       // WHERE builder
//       const where: string[] = [];
//       const params: any[] = [];
//       let i = 1;

//       if (status) {
//         where.push(`c.status = $${i++}`);
//         params.push(status);
//       }

//       if (country) {
//         where.push(`lower(c.country) = $${i++}`);
//         params.push(country.toLowerCase());
//       }

//       if (city) {
//         where.push(`lower(c.city) = $${i++}`);
//         params.push(city.toLowerCase());
//       }

//       if (region) {
//         where.push(`lower(c.region) = $${i++}`);
//         params.push(region.toLowerCase());
//       }

//       if (search) {
//         where.push(`c.name_canonical ILIKE $${i++}`);
//         params.push(`%${search}%`);
//       }

//       if (skillId) {
//         where.push(`
//         exists (
//           select 1
//           from dcx.consultancy_specialty_skills css
//           where css.consultancy_id = c.consultancy_id
//             and css.skill_id = $${i++}
//         )
//       `);
//         params.push(skillId);
//       }

//       const whereSql = where.length ? `where ${where.join(" and ")}` : "";

//       const countResult = await client.query<{ total: string }>(
//         `SELECT COUNT(*)::text as total FROM dcx.consultancies c ${whereSql}`,
//         params
//       );
//       const total = Number(countResult.rows?.[0]?.total ?? 0);
//       const totalPages = Math.max(1, Math.ceil(total / pageSize));
//       if (total > 0 && page > totalPages) {
//         return {
//           statusCode: 200,
//           body: JSON.stringify({
//             consultancies: [] as Consultancy[],
//             meta: { page, pageSize, total, totalPages },
//           }),
//         };
//       }
//       // Data query
//       const limitParam = `$${i++}`;
//       const offsetParam = `$${i++}`;
//       const dataParams = [...params, pageSize, offset];

//       const res = await client.query<ConsultancyRow>(
//         `
//       select
//         c.consultancy_id as "consultancyId",
//         c.name,
//         c.about_us as "aboutUs",
//         c.website,
//         c.status,

//         c.country,
//         c.city,
//         c.region,
//         c.timezone,

//         c.logo_key as "logoKey",
//         c.logo_url as "logoUrl",
//         c.logo_content_type as "logoContentType",

//         c.created_at as "createdAt",
//         c.updated_at as "updatedAt"
//       from dcx.consultancies c
//       ${whereSql}
//       order by c.name asc, c.consultancy_id asc
//       limit ${limitParam} offset ${offsetParam}
//       `,
//         dataParams
//       );
//       const rows = res.rows ?? [];
//       const consultancyIds = rows.map((row) => row.consultancyId);
//       const specialtyByConsultancy = new Map<string, string[]>();
//       const allSkillIdsSet = new Set<string>();

//       if (consultancyIds.length > 0) {
//         const specialtiesRes = await client.query<SpecialtyRow>(
//           `
//         select
//           consultancy_id as "consultancyId",
//           skill_id as "skillId"
//         from dcx.consultancy_specialty_skills
//         where consultancy_id = any($1::text[])
//         `,
//           [consultancyIds]
//         );

//         for (const row of specialtiesRes.rows ?? []) {
//           const list = specialtyByConsultancy.get(row.consultancyId) ?? [];
//           list.push(row.skillId);
//           specialtyByConsultancy.set(row.consultancyId, list);
//           allSkillIdsSet.add(row.skillId);
//         }
//       }

//       const skillIds = Array.from(allSkillIdsSet);
//       const skillsById = new Map<string, SkillSummary>();

//       if (skillIds.length > 0) {
//         const skillsRes = await client.query<SkillSummaryRow>(
//           `
//         select
//           skill_id as "skillId",
//           name,
//           category,
//           status
//         from dcx.skills
//         where skill_id = any($1::text[])
//         `,
//           [skillIds]
//         );

//         for (const skill of skillsRes.rows ?? []) {
//           skillsById.set(skill.skillId, {
//             skillId: skill.skillId,
//             name: skill.name,
//             category: skill.category,
//             status: skill.status,
//           });
//         }
//       }
//       //   const consultancies: Consultancy[] = (res.rows ?? []).map(
//       //     (consultancy) => ({
//       //       consultancyId: consultancy.consultancyId,
//       //       name: consultancy.name,
//       //       aboutUs: consultancy.aboutUs,
//       //       website: consultancy.website,
//       //       status: consultancy.status as any,
//       //       location: {
//       //         country: consultancy.country ?? "",
//       //         city: consultancy.city ?? "",
//       //         region: consultancy.region ?? "",
//       //         timezone: consultancy.timezone ?? "",
//       //       },
//       //       logo: {
//       //         key: consultancy.logoKey ?? "",
//       //         url: consultancy.logoUrl ?? "",
//       //         contentType: consultancy.logoContentType ?? "",
//       //       },
//       //       specialtySkillIds:
//       //         specialtyByConsultancy.get(consultancy.consultancyId) ?? [],
//       //       createdAt: consultancy.createdAt,
//       //       updatedAt: consultancy.updatedAt,
//       //     })
//       //   );
//       const consultancies: ConsultancyResponse[] = rows.map((row) => {
//         const specialtySkillIds =
//           specialtyByConsultancy.get(row.consultancyId) ?? [];
//         const specialtySkills = specialtySkillIds
//           .map((id) => skillsById.get(id))
//           .filter((s): s is SkillSummary => Boolean(s));

//         return {
//           consultancyId: row.consultancyId,
//           name: row.name,
//           aboutUs: row.aboutUs ?? "",
//           website: row.website ?? "",
//           specialtySkillIds,
//           specialtySkills,
//           status: row.status as any,
//           createdAt: row.createdAt,
//           updatedAt: row.updatedAt,
//           location: {
//             country: row.country ?? "",
//             city: row.city ?? "",
//             region: row.region ?? "",
//             timezone: row.timezone ?? "",
//           },
//           logo:
//             row.logoKey || row.logoUrl || row.logoContentType
//               ? {
//                   key: row.logoKey ?? "",
//                   url: row.logoUrl ?? "",
//                   contentType: row.logoContentType ?? "",
//                 }
//               : undefined,
//         };
//       });
//       metrics.addMetric("GetConsultanciesSuccess", MetricUnit.Count, 1);
//       logger.info(`Consultancies fetched successfully`, {
//         dsqlClusterArn: DSQL_CLUSTER_ARN,
//         returned: consultancies.length,
//         total,
//         totalPages,
//         filters: {
//           status: status || null,
//           country: country || null,
//           city: city || null,
//           region: region || null,
//           search: search || null,
//           skillId: skillId || null,
//         },
//       });

//       return {
//         statusCode: 200,
//         body: JSON.stringify({
//           consultancies,
//           meta: { page, pageSize, total, totalPages },
//         }),
//       };
//     } catch (error) {
//       metrics.addMetric("GetConsultanciesFailure", MetricUnit.Count, 1);
//       logger.error("Error fetching consultancies", { error });
//       throw error;
//     } finally {
//       client.release();
//     }
//   } catch (err) {
//     const errorMessage = err instanceof Error ? err.message : "Unknown error";
//     logger.error(errorMessage);
//     metrics.addMetric("GetConsultanciesError", MetricUnit.Count, 1);
//     return errorHandler(err);
//   }
// };

// export const handler = middy(getConsultanciesHandler)
//   .use(captureLambdaHandler(tracer))
//   .use(logMetrics(metrics))
//   .use(injectLambdaContext(logger))
//   .use(httpErrorHandler());

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

import { getConsultanciesUseCase } from "../../../../use-cases/get-consultancies";

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

export const getConsultanciesHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const qs = event.queryStringParameters ?? {};

    const page = clampInt(qs.page, 1, 1, 1_000_000);
    const pageSize = clampInt(qs.pageSize, 25, 1, 100);

    const status = qs.status?.trim();
    const country = qs.country?.trim();
    const city = qs.city?.trim();
    const region = qs.region?.trim();
    const search = qs.search?.trim();
    const skillId = qs.skillId?.trim();

    const result = await getConsultanciesUseCase({
      page,
      pageSize,
      status,
      country,
      city,
      region,
      search,
      skillId,
    });

    metrics.addMetric("GetConsultanciesSuccess", MetricUnit.Count, 1);
    logger.info("Consultancies fetched successfully", {
      dsqlClusterArn,
      returned: result.rows.length,
      meta: result.meta,
      filters: {
        status: status || null,
        country: country || null,
        city: city || null,
        region: region || null,
        search: search || null,
        skillId: skillId || null,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        consultancies: result.rows,
        meta: result.meta,
      }),
    };
  } catch (error) {
    metrics.addMetric("GetConsultanciesError", MetricUnit.Count, 1);
    logger.error("Error fetching consultancies", { error });
    return errorHandler(error);
  }
};

export const handler = middy(getConsultanciesHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(injectLambdaContext(logger))
  .use(httpErrorHandler());
