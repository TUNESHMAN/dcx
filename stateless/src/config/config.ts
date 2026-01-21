const convict = require("convict");

export const config = convict({
  env: {
    doc: "Application environment",
    format: ["develop", "test", "staging", "production"],
    default: "develop",
    env: "NODE_ENV",
  },

  aws: {
    region: {
      doc: "AWS region",
      format: String,
      default: "eu-west-2",
      env: "AWS_REGION",
    },
  },

  consultancyLogoBucketName: {
    doc: "The S3 bucket consultancy logos",
    format: String,
    default: "",
    env: "LOGO_BUCKET_NAME",
  },
  logoCDNDomain: {
    doc: "",
    format: String,
    default: "",
    env: " LOGO_CDN_DOMAIN",
  },

  dsql: {
    endpoint: {
      doc: "DSQL/Postgres endpoint hostname",
      format: String,
      default: "",
      env: "DSQL_ENDPOINT",
    },
    database: {
      doc: "Database name",
      format: String,
      default: "postgres",
      env: "DSQL_DB_NAME",
    },
    user: {
      doc: "Database user",
      format: String,
      default: "admin",
      env: "DSQL_DB_USER",
    },
    clusterArn: {
      doc: "DSQL cluster ARN",
      format: String,
      default: "",
      env: "DSQL_CLUSTER_ARN",
    },
    sslRejectUnauthorized: {
      doc: "Reject unauthorized SSL certs",
      format: Boolean,
      default: true,
      env: "DSQL_SSL_REJECT_UNAUTHORIZED",
    },
    pool: {
      max: {
        doc: "Max DB pool size",
        format: "int",
        default: 5,
        env: "DB_POOL_MAX",
      },
      idleTimeoutMillis: {
        doc: "Idle timeout for pool connections",
        format: "int",
        default: 30000,
        env: "DB_POOL_IDLE_TIMEOUT",
      },
      connectionTimeoutMillis: {
        doc: "Connection timeout",
        format: "int",
        default: 5000,
        env: "DB_POOL_CONNECTION_TIMEOUT",
      },
    },
  },

  idempotency: {
    tableName: {
      doc: "DynamoDB table name for idempotency",
      format: String,
      default: "",
      env: "IDEMPOTENCY_TABLE_NAME",
    },
  },

  logging: {
    level: {
      doc: "Log level",
      format: ["debug", "info", "warn", "error"],
      default: "info",
      env: "LOG_LEVEL",
    },
  },
});

config.validate({ allowed: "strict" });
