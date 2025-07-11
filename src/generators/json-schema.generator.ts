import {
  PrismaSchema,
  PrismaModel,
  PrismaField,
  JsonSchema,
  JsonSchemaProperty,
} from "../types";

export class JsonSchemaGenerator {
  private schema: PrismaSchema;

  constructor(schema: PrismaSchema) {
    this.schema = schema;
  }

  generateSchema(model: PrismaModel): JsonSchema {
    const properties: { [key: string]: JsonSchemaProperty } = {};
    const required: string[] = [];

    for (const field of model.fields) {
      if (field.isId) continue; // Skip ID fields for MongoDB

      const property = this.convertFieldToJsonSchema(field);
      properties[field.name] = property;

      // A field is required if:
      // 1. It's not optional (no ?)
      // 2. It has no default value
      // 3. It's not an array (arrays can be empty)
      if (
        !field.isOptional &&
        field.defaultValue === undefined &&
        !field.isArray
      ) {
        required.push(field.name);
      }
    }

    return {
      type: "object",
      properties,
      required,
    };
  }

  private convertFieldToJsonSchema(field: PrismaField): JsonSchemaProperty {
    const baseType = this.mapPrismaTypeToJsonSchema(field.type);

    const property: JsonSchemaProperty = {
      type: baseType,
    };

    if (field.isArray) {
      property.type = "array";
      property.items = {
        type: this.mapPrismaTypeToJsonSchema(field.type),
      };
    }

    if (field.defaultValue !== undefined) {
      property.default = field.defaultValue;
    }

    // Add format for specific types
    if (field.type === "DateTime") {
      property.format = "date-time";
    }

    // Add enum values
    if (this.isEnum(field.type)) {
      const enumDef = this.schema.enums.find((e) => e.name === field.type);
      if (enumDef) {
        property.enum = enumDef.values;
      }
    }

    return property;
  }

  private mapPrismaTypeToJsonSchema(prismaType: string): string {
    const typeMap: { [key: string]: string } = {
      String: "string",
      Int: "number",
      Float: "number",
      Boolean: "boolean",
      DateTime: "string",
      Json: "object",
      Bytes: "string",
    };

    // If it's a known primitive type, use the mapping
    if (typeMap[prismaType]) {
      return typeMap[prismaType];
    }

    // If it's an enum, it's a string with enum values
    if (this.isEnum(prismaType)) {
      return "string";
    }

    // If it's a model (relation), it's an object
    if (this.isModel(prismaType)) {
      return "object";
    }

    // Default to string for unknown types
    return "string";
  }

  private isEnum(typeName: string): boolean {
    return this.schema.enums.some((e) => e.name === typeName);
  }

  private isModel(typeName: string): boolean {
    return this.schema.models.some((m) => m.name === typeName);
  }
}
