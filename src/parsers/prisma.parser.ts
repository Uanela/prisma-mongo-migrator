import { PrismaSchema, PrismaModel, PrismaEnum, PrismaField } from "../types";

export class PrismaSchemaParser {
  private schema: string;
  private enums: PrismaEnum[] = [];
  private models: PrismaModel[] = [];

  constructor(schemaContent: string) {
    this.schema = schemaContent;
  }

  parse(): PrismaSchema {
    this.enums = this.extractEnums();
    this.models = this.extractModels();

    return {
      models: this.models,
      enums: this.enums,
    };
  }

  private extractEnums(): PrismaEnum[] {
    const enums: PrismaEnum[] = [];
    const enumBlocks = this.schema.match(/enum\s+\w+\s*\{[^}]*\}/g) || [];

    for (const block of enumBlocks) {
      const enumObj = this.parseEnumBlock(block);
      if (enumObj) {
        enums.push(enumObj);
      }
    }

    return enums;
  }

  private parseEnumBlock(block: string): PrismaEnum | null {
    const nameMatch = block.match(/enum\s+(\w+)/);
    if (!nameMatch) return null;

    const name = nameMatch[1];
    const values = block
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !line.startsWith("enum") &&
          !line.startsWith("{") &&
          !line.startsWith("}")
      )
      .map((line) => line.replace(/,$/, ""));

    return { name, values };
  }

  private extractModels(): PrismaModel[] {
    const models: PrismaModel[] = [];
    const modelBlocks = this.extractModelBlocks();

    for (const block of modelBlocks) {
      const model = this.parseModelBlock(block);
      if (model) {
        models.push(model);
      }
    }

    return models;
  }

  private extractModelBlocks(): string[] {
    const modelRegex = /model\s+\w+\s*\{[^}]*\}/g;
    return this.schema.match(modelRegex) || [];
  }

  private parseModelBlock(block: string): PrismaModel | null {
    const nameMatch = block.match(/model\s+(\w+)/);
    if (!nameMatch) return null;

    const name = nameMatch[1];
    const fields = this.parseFields(block);

    // Check for @@map directive
    const mapMatch = block.match(/@@map\s*\(\s*"([^"]+)"\s*\)/);
    const mapName = mapMatch ? mapMatch[1] : undefined;

    return { name, fields, mapName };
  }

  private parseFields(block: string): PrismaField[] {
    const fields: PrismaField[] = [];
    const fieldLines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !line.startsWith("model") &&
          !line.startsWith("{") &&
          !line.startsWith("}")
      );

    for (const line of fieldLines) {
      if (line.startsWith("//") || line.startsWith("@@")) continue;

      const field = this.parseFieldLine(line);
      if (field) {
        fields.push(field);
      }
    }

    return fields;
  }

  private parseFieldLine(line: string): PrismaField | null {
    const fieldMatch = line.match(/^(\w+)\s+(\w+(?:\[\])?)\??\s*(.*)/);
    if (!fieldMatch) return null;

    const [, name, typeWithArray, attributesStr] = fieldMatch;
    const isArray = typeWithArray.endsWith("[]");
    const type = isArray ? typeWithArray.slice(0, -2) : typeWithArray;
    const isOptional = line.includes("?");
    const attributes = attributesStr
      .split(/\s+/)
      .filter((attr) => attr.startsWith("@"));

    // Extract default value
    let defaultValue: any = undefined;
    const defaultMatch = attributesStr.match(/@default\(([^)]+)\)/);
    if (defaultMatch) {
      defaultValue = this.parseDefaultValue(defaultMatch[1]);
    }

    const isId = attributes.some((attr) => attr.startsWith("@id"));
    const isUnique = attributes.some((attr) => attr.startsWith("@unique"));

    return {
      name,
      type,
      isOptional,
      isArray,
      defaultValue,
      isId,
      isUnique,
      attributes,
    };
  }

  private parseDefaultValue(defaultStr: string): any {
    defaultStr = defaultStr.trim();

    // Handle string values
    if (defaultStr.startsWith('"') && defaultStr.endsWith('"')) {
      return defaultStr.slice(1, -1);
    }

    // Handle boolean values
    if (defaultStr === "true") return true;
    if (defaultStr === "false") return false;

    // Handle numeric values
    if (/^\d+$/.test(defaultStr)) {
      return parseInt(defaultStr, 10);
    }
    if (/^\d+\.\d+$/.test(defaultStr)) {
      return parseFloat(defaultStr);
    }

    // Handle enum values (no quotes, not a function)
    if (!defaultStr.includes("(")) {
      return defaultStr;
    }

    // Handle functions (like now(), auto(), etc.)
    if (defaultStr.includes("(")) {
      // For MongoDB, we'll skip function defaults as they're handled by the DB
      return undefined;
    }

    return defaultStr;
  }

  isEnum(typeName: string): boolean {
    return this.enums.some((e) => e.name === typeName);
  }

  isModel(typeName: string): boolean {
    return this.models.some((m) => m.name === typeName);
  }
}
