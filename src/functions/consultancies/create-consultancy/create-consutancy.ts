import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { ValidationError } from "../../../errors/validation-error";
import { errorHandler } from "../../../shared/error-handler/error-handler";
import { logger } from "../../../shared/logger/logger";
import { schema } from "./create-consultancy-schema";
import { schemaValidator } from "../../../shared/schema-validator/schema-validator";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { envVar } from "@leighton-digital/lambda-toolkit";
import { CreateConsultancy } from "../../../dto/create-consultancy/create-consultancy";
import { Consultancy } from "../../../dto/consultancy/consultancy";
import { IdempotencyConfig } from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
import { makeHandlerIdempotent } from "@aws-lambda-powertools/idempotency/middleware";
import { Pool } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
const tracer = new Tracer();
const metrics = new Metrics();
const [DSQL_ENDPOINT, DSQL_CLUSTER_ARN, IDEMPOTENCY_TABLE_NAME] =
  envVar.getStrings(
    "DSQL_ENDPOINT",
    "DSQL_CLUSTER_ARN",
    "IDEMPOTENCY_TABLE_NAME"
  );

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

export const createConsultancyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      throw new ValidationError("No payload body");
    }
    const newConsultancy = JSON.parse(event.body) as CreateConsultancy;
    schemaValidator(schema, newConsultancy);
    const timestamp = new Date().toISOString();
    const nameCanonical = normalizeName(
      (newConsultancy as CreateConsultancy).name
    );
    const consultancyId = `co_${randomUUID()}`;
    const location = {
      country: newConsultancy.location.country.trim(),
      city: newConsultancy.location.city?.trim() ?? "",
      region: newConsultancy.location.region?.trim() ?? "",
      timezone: newConsultancy.location.timezone?.trim() ?? "",
    };
    const logo = newConsultancy.logo
      ? {
          key: newConsultancy.logo.key?.trim() ?? "",
          url: newConsultancy.logo.url?.trim() ?? "",
          contentType: newConsultancy.logo.contentType?.trim() ?? "",
        }
      : { key: "", url: "", contentType: "" };

    const specialtySkillIds = (newConsultancy.specialtySkillIds ?? []).filter(
      (s) => typeof s === "string" && s.trim().length > 0
    );
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const insertConsultancyQuery = `INSERT INTO dcx.consultancies
      (consultancy_id, name, name_canonical, about_us, website,country,city, region, timezone, status,logo_key, logo_url, logo_content_type, logo_updated_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz,$15::timestamptz,$16::timestamptz)
      RETURNING
    consultancy_id as "consultancyId",
    name,
    name_canonical as "nameCanonical",
    about_us as "aboutUs",
    website,
    country,
    city,
    region,
    timezone,
    status,
    logo_key, logo_url, logo_content_type, logo_updated_at,
    created_at as "createdAt",
    updated_at as "updatedAt"`;

      const consultancyValues = [
        consultancyId,
        newConsultancy.name,
        nameCanonical,
        newConsultancy.aboutUs,
        newConsultancy.website,
        location.country,
        location.city,
        location.region,
        location.timezone,
        "active",
        logo.key,
        logo.url,
        logo.contentType,
        logo.key ? timestamp : null,
        timestamp,
        timestamp,
      ];

      const result = await client.query<Consultancy>(
        insertConsultancyQuery,
        consultancyValues
      );
      logger.debug("Insert consultancy result", { result });
      const row = result.rows[0];
      // Insert join rows for specialties
      for (const skillId of specialtySkillIds) {
        await client.query(
          `
          insert into dcx.consultancy_specialty_skills
            (consultancy_id, skill_id, created_at)
          values
            ($1,$2,$3::timestamptz)
          `,
          [consultancyId, skillId, timestamp]
        );
      }
      await client.query("COMMIT");
      const createdConsultancy: Consultancy = {
        consultancyId: row.consultancyId,
        name: row.name,
        aboutUs: row.aboutUs,
        website: row.website,
        specialtySkillIds: specialtySkillIds,
        status: row.status as any,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        location: row.location,
        logo: row.logo,
      };

      metrics.addMetric("ConsultancyCreatedSuccesfully", MetricUnit.Count, 1);
      logger.info("Consultancy created successfully", {
        consultancyId,
        dsqlClusterArn: DSQL_CLUSTER_ARN,
      });

      return {
        statusCode: 201,
        body: JSON.stringify({
          message: "Consultancy created successfully",
          createdConsultancy,
        }),
      };
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => undefined);

      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(errorMessage);
    metrics.addMetric("CreateConsultancyError", MetricUnit.Count, 1);
    return errorHandler(error);
  }
};

export const handler = middy(createConsultancyHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(makeHandlerIdempotent({ persistenceStore, config: idempotencyConfig }))
  .use(httpErrorHandler());
