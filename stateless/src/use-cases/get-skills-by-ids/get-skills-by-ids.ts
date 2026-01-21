import { fetchManyByIds } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

type SkillStatus = "active" | "deprecated";

export type SkillLite = {
  skill_id: string;
  name: string;
  category: string;
  status: SkillStatus;
};

export const getSkillsByIdsUseCase = async (skillIds: string[]) => {
  logger.info("Fetching skills by ids", { count: skillIds.length });

  return fetchManyByIds<SkillLite>("dcx.skills", "skill_id", skillIds);
};
