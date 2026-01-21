import { createItem } from "../../adapters/secondary/database-adapter/database-adapter";
import { logger } from "../../shared/logger/logger";
import { CreateSkill } from "../../dto/create-skills/create-skills";

export const createSkillUseCase = async (newSkill: CreateSkill) => {
  logger.info(`Storing skill:${JSON.stringify(newSkill)}`);
  await createItem("dcx.skills", {
    skill_id: newSkill.skillId,
    name: newSkill.name,
    name_lower: newSkill.nameLower,
    category: newSkill.category,
    status: newSkill.status,
    aliases: JSON.stringify(newSkill.aliases ?? []),
    created_at: newSkill.createdAt,
    updated_at: newSkill.updatedAt,
  });
};
