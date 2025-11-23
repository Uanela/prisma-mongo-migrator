import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import chalk from "chalk";
import { JsonSchemaGenerator } from "./generators/json-schema.generator";
import { PrismaSchema } from "./types";
import { MongoBackfillService, PrismaSchemaParser } from ".";
import { kebabCase } from "change-case-all";

/**
 * Command-line interface for converting Prisma schemas to JSON Schema and backfilling MongoDB collections.
 *
 * This CLI tool provides three main commands:
 * 1. `convert` - Convert Prisma schemas to JSON Schema files
 * 2. `backfill` - Backfill MongoDB collections with default values
 * 3. `generate-and-backfill` - Combined operation for schema generation and backfilling
 *
 * The CLI automatically discovers and parses all `.prisma` files in the specified directory,
 * combining them into a unified schema for processing. It provides colorized console output
 * and comprehensive error handling.
 *
 * @example
 * ```bash
 * # Convert Prisma schemas to JSON Schema files
 * npx prisma-json-schema convert --schema ./prisma --output ./schemas
 *
 * # Backfill MongoDB with default values
 * npx prisma-json-schema backfill --connection mongodb://localhost:27017 --database myapp
 *
 * # Process specific model only
 * npx prisma-json-schema backfill --model User --database myapp
 *
 * # Generate and backfill in one command
 * npx prisma-json-schema generate-and-backfill --schema ./prisma --database myapp
 * ```
 */
export class PrismaMongoMigratorCLI {
  /** Commander.js program instance for CLI command management */
  private program: Command;
  /** Parsed Prisma schema containing models and enums */
  private schema: PrismaSchema | null = null;
  /** JSON Schema generator instance for converting Prisma models */
  private generator: JsonSchemaGenerator | null = null;

  /**
   * Creates a new CLI instance and sets up all available commands.
   */
  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  /**
   * Sets up all CLI commands with their options and descriptions.
   *
   * Configures three main commands:
   * - `convert`: Converts Prisma schemas to JSON Schema files
   * - `backfill`: Backfills MongoDB collections with default values
   * - `generate-and-backfill`: Combined operation for both tasks
   *
   * @private
   */
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

  /**
   * Loads and parses all Prisma schema files from the specified directory.
   *
   * This method:
   * 1. Recursively searches for `.prisma` files in the given path
   * 2. Excludes the `migrations` directory to avoid parsing migration files
   * 3. Combines all found schema files into a single schema string
   * 4. Parses the combined schema using PrismaSchemaParser
   * 5. Initializes the JSON Schema generator
   * 6. Provides detailed console output about discovered files and parsed content
   *
   * @private
   * @param schemaPath - Path to the directory containing Prisma schema files
   * @throws Exits the process with code 1 if no schema files are found or parsing fails
   *
   * @example
   * ```typescript
   * // For a directory structure:
   * // prisma/
   * //   schema.prisma
   * //   models/
   * //     user.prisma
   * //     post.prisma
   * //   migrations/ (ignored)
   * //     001_init.sql
   *
   * this.loadSchemas("prisma");
   * // Console output:
   * // Found 3 Prisma files: schema.prisma, user.prisma, post.prisma
   * // Parsed 5 models and 2 enums
   * ```
   */
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

  /**
   * Recursively searches for Prisma schema files in the specified directory.
   *
   * This method performs a deep search through the directory tree, collecting all
   * `.prisma` files while intelligently excluding certain directories like `migrations`
   * that typically contain SQL migration files rather than schema definitions.
   *
   * @private
   * @param schemaPath - Root directory to search for Prisma files
   * @returns Array of absolute file paths to discovered `.prisma` files, sorted alphabetically
   * @throws Exits the process with code 1 if directory reading fails
   *
   * @example
   * ```typescript
   * const files = this.findPrismaFiles("./prisma");
   * // Returns: [
   * //   "/project/prisma/schema.prisma",
   * //   "/project/prisma/models/user.prisma",
   * //   "/project/prisma/models/post.prisma"
   * // ]
   * // Note: "./prisma/migrations/001_init.sql" would be excluded
   * ```
   */
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

