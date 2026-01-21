import { APIGatewayProxyResult } from "aws-lambda";
import { Pool, PoolClient } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { envVar } from "@leighton-digital/lambda-toolkit";
import { logger } from "../../../shared/logger/logger";

type RunMigrationsEvent = {
  dryRun?: boolean;
};

const [DSQL_ENDPOINT, DSQL_CLUSTER_ARN] = envVar.getStrings(
  "DSQL_ENDPOINT",
  "DSQL_CLUSTER_ARN"
);

const AWS_REGION = process.env.AWS_REGION ?? "eu-west-2";
const DB_NAME = process.env.DSQL_DB_NAME ?? "postgres";
const DB_USER = process.env.DSQL_DB_USER ?? "admin";

const signer = new DsqlSigner({
  hostname: DSQL_ENDPOINT,
  region: AWS_REGION,
});

const pool = new Pool({
  host: DSQL_ENDPOINT,
  port: 5432,
  database: DB_NAME,
  user: DB_USER,
  // IMPORTANT: generates a fresh token for each new connection
  password: async () => signer.getDbConnectAdminAuthToken(),
  ssl: { rejectUnauthorized: true },
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

/**
 * IMPORTANT:
 * - Make sure CDK bundling includes: loader: { ".sql": "text" }
 * - Ensure you have a *.d.ts module declaration for "*.sql"
 *
 * NOTE: update these import paths to match your repo structure.
 */

import initSchema from "../../../../../database/schema/001_init.sql";
import createSkills from "../../../../../database/migrations/002_create_skills.sql";
import createConsultancies from "../../../../../database/migrations/003_create_consultancies.sql";

import createConsultants from "../../../../../database/migrations/007_create_consultants.sql";

// Add new migrations here as you create them
const SCHEMA_SCRIPTS: { name: string; sql: string }[] = [
  { name: "001_init.sql", sql: initSchema },
];

const MIGRATIONS: { name: string; sql: string }[] = [
  { name: "002_create_skills.sql", sql: createSkills },
  { name: "003_create_consultancies.sql", sql: createConsultancies },
  { name: "007_create_consultants.sql", sql: createConsultants },
];

export const handler = async (
  event: RunMigrationsEvent = {}
): Promise<APIGatewayProxyResult> => {
  const dryRun = Boolean(event.dryRun);

  const applied: string[] = [];
  const skipped: string[] = [];

  let client: PoolClient | undefined;

  try {
    client = await pool.connect();

    logger.info("Starting DSQL migration run", {
      dryRun,
      endpoint: DSQL_ENDPOINT,
      clusterArn: DSQL_CLUSTER_ARN,
      region: AWS_REGION,
      dbName: DB_NAME,
      dbUser: DB_USER,
      schemaScripts: SCHEMA_SCRIPTS.map((s) => s.name),
      migrations: MIGRATIONS.map((m) => m.name),
    });

    // DSQL limitation: multiple DDL statements are not supported in a transaction.
    // So: no BEGIN/COMMIT, and execute statement-by-statement.

    // Ensure dcx schema exists (safe)
    await execSql(client, "create schema if not exists dcx;");

    // Ensure migration tracking table exists (safe)
    await execSql(
      client,
      `
      create table if not exists dcx.schema_migrations (
        name text primary key,
        applied_at timestamptz not null
      );
      `
    );

    // 1) Run schema scripts every time (safe; should be idempotent)
    for (const script of SCHEMA_SCRIPTS) {
      logger.info(`Applying schema script: ${script.name}`);
      if (!dryRun) {
        await execSqlFile(client, script.sql);
      }
      applied.push(`schema/${script.name}`);
    }

    // 2) Run migrations once (tracked)
    for (const m of MIGRATIONS) {
      const already = await client.query(
        `select 1 from dcx.schema_migrations where name = $1`,
        [m.name]
      );

      if ((already.rowCount ?? 0) > 0) {
        skipped.push(`migrations/${m.name}`);
        continue;
      }

      logger.info(`Applying migration: ${m.name}`);
      if (!dryRun) {
        await execSqlFile(client, m.sql);
        await client.query(
          `insert into dcx.schema_migrations (name, applied_at) values ($1, now())`,
          [m.name]
        );
      }
      applied.push(`migrations/${m.name}`);
    }

    logger.info("Migration run complete", { applied, skipped });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: dryRun ? "Dry-run complete" : "Migrations applied",
        applied,
        skipped,
      }),
    };
  } catch (err: any) {
    logger.error("Migration run failed", {
      error: err?.message ?? String(err),
      code: err?.code,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Migration run failed",
        error: err?.message ?? String(err),
      }),
    };
  } finally {
    client?.release();
  }
};

async function execSql(client: PoolClient, sql: string) {
  const stmt = sql.trim();
  if (!stmt) return;
  await client.query(stmt);
}

/**
 * Executes a SQL file by splitting into statements and running sequentially.
 * This avoids DSQL errors with multi-DDL in one call/transaction.
 */
async function execSqlFile(client: PoolClient, fileSql: string) {
  const statements = splitSqlStatements(fileSql);
  for (const stmt of statements) {
    await execSql(client, stmt);
  }
}

function splitSqlStatements(sql: string): string[] {
  // Remove BOM if present
  const normalized = sql.replace(/^\uFEFF/, "");

  return normalized
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => `${s};`);
}
