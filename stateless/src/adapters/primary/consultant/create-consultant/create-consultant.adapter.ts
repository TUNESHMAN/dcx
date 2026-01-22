import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { randomUUID } from "node:crypto";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { IdempotencyConfig } from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
import { makeHandlerIdempotent } from "@aws-lambda-powertools/idempotency/middleware";
import { ValidationError } from "../../../../errors/validation-error";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { logger } from "../../../../shared/logger/logger";
import { schemaValidator } from "../../../../shared/schema-validator/schema-validator";
import { schema } from "./create-consultant-schema";
import { config } from "../../../../config";
import { CreateConsultant } from "../../../../dto/create-consultant/create-consultant";
import { createConsultantUseCase } from "../../../../use-cases/create-consultant";
import { getConsultancyUseCase } from "../../../../use-cases/get-consultancy";
import { getSkillsByIdsUseCase } from "../../../../use-cases/get-skills-by-ids";
import { createConsultantSkillsUseCase } from "../../../../use-cases/create-consultant-skills";

type ConsultantStatus = "active" | "archived";
type Seniority = "junior" | "mid" | "senior";
type AvailabilityStatus = "available_now" | "available_from";

type ConsultancyStatus = "active" | "disabled";
type SkillStatus = "active" | "deprecated";

type ConsultancyStatusRow = {
  consultancy_id: string;
  status: ConsultancyStatus;
};

type SkillRow = {
  skill_id: string;
  name: string;
  category: string;
  status: SkillStatus;
};

type ConsultantResponse = {
  consultantId: string;
  consultancyId: string;
  fullName: string;
  title: string;
  dayRate: string;
  seniority: Seniority;
  status: ConsultantStatus;
  availability: {
    availabilityStatus: AvailabilityStatus;
    availableFrom: string | null;
  };
  willingToTravel: boolean;
  skillIds: string[];
  location: {
    country: string;
    city: string;
  };
  lastRefreshedAt: string;
  createdAt: string;
  updatedAt: string;
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

function normalizeText(value: unknown) {
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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const createConsultantHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) throw new ValidationError("No payload body");

    const payload = JSON.parse(event.body) as CreateConsultant;
    schemaValidator(schema, payload);

    const now = new Date().toISOString();
    const consultantId = `ct_${randomUUID()}`;

    const consultancyId = normalizeText(payload.consultancyId);
    const fullName = normalizeText(payload.fullName);
    const title = normalizeText(payload.title);
    const dayRate = normalizeText(payload.dayRate);
    const seniority = normalizeText(payload.seniority) as Seniority;

    const availabilityStatus = normalizeText(
      payload.availability?.availabilityStatus
    ) as AvailabilityStatus;

    if (!consultancyId) throw new ValidationError("consultancyId is required");
    if (!fullName) throw new ValidationError("fullName is required");
    if (!title) throw new ValidationError("title is required");
    if (!dayRate) throw new ValidationError("dayRate is required");
    if (!seniority) throw new ValidationError("seniority is required");
    if (!availabilityStatus) {
      throw new ValidationError("availability.availabilityStatus is required");
    }

    const availableFromRaw =
      payload.availability?.availableFrom !== undefined
        ? payload.availability.availableFrom
        : null;

    let availableFrom: string | null = null;
    if (availabilityStatus === "available_from") {
      if (!availableFromRaw) {
        throw new ValidationError(
          "availability.availableFrom is required when availabilityStatus is 'available_from'"
        );
      }
      const date = normalizeText(availableFromRaw);
      if (!isIsoDate(date)) {
        throw new ValidationError(
          "availability.availableFrom must be YYYY-MM-DD"
        );
      }
      availableFrom = date;
    } else {
      availableFrom = null;
    }

    const willingToTravel = Boolean(payload.willingToTravel);

    const country = normalizeText(payload.location?.country);
    const city = normalizeText(payload.location?.city);
    if (!country) throw new ValidationError("location.country is required");
    if (!city) throw new ValidationError("location.city is required");

    const skillIds = normalizeSkillIds(payload.skillIds);
    const status: ConsultantStatus = "active";

    const consultancy = await getConsultancyUseCase(consultancyId);

    if (!consultancy) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Consultancy not found",
          code: "ConsultancyNotFound",
        }),
      };
    }

    const consultancyRow = consultancy as unknown as ConsultancyStatusRow;
    if (consultancyRow.status === "disabled") {
      return {
        statusCode: 409,
        body: JSON.stringify({
          message: "Cannot add consultants to a disabled consultancy",
          code: "ConsultancyDisabled",
        }),
      };
    }

    if (skillIds.length > 0) {
      const rows = (await getSkillsByIdsUseCase(skillIds)) as SkillRow[];

      const byId = new Map(rows.map((r) => [r.skill_id, r]));
      const missing = skillIds.filter((id) => !byId.has(id));
      const deprecated = skillIds.filter(
        (id) => byId.get(id)?.status === "deprecated"
      );

      if (missing.length > 0 || deprecated.length > 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message:
              "One or more skillIds are invalid. Skills must exist and be active.",
            code: "InvalidSkillIds",
            details: {
              missingSkillIds: missing,
              deprecatedSkillIds: deprecated,
            },
          }),
        };
      }
    }

    const consultantDbRow = {
      consultant_id: consultantId,
      consultancy_id: consultancyId,
      full_name: fullName,
      title,
      day_rate: dayRate,
      seniority,
      availability_status: availabilityStatus,
      available_from: availableFrom,
      country,
      city,
      willing_to_travel: willingToTravel,
      status: "active" as ConsultantStatus,

      last_refreshed_at: now,
      created_at: now,
      updated_at: now,
    };

    await createConsultantUseCase(consultantDbRow as any);
    await createConsultantSkillsUseCase(
      skillIds.map((skillId) => ({
        consultantId,
        skillId,
        createdAt: now,
      }))
    );

    metrics.addMetric("CreateConsultantSuccess", MetricUnit.Count, 1);
    logger.info("Consultant created successfully", {
      consultantId,
      consultancyId,
      dsqlClusterArn,
      skillsCount: skillIds.length,
      availabilityStatus,
    });

    const response: ConsultantResponse = {
      consultantId,
      consultancyId,
      fullName,
      title,
      dayRate,
      seniority,
      status,
      availability: {
        availabilityStatus,
        availableFrom,
      },
      willingToTravel,
      skillIds,
      location: { country, city },
      lastRefreshedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Consultant created successfully",
        consultant: response,
      }),
    };
  } catch (error) {
    metrics.addMetric("CreateConsultantError", MetricUnit.Count, 1);
    logger.error("Error creating consultant", { error });
    return errorHandler(error);
  }
};

export const handler = middy(createConsultantHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(makeHandlerIdempotent({ persistenceStore, config: idempotencyConfig }))
  .use(httpErrorHandler());
