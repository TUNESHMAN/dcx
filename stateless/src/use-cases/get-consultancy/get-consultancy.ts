import { fetchOneById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

type ConsultancyStatusRow = {
  consultancy_id: string;
  status: "active" | "disabled";
};

export const getConsultancyUseCase = async (consultancyId: string) => {
  logger.info(`Fetching consultancy status: ${consultancyId}`);

  return fetchOneById<ConsultancyStatusRow>(
    "dcx.consultancies",
    "consultancy_id",
    consultancyId
  );
};
