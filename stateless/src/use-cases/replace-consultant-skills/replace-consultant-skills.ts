import {
  createItem,
  deleteWhere,
} from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type ReplaceConsultantSkillsInput = {
  consultantId: string;
  skillIds: string[];
  createdAt: string;
};

function normalizeSkillIds(skillIds: string[]): string[] {
  const set = new Set<string>();
  for (const v of skillIds ?? []) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) set.add(t);
  }
  return Array.from(set);
}

export const replaceConsultantSkillsUseCase = async (
  input: ReplaceConsultantSkillsInput
) => {
  const consultantId = (input.consultantId ?? "").trim();
  if (!consultantId) return;

  const createdAt = input.createdAt;
  const skillIds = normalizeSkillIds(input.skillIds);

  logger.info("Replacing consultant skill join rows", {
    consultantId,
    count: skillIds.length,
  });

  await deleteWhere("dcx.consultant_skills", "consultant_id = $1", [
    consultantId,
  ]);

  if (skillIds.length === 0) return;

  for (const skillId of skillIds) {
    await createItem("dcx.consultant_skills", {
      consultant_id: consultantId,
      skill_id: skillId,
      created_at: createdAt,
    });
  }
};
