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
