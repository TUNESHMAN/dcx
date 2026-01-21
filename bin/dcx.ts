#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { envVar, Stage } from "@leighton-digital/lambda-toolkit";

// import { DcxStack } from "../lib/dcx-stack";
import { getEnvironmentConfig } from "../app-config/app-config";
import { resourceNameForStage } from "../utils/naming";
import { DCXStatelessStack } from "../stateless/stateless";
import { DCXStatefulStack } from "../stateful/stateful";

const stage = envVar.getString("STAGE") as Stage;
const appConfig = getEnvironmentConfig(stage);

const app = new cdk.App();

const statefulStack = new DCXStatefulStack(
  app,
  resourceNameForStage("DCXStatefulStack", stage),
  appConfig
);
new DCXStatelessStack(app, resourceNameForStage("DCXStatelessStack", stage), {
  ...appConfig,
  dcxIdempotencyTable: statefulStack.dcxIdempotencyTable,
  consultancyLogosBucket: statefulStack.consultancyLogosBucket,
  dsqlCluster: statefulStack.dsqlCluster,
  consultancyLogosCdnDomain: statefulStack.consultancyLogosCdnDomain,
});

// statelessStack.addDependency(statefulStack);
// new DcxStack(app, resourceNameForStage("DcxStack", stage), appConfig);
