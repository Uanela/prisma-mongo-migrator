import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import chalk from "chalk";
import { JsonSchemaGenerator } from "./generators/json-schema.generator";
import { PrismaSchema } from "./types";
import { MongoBackfillService, PrismaSchemaParser } from ".";
import { kebabCase } from "change-case-all";

export class PrismaMongoMigratorCLI {
  private program: Command;
  private schema: PrismaSchema | null = null;
  private generator: JsonSchemaGenerator | null = null;

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name("prisma-json-schema")
      .description("Convert Prisma schema to JSON Schema and backfill MongoDB")
      .version("1.0.0");

    this.program
      .command("convert")
      .alias("c")
      .description("Convert Prisma schema to JSON Schema")
      .option(
        "-s, --schema <path>",
        "Path to Prisma schema directory",
        "prisma"
      )
      .option(
        "-o, --output <path>",
        "Output directory for JSON schemas",
        "schemas"
      )
      .action(this.convertCommand.bind(this));

    this.program
      .command("backfill")
      .alias("b")
      .description("Backfill MongoDB collections with default values")
      .option(
        "-s, --schema <path>",
        "Path to Prisma schema directory",
        "prisma"
      )
      .option(
        "-c, --connection <string>",
        "MongoDB connection string",
        "mongodb://localhost:27017"
      )
      .option("-d, --database <string>", "Database name", "none")
      .option("-m, --model <string>", "Specific model to backfill (optional)")
      .action(this.backfillCommand.bind(this));

    this.program
      .command("generate-and-backfill")
      .description("Convert schemas and backfill MongoDB in one command")
      .option(
        "-s, --schema <path>",
        "Path to Prisma schema directory",
        "prisma"
      )
      .option(
        "-o, --output <path>",
        "Output directory for JSON schemas",
        "schemas"
      )
      .option(
        "-c, --connection <string>",
        "MongoDB connection string",
        "mongodb://localhost:27017"
      )
      .option("-d, --database <string>", "Database name", "test")
      .option("-m, --model <string>", "Specific model to process (optional)")
      .action(this.generateAndBackfillCommand.bind(this));
  }

  private loadSchemas(schemaPath: string): void {
    try {
      const schemaFiles = this.findPrismaFiles(schemaPath);
      if (schemaFiles.length === 0) {
        console.error(
          `${chalk.red("No .prisma files found")} in ${chalk.bold(schemaPath)}`
        );
        process.exit(1);
      }

      console.log(
        `\nFound ${chalk.bold.cyan(schemaFiles.length)} Prisma files: ${schemaFiles.map((f) => chalk.dim(f.split("/").pop())).join(", ")}`
      );

      // Combine all schema files
      const combinedSchema = schemaFiles
        .map((file) => readFileSync(file, "utf-8"))
        .join("\n\n");

      const parser = new PrismaSchemaParser(combinedSchema);
      this.schema = parser.parse();
      this.generator = new JsonSchemaGenerator(this.schema);

      console.log(
        `\nParsed ${chalk.bold.green(this.schema.models.length)} models and ${chalk.bold.green(this.schema.enums.length)} enums`
      );
    } catch (error) {
      console.error(
        `\n${chalk.red("Failed to load schemas")} from ${chalk.bold(schemaPath)}:`,
        error
      );
      process.exit(1);
    }
  }

  private findPrismaFiles(schemaPath: string): string[] {
    const files: string[] = [];

    const findFiles = (currentPath: string) => {
      try {
        const items = readdirSync(currentPath, { withFileTypes: true });

        for (const item of items) {
          const fullPath = join(currentPath, item.name);

          if (item.isDirectory()) {
            // Skip migrations folder
            if (item.name === "migrations") {
              continue;
            }
            // Recursively search subdirectories
            findFiles(fullPath);
          } else if (item.isFile() && item.name.endsWith(".prisma")) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.error(
          `\n${chalk.red("Error reading directory")} ${chalk.bold(currentPath)}:`,
          error
        );
        process.exit(1);
      }
    };

    findFiles(schemaPath);
    return files.sort(); // Sort for consistent ordering
  }

  private async convertCommand(options: any): Promise<void> {
    this.loadSchemas(options.schema);
    if (!this.schema || !this.generator) return;

    const models = this.schema.models;
    console.log(
      `\nConverting ${chalk.bold.cyan(models.length)} models to JSON Schema...`
    );

    // Create output directory if it doesn't exist
    const fs = require("fs");
    if (!fs.existsSync(options.output)) {
      fs.mkdirSync(options.output, { recursive: true });
    }

    for (const model of models) {
      const jsonSchema = this.generator.generateSchema(model);
      const outputPath = `${options.output}/${kebabCase(model.name.toLowerCase())}.json`;

      writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2));
      console.log(
        `Generated JSON Schema for ${chalk.bold.cyan(model.name)} → ${chalk.dim(outputPath)}`
      );
    }

    console.log(`${chalk.green("✓ All schemas converted successfully!")}`);
  }

  private async backfillCommand(options: any): Promise<void> {
    this.loadSchemas(options.schema);
    if (!this.schema || !this.generator) return;

    const models = this.schema.models;
    const backfillService = new MongoBackfillService(
      options.connection,
      options.database !== "none"
        ? options.database
        : options.connection.split("/").pop()
    );

    const modelsToProcess = options.model
      ? models.filter((m) => m.name === options.model)
      : models;

    if (modelsToProcess.length === 0) {
      console.log(
        `${chalk.red("No models found")}${options.model ? ` matching "${chalk.bold(options.model)}"` : ""}`
      );
      return;
    }

    for (const model of modelsToProcess) {
      const jsonSchema = this.generator.generateSchema(model);
      await backfillService.backfillCollection(model, jsonSchema);
    }
  }

  private async generateAndBackfillCommand(options: any): Promise<void> {
    this.loadSchemas(options.schema);
    if (!this.schema || !this.generator) return;

    const models = this.schema.models;

    // Generate schemas in memory (no file output for backfill-only mode)
    console.log(`Processing ${chalk.bold.cyan(models.length)} models...`);

    const backfillService = new MongoBackfillService(
      options.connection,
      options.database !== "none"
        ? options.database
        : options.connection.split("/").pop()
    );

    const modelsToProcess = options.model
      ? models.filter((m) => m.name === options.model)
      : models;

    if (modelsToProcess.length === 0) {
      console.log(
        `${chalk.red("No models found")}${options.model ? ` matching "${chalk.bold(options.model)}"` : ""}`
      );
      return;
    }

    for (const model of modelsToProcess) {
      const jsonSchema = this.generator.generateSchema(model);
      await backfillService.backfillCollection(model, jsonSchema);
    }
  }

  run(): void {
    this.program.parse();
  }
}

// CLI Entry Point
const cli = new PrismaMongoMigratorCLI();
cli.run();
