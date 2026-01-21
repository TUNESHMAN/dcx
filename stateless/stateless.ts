import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as dsql from "aws-cdk-lib/aws-dsql";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { resourceNameForStage } from "../utils/naming";
import { EnvironmentConfig } from "../app-config";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as apigw from "aws-cdk-lib/aws-apigateway";

export interface DCXStatelessStackProps
  extends Omit<cdk.StackProps, "env">,
    EnvironmentConfig {
  dcxIdempotencyTable: dynamodb.Table;
  consultancyLogosBucket: s3.Bucket;
  dsqlCluster: dsql.CfnCluster;
  consultancyLogosCdnDomain: string;
}

export class DCXStatelessStack extends cdk.Stack {
  private readonly dcxIdempotencyTable: dynamodb.Table;
  private readonly consultancyLogosBucket: s3.Bucket;
  private readonly dsqlCluster: dsql.CfnCluster;
  private readonly consultancyLogosCdnDomain: string;

  constructor(scope: Construct, id: string, props: DCXStatelessStackProps) {
    super(scope, id, props);
    const {
      env: { region, account },
      shared: {
        stage,
        serviceName,
        metricNamespace,
        logging: { logEvent, logLevel, sampleRate },
      },
      stateless: { runtime },
    } = props;
    const { dcxIdempotencyTable, consultancyLogosBucket, dsqlCluster } = props;
    this.dcxIdempotencyTable = dcxIdempotencyTable;
    this.consultancyLogosBucket = consultancyLogosBucket;
    this.dsqlCluster = dsqlCluster;

    const baseLambdaConfig = {
      POWERTOOLS_LOG_LEVEL: logLevel,
      POWERTOOLS_LOGGER_LOG_EVENT: logEvent,
      POWERTOOLS_LOGGER_SAMPLE_RATE: sampleRate,
      POWERTOOLS_TRACE_ENABLED: "true",
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS: "true",
      POWERTOOLS_SERVICE_NAME: serviceName,
      POWERTOOLS_TRACER_CAPTURE_RESPONSE: "true",
      POWERTOOLS_TRACER_CAPTURE_ERRORS: "true",
      POWERTOOLS_METRICS_NAMESPACE: metricNamespace,
    };
    const DSQL_ENDPOINT = this.dsqlCluster.getAtt("Endpoint").toString();
    const DSQL_CLUSTER_ARN = this.dsqlCluster.getAtt("ResourceArn").toString();
    const DSQL_VPCE_SERVICE_NAME = this.dsqlCluster
      .getAtt("VpcEndpointServiceName")
      .toString();

    new cdk.CfnOutput(this, "DsqlEndpoint", { value: DSQL_ENDPOINT });
    new cdk.CfnOutput(this, "DsqlClusterArn", { value: DSQL_CLUSTER_ARN });
    new cdk.CfnOutput(this, "DsqlVpcEndpointServiceName", {
      value: DSQL_VPCE_SERVICE_NAME,
    });
    // Lambda for migrations
    const runMigrationsLambda = new NodejsFunction(
      this,
      "RunMigrationsLambda",
      {
        functionName: resourceNameForStage("run-migrations", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/functions/migrations/run-migrations/run-migrations.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
          DSQL_DB_NAME: "postgres",
          DSQL_DB_USER: "admin",
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: 1024,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(60),
        bundling: {
          minify: true,
          externalModules: ["aws-sdk"],
          loader: {
            ".sql": "text",
          },
        },
      }
    );
    // Create Skills Lambda Function
    const createSkillsLambda = new NodejsFunction(this, "CreateSkillsLambda", {
      functionName: resourceNameForStage("create-skills", stage),
      runtime,
      entry: path.join(
        __dirname,
        "../stateless/src/adapters/primary/skill/create-skill/create-skill.adapter.ts"
      ),
      environment: {
        ...baseLambdaConfig,
        IDEMPOTENCY_TABLE_NAME: dcxIdempotencyTable.tableName,
        DSQL_ENDPOINT,
        DSQL_CLUSTER_ARN,
      },
      logRetention: logs.RetentionDays.ONE_DAY,
      handler: "handler",
      memorySize: stage === "prod" ? 1024 : 512,
      architecture: lambda.Architecture.ARM_64,
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(5),
      bundling: {
        minify: true,
        externalModules: ["@aws-sdk/*"],
      },
    });

    // Get skills Lambda Function
    const getSkillsLambda = new NodejsFunction(this, "GetSkillsLambda", {
      functionName: resourceNameForStage("get-skills", stage),
      runtime,
      entry: path.join(
        __dirname,
        "../stateless/src/adapters/primary/skill/get-skills/get-skills.adapter.ts"
      ),
      environment: {
        ...baseLambdaConfig,
        DSQL_ENDPOINT,
        DSQL_CLUSTER_ARN,
      },
      logRetention: logs.RetentionDays.ONE_DAY,
      handler: "handler",
      memorySize: stage === "prod" ? 1024 : 512,
      architecture: lambda.Architecture.ARM_64,
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(5),
      bundling: {
        minify: true,
        externalModules: ["@aws-sdk/*"],
      },
    });

    // Update Skill Lambda Function
    const updateSkillLambda = new NodejsFunction(this, "UpdateSkillLambda", {
      functionName: resourceNameForStage("update-skill", stage),
      runtime,
      entry: path.join(
        __dirname,
        "../stateless/src/adapters/primary/skill/update-skill/update-skill.adapter.ts"
      ),
      environment: {
        ...baseLambdaConfig,
        DSQL_ENDPOINT,
        DSQL_CLUSTER_ARN,
      },
      logRetention: logs.RetentionDays.ONE_DAY,
      handler: "handler",
      memorySize: stage === "prod" ? 1024 : 512,
      architecture: lambda.Architecture.ARM_64,
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(5),
      bundling: {
        minify: true,
        externalModules: ["@aws-sdk/*"],
      },
    });
    // Deprecate skill Lambda Function
    const deprecateSkillLambda = new NodejsFunction(
      this,
      "DeprecateSkillLambda",
      {
        functionName: resourceNameForStage("deprecate-skill", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/skill/deprecate-skill/deprecate-skill.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );

    // create consultancy Lambda Function
    const createConsultancyLambda = new NodejsFunction(
      this,
      "CreateConsultancyLambda",
      {
        functionName: resourceNameForStage("create-consultancy", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultancy/create-consultancy/create-consultancy.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          IDEMPOTENCY_TABLE_NAME: this.dcxIdempotencyTable.tableName,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );

    // Get consultancies Lambda Function
    const getConsultanciesLambda = new NodejsFunction(
      this,
      "GetConsultanciesLambda",
      {
        functionName: resourceNameForStage("get-consultancies", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultancy/get-consultancies/get-consultancies.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );
    // Update consultancy lambda function
    const updateConsultancyLambda = new NodejsFunction(
      this,
      "UpdateConsultancyLambda",
      {
        functionName: resourceNameForStage("update-consultancy", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultancy/update-consultancy/update-consultancy.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );

    // disable consultancy Lambda function
    const disableConsultancyLambda = new NodejsFunction(
      this,
      "DisableConsultancyLambda",
      {
        functionName: resourceNameForStage("disable-consultancy", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultancy/disable-consultancy/disable-consultancy.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );

    // consultancy logo upload Lambda function
    const consultancyLogoUploadLambda = new NodejsFunction(
      this,
      "ConsultancyLogoUploadLambda",
      {
        functionName: resourceNameForStage("consultancy-logo-upload", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultancy/consultancy-logo-upload/consultancy-logo-upload.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          LOGO_BUCKET_NAME: this.consultancyLogosBucket.bucketName,
          LOGO_CDN_DOMAIN: this.consultancyLogosCdnDomain,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );

    // Create consultant Lambda Function
    const createConsultantLambda = new NodejsFunction(
      this,
      "CreateConsultantLambda",
      {
        functionName: resourceNameForStage("create-consultant", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultant/create-consultant/create-consultant.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
          IDEMPOTENCY_TABLE_NAME: this.dcxIdempotencyTable.tableName,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );
    // Update consultant Lambda Function
    const updateConsultantLambda = new NodejsFunction(
      this,
      "UpdateConsultantLambda",
      {
        functionName: resourceNameForStage("update-consultant", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultant/update-consultant/update-consultant.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
          IDEMPOTENCY_TABLE_NAME: this.dcxIdempotencyTable.tableName,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );

    // Archive consultant lambda function
    const archiveConsultantLambda = new NodejsFunction(
      this,
      "ArchiveConsultantLambda",
      {
        functionName: resourceNameForStage("archive-consultant", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultant/archive-consultant/archive-consultant.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );
    // Delete consultant lambda function
    const deleteConsultantLambda = new NodejsFunction(
      this,
      "DeleteConsultantLambda",
      {
        functionName: resourceNameForStage("delete-consultant", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultant/delete-consultant/delete-consultant.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );

    // Get consultants Lambda Function
    const getConsultantsLambda = new NodejsFunction(
      this,
      "GetConsultantsLambda",
      {
        functionName: resourceNameForStage("get-consultants", stage),
        runtime,
        entry: path.join(
          __dirname,
          "../stateless/src/adapters/primary/consultant/get-consultants/get-consultants.adapter.ts"
        ),
        environment: {
          ...baseLambdaConfig,
          DSQL_ENDPOINT,
          DSQL_CLUSTER_ARN,
        },
        logRetention: logs.RetentionDays.ONE_DAY,
        handler: "handler",
        memorySize: stage === "prod" ? 1024 : 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
        },
      }
    );
    // Lifecycle policy to empty logo uploads in tmp folder
    consultancyLogosBucket.addLifecycleRule({
      prefix: "consultancies/logos/tmp/",
      expiration: cdk.Duration.days(1),
    });
    const dsqlConnectPolicy = new iam.PolicyStatement({
      actions: ["dsql:DbConnectAdmin"],
      resources: [DSQL_CLUSTER_ARN],
    });

    runMigrationsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dsql:DbConnectAdmin"],
        resources: [DSQL_CLUSTER_ARN],
      })
    );
    //  Grant the Lambda functions appropriate permissions to the Database tables and appropriate buckets
    createSkillsLambda.addToRolePolicy(dsqlConnectPolicy);
    getSkillsLambda.addToRolePolicy(dsqlConnectPolicy);
    updateSkillLambda.addToRolePolicy(dsqlConnectPolicy);
    deprecateSkillLambda.addToRolePolicy(dsqlConnectPolicy);
    createConsultancyLambda.addToRolePolicy(dsqlConnectPolicy);
    getConsultanciesLambda.addToRolePolicy(dsqlConnectPolicy);
    disableConsultancyLambda.addToRolePolicy(dsqlConnectPolicy);
    updateConsultancyLambda.addToRolePolicy(dsqlConnectPolicy);
    this.dcxIdempotencyTable.grantReadWriteData(createSkillsLambda);
    this.dcxIdempotencyTable.grantReadWriteData(createConsultancyLambda);
    this.dcxIdempotencyTable.grantReadWriteData(createConsultantLambda);
    consultancyLogosBucket.grantPut(consultancyLogoUploadLambda);
    createConsultantLambda.addToRolePolicy(dsqlConnectPolicy);
    updateConsultantLambda.addToRolePolicy(dsqlConnectPolicy);
    archiveConsultantLambda.addToRolePolicy(dsqlConnectPolicy);
    deleteConsultantLambda.addToRolePolicy(dsqlConnectPolicy);
    getConsultantsLambda.addToRolePolicy(dsqlConnectPolicy);

    // Initialize API Gateway for establishing communication with the DCX system
    const api = new apigw.RestApi(this, "Api", {
      description: "Digital Capability Exchange",
      restApiName: resourceNameForStage("dcx", stage),
      endpointTypes: [apigw.EndpointType.EDGE],
      deploy: true,
      deployOptions: {
        stageName: "api",
      },
    });

    const root: apigw.Resource = api.root.addResource("v1");
    const skills: apigw.Resource = root.addResource("skills");
    const skillById: apigw.Resource = skills.addResource("{skillId}");
    const deprecateSkill: apigw.Resource = skillById.addResource("deprecate");
    const consultancy: apigw.Resource = root.addResource("consultancy");
    const consultancyById: apigw.Resource =
      consultancy.addResource("{consultancyId}");
    const disableConsultancy: apigw.Resource =
      consultancyById.addResource("disable");
    const consultancies: apigw.Resource = root.addResource("consultancies");
    const consultancyLogo: apigw.Resource =
      consultancy.addResource("logo-upload");
    const consultant: apigw.Resource = root.addResource("consultant");
    const consultantById: apigw.Resource =
      consultant.addResource("{consultantId}");
    const archiveConsultant: apigw.Resource =
      consultantById.addResource("archive");
    // Integrate Create Skills Lambda with API Gateway
    skills.addMethod(
      "POST",
      new apigw.LambdaIntegration(createSkillsLambda, {
        proxy: true,
      })
    );
    // Integrate Get Skills Lambda with API Gateway
    skills.addMethod(
      "GET",
      new apigw.LambdaIntegration(getSkillsLambda, {
        proxy: true,
      })
    );
    // Integrate Update Skill Lambda with API Gateway
    skillById.addMethod(
      "PATCH",
      new apigw.LambdaIntegration(updateSkillLambda, {
        proxy: true,
      })
    );
    // Integrate Deprecate Skill Lambda with API Gateway
    deprecateSkill.addMethod(
      "DELETE",
      new apigw.LambdaIntegration(deprecateSkillLambda, {
        proxy: true,
      })
    );
    // Integrate Create Consultancy Lambda with API Gateway
    consultancy.addMethod(
      "POST",
      new apigw.LambdaIntegration(createConsultancyLambda, {
        proxy: true,
      })
    );
    // Integrate Get Consultancies Lambda with API Gateway
    consultancies.addMethod(
      "GET",
      new apigw.LambdaIntegration(getConsultanciesLambda, {
        proxy: true,
      })
    );
    // Integrate Disable Consultancy Lambda with API Gateway
    disableConsultancy.addMethod(
      "DELETE",
      new apigw.LambdaIntegration(disableConsultancyLambda, {
        proxy: true,
      })
    );
    // Integrate Update Consultancy Lambda with API Gateway
    consultancyById.addMethod(
      "PATCH",
      new apigw.LambdaIntegration(updateConsultancyLambda, {
        proxy: true,
      })
    );
    // Integrate Consultancy Logo Upload Lambda with API Gateway
    consultancyLogo.addMethod(
      "POST",
      new apigw.LambdaIntegration(consultancyLogoUploadLambda, {
        proxy: true,
      })
    );
    // Integrate create consultant lambda with API Gateway
    consultant.addMethod(
      "POST",
      new apigw.LambdaIntegration(createConsultantLambda, {
        proxy: true,
      })
    );
    // Integrate update consultant lambda with API Gateway
    consultantById.addMethod(
      "PATCH",
      new apigw.LambdaIntegration(updateConsultantLambda, {
        proxy: true,
      })
    );

    // Integrate delete consultant lambda with API Gateway
    consultantById.addMethod(
      "DELETE",
      new apigw.LambdaIntegration(deleteConsultantLambda, {
        proxy: true,
      })
    );
    // Integrate archive consultant lambda with API Gateway
    archiveConsultant.addMethod(
      "PATCH",
      new apigw.LambdaIntegration(archiveConsultantLambda, {
        proxy: true,
      })
    );
    // Integrate get consultant lambda with API Gateway
    consultant.addMethod(
      "GET",
      new apigw.LambdaIntegration(getConsultantsLambda, {
        proxy: true,
      })
    );
  }
}
