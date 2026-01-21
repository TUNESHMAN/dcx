// import * as cdk from "aws-cdk-lib";
// import * as lambda from "aws-cdk-lib/aws-lambda";
// import * as logs from "aws-cdk-lib/aws-logs";
// import * as apigw from "aws-cdk-lib/aws-apigateway";
// import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
// import * as iam from "aws-cdk-lib/aws-iam";
// import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
// import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
// import * as s3 from "aws-cdk-lib/aws-s3";
// import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
// import { Construct } from "constructs";

// import { EnvironmentConfig } from "../app-config";
// import { resourceNameForStage } from "../utils/naming";
// import { Stage } from "@leighton-digital/lambda-toolkit";
// import * as dsql from "aws-cdk-lib/aws-dsql";

// interface DcxStackProps
//   extends Omit<cdk.StackProps, "env">,
//     EnvironmentConfig {}

// export class DcxStack extends cdk.Stack {
//   constructor(scope: Construct, id: string, props: DcxStackProps) {
//     super(scope, id, props);

//     const {
//       env: { region, account },
//       shared: {
//         stage,
//         serviceName,
//         metricNamespace,
//         logging: { logEvent, logLevel, sampleRate },
//       },
//       stateless: { runtime },
//     } = props;

// const baseLambdaConfig = {
//   POWERTOOLS_LOG_LEVEL: logLevel,
//   POWERTOOLS_LOGGER_LOG_EVENT: logEvent,
//   POWERTOOLS_LOGGER_SAMPLE_RATE: sampleRate,
//   POWERTOOLS_TRACE_ENABLED: "true",
//   POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS: "true",
//   POWERTOOLS_SERVICE_NAME: serviceName,
//   POWERTOOLS_TRACER_CAPTURE_RESPONSE: "true",
//   POWERTOOLS_TRACER_CAPTURE_ERRORS: "true",
//   POWERTOOLS_METRICS_NAMESPACE: metricNamespace,
// };

// Aurora DSQL Cluster
// const dsqlCluster = new dsql.CfnCluster(this, "DSQLCluster", {
//   deletionProtectionEnabled: stage === Stage.prod,
//   tags: [
//     { key: "service", value: serviceName },
//     { key: "stage", value: stage },
//     { key: "Name", value: resourceNameForStage("dsql-cluster", stage) },
//   ],
// });

// const DSQL_ENDPOINT = dsqlCluster.getAtt("Endpoint").toString();
// const DSQL_CLUSTER_ARN = dsqlCluster.getAtt("ResourceArn").toString();
// const DSQL_VPCE_SERVICE_NAME = dsqlCluster
//   .getAtt("VpcEndpointServiceName")
//   .toString();

// new cdk.CfnOutput(this, "DsqlEndpoint", { value: DSQL_ENDPOINT });
// new cdk.CfnOutput(this, "DsqlClusterArn", { value: DSQL_CLUSTER_ARN });
// new cdk.CfnOutput(this, "DsqlVpcEndpointServiceName", {
//   value: DSQL_VPCE_SERVICE_NAME,
// });

// Idempotency Table
// const idempotencyTable = new dynamodb.Table(this, "IdempotencyTable", {
//   partitionKey: {
//     name: "id",
//     type: dynamodb.AttributeType.STRING,
//   },
//   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
//   tableName: resourceNameForStage(
//     "digital-capability-exchange-idempotency-table",
//     stage
//   ),
//   removalPolicy: cdk.RemovalPolicy.DESTROY,
//   timeToLiveAttribute: "expiration",
// });

// S3 Bucket for Consultancy Logos
// const consultancyLogosBucket = new s3.Bucket(
//   this,
//   "ConsultancyLogosBucket",
//   {
//     bucketName: resourceNameForStage(
//       "digital-capability-exchange-consultancy-logos-bucket",
//       stage
//     ),
//     blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
//     removalPolicy:
//       stage === Stage.prod
//         ? cdk.RemovalPolicy.RETAIN
//         : cdk.RemovalPolicy.DESTROY,
//     autoDeleteObjects: stage === Stage.prod ? false : true,
//     cors: [
//       {
//         allowedMethods: [s3.HttpMethods.PUT],
//         allowedOrigins: ["*"], // I will adjust to frontend domain in prod
//         allowedHeaders: ["*"],
//         exposedHeaders: ["ETag"],
//         maxAge: 3000,
//       },
//     ],
//   }
// );

