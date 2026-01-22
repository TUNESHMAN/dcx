import {
  listWithFiltersAndPagination,
  fetchManyByAnyIds,
} from "../../adapters/secondary/database-adapter";
import { logger } from "../../shared/logger/logger";

type GetConsultantsInput = {
  page: number;
  pageSize: number;
  consultancyId?: string;
  status?: "active" | "archived";
  seniority?: "junior" | "mid" | "senior";
  availabilityStatus?: "available_now" | "available_from";
  country?: string;
  city?: string;
  search?: string;
  skillId?: string;
};

type ConsultantRow = {
  consultantId: string;
  consultancyId: string;
  fullName: string;
  title: string;
  dayRate: string;
  seniority: "junior" | "mid" | "senior";
  availabilityStatus: "available_now" | "available_from";
  availableFrom: string | null;
  country: string;
  city: string;
  willingToTravel: boolean;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type ConsultantSkillJoinRow = {
  consultant_id: string;
  skill_id: string;
  created_at: string;
};

type ConsultantWithSkillsRow = ConsultantRow & {
  skillIds: string[];
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const getConsultantsUseCase = async (input: GetConsultantsInput) => {
  logger.info("Fetching consultants", { input });

  const search = nonEmpty(input.search) ? input.search.trim() : undefined;

  const extraWhere = [
    ...(search
      ? [
          {
            clause: `c.full_name ILIKE __PARAM__`,
            params: [`%${search}%`],
          },
        ]
      : []),

    ...(nonEmpty(input.skillId)
      ? [
          {
            clause: `
                exists (
                  select 1
                  from dcx.consultant_skills cs
                  where cs.consultant_id = c.consultant_id
                    and cs.skill_id = __PARAM__
                )
              `,
            params: [input.skillId.trim()],
          },
        ]
      : []),
  ];

  const paged = await listWithFiltersAndPagination<ConsultantRow>({
    tableName: "dcx.consultants c",
    selectColumns: [
      `c.consultant_id as "consultantId"`,
      `c.consultancy_id as "consultancyId"`,
      `c.full_name as "fullName"`,
      `c.title`,
      `c.day_rate as "dayRate"`,
      `c.seniority`,
      `c.availability_status as "availabilityStatus"`,
      `c.available_from as "availableFrom"`,
      `c.country`,
      `c.city`,
      `c.willing_to_travel as "willingToTravel"`,
      `c.status`,
      `c.created_at as "createdAt"`,
      `c.updated_at as "updatedAt"`,
    ],
    orderBy: [`c.full_name asc`, `c.consultant_id asc`],
    page: input.page,
    pageSize: input.pageSize,

    equals: {
      "c.consultancy_id": input.consultancyId,
      "c.status": input.status,
      "c.seniority": input.seniority,
      "c.availability_status": input.availabilityStatus,
    },

    equalsLower: {
      "c.country": input.country,
      "c.city": input.city,
    },
    ...(extraWhere.length > 0 ? { extraWhere } : {}),
  });

  const consultantIds = paged.rows.map((r) => r.consultantId);

  const joins =
    consultantIds.length === 0
      ? []
      : await fetchManyByAnyIds<ConsultantSkillJoinRow>(
          "dcx.consultant_skills",
          "consultant_id",
          consultantIds
        );

  const skillsByConsultant = new Map<string, string[]>();
  for (const join of joins) {
    const list = skillsByConsultant.get(join.consultant_id) ?? [];
    list.push(join.skill_id);
    skillsByConsultant.set(join.consultant_id, list);
  }

  const rows: ConsultantWithSkillsRow[] = paged.rows.map((row) => ({
    ...row,
    skillIds: skillsByConsultant.get(row.consultantId) ?? [],
  }));

  return { rows, meta: paged.meta };
};
