import { createItem } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type CreateConsultancySpecialtySkillLink = {
  consultancyId: string;
  skillId: string;
  createdAt: string;
};

export const createConsultancySpecialtySkillsUseCase = async (
  links: CreateConsultancySpecialtySkillLink[]
) => {
  if (!Array.isArray(links) || links.length === 0) return;

  logger.info("Creating consultancy specialty join rows", {
    count: links.length,
  });

  for (const link of links) {
    await createItem("dcx.consultancy_specialty_skills", {
      consultancy_id: link.consultancyId,
      skill_id: link.skillId,
      created_at: link.createdAt,
    });
  }
};