// CloudFront distribution to serve private S3 logos
// const logoCachePolicy = new cloudfront.CachePolicy(
//   this,
//   "LogoCachePolicy",
//   {
//     defaultTtl: cdk.Duration.days(30),
//     minTtl: cdk.Duration.minutes(1),
//     maxTtl: cdk.Duration.days(365),
//     cookieBehavior: cloudfront.CacheCookieBehavior.none(),
//     queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
//     headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Origin"),
//     enableAcceptEncodingBrotli: true,
//     enableAcceptEncodingGzip: true,
//   }
// );

// const logosDistribution = new cloudfront.Distribution(
//   this,
//   "ConsultancyLogosDistribution",
//   {
//     defaultBehavior: {
//       origin: origins.S3BucketOrigin.withOriginAccessControl(
//         consultancyLogosBucket
//       ),
//       viewerProtocolPolicy:
//         cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
//       allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
//       cachePolicy: logoCachePolicy,
//       responseHeadersPolicy:
//         cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS, // I will tighten later in prod
//     },
//     comment: `DCX consultancy logos (${stage})`,
//     minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
//     enabled: true,
//   }
// );

// // Output the CloudFront domain for convenience
// new cdk.CfnOutput(this, "ConsultancyLogosCdnDomain", {
//   value: logosDistribution.domainName,
// });

// const runMigrationsLambda = new NodejsFunction(
//   this,
//   "RunMigrationsLambda",
//   {
//     functionName: resourceNameForStage("run-migrations", stage),
//     runtime,
//     entry: path.join(
//       __dirname,
//       "../src/functions/migrations/run-migrations/run-migrations.ts"
//     ),
//     environment: {
//       ...baseLambdaConfig,
//       DSQL_ENDPOINT,
//       DSQL_CLUSTER_ARN,
//       DSQL_DB_NAME: "postgres",
//       DSQL_DB_USER: "admin",
//     },
//     logRetention: logs.RetentionDays.ONE_DAY,
//     handler: "handler",
//     memorySize: 1024,
//     architecture: lambda.Architecture.ARM_64,
//     tracing: lambda.Tracing.ACTIVE,
//     timeout: cdk.Duration.seconds(60),
//     bundling: {
//       minify: true,
//       externalModules: ["aws-sdk"],
//       loader: {
//         ".sql": "text",
//       },
//     },
//   }
// );

// Create Skills Lambda Function
// const createSkillsLambda = new NodejsFunction(this, "CreateSkillsLambda", {
//   functionName: resourceNameForStage("create-skills", stage),
//   runtime,
//   entry: path.join(
//     __dirname,
//     "../src/functions/skills/create-skills/create-skills.ts"
//   ),
//   environment: {
//     ...baseLambdaConfig,
//     IDEMPOTENCY_TABLE_NAME: idempotencyTable.tableName,
//     DSQL_ENDPOINT,
//     DSQL_CLUSTER_ARN,
//   },
//   logRetention: logs.RetentionDays.ONE_DAY,
//   handler: "handler",
//   memorySize: stage === "prod" ? 1024 : 512,
//   architecture: lambda.Architecture.ARM_64,
//   tracing: lambda.Tracing.ACTIVE,
//   timeout: cdk.Duration.seconds(5),
//   bundling: {
//     minify: true,
//     externalModules: ["@aws-sdk/*"],
//   },
// });

// Get skills Lambda Function
// const getSkillsLambda = new NodejsFunction(this, "GetSkillsLambda", {
//   functionName: resourceNameForStage("get-skills", stage),
//   runtime,
//   entry: path.join(
//     __dirname,
//     "../src/functions/skills/get-skills/get-skills.ts"
//   ),
//   environment: {
//     ...baseLambdaConfig,
//     DSQL_ENDPOINT,
//     DSQL_CLUSTER_ARN,
//   },
//   logRetention: logs.RetentionDays.ONE_DAY,
//   handler: "handler",
//   memorySize: stage === "prod" ? 1024 : 512,
//   architecture: lambda.Architecture.ARM_64,
//   tracing: lambda.Tracing.ACTIVE,
//   timeout: cdk.Duration.seconds(5),
//   bundling: {
//     minify: true,
//     externalModules: ["@aws-sdk/*"],
//   },
// });

