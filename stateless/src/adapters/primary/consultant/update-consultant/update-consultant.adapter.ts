import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { MetricUnit, Metrics } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { ValidationError } from "../../../../errors/validation-error";
import { errorHandler } from "../../../../shared/error-handler/error-handler";
import { logger } from "../../../../shared/logger/logger";
import { schemaValidator } from "../../../../shared/schema-validator/schema-validator";
import { schema } from "./update-consultant-schema";
import { config } from "../../../../config";
import { getSkillsByIdsUseCase } from "../../../../use-cases/get-skills-by-ids";
import { getConsultantUseCase } from "../../../../use-cases/get-consultant";
import { updateConsultantUseCase } from "../../../../use-cases/update-consultant";
import { replaceConsultantSkillsUseCase } from "../../../../use-cases/replace-consultant-skills";

type ConsultantStatus = "active" | "archived";
type Seniority = "junior" | "mid" | "senior";
type AvailabilityStatus = "available_now" | "available_from";
type SkillStatus = "active" | "deprecated";

type PatchPayload = Partial<{
  consultancyId: never;
  status: never;
  fullName: string;
  title: string;
  dayRate: string;
  seniority: Seniority;
  availability: {
    availabilityStatus: AvailabilityStatus;
    availableFrom?: string;
  };

  willingToTravel: boolean;
  location: {
    country: string;
    city: string;
  };
  skillIds: string[];
}>;

type ConsultantStatusRow = {
  consultant_id: string;
  consultancy_id: string;
  status: ConsultantStatus;
};

type SkillRow = {
  skill_id: string;
  status: SkillStatus;
};

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

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

