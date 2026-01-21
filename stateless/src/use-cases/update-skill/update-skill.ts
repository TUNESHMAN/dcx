import { updateItemById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type UpdateSkillUpdates = {
  name?: string;
  nameLower?: string;
  category?: string;
  aliases?: string[];
  updatedAt: string;
};

export const updateSkillUseCase = async (
  skillId: string,
  updates: UpdateSkillUpdates
) => {
  logger.info("Updating skill", {
    skillId,
    updates: Object.keys(updates),
  });

  await updateItemById("dcx.skills", "skill_id", skillId, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.nameLower !== undefined
      ? { name_lower: updates.nameLower }
      : {}),
    ...(updates.category !== undefined ? { category: updates.category } : {}),
    ...(updates.aliases !== undefined
      ? { aliases: JSON.stringify(updates.aliases) }
      : {}),
    updated_at: updates.updatedAt,
  });
};
