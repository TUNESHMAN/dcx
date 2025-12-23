import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";
import { EnvironmentConfig } from "../app-config";
import { resourceNameForStage } from "../utils/naming";
import { Stage } from "@leighton-digital/lambda-toolkit";

interface DcxStackProps
  extends Omit<cdk.StackProps, "env">,
    EnvironmentConfig {}

export class DcxStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DcxStackProps) {
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

    // Dynamodb table for storing our records and entries
    const table = new dynamodb.Table(this, "Table", {
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      tableName: resourceNameForStage("digital-capability-exchange", stage),
      removalPolicy:
        stage === Stage.prod
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // Create Skills Lambda Function
    const createSkillsLambda = new NodejsFunction(this, "CreateSkillsLambda", {
      functionName: resourceNameForStage("create-skills", stage),
      runtime,
      entry: path.join(
        __dirname,
        "../src/functions/skills/create-skills/create-skills.ts"
      ),
      environment: {
        ...baseLambdaConfig,
        TABLE_NAME: table.tableName,
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

    // Initialize API Gateway for establishing communication with the DCX system
    const api = new apigw.RestApi(this, "Api", {
      description: "Digital Capability Exchange",
      restApiName: resourceNameForStage("digital-capability-exchange", stage),
      endpointTypes: [apigw.EndpointType.EDGE],
      deploy: true,
      deployOptions: {
        stageName: "api",
      },
    });

    const root: apigw.Resource = api.root.addResource("v1");
    const skills: apigw.Resource = root.addResource("skills");
    // Integrate Create Skills Lambda with API Gateway
    skills.addMethod(
      "POST",
      new apigw.LambdaIntegration(createSkillsLambda, {
        proxy: true,
      })
    );
    // Grant the Lambda functions appropriate permissions to the DynamoDB table
    table.grantWriteData(createSkillsLambda);
  }
}
