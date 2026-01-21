import { SkillStatus } from "../skill";
export interface CreateSkill {
  skillId?: string;
  name: string;
  nameLower: string;
  category: string;
  status: SkillStatus;
  aliases?: string[];
  createdAt: string;
  updatedAt: string;
}
