import { updateItemById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type ArchiveConsultantUpdates = {
  updatedAt: string;
};

export const archiveConsultantUseCase = async (
  consultantId: string,
  updates: ArchiveConsultantUpdates
) => {
  logger.info("Archiving consultant", {
    consultantId,
  });

  await updateItemById("dcx.consultants", "consultant_id", consultantId, {
    status: "archived",
    updated_at: updates.updatedAt,
  });
};
