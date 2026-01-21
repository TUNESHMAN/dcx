import { fetchManyByColumn } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

type SpecialtyRow = { skill_id: string };

export const getConsultancySpecialtySkillIdsUseCase = async (
  consultancyId: string
): Promise<string[]> => {
  logger.info("Fetching consultancy specialty skills", { consultancyId });

  const rows = await fetchManyByColumn<SpecialtyRow>(
    "dcx.consultancy_specialty_skills",
    "consultancy_id",
    consultancyId
  );

  return (rows ?? [])
    .map((r: any) => r.skill_id)
    .filter(
      (x: any): x is string => typeof x === "string" && x.trim().length > 0
    )
    .sort();
};
