import { updateItemById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type DisableConsultancyUpdates = {
  updatedAt: string;
};

export const disableConsultancyUseCase = async (
  consultancyId: string,
  updates: DisableConsultancyUpdates
) => {
  logger.info("Disabling consultancy", {
    consultancyId,
  });

  await updateItemById("dcx.consultancies", "consultancy_id", consultancyId, {
    status: "disabled",
    updated_at: updates.updatedAt,
  });
};
