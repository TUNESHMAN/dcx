import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";

export class DcxStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
      tableName: "digital-capability-exchange",
    });

    // Create Skills Lambda Function
    const createSkillsLambda = new NodejsFunction(this, "CreateSkillsLambda", {
      functionName: "create-skills",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(
        __dirname,
        "../src/functions/skills/create-skills/create-skills.ts"
      ),
      logRetention: logs.RetentionDays.ONE_DAY,
      handler: "handler",
      memorySize: 1024,
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
      restApiName: `digital-capability-exchange`,
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
