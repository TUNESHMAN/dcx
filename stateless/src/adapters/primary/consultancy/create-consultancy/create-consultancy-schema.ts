export const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Consultancy",
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    aboutUs: { type: "string" },
    website: { type: "string", format: "uri" },
    specialtySkillIds: {
      type: "array",
      items: { type: "string" },
    },
    location: {
      type: "object",
      properties: {
        country: { type: "string" },
        city: { type: "string" },
        region: { type: "string" },
        timezone: { type: "string" },
      },
      required: ["country", "city"],
    },
    logo: {
      type: "object",
      properties: {
        key: { type: "string" },
        url: { type: "string" },
        contentType: { type: "string" },
      },
    },
  },
  required: ["name", "location"],
};
