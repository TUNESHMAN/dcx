export const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Skill",
  type: "object",
  properties: {
    name: { type: "string" },
    category: { type: "string" },
    aliases: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["name", "category", "aliases"],
};
