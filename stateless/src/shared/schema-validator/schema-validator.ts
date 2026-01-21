import Ajv, { type Schema } from "ajv";
import addFormats from "ajv-formats";
import { ValidationError } from "../../errors/validation-error";

export function schemaValidator(schema: Schema, body: unknown) {
  const ajv = new Ajv({
    allErrors: true,
  });

  addFormats(ajv);
  ajv.addSchema(schema);

  const valid = ajv.validate(schema, body);

  if (!valid) {
    const errorMessage = JSON.stringify(ajv.errors);
    throw new ValidationError(errorMessage);
  }
}
