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
import { schema } from "./update-consultancy-schema";
import { schemaValidator } from "../../../../shared/schema-validator/schema-validator";
import { config } from "../../../../config";
import { getConsultancyUseCase } from "../../../../use-cases/get-consultancy";
import {
  updateConsultancyUseCase,
  UpdateConsultancyUpdates,
} from "../../../../use-cases/update-consultancy";

const tracer = new Tracer();
const metrics = new Metrics();

const dsqlClusterArn = config.get("dsql.clusterArn");

type PatchPayload = {
  name?: string;
  aboutUs?: string;
  website?: string;
  location?: {
    country?: string;
    city?: string;
    region?: string;
    timezone?: string;
  };
  logo?: {
    key?: string;
    url?: string;
    contentType?: string;
  } | null;
  status?: never;
};

type ConsultancyStatus = "active" | "disabled";
type ConsultancyStatusRow = {
  consultancy_id: string;
  status: ConsultancyStatus;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeName(name: string) {
  return normalizeText(name);
}

export const updateConsultancyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) throw new ValidationError("No payload body");

    const consultancyId = event.pathParameters?.consultancyId?.trim();
    if (!consultancyId)
      throw new ValidationError("No consultancyId path parameter");

    const payload = JSON.parse(event.body) as PatchPayload;
    schemaValidator(schema, payload);

    if ((payload as any).status !== undefined) {
      throw new ValidationError(
        "status cannot be updated via PATCH. Use delete/disable flow instead."
      );
    }

    const hasAnyUpdate =
      payload.name !== undefined ||
      payload.aboutUs !== undefined ||
      payload.website !== undefined ||
      payload.location !== undefined ||
      payload.logo !== undefined;

    if (!hasAnyUpdate) {
      throw new ValidationError("No updatable fields provided");
    }

    // Existence and status check
    const consultancy = await getConsultancyUseCase(consultancyId);
    if (!consultancy) {
      metrics.addMetric("UpdateConsultancyNotFound", MetricUnit.Count, 1);
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
      metrics.addMetric("UpdateConsultancyDisabled", MetricUnit.Count, 1);
      return {
        statusCode: 409,
        body: JSON.stringify({
          message:
            "Consultancy is disabled and cannot be updated. Enable it first.",
          code: "ConsultancyDisabled",
        }),
      };
    }

    const now = new Date().toISOString();

    const updates: UpdateConsultancyUpdates = {
      updatedAt: now,
    };

    if (payload.name !== undefined) {
      const name = normalizeText(payload.name);
      if (!name) throw new ValidationError("name cannot be empty");

      updates.name = name;
      updates.nameCanonical = normalizeName(name);
    }

    if (payload.aboutUs !== undefined) {
      updates.aboutUs = normalizeText(payload.aboutUs);
    }

    if (payload.website !== undefined) {
      updates.website = normalizeText(payload.website);
    }

    if (payload.location !== undefined) {
      const loc = payload.location;

      if (loc.country !== undefined)
        updates.country = normalizeText(loc.country);
      if (loc.city !== undefined) updates.city = normalizeText(loc.city);
      if (loc.region !== undefined) updates.region = normalizeText(loc.region);
      if (loc.timezone !== undefined)
        updates.timezone = normalizeText(loc.timezone);
    }

    if (payload.logo !== undefined) {
      if (payload.logo === null) {
        updates.logoKey = null;
        updates.logoUrl = null;
        updates.logoContentType = null;
        updates.logoUpdatedAt = null;
      } else {
        const key = normalizeText(payload.logo.key ?? "");
        const url = normalizeText(payload.logo.url ?? "");
        const contentType = normalizeText(payload.logo.contentType ?? "");

        updates.logoKey = key || null;
        updates.logoUrl = url || null;
        updates.logoContentType = contentType || null;
        updates.logoUpdatedAt = now;
      }
    }

    await updateConsultancyUseCase(consultancyId, updates);

    metrics.addMetric("UpdateConsultancySuccess", MetricUnit.Count, 1);
    logger.info("Consultancy updated successfully", {
      consultancyId,
      dsqlClusterArn,
      updatedFields: Object.keys(updates).filter((k) => k !== "updatedAt"),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Consultancy updated successfully",
        consultancy: {
          consultancyId,
          updatedAt: now,
          updates: {
            ...(updates.name !== undefined ? { name: updates.name } : {}),
            ...(updates.aboutUs !== undefined
              ? { aboutUs: updates.aboutUs }
              : {}),
            ...(updates.website !== undefined
              ? { website: updates.website }
              : {}),
            ...(payload.location !== undefined
              ? {
                  location: {
                    ...(updates.country !== undefined
                      ? { country: updates.country }
                      : {}),
                    ...(updates.city !== undefined
                      ? { city: updates.city }
                      : {}),
                    ...(updates.region !== undefined
                      ? { region: updates.region }
                      : {}),
                    ...(updates.timezone !== undefined
                      ? { timezone: updates.timezone }
                      : {}),
                  },
                }
              : {}),
            ...(payload.logo !== undefined
              ? {
                  logo:
                    payload.logo === null
                      ? null
                      : {
                          key: updates.logoKey ?? "",
                          url: updates.logoUrl ?? "",
                          contentType: updates.logoContentType ?? "",
                        },
                }
              : {}),
          },
        },
      }),
    };
  } catch (error) {
    metrics.addMetric("UpdateConsultancyError", MetricUnit.Count, 1);
    logger.error("Error updating consultancy", { error });
    return errorHandler(error);
  }
};

export const handler = middy(updateConsultancyHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics))
  .use(httpErrorHandler());