// Update Skill Lambda Function
// const updateSkillLambda = new NodejsFunction(this, "UpdateSkillLambda", {
//   functionName: resourceNameForStage("update-skill", stage),
//   runtime,
//   entry: path.join(
//     __dirname,
//     "../src/functions/skills/update-skill/update-skill.ts"
//   ),
//   environment: {
//     ...baseLambdaConfig,
//     DSQL_ENDPOINT,
//     DSQL_CLUSTER_ARN,
//   },
//   logRetention: logs.RetentionDays.ONE_DAY,
//   handler: "handler",
//   memorySize: stage === "prod" ? 1024 : 512,
//   architecture: lambda.Architecture.ARM_64,
//   tracing: lambda.Tracing.ACTIVE,
//   timeout: cdk.Duration.seconds(5),
//   bundling: {
//     minify: true,
//     externalModules: ["@aws-sdk/*"],
//   },
// });

// Deprecate skill Lambda Function
// const deprecateSkillLambda = new NodejsFunction(
//   this,
//   "DeprecateSkillLambda",
//   {
//     functionName: resourceNameForStage("deprecate-skill", stage),
//     runtime,
//     entry: path.join(
//       __dirname,
//       "../src/functions/skills/deprecate-skill/deprecate-skill.ts"
//     ),
//     environment: {
//       ...baseLambdaConfig,
//       DSQL_ENDPOINT,
//       DSQL_CLUSTER_ARN,
//     },
//     logRetention: logs.RetentionDays.ONE_DAY,
//     handler: "handler",
//     memorySize: stage === "prod" ? 1024 : 512,
//     architecture: lambda.Architecture.ARM_64,
//     tracing: lambda.Tracing.ACTIVE,
//     timeout: cdk.Duration.seconds(5),
//     bundling: {
//       minify: true,
//       externalModules: ["@aws-sdk/*"],
//     },
//   }
// );

// create consultancy Lambda Function
// const createConsultancyLambda = new NodejsFunction(
//   this,
//   "CreateConsultancyLambda",
//   {
//     functionName: resourceNameForStage("create-consultancy", stage),
//     runtime,
//     entry: path.join(
//       __dirname,
//       "../src/functions/consultancies/create-consultancy/create-consutancy.ts"
//     ),
//     environment: {
//       ...baseLambdaConfig,
//       IDEMPOTENCY_TABLE_NAME: idempotencyTable.tableName,
//       DSQL_ENDPOINT,
//       DSQL_CLUSTER_ARN,
//     },
//     logRetention: logs.RetentionDays.ONE_DAY,
//     handler: "handler",
//     memorySize: stage === "prod" ? 1024 : 512,
//     architecture: lambda.Architecture.ARM_64,
//     tracing: lambda.Tracing.ACTIVE,
//     timeout: cdk.Duration.seconds(5),
//     bundling: {
//       minify: true,
//       externalModules: ["@aws-sdk/*"],
//     },
//   }
// );

// Get consultancies Lambda Function
// const getConsultanciesLambda = new NodejsFunction(
//   this,
//   "GetConsultanciesLambda",
//   {
//     functionName: resourceNameForStage("get-consultancies", stage),
//     runtime,
//     entry: path.join(
//       __dirname,
//       "../src/functions/consultancies/get-consultancies/get-consultancies.ts"
//     ),
//     environment: {
//       ...baseLambdaConfig,
//       DSQL_ENDPOINT,
//       DSQL_CLUSTER_ARN,
//     },
//     logRetention: logs.RetentionDays.ONE_DAY,
//     handler: "handler",
//     memorySize: stage === "prod" ? 1024 : 512,
//     architecture: lambda.Architecture.ARM_64,
//     tracing: lambda.Tracing.ACTIVE,
//     timeout: cdk.Duration.seconds(5),
//     bundling: {
//       minify: true,
//       externalModules: ["@aws-sdk/*"],
//     },
//   }
// );
// Update consultancy lambda function
// const updateConsultancyLambda = new NodejsFunction(
//   this,
//   "UpdateConsultancyLambda",
//   {
//     functionName: resourceNameForStage("update-consultancy", stage),
//     runtime,
//     entry: path.join(
//       __dirname,
//       "../src/functions/consultancies/update-consultancy/update-consultancy.ts"
//     ),
//     environment: {
//       ...baseLambdaConfig,
//       DSQL_ENDPOINT,
//       DSQL_CLUSTER_ARN,
//     },
//     logRetention: logs.RetentionDays.ONE_DAY,
//     handler: "handler",
//     memorySize: stage === "prod" ? 1024 : 512,
//     architecture: lambda.Architecture.ARM_64,
//     tracing: lambda.Tracing.ACTIVE,
//     timeout: cdk.Duration.seconds(5),
//     bundling: {
//       minify: true,
//       externalModules: ["@aws-sdk/*"],
//     },
//   }
// );

