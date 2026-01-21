import { updateItemById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export const deprecateSkillUseCase = async (
  skillId: string,
  updatedAt: string
) => {
  logger.info("Deprecating skill", { skillId });
  await updateItemById("dcx.skills", "skill_id", skillId, {
    status: "deprecated",
    updated_at: updatedAt,
  });
};
