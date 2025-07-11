export interface PrismaField {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
  defaultValue?: any;
  isId?: boolean;
  isUnique?: boolean;
  attributes: string[];
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  mapName?: string;
}

export interface PrismaEnum {
  name: string;
  values: string[];
}

export interface PrismaSchema {
  models: PrismaModel[];
  enums: PrismaEnum[];
}

export interface JsonSchemaProperty {
  type: string;
  default?: any;
  items?: { type: string };
  format?: string;
  enum?: string[];
}

export interface JsonSchema {
  type: string;
  properties: { [key: string]: JsonSchemaProperty };
  required: string[];
}