// disable consultancy Lambda function
// const disableConsultancyLambda = new NodejsFunction(
//   this,
//   "DisableConsultancyLambda",
//   {
//     functionName: resourceNameForStage("disable-consultancy", stage),
//     runtime,
//     entry: path.join(
//       __dirname,
//       "../src/functions/consultancies/disable-consultancy/disable-consultancy.ts"
//     ),
//     environment: {
//       ...baseLambdaConfig,
//       DSQL_ENDPOINT,
//       DSQL_CLUSTER_ARN,
//     },
//     logRetention: logs.RetentionDays.ONE_DAY,
//     handler: "handler",
//     memorySize: stage === "prod" ? 1024 : 512,
//     architecture: lambda.Architecture.ARM_64,
//     tracing: lambda.Tracing.ACTIVE,
//     timeout: cdk.Duration.seconds(5),
//     bundling: {
//       minify: true,
//       externalModules: ["@aws-sdk/*"],
//     },
//   }
// );
// consultancy logo upload Lambda function
// const consultancyLogoUploadLambda = new NodejsFunction(
//   this,
//   "ConsultancyLogoUploadLambda",
//   {
//     functionName: resourceNameForStage("consultancy-logo-upload", stage),
//     runtime,
//     entry: path.join(
//       __dirname,
//       "../src/functions/consultancies/consultancy-logo-upload/consultancy-logo-upload.ts"
//     ),
//     environment: {
//       ...baseLambdaConfig,
//       LOGO_BUCKET_NAME: consultancyLogosBucket.bucketName,
//       LOGO_CDN_DOMAIN: logosDistribution.domainName,
//     },
//     logRetention: logs.RetentionDays.ONE_DAY,
//     handler: "handler",
//     memorySize: stage === "prod" ? 1024 : 512,
//     architecture: lambda.Architecture.ARM_64,
//     tracing: lambda.Tracing.ACTIVE,
//     timeout: cdk.Duration.seconds(5),
//     bundling: {
//       minify: true,
//       externalModules: ["@aws-sdk/*"],
//     },
//   }
// );

// Create consultanty Lambda Function
// const createConsultantLambda = new NodejsFunction(
//   this,
//   "CreateConsultantLambda",
//   {
//     functionName: resourceNameForStage("create-consultant", stage),
//     runtime,
//     entry: path.join(
//       __dirname,
//       "../src/functions/consultants/create-consultant/create-consultant.ts"
//     ),
//     environment: {
//       ...baseLambdaConfig,
//       DSQL_ENDPOINT,
//       DSQL_CLUSTER_ARN,
//       IDEMPOTENCY_TABLE_NAME: idempotencyTable.tableName,
//     },
//     logRetention: logs.RetentionDays.ONE_DAY,
//     handler: "handler",
//     memorySize: stage === "prod" ? 1024 : 512,
//     architecture: lambda.Architecture.ARM_64,
//     tracing: lambda.Tracing.ACTIVE,
//     timeout: cdk.Duration.seconds(5),
//     bundling: {
//       minify: true,
//       externalModules: ["@aws-sdk/*"],
//     },
//   }
// );

// // Initialize API Gateway for establishing communication with the DCX system
// const api = new apigw.RestApi(this, "Api", {
//   description: "Digital Capability Exchange",
//   restApiName: resourceNameForStage("digital-capability-exchange", stage),
//   endpointTypes: [apigw.EndpointType.EDGE],
//   deploy: true,
//   deployOptions: {
//     stageName: "api",
//   },
// });

