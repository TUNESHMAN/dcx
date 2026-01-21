import { createItem } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type CreateConsultancyDbModel = {
  consultancyId: string;
  name: string;
  nameCanonical: string;
  aboutUs: string;
  website: string;
  status: "active" | "disabled";

  country: string;
  city: string;
  region: string;
  timezone: string;

  logoKey: string | null;
  logoUrl: string | null;
  logoContentType: string | null;
  logoUpdatedAt: string | null;

  createdAt: string;
  updatedAt: string;
};

export const createConsultancyUseCase = async (
  newConsultancy: CreateConsultancyDbModel
) => {
  logger.info("Storing consultancy", {
    consultancyId: newConsultancy.consultancyId,
  });

  await createItem("dcx.consultancies", {
    consultancy_id: newConsultancy.consultancyId,
    name: newConsultancy.name,
    name_canonical: newConsultancy.nameCanonical,
    about_us: newConsultancy.aboutUs,
    website: newConsultancy.website,
    status: newConsultancy.status,

    country: newConsultancy.country,
    city: newConsultancy.city,
    region: newConsultancy.region,
    timezone: newConsultancy.timezone,

    logo_key: newConsultancy.logoKey,
    logo_url: newConsultancy.logoUrl,
    logo_content_type: newConsultancy.logoContentType,
    logo_updated_at: newConsultancy.logoUpdatedAt,

    created_at: newConsultancy.createdAt,
    updated_at: newConsultancy.updatedAt,
  });
};
