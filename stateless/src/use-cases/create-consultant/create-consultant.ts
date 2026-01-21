import { createItem } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";
import { CreateConsultant } from "../../dto/create-consultant/create-consultant";

export const createConsultantUseCase = async (
  newConsultant: CreateConsultant
) => {
  logger.info(`Storing consultant: ${JSON.stringify(newConsultant)}`);
  await createItem("dcx.consultants", newConsultant);
};