export const updateConsultantHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const consultantId = event.pathParameters?.consultantId?.trim();
    if (!consultantId)
      throw new ValidationError("No consultantId path parameter");
    if (!event.body) throw new ValidationError("No payload body");

    const payload = JSON.parse(event.body) as PatchPayload;
    schemaValidator(schema, payload);

    if ((payload as any).status !== undefined) {
      throw new ValidationError(
        "status cannot be updated via PATCH. Use archive flow instead."
      );
    }
    if ((payload as any).consultancyId !== undefined) {
      throw new ValidationError("consultancyId cannot be updated via PATCH.");
    }

    const hasAnyUpdate =
      payload.fullName !== undefined ||
      payload.title !== undefined ||
      payload.dayRate !== undefined ||
      payload.seniority !== undefined ||
      payload.availability !== undefined ||
      payload.willingToTravel !== undefined ||
      payload.location !== undefined ||
      payload.skillIds !== undefined;

    if (!hasAnyUpdate)
      throw new ValidationError("No updatable fields provided");

    // ✅ Existence check (+ status)
    const consultant = (await getConsultantUseCase(
      consultantId
    )) as unknown as ConsultantStatusRow | null;

    if (!consultant) {
      metrics.addMetric("UpdateConsultantNotFound", MetricUnit.Count, 1);
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Consultant not found",
          code: "ConsultantNotFound",
        }),
      };
    }

    if (consultant.status === "archived") {
      metrics.addMetric("UpdateConsultantArchived", MetricUnit.Count, 1);
      return {
        statusCode: 409,
        body: JSON.stringify({
          message: "Consultant is archived and cannot be updated.",
          code: "ConsultantArchived",
        }),
      };
    }

    const now = new Date().toISOString();
    const updates: any = { updatedAt: now };
    let hasConsultantFieldUpdates = false;

    if (payload.fullName !== undefined) {
      const fullName = normalizeText(payload.fullName);
      if (!fullName) throw new ValidationError("fullName cannot be empty");
      updates.fullName = fullName;
      hasConsultantFieldUpdates = true;
    }

    if (payload.title !== undefined) {
      const title = normalizeText(payload.title);
      if (!title) throw new ValidationError("title cannot be empty");
      updates.title = title;
      hasConsultantFieldUpdates = true;
    }

    if (payload.dayRate !== undefined) {
      const dayRate = normalizeText(payload.dayRate);
      if (!dayRate) throw new ValidationError("dayRate cannot be empty");
      updates.dayRate = dayRate;
      hasConsultantFieldUpdates = true;
    }

    if (payload.seniority !== undefined) {
      const seniority = normalizeText(payload.seniority) as Seniority;
      if (!seniority) throw new ValidationError("seniority cannot be empty");
      updates.seniority = seniority;
      hasConsultantFieldUpdates = true;
    }

    if (payload.willingToTravel !== undefined) {
      updates.willingToTravel = Boolean(payload.willingToTravel);
      hasConsultantFieldUpdates = true;
    }

    if (payload.location !== undefined) {
      const country = normalizeText(payload.location?.country);
      const city = normalizeText(payload.location?.city);
      if (!country)
        throw new ValidationError("location.country cannot be empty");
      if (!city) throw new ValidationError("location.city cannot be empty");

      updates.location = { country, city };
      hasConsultantFieldUpdates = true;
    }

    if (payload.availability !== undefined) {
      const availabilityStatus = normalizeText(
        payload.availability?.availabilityStatus
      ) as AvailabilityStatus;

      if (!availabilityStatus) {
        throw new ValidationError(
          "availability.availabilityStatus is required"
        );
      }

      if (availabilityStatus === "available_from") {
        const availableFrom = normalizeText(
          payload.availability?.availableFrom
        );
        if (!availableFrom) {
          throw new ValidationError(
            "availability.availableFrom is required when availabilityStatus is 'available_from'"
          );
        }
        if (!isIsoDate(availableFrom)) {
          throw new ValidationError(
            "availability.availableFrom must be YYYY-MM-DD"
          );
        }

        updates.availability = { availabilityStatus, availableFrom };
      } else {
        // available_now => clear availableFrom
        updates.availability = { availabilityStatus, availableFrom: null };
      }

      hasConsultantFieldUpdates = true;
    }

    // ---- Skills validation + replace join rows ONLY if skillIds provided ----
    let normalizedSkillIds: string[] | undefined;

    if (payload.skillIds !== undefined) {
      normalizedSkillIds = normalizeSkillIds(payload.skillIds);

      if (normalizedSkillIds.length > 0) {
        const rows = (await getSkillsByIdsUseCase(
          normalizedSkillIds
        )) as unknown as SkillRow[];

        const byId = new Map(rows.map((r) => [r.skill_id, r]));
        const missing = normalizedSkillIds.filter((id) => !byId.has(id));
        const deprecated = normalizedSkillIds.filter(
          (id) => byId.get(id)?.status === "deprecated"
        );

        if (missing.length > 0 || deprecated.length > 0) {
          metrics.addMetric(
            "UpdateConsultantInvalidSkillIds",
            MetricUnit.Count,
            1
          );
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
    }

    // ---- Persist ----
    // Only write consultant row if we actually updated any consultant fields
    if (hasConsultantFieldUpdates) {
      await updateConsultantUseCase(consultantId, updates);
    }

    // Replace skills ONLY when provided (empty array clears all)
    if (normalizedSkillIds !== undefined) {
      await replaceConsultantSkillsUseCase({
        consultantId,
        skillIds: normalizedSkillIds,
        createdAt: now,
      });
    }

    metrics.addMetric("UpdateConsultantSuccess", MetricUnit.Count, 1);
    logger.info("Consultant updated successfully", {
      consultantId,
      dsqlClusterArn,
      updatedFields: Object.keys(payload),
      skillsProvided: normalizedSkillIds !== undefined,
      skillsCount: normalizedSkillIds?.length,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Consultant updated successfully" }),
    };
  } catch (error) {
    metrics.addMetric("UpdateConsultantError", MetricUnit.Count, 1);
    logger.error("Error updating consultant", { error });
    return errorHandler(error);
  }
};

export const handler = middy(updateConsultantHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(httpErrorHandler());
