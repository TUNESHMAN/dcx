import { updateItemById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type UpdateConsultancyUpdates = {
  name?: string;
  nameCanonical?: string;
  aboutUs?: string;
  website?: string;
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
  logoKey?: string | null;
  logoUrl?: string | null;
  logoContentType?: string | null;
  logoUpdatedAt?: string | null;
  updatedAt: string;
};

export const updateConsultancyUseCase = async (
  consultancyId: string,
  updates: UpdateConsultancyUpdates
) => {
  logger.info("Updating consultancy", {
    consultancyId,
    updates: Object.keys(updates),
  });

  await updateItemById("dcx.consultancies", "consultancy_id", consultancyId, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.nameCanonical !== undefined
      ? { name_canonical: updates.nameCanonical }
      : {}),
    ...(updates.aboutUs !== undefined ? { about_us: updates.aboutUs } : {}),
    ...(updates.website !== undefined ? { website: updates.website } : {}),

    ...(updates.country !== undefined ? { country: updates.country } : {}),
    ...(updates.city !== undefined ? { city: updates.city } : {}),
    ...(updates.region !== undefined ? { region: updates.region } : {}),
    ...(updates.timezone !== undefined ? { timezone: updates.timezone } : {}),

    ...(updates.logoKey !== undefined ? { logo_key: updates.logoKey } : {}),
    ...(updates.logoUrl !== undefined ? { logo_url: updates.logoUrl } : {}),
    ...(updates.logoContentType !== undefined
      ? { logo_content_type: updates.logoContentType }
      : {}),
    ...(updates.logoUpdatedAt !== undefined
      ? { logo_updated_at: updates.logoUpdatedAt }
      : {}),

    updated_at: updates.updatedAt,
  });
};
