# Prisma JSON Schema CLI - NPM Package Structure

## Package Structure

```
prisma-json-schema-cli/
├── package.json
├── README.md
├── LICENSE
├── tsconfig.json
├── .gitignore
├── .npmignore
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── parsers/
│   │   └── prisma-parser.ts
│   ├── generators/
│   │   └── json-schema-generator.ts
│   ├── services/
│   │   └── mongo-backfill.service.ts
│   └── types/
│       └── index.ts
├── dist/
│   └── (compiled JavaScript files)
├── bin/
│   └── cli.js
└── tests/
    ├── fixtures/
    │   └── test-schema.prisma
    └── unit/
        ├── parser.test.ts
        ├── generator.test.ts
        └── backfill.test.ts
```

## package.json

```json
{
  "name": "prisma-json-schema-cli",
  "version": "1.0.0",
  "description": "Convert Prisma schema to JSON Schema and backfill MongoDB collections with default values",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "prisma-json-schema": "bin/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "prepublishOnly": "npm run build",
    "start": "node dist/cli.js"
  },
  "keywords": [
    "prisma",
    "json-schema",
    "mongodb",
    "backfill",
    "cli",
    "database",
    "schema",
    "migration"
  ],
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/prisma-json-schema-cli.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/prisma-json-schema-cli/issues"
  },
  "homepage": "https://github.com/yourusername/prisma-json-schema-cli#readme",
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^11.1.0",
    "mongodb": "^6.3.0",
    "pluralize": "^8.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/jest": "^29.5.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist/",
    "bin/",
    "README.md",
    "LICENSE"
  ]
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

## bin/cli.js

```javascript
#!/usr/bin/env node
require('../dist/cli.js');
```

## .gitignore

```
# Dependencies
node_modules/

# Build output
dist/

# Environment files
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env

# next.js build output
.next

# Nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless
```

## .npmignore

```
# Source files
src/
tsconfig.json
tests/

# Development files
.eslintrc.js
jest.config.js
.gitignore

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log

# Coverage
coverage/

# Environment files
.env*
```

## README.md

```markdown
# Prisma JSON Schema CLI

A powerful CLI tool to convert Prisma schema to JSON Schema and backfill MongoDB collections with default values.

## Features

- 🔄 Convert Prisma models to JSON Schema
- 🗃️ Backfill MongoDB collections with default values
- 🎨 Beautiful colored output with chalk
- 📋 Support for `@@map` directives
- 🔍 Smart collection name detection
- 🚀 Memory-efficient processing (no temporary files)

## Installation

```bash
npm install -g prisma-json-schema-cli
```

## Usage

### Convert Prisma Schema to JSON Schema

```bash
prisma-json-schema convert -s ./prisma -o ./schemas
```

### Backfill MongoDB Collections

```bash
prisma-json-schema backfill -s ./prisma -c mongodb://localhost:27017 -d mydb
```

### Generate and Backfill in One Command

```bash
prisma-json-schema generate-and-backfill -s ./prisma -c mongodb://localhost:27017 -d mydb
```

## Options

- `-s, --schema <path>`: Path to Prisma schema directory (default: "prisma")
- `-o, --output <path>`: Output directory for JSON schemas (default: "schemas")
- `-c, --connection <string>`: MongoDB connection string (default: "mongodb://localhost:27017")
- `-d, --database <string>`: Database name (default: "test")
- `-m, --model <string>`: Specific model to process (optional)

## Examples

### Basic Usage

```bash
# Convert all models
prisma-json-schema convert

# Backfill specific model
prisma-json-schema backfill -m User -d production

# Use custom MongoDB connection
prisma-json-schema backfill -c mongodb://user:pass@localhost:27017 -d myapp
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
  ACTIVE
  INACTIVE
  PENDING
}
```

## Output Example

```
Found 2 Prisma files: schema.prisma, user.prisma
Parsed 5 models and 2 enums
Backfilling User fields {isActive: true, createdAt: "2024-01-01T00:00:00.000Z"}
Backfill completed for User, fields {isActive: true, createdAt: "2024-01-01T00:00:00.000Z"}, updated 150 documents
```

## License

MIT
```

## LICENSE

```
MIT License

Copyright (c) 2024 Your Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/
