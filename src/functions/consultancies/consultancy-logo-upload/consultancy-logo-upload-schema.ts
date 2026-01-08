export const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ConsultancyLogo",
  type: "object",
  properties: {
    contentType: { type: "string" },
    fileName: { type: "string" },
  },
  required: ["contentType", "fileName"],
};
