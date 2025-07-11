import { Db, MongoClient } from "mongodb";
import { plural } from "pluralize";
import chalk from "chalk";
import { kebabCase } from "change-case-all";
import { JsonSchema, PrismaModel } from "../types";

export class MongoBackfillService {
  private client: MongoClient;
  private dbName: string;

  constructor(connectionString: string, dbName: string) {
    this.client = new MongoClient(connectionString);
    this.dbName = dbName;
  }

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

  private async getCollection(db: Db, model: PrismaModel) {
    // First try the mapped name if it exists
    const collectionName = model.mapName || model.name;
    const attempts = [
      collectionName,
      collectionName.toLowerCase(),
      plural(collectionName),
      plural(collectionName.toLowerCase()),
      kebabCase(collectionName),
      plural(kebabCase(collectionName)),
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
