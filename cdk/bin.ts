#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NextjsCdkStack } from "./nextjs-cdk-stack";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage");
if (stage === undefined) {
  throw new Error(`no stage found`);
}

const fqdn = app.node.tryGetContext("fqdn");
if (fqdn === undefined) {
  throw new Error(`no fqdn found`);
}

const certificateArn = app.node.tryGetContext("certificateArn");
if (certificateArn === undefined) {
  throw new Error(`no certificateArn found`);
}

new NextjsCdkStack(app, `calendar-frontend-${stage}`, {
  certificateArn: certificateArn,
  fqdn: fqdn,
  stage: stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
