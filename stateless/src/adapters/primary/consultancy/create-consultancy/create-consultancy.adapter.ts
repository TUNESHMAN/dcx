import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { randomUUID } from "node:crypto";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { ValidationError } from "../../../../errors/validation-error";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { logger } from "../../../../shared/logger/logger";
import { schemaValidator } from "../../../../shared/schema-validator/schema-validator";
import { schema } from "./create-consultancy-schema";

import { IdempotencyConfig } from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
import { makeHandlerIdempotent } from "@aws-lambda-powertools/idempotency/middleware";

import { config } from "../../../../config";
import { CreateConsultancy } from "../../../../dto/create-consultancy/create-consultancy";

import { createConsultancyUseCase } from "../../../../use-cases/create-consultancy";
import { createConsultancySpecialtySkillsUseCase } from "../../../../use-cases/create-consultancy-specialty-skills";
import { getSkillsByIdsUseCase } from "../../../../use-cases/get-skills-by-ids";

type ConsultancyStatus = "active" | "disabled";
type SkillStatus = "active" | "deprecated";

type SkillRow = {
  skill_id: string;
  name: string;
  category: string;
  status: SkillStatus;
};

type CreateConsultancyResponse = {
  consultancyId: string;
  name: string;
  aboutUs: string;
  website: string;
  status: ConsultancyStatus;
  specialtySkillIds: string[];
  specialtySkills: Array<{
    skillId: string;
    name: string;
    category: string;
  }>;
  createdAt: string;
  updatedAt: string;
  location: {
    country: string;
    city: string;
    region?: string;
    timezone?: string;
  };
  logo?: {
    key: string;
    url: string;
    contentType: string;
  } | null;
};

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

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSkillIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<string>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) set.add(t);
  }
  return Array.from(set);
}

export const createConsultancyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) throw new ValidationError("No payload body");

    const payload = JSON.parse(event.body) as CreateConsultancy;
    schemaValidator(schema, payload);

    const now = new Date().toISOString();
    const consultancyId = `co_${randomUUID()}`;

    const name = normalizeText(payload.name);
    if (!name) throw new ValidationError("name is required");

    const nameCanonical = name;

    const aboutUs =
      payload.aboutUs !== undefined ? normalizeText(payload.aboutUs) : "";
    const website =
      payload.website !== undefined ? normalizeText(payload.website) : "";

    const country = normalizeText(payload.location?.country);
    const city = normalizeText(payload.location?.city);
    const region =
      payload.location?.region !== undefined
        ? normalizeText(payload.location.region)
        : "";
    const timezone =
      payload.location?.timezone !== undefined
        ? normalizeText(payload.location.timezone)
        : "";

    if (!country) throw new ValidationError("location.country is required");
    if (!city) throw new ValidationError("location.city is required");

    const logo =
      payload.logo === undefined
        ? null
        : {
            key: normalizeText(payload.logo.key),
            url: normalizeText(payload.logo.url),
            contentType: normalizeText(payload.logo.contentType),
          };

    const specialtySkillIds = normalizeSkillIds(payload.specialtySkillIds);

    // Validate specialty skills exist + active
    let specialtySkills: CreateConsultancyResponse["specialtySkills"] = [];
    if (specialtySkillIds.length > 0) {
      const rows = (await getSkillsByIdsUseCase(
        specialtySkillIds
      )) as SkillRow[];

      const byId = new Map(rows.map((r) => [r.skill_id, r]));
      const missing = specialtySkillIds.filter((id) => !byId.has(id));
      const deprecated = specialtySkillIds.filter(
        (id) => byId.get(id)?.status === "deprecated"
      );

      if (missing.length > 0 || deprecated.length > 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message:
              "One or more specialtySkillIds are invalid. Skills must exist and be active.",
            code: "InvalidSpecialtySkillIds",
            details: {
              missingSkillIds: missing,
              deprecatedSkillIds: deprecated,
            },
          }),
        };
      }

      specialtySkills = specialtySkillIds
        .map((id) => byId.get(id)!)
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) || a.skill_id.localeCompare(b.skill_id)
        )
        .map((s) => ({
          skillId: s.skill_id,
          name: s.name,
          category: s.category,
        }));
    }
    await createConsultancyUseCase({
      consultancyId,
      name,
      nameCanonical,
      aboutUs,
      website,
      status: "active",

      country,
      city,
      region,
      timezone,

      logoKey: logo?.key ?? null,
      logoUrl: logo?.url ?? null,
      logoContentType: logo?.contentType ?? null,
      logoUpdatedAt: logo?.key ? now : null,

      createdAt: now,
      updatedAt: now,
    });

    // Insert join rows
    await createConsultancySpecialtySkillsUseCase(
      specialtySkillIds.map((skillId) => ({
        consultancyId,
        skillId,
        createdAt: now,
      }))
    );

    const response: CreateConsultancyResponse = {
      consultancyId,
      name,
      aboutUs,
      website,
      status: "active",
      specialtySkillIds,
      specialtySkills,
      createdAt: now,
      updatedAt: now,
      location: {
        country,
        city,
        region: region || undefined,
        timezone: timezone || undefined,
      },
      logo: logo
        ? {
            key: logo.key,
            url: logo.url,
            contentType: logo.contentType,
          }
        : null,
    };

    metrics.addMetric("CreateConsultancySuccess", MetricUnit.Count, 1);
    logger.info("Consultancy created successfully", {
      consultancyId,
      dsqlClusterArn,
      specialtySkillsCount: specialtySkillIds.length,
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Consultancy created successfully",
        createdConsultancy: response,
      }),
    };
  } catch (error) {
    metrics.addMetric("CreateConsultancyError", MetricUnit.Count, 1);
    logger.error("Error creating consultancy", { error });
    return errorHandler(error);
  }
};

export const handler = middy(createConsultancyHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(makeHandlerIdempotent({ persistenceStore, config: idempotencyConfig }))
  .use(httpErrorHandler());
