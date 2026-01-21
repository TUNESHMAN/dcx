import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dsql from "aws-cdk-lib/aws-dsql";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";
import { resourceNameForStage } from "../utils/naming";
import { envVar, Stage } from "@leighton-digital/lambda-toolkit";
import { EnvironmentConfig } from "../app-config";
const stage = envVar.getString("STAGE") as Stage;

interface DcxStatefulStackProps
  extends Omit<cdk.StackProps, "env">,
    EnvironmentConfig {}

export class DCXStatefulStack extends cdk.Stack {
  public dcxIdempotencyTable: dynamodb.Table;
  public consultancyLogosBucket: s3.Bucket;
  public dsqlCluster: dsql.CfnCluster;
  public consultancyLogosCdnDomain: string;
  constructor(scope: Construct, id: string, props: DcxStatefulStackProps) {
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
    // Idempotency Table
    this.dcxIdempotencyTable = new dynamodb.Table(this, "IdempotencyTable", {
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: resourceNameForStage("dcx-idempotency-table", stage),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "expiration",
    });

    // S3 Bucket for Consultancy Logos
    this.consultancyLogosBucket = new s3.Bucket(
      this,
      "ConsultancyLogosBucket",
      {
        bucketName: resourceNameForStage("dcx-consultancy-logos-bucket", stage),
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy:
          stage === Stage.prod
            ? cdk.RemovalPolicy.RETAIN
            : cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: stage === Stage.prod ? false : true,
        cors: [
          {
            allowedMethods: [s3.HttpMethods.PUT],
            allowedOrigins: ["*"], // I will adjust to frontend domain in prod
            allowedHeaders: ["*"],
            exposedHeaders: ["ETag"],
            maxAge: 3000,
          },
        ],
      }
    );

    // CloudFront distribution to serve private S3 logos
    const logoCachePolicy = new cloudfront.CachePolicy(
      this,
      "LogoCachePolicy",
      {
        defaultTtl: cdk.Duration.days(30),
        minTtl: cdk.Duration.minutes(1),
        maxTtl: cdk.Duration.days(365),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Origin"),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
      }
    );
    // CloudFront distribution to serve private S3 logos
    const logosDistribution = new cloudfront.Distribution(
      this,
      "ConsultancyLogosDistribution",
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(
            this.consultancyLogosBucket
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: logoCachePolicy,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS, // I will tighten later in prod
        },
        comment: `DCX consultancy logos (${stage})`,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        enabled: true,
      }
    );
    this.consultancyLogosCdnDomain = logosDistribution.domainName;
    // Output the CloudFront domain for convenience
    new cdk.CfnOutput(this, "ConsultancyLogosCdnDomain", {
      value: this.consultancyLogosCdnDomain,
    });

    // Aurora DSQL CLuster
    this.dsqlCluster = new dsql.CfnCluster(this, "DSQLCluster", {
      deletionProtectionEnabled: stage === Stage.prod,
      tags: [
        { key: "service", value: serviceName },
        { key: "stage", value: stage },
        { key: "Name", value: resourceNameForStage("dsql-cluster", stage) },
      ],
    });
  }
}
