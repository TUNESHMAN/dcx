import { fetchOneById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type ConsultantStatus = "active" | "archived";
export type Seniority = "junior" | "mid" | "senior";
export type AvailabilityStatus = "available_now" | "available_from";

export type ConsultantRow = {
  consultant_id: string;
  consultancy_id: string;
  full_name: string;
  title: string;
  day_rate: string;
  seniority: Seniority;
  availability_status: AvailabilityStatus;
  available_from: string | null;
  willing_to_travel: boolean;
  country: string;
  city: string;
  status: ConsultantStatus;
  last_refreshed_at: string;
  created_at: string;
  updated_at: string;
};

export const getConsultantUseCase = async (consultantId: string) => {
  const id = (consultantId ?? "").trim();
  logger.info("Fetching consultant", { consultantId: id });

  if (!id) return null;

  return fetchOneById<ConsultantRow>("dcx.consultants", "consultant_id", id);
};