  /**
   * Handles the `convert` command to generate JSON Schema files from Prisma models.
   *
   * This command:
   * 1. Loads and parses all Prisma schema files
   * 2. Creates the output directory if it doesn't exist
   * 3. Generates a JSON Schema file for each Prisma model
   * 4. Saves files with kebab-case naming convention
   * 5. Provides progress feedback for each generated file
   *
   * @private
   * @param options - Command options containing schema path and output directory
   * @returns Promise that resolves when all schemas are generated
   *
   * @example
   * ```bash
   * # Command usage:
   * npx prisma-json-schema convert --schema ./prisma --output ./json-schemas
   *
   * # Console output:
   * # Found 2 Prisma files: schema.prisma, models.prisma
   * # Parsed 3 models and 1 enums
   * # Converting 3 models to JSON Schema...
   * # Generated JSON Schema for User → json-schemas/user.json
   * # Generated JSON Schema for Post → json-schemas/post.json
   * # Generated JSON Schema for Comment → json-schemas/comment.json
   * # ✓ All schemas converted successfully!
   * ```
   */
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

  /**
   * Handles the `backfill` command to update MongoDB collections with default values.
   *
   * This command:
   * 1. Loads and parses Prisma schemas
   * 2. Connects to the specified MongoDB database
   * 3. Generates JSON schemas for the models
   * 4. Runs backfill operations on MongoDB collections
   * 5. Supports processing all models or a specific model via the --model option
   * 6. Automatically derives database name from connection string if not specified
   *
   * @private
   * @param options - Command options containing connection details and model filter
   * @returns Promise that resolves when backfill operations complete
   *
   * @example
   * ```bash
   * # Backfill all models:
   * npx prisma-json-schema backfill --connection mongodb://localhost:27017 --database myapp
   *
   * # Backfill specific model only:
   * npx prisma-json-schema backfill --model User --database myapp
   *
   * # Use connection string database (if database="none"):
   * npx prisma-json-schema backfill --connection mongodb://localhost:27017/myapp --database none
   * ```
   */
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

  /**
   * Handles the `generate-and-backfill` command for combined schema generation and backfilling.
   *
   * This command combines the functionality of both `convert` and `backfill` commands,
   * but generates schemas in memory rather than writing them to files. This is optimized
   * for scenarios where you want to backfill collections immediately without persisting
   * the JSON schema files.
   *
   * The command:
   * 1. Loads and parses Prisma schemas
   * 2. Generates JSON schemas in memory for each model
   * 3. Immediately uses those schemas to backfill MongoDB collections
   * 4. Supports model filtering via the --model option
   * 5. Provides the same database name resolution as the backfill command
   *
   * @private
   * @param options - Command options containing paths, connection details, and filters
   * @returns Promise that resolves when generation and backfill operations complete
   *
   * @example
   * ```bash
   * # Generate and backfill all models:
   * npx prisma-json-schema generate-and-backfill --schema ./prisma --database myapp
   *
   * # Process specific model only:
   * npx prisma-json-schema generate-and-backfill --model User --database myapp
   *
   * # Custom connection and schema path:
   * npx prisma-json-schema generate-and-backfill \
   *   --schema ./backend/prisma \
   *   --connection mongodb://user:pass@localhost:27017 \
   *   --database production
   * ```
   */
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

  /**
   * Starts the CLI program and processes command-line arguments.
   *
   * This method should be called to begin CLI execution. It parses the command-line
   * arguments and executes the appropriate command handler based on user input.
   *
   * @example
   * ```typescript
   * const cli = new PrismaMongoMigratorCLI();
   * cli.run(); // Processes process.argv and executes the requested command
   * ```
   */
  run(): void {
    this.program.parse();
  }
}

/**
 * CLI Entry Point
 *
 * Creates and runs the CLI instance when this file is executed directly.
 * This allows the tool to be used as a standalone CLI application.
 *
 * @example
 * ```bash
 * # When run as a script:
 * node dist/cli.js convert --schema ./prisma --output ./schemas
 *
 * # When installed as a package:
 * npx prisma-json-schema backfill --database myapp
 * ```
 */
const cli = new PrismaMongoMigratorCLI();
cli.run();
