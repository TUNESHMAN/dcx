#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { envVar, Stage } from "@leighton-digital/lambda-toolkit";
import { DcxStack } from "../lib/dcx-stack";
import { getEnvironmentConfig } from "../app-config/app-config";
import { resourceNameForStage } from "../utils/naming";

const stage = envVar.getString("STAGE") as Stage;
const appConfig = getEnvironmentConfig(stage);

const app = new cdk.App();
new DcxStack(app, resourceNameForStage("DcxStack", stage), appConfig);