// const root: apigw.Resource = api.root.addResource("v1");
// const skills: apigw.Resource = root.addResource("skills");
// const skillById: apigw.Resource = skills.addResource("{skillId}");
// const deprecateSkill: apigw.Resource = skillById.addResource("deprecate");
// const consultancy: apigw.Resource = root.addResource("consultancy");
// const consultancyById: apigw.Resource =
//   consultancy.addResource("{consultancyId}");
// const disableConsultancy: apigw.Resource =
//   consultancyById.addResource("disable");
// const consultancies: apigw.Resource = root.addResource("consultancies");
// const consultancyLogo: apigw.Resource =
//   consultancy.addResource("logo-upload");
// const consultant: apigw.Resource = root.addResource("consultant");
// // Integrate Create Skills Lambda with API Gateway
// skills.addMethod(
//   "POST",
//   new apigw.LambdaIntegration(createSkillsLambda, {
//     proxy: true,
//   })
// );
// // Integrate Get Skills Lambda with API Gateway
// skills.addMethod(
//   "GET",
//   new apigw.LambdaIntegration(getSkillsLambda, {
//     proxy: true,
//   })
// );
// // Integrate Update Skill Lambda with API Gateway
// skillById.addMethod(
//   "PATCH",
//   new apigw.LambdaIntegration(updateSkillLambda, {
//     proxy: true,
//   })
// );
// // Integrate Deprecate Skill Lambda with API Gateway
// deprecateSkill.addMethod(
//   "DELETE",
//   new apigw.LambdaIntegration(deprecateSkillLambda, {
//     proxy: true,
//   })
// );
// // Integrate Create Consultancy Lambda with API Gateway
// consultancy.addMethod(
//   "POST",
//   new apigw.LambdaIntegration(createConsultancyLambda, {
//     proxy: true,
//   })
// );
// // Integrate Get Consultancies Lambda with API Gateway
// consultancies.addMethod(
//   "GET",
//   new apigw.LambdaIntegration(getConsultanciesLambda, {
//     proxy: true,
//   })
// );
// // Integrate Disable Consultancy Lambda with API Gateway
// disableConsultancy.addMethod(
//   "DELETE",
//   new apigw.LambdaIntegration(disableConsultancyLambda, {
//     proxy: true,
//   })
// );
// // Integrate Update Consultancy Lambda with API Gateway
// consultancyById.addMethod(
//   "PATCH",
//   new apigw.LambdaIntegration(updateConsultancyLambda, {
//     proxy: true,
//   })
// );
// // Integrate Consultancy Logo Upload Lambda with API Gateway
// consultancyLogo.addMethod(
//   "POST",
//   new apigw.LambdaIntegration(consultancyLogoUploadLambda, {
//     proxy: true,
//   })
// );

// consultant.addMethod(
//   "POST",
//   new apigw.LambdaIntegration(createConsultantLambda, {
//     proxy: true,
//   })
// );

// runMigrationsLambda.addToRolePolicy(
//   new iam.PolicyStatement({
//     actions: ["dsql:DbConnectAdmin"],
//     resources: [DSQL_CLUSTER_ARN],
//   })
// );

// Lifecycle policy to empty logo uploads in tmp folder
// consultancyLogosBucket.addLifecycleRule({
//   prefix: "consultancies/logos/tmp/",
//   expiration: cdk.Duration.days(1),
// });

// const dsqlConnectPolicy = new iam.PolicyStatement({
//   actions: ["dsql:DbConnectAdmin"],
//   resources: [DSQL_CLUSTER_ARN],
// });
//  Grant the Lambda functions appropriate permissions to the Database tables and appropriate buckets
// createSkillsLambda.addToRolePolicy(dsqlConnectPolicy);
// getSkillsLambda.addToRolePolicy(dsqlConnectPolicy);
// updateSkillLambda.addToRolePolicy(dsqlConnectPolicy);
// deprecateSkillLambda.addToRolePolicy(dsqlConnectPolicy);
// createConsultancyLambda.addToRolePolicy(dsqlConnectPolicy);
// getConsultanciesLambda.addToRolePolicy(dsqlConnectPolicy);
// disableConsultancyLambda.addToRolePolicy(dsqlConnectPolicy);
// updateConsultancyLambda.addToRolePolicy(dsqlConnectPolicy);
// idempotencyTable.grantReadWriteData(createSkillsLambda);
// idempotencyTable.grantReadWriteData(createConsultancyLambda);
// idempotencyTable.grantReadWriteData(createConsultantLambda);
// consultancyLogosBucket.grantPut(consultancyLogoUploadLambda);
// createConsultantLambda.addToRolePolicy(dsqlConnectPolicy);
//   }
// }
