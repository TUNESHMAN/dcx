import { updateItemById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type AvailabilityStatus = "available_now" | "available_from";
export type Seniority = "junior" | "mid" | "senior";

export type UpdateConsultantUpdates = {
  fullName?: string;
  title?: string;
  dayRate?: string;
  seniority?: Seniority;
  availability?: {
    availabilityStatus: AvailabilityStatus;
    availableFrom?: string | null;
  };

  willingToTravel?: boolean;

  location?: {
    country: string;
    city: string;
  };

  lastRefreshedAt?: string;
  updatedAt: string;
};

export const updateConsultantUseCase = async (
  consultantId: string,
  updates: UpdateConsultantUpdates
) => {
  logger.info("Updating consultant", {
    consultantId,
    updates: Object.keys(updates),
  });

  const availabilityPatch =
    updates.availability !== undefined
      ? {
          availability_status: updates.availability.availabilityStatus,
          available_from:
            updates.availability.availabilityStatus === "available_from"
              ? updates.availability.availableFrom ?? null
              : null,
        }
      : {};

  const locationPatch =
    updates.location !== undefined
      ? {
          country: updates.location.country,
          city: updates.location.city,
        }
      : {};

  await updateItemById("dcx.consultants", "consultant_id", consultantId, {
    ...(updates.fullName !== undefined ? { full_name: updates.fullName } : {}),
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.dayRate !== undefined ? { day_rate: updates.dayRate } : {}),
    ...(updates.seniority !== undefined
      ? { seniority: updates.seniority }
      : {}),
    ...(updates.willingToTravel !== undefined
      ? { willing_to_travel: updates.willingToTravel }
      : {}),

    ...locationPatch,
    ...availabilityPatch,

    ...(updates.lastRefreshedAt !== undefined
      ? { last_refreshed_at: updates.lastRefreshedAt }
      : {}),

    updated_at: updates.updatedAt,
  });
};
