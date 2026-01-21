export const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "UpdateConsultant",
  type: "object",
  additionalProperties: false,
  properties: {
    fullName: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    dayRate: { type: "string", minLength: 1 },
    seniority: {
      type: "string",
      enum: ["junior", "mid", "senior"],
    },
    availability: {
      type: "object",
      properties: {
        availabilityStatus: {
          type: "string",
          enum: ["available_now", "available_from"],
        },
        availableFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      },
    },
    skillIds: {
      type: "array",
      items: { type: "string" },
    },
    location: {
      type: "object",
      properties: {
        country: { type: "string", minLength: 1 },
        city: { type: "string", minLength: 1 },
      },
    },
    willingToTravel: { type: "boolean" },
  },
};
