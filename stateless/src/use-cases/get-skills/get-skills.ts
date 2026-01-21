import { listWithFiltersAndPagination } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

export type GetSkillsQuery = {
  page: number;
  pageSize: number;
  status?: string;
  category?: string;
  search?: string;
};

export type SkillRow = {
  skill_id: string;
  name: string;
  category: string;
  status: string;
  aliases: any;
  created_at: string;
  updated_at: string;
};

export const getSkillsUseCase = async (q: GetSkillsQuery) => {
  logger.info("Fetching skills", { q });

  return listWithFiltersAndPagination<SkillRow>({
    tableName: "dcx.skills",
    selectColumns: [
      `skill_id`,
      `name`,
      `category`,
      `status`,
      `aliases`,
      `created_at`,
      `updated_at`,
    ],
    orderBy: [`name asc`, `skill_id asc`],
    page: q.page,
    pageSize: q.pageSize,
    equals: {
      status: q.status,
    },
    equalsLower: {
      category: q.category,
    },
    likeLower: {
      column: "name_lower",
      term: q.search,
    },
  });
};
