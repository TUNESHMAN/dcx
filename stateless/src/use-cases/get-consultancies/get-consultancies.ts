import { listWithFiltersAndPagination } from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

type GetConsultanciesInput = {
  page: number;
  pageSize: number;
  status?: string;
  country?: string;
  city?: string;
  region?: string;
  search?: string;
  skillId?: string;
};

type ConsultancyRow = {
  consultancyId: string;
  name: string;
  aboutUs: string;
  website: string;
  status: string;
  country: string;
  city: string;
  region: string;
  timezone: string;
  logoKey: string | null;
  logoUrl: string | null;
  logoContentType: string | null;
  createdAt: string;
  updatedAt: string;
};

export const getConsultanciesUseCase = async (input: GetConsultanciesInput) => {
  logger.info("Fetching consultancies", { input });

  return listWithFiltersAndPagination<ConsultancyRow>({
    tableName: "dcx.consultancies c",
    selectColumns: [
      `c.consultancy_id as "consultancyId"`,
      `c.name`,
      `c.about_us as "aboutUs"`,
      `c.website`,
      `c.status`,
      `c.country`,
      `c.city`,
      `c.region`,
      `c.timezone`,
      `c.logo_key as "logoKey"`,
      `c.logo_url as "logoUrl"`,
      `c.logo_content_type as "logoContentType"`,
      `c.created_at as "createdAt"`,
      `c.updated_at as "updatedAt"`,
    ],
    orderBy: [`c.name asc`, `c.consultancy_id asc`],
    page: input.page,
    pageSize: input.pageSize,

    equals: { "c.status": input.status },
    equalsLower: {
      "c.country": input.country,
      "c.city": input.city,
      "c.region": input.region,
    },

    // you were using name_canonical ILIKE for search
    // If you keep that, you can add a second helper for ilike,
    // OR just store a lowered column and use likeLower.
    // For now, reuse likeLower with a lowered column if you have it.
    likeLower: input.search
      ? { column: "c.name_canonical", term: input.search }
      : undefined,

    extraWhere: input.skillId
      ? [
          {
            clause: `
              exists (
                select 1
                from dcx.consultancy_specialty_skills css
                where css.consultancy_id = c.consultancy_id
                  and css.skill_id = __PARAM__
              )
            `,
            params: [input.skillId.trim()],
          },
        ]
      : undefined,
  });
};
