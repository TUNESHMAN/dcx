import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Region, Stage } from "@leighton-digital/lambda-toolkit";

// This interface defines the shape of our environment config.
// We have shared config - that should be available in all of our stacks
// We have env config - which is our typed environment config, for the AWS account and region.
// We have stateless config - this is config that is only available to our stateless stack. (Something we'll be creating in the future).
export interface EnvironmentConfig {
  shared: {
    stage: Stage;
    metricNamespace: string;
    serviceName: string;
    logging: {
      logLevel: "INFO" | "DEBUG" | "WARN" | "ERROR";
      logEvent: "true" | "false";
      sampleRate: string;
    };
  };
  env: {
    account: string;
    region: Region;
  };
  stateless: {
    runtime: Runtime;
  };
}

// These consts are values that should be the same, regardless of which stage we're deploying to.
const serviceNamePrefix = "dcx-service";
const lambdaRuntime = Runtime.NODEJS_22_X;
const region = Region.london;

// This is the utility definition - we're expected the consuming code to give us
// a Stage (develop, test, staging, prod, etc.) and we will return the relevant config for that environment
export const getEnvironmentConfig = (stage: Stage): EnvironmentConfig => {
  switch (stage) {
    case Stage.develop:
      return {
        shared: {
          logging: {
            logLevel: "DEBUG",
            logEvent: "true",
            sampleRate: "0",
          },
          serviceName: `${serviceNamePrefix}-${Stage.develop}`,
          metricNamespace: `${serviceNamePrefix}-${Stage.develop}`,
          stage: Stage.develop,
        },
        stateless: {
          runtime: lambdaRuntime,
        },
        env: {
          account: "258763568004", // Your Develop Account ID
          region: region,
        },
      };
    case Stage.prod:
      return {
        shared: {
          logging: {
            logLevel: "INFO",
            logEvent: "false",
            sampleRate: "0",
          },
          serviceName: `${serviceNamePrefix}`,
          metricNamespace: `${serviceNamePrefix}`,
          stage: Stage.prod,
        },
        stateless: {
          runtime: lambdaRuntime,
        },
        env: {
          account: "258763568004", // Your Production Account ID
          region: region,
        },
      };
    // This is the fall back case - if the Stage name doesn't match any of them defined in this switch statement
    // we will treat the stage as an Ephemeral, or short lived stage.
    default:
      return {
        shared: {
          logging: {
            logLevel: "DEBUG",
            logEvent: "true",
            sampleRate: "0",
          },
          // Notice the service and namespace names are dynamic here.
          // This allows us to deploy to environments that match Jira ticket numbers.
          // For example dcx-service-on-1234
          // When work is complete in these ephemeral environments, they are destroyed.
          // Read more here! https://blog.serverlessadvocate.com/serverless-ephemeral-environments-with-serverful-aws-services-c803d24b353f
          serviceName: `${serviceNamePrefix}-${stage}`,
          metricNamespace: `${serviceNamePrefix}-${stage}`,
          stage: stage,
        },
        stateless: {
          runtime: lambdaRuntime,
        },
        env: {
          account: "258763568004", // Your Develop Account ID
          region: region,
        },
      };
  }
};
