// export type SkillStatus = "active" | "deprecated";

// export interface Skill {
//   skillId: string;
//   name: string;
//   category: string;
//   status: SkillStatus;
//     nameLower: string;
//   aliases: string[];
//   createdAt: string;
//   updatedAt: string;
// }

export type SkillStatus = "active" | "deprecated";

/**
 * Domain / API model
 * Used by controllers, responses, frontend
 */
export interface Skill {
  skillId: string;
  name: string;
  category: string;
  status: SkillStatus;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * DynamoDB persistence model
 * Used ONLY inside lambdas/repositories
 */
export interface SkillDbItem extends Skill {
  PK: "SKILL";
  SK: `SKILL#${string}`;
  entityType: "Skill";
  nameLower: string;
}
