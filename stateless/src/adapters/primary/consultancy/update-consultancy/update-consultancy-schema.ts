export const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "UpdateConsultancy",
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    aboutUs: { type: "string" },
    website: { type: "string", format: "uri" },
    location: {
      type: "object",
      additionalProperties: false,
      properties: {
        country: { type: "string", minLength: 1 },
        city: { type: "string", minLength: 1 },
        region: { type: "string" },
        timezone: { type: "string" },
      },
    },
    logo: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            key: { type: "string", minLength: 1 },
            url: { type: "string", format: "uri" },
            contentType: { type: "string", minLength: 1 },
          },
          required: ["key", "url", "contentType"],
        },
      ],
    },
    status: false,
  },
};
