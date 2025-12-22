export interface CreateSkill {
  /**
   * Display name of the skill.
   * Example: "Playwright"
   */
  name: string;

  /**
   * High-level category for grouping skills.
   * Example: "Testing", "Frontend", "Backend", "Cloud"
   */
  category: string;

  /**
   * Optional alternative names or synonyms.
   * Example: ["Microsoft Playwright", "PW"]
   */
  aliases?: string[];
}
