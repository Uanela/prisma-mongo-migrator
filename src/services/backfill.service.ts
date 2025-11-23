import { Db, MongoClient } from "mongodb";
import pluralize from "pluralize";
import chalk from "chalk";
import { kebabCase } from "change-case-all";
import { JsonSchema, PrismaModel } from "../types";

/**
 * A service for backfilling MongoDB collections with default values from Prisma models.
 *
 * This service connects to a MongoDB database and updates existing documents to include
 * default values for fields that are missing, null, or undefined. It's particularly useful
 * when adding new fields with default values to existing Prisma models and needing to
 * retroactively apply those defaults to historical data.
 *
 * The service uses intelligent collection name resolution, trying multiple naming conventions
 * to find the correct MongoDB collection for each Prisma model.
 *
 * @example
 * ```typescript
 * const backfillService = new MongoBackfillService(
 *   "mongodb://localhost:27017",
 *   "myapp"
 * );
 *
 * const userModel = { name: "User", fields: [...], mapName: "users" };
 * const userSchema = {
 *   properties: {
 *     status: { type: "string", default: "ACTIVE" },
 *     createdAt: { type: "string", format: "date-time", default: "2024-01-01T00:00:00Z" }
 *   }
 * };
 *
 * await backfillService.backfillCollection(userModel, userSchema);
 * // Will update all User documents missing 'status' or 'createdAt' fields
 * ```
 */
export class MongoBackfillService {
  /** MongoDB client instance for database operations */
  private client: MongoClient;
  /** Name of the target database */
  private dbName: string;

  /**
   * Creates a new MongoDB backfill service instance.
   *
   * @param connectionString - MongoDB connection string (e.g., "mongodb://localhost:27017")
   * @param dbName - Name of the target database to perform backfill operations on
   */
  constructor(connectionString: string, dbName: string) {
    this.client = new MongoClient(connectionString);
    this.dbName = dbName;
  }

  /**
   * Backfills a MongoDB collection with default values from a Prisma model schema.
   *
   * This method performs the following operations:
   * 1. Identifies fields in the schema that have default values
   * 2. Connects to the MongoDB database
   * 3. Locates the appropriate collection for the model
   * 4. Iterates through all documents in the collection
   * 5. Updates documents that are missing fields or have null/undefined values
   * 6. Provides detailed console output with colored progress information
   *
   * The method is safe to run multiple times as it only updates fields that are
   * missing, null, or undefined - it won't overwrite existing values.
   *
   * @param model - The Prisma model definition containing field information
   * @param schema - The JSON schema containing property definitions and default values
   * @returns Promise that resolves when the backfill operation is complete
   *
   * @throws Will log errors and gracefully handle collection not found scenarios
   *
   * @example
   * ```typescript
   * const userModel = {
   *   name: "User",
   *   fields: [
   *     { name: "id", type: "String", isId: true },
   *     { name: "status", type: "String", defaultValue: "ACTIVE" },
   *     { name: "createdAt", type: "DateTime" }
   *   ],
   *   mapName: "users"
   * };
   *
   * const userSchema = {
   *   type: "object",
   *   properties: {
   *     status: { type: "string", default: "ACTIVE" },
   *     isVerified: { type: "boolean", default: false }
   *   },
   *   required: ["status"]
   * };
   *
   * await backfillService.backfillCollection(userModel, userSchema);
   *
   * // Console output:
   * // - Backfilling User fields {status: "ACTIVE", isVerified: false}
   * // Backfill completed for User, fields {status: "ACTIVE", isVerified: false}, updated 150 documents
   * ```
   */
  async backfillCollection(
    model: PrismaModel,
    schema: JsonSchema
  ): Promise<void> {
    const fieldsWithDefaults = Object.entries(schema.properties).filter(
      ([_, property]) => property.default !== undefined
    );

    if (fieldsWithDefaults.length === 0) {
      console.log(
        `\nSkipping ${chalk.bold.cyan(model.name)} - ${chalk.yellow("no default values found")}`
      );
      return;
    }

    const defaultsObj = fieldsWithDefaults.reduce(
      (acc, [fieldName, property]) => {
        acc[fieldName] = property.default;
        return acc;
      },
      {} as any
    );

    const defaultsStr = Object.entries(defaultsObj)
      .map(
        ([key, value]) =>
          `${chalk.bold(key)}: ${chalk.dim(JSON.stringify(value))}`
      )
      .join(", ");

    console.log(
      `\n- Backfilling ${chalk.bold.cyan(model.name)} fields {${defaultsStr}}`
    );

    await this.client.connect();
    const db = this.client.db(this.dbName);
    const collection = await this.getCollection(db, model);

    if (!collection) {
      console.log(
        `${chalk.red("Collection not found")} for model: ${chalk.bold(model.name)}`
      );
      await this.client.close();
      return;
    }

    const cursor = collection.find();
    let updatedCount = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc) continue;

      const update: any = {};
      for (const [fieldName, property] of Object.entries(schema.properties)) {
        if (
          property.default !== undefined &&
          (!doc.hasOwnProperty(fieldName) ||
            doc[fieldName] === null ||
            doc[fieldName] === undefined)
        ) {
          update[fieldName] = property.default;
        }
      }

      if (Object.keys(update).length > 0) {
        await collection.updateOne({ _id: doc._id }, { $set: update });
        updatedCount++;
      }
    }

    await this.client.close();

    console.log(
      `Backfill ${chalk.green("completed")} for ${chalk.bold.cyan(model.name)}, fields {${defaultsStr}}, updated ${chalk.bold.green(updatedCount)} documents`
    );
  }

  /**
   * Intelligently locates a MongoDB collection based on a Prisma model.
   *
   * This method attempts to find the correct collection using multiple naming strategies:
   * 1. Exact model name or mapped name (if specified in @@map directive)
   * 2. Lowercase version of the name
   * 3. Pluralized version of the name
   * 4. Pluralized lowercase version
   * 5. Kebab-case version of the name
   * 6. Pluralized kebab-case version
   *
   * The method tests each naming convention by attempting to access the collection's
   * indexes, which is a lightweight way to verify the collection exists.
   *
   * @private
   * @param db - The MongoDB database instance
   * @param model - The Prisma model to find a collection for
   * @returns Promise resolving to the MongoDB collection if found, null otherwise
   *
   * @example
   * ```typescript
   * // For a model named "UserProfile" with mapName "user_profiles"
   * // Will try in order:
   * // 1. "user_profiles" (mapName takes priority)
   * // 2. "userprofiles" (lowercase)
   * // 3. "user_profiless" (pluralized mapName)
   * // 4. "UserProfiles" (pluralized original)
   * // 5. "user-profiles" (kebab-case)
   * // 6. "user-profiless" (pluralized kebab-case)
   *
   * const collection = await this.getCollection(db, model);
   * if (collection) {
   *   // Found the collection, can proceed with operations
   * }
   * ```
   */
  private async getCollection(db: Db, model: PrismaModel) {
    // First try the mapped name if it exists
    const collectionName = model.mapName || model.name;
    const attempts = [
      collectionName,
      collectionName.toLowerCase(),
      pluralize.plural(collectionName),
      pluralize.plural(collectionName.toLowerCase()),
      kebabCase(collectionName),
      pluralize.plural(kebabCase(collectionName)),
    ];

    // Remove duplicates
    const uniqueAttempts = [...new Set(attempts)];

    for (const attempt of uniqueAttempts) {
      try {
        const collection = db.collection(attempt);
        const stats = await collection.indexes();
        if (stats) {
          return collection;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}
