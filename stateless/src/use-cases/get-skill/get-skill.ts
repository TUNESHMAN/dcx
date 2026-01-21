import { fetchOneById } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

type SkillStatus = "active" | "deprecated";

export type SkillRecord = {
  skillId: string;
  name: string;
  nameLower: string;
  category: string;
  status: SkillStatus;
  aliases: unknown;
  createdAt: string;
  updatedAt: string;
};

export const getSkillUseCase = async (skillId: string) => {
  logger.info(`Fetching skill status: ${skillId}`);

  return fetchOneById<SkillRecord>("dcx.skills", "skill_id", skillId);
};
