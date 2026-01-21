import { createItem } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type CreateConsultantSkillLink = {
  consultantId: string;
  skillId: string;
  createdAt: string;
};

export const createConsultantSkillsUseCase = async (
  links: CreateConsultantSkillLink[]
) => {
  if (!Array.isArray(links) || links.length === 0) return;

  logger.info("Creating consultant skill join rows", { count: links.length });

  for (const link of links) {
    await createItem("dcx.consultant_skills", {
      consultant_id: link.consultantId,
      skill_id: link.skillId,
      created_at: link.createdAt,
    });
  }
};
