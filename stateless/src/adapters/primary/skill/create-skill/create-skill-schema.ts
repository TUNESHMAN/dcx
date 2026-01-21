export const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Skill",
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    category: { type: "string", minLength: 1 },
    aliases: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["name", "category"],
};
