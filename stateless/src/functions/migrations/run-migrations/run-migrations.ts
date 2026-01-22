import { APIGatewayProxyResult } from "aws-lambda";
import { PoolClient } from "pg";
import { logger } from "../../../shared/logger/logger";
import { getDbPool } from "../../../../../database/connection/database-connection";
import { config } from "../../../config";

const region = config.get("aws.region");
const dsqlClusterArn = config.get("dsql.clusterArn");
const dsqlEndPoint = config.get("dsql.endpoint");
const dsqlDBName = config.get("dsql.database");
const dsqlDBUser = config.get("dsql.user");

type RunMigrationsEvent = {
  dryRun?: boolean;
};

import initSchema from "../../../../../database/schema/001_init.sql";
import createSkills from "../../../../../database/migrations/002_create_skills.sql";
import createConsultancies from "../../../../../database/migrations/003_create_consultancies.sql";

import createConsultants from "../../../../../database/migrations/007_create_consultants.sql";

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

  let client;

  try {
    const pool = await getDbPool();
    client = await pool.connect();

    logger.info("Starting DSQL migration run", {
      dryRun,
      endpoint: dsqlEndPoint,
      clusterArn: dsqlClusterArn,
      region,
      dbName: dsqlDBName,
      dbUser: dsqlDBUser,
      schemaScripts: SCHEMA_SCRIPTS.map((schema) => schema.name),
      migrations: MIGRATIONS.map((migration) => migration.name),
    });

    await execSql(client, "create schema if not exists dcx;");

    await execSql(
      client,
      `
      create table if not exists dcx.schema_migrations (
        name text primary key,
        applied_at timestamptz not null
      );
      `
    );

    for (const script of SCHEMA_SCRIPTS) {
      logger.info(`Applying schema script: ${script.name}`);
      if (!dryRun) {
        await execSqlFile(client, script.sql);
      }
      applied.push(`schema/${script.name}`);
    }

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

async function execSqlFile(client: PoolClient, fileSql: string) {
  const statements = splitSqlStatements(fileSql);
  for (const stmt of statements) {
    await execSql(client, stmt);
  }
}

function splitSqlStatements(sql: string): string[] {
  const normalized = sql.replace(/^\uFEFF/, "");

  return normalized
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map((statement) => `${statement};`);
}
