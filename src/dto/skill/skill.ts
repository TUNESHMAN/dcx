export type SkillStatus = "active" | "deprecated";
export interface Skill {
  skillId: string;
  name: string;
  category: string;
  status: SkillStatus;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillDbItem extends Skill {
  PK: "SKILL";
  SK: `SKILL#${string}`;
  entityType: "Skill";
  nameLower: string;
}

export interface SkillNameGuardDdbItem {
  PK: `SKILLNAME#${string}`;
  SK: "SKILL";
  entityType: "SkillNameGuard";
  skillId: string;
  createdAt: string;
}
