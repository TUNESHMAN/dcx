import { Pool } from "pg";
import { config } from "../../stateless/src/config";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { logger } from "../../stateless/src/shared/logger/logger";

let pool: Pool | undefined;
const signer = new DsqlSigner({
  hostname: config.get("dsql.endpoint"),
  region: config.get("aws.region"),
});

const createConnectionPool = async () => {
  try {
    if (!pool) {
      pool = new Pool({
        host: config.get("dsql.endpoint"),
        port: 5432,
        database: config.get("dsql.database"),
        user: config.get("dsql.user"),
        password: async () => signer.getDbConnectAdminAuthToken(),
        ssl: { rejectUnauthorized: config.get("dsql.sslRejectUnauthorized") },
        max: config.get("dsql.pool.max"),
        idleTimeoutMillis: config.get("dsql.pool.idleTimeoutMillis"),
        connectionTimeoutMillis: config.get(
          "dsql.pool.connectionTimeoutMillis"
        ),
      });
      const client = await pool.connect();
      client.release();
      logger.info("Database connection pool created and tested successfully");
    }
  } catch (error: any) {
    logger.error("Detailed Connection Error", {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    throw error;
  }
};

export const getDbPool = async (): Promise<Pool> => {
  if (!pool) {
    await createConnectionPool();
  }

  if (!pool) {
    throw new Error("Failed to create a connection pool");
  }

  return pool;
};
