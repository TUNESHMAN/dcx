import {
  deleteItemById,
  deleteWhere,
} from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export const deleteConsultantUseCase = async (consultantId: string) => {
  logger.info("Hard deleting consultant", { consultantId });

  await deleteWhere("dcx.consultant_skills", "consultant_id = $1", [
    consultantId,
  ]);

  await deleteItemById("dcx.consultants", "consultant_id", consultantId);
};
