# Prisma MongoDB Migrator CLI

A powerful CLI tool to convert Prisma schema to JSON Schema and backfill MongoDB collections with default values.

## Features

- 🗃️ Backfill MongoDB collections with default values
- 🔄 Convert Prisma models to JSON Schema
- 📋 Support for `@@map` directives
- 🔍 Smart collection name detection
- 🚀 Memory-efficient processing

## Installation

```bash
npm install prisma-mongo-migrator
```

## Usage

### Backfill MongoDB Collections

```bash
pmm backfill
```

### Convert Prisma Schema to JSON Schema

```bash
pmm convert
```

## Options

- `-s, --schema <path>`: Path to Prisma schema directory (default: "prisma")
- `-o, --output <path>`: Output directory for JSON schemas (default: "schemas")
- `-c, --connection <string>`: MongoDB connection string (default: "mongodb://localhost:27017")
- `-d, --database <string>`: Database name (defaults: "/text-after-last-slash-on-connection-string")
- `-m, --model <string>`: Specific model to process (optional)

## Examples

### Basic Usage

```bash
# Convert all models
pmm convert

# Backfill specific model
pmm backfill -m User -d production

# Use custom MongoDB connection
pmm backfill -c mongodb://user:pass@localhost:27017/my-app-db
```

### Prisma Schema Example

```prisma
model User {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  email     String   @unique
  name      String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@map("users")
}

enum Status {
  Active
  Inactive
  Pending
}
```

## Output Example

```
Found 2 Prisma files: schema.prisma, user.prisma

Parsed 5 models and 2 enums

Backfilling User fields {isActive: true, createdAt: "2024-01-01T00:00:00.000Z"}
Backfill completed for User, fields {isActive: true, createdAt: "2024-01-01T00:00:00.000Z"}, updated 150 documents
```
