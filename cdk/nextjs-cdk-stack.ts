import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { ImageOptimizationLambda } from "./image-optimization-lambda";
import { NextjsAssetDeployments } from "./nextjs-asset-deployments";
import { NextjsDistribution } from "./nextjs-distribution";
import { NextJsLambda } from "./nextjs-lambda";
import { NextjsS3 } from "./nextjs-s3";

interface NextjsCdkStackProps extends StackProps {
  readonly fqdn: string;
  readonly certificateArn: string;
  readonly stage: string;
}

export class NextjsCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: NextjsCdkStackProps) {
    const { fqdn, certificateArn, stage, ...rest } = props;
    super(scope, id, rest);

    const codeDir = path.join(__dirname, "../.next/standalone");
    const staticDir = path.join(__dirname, "../.next/static");
    const publicStaticDir = path.join(__dirname, "../public/static");

    const lambda = new NextJsLambda(this, "NextjsLambda", {
      region: this.region,
      codeDir,
    });

    const bucket = new NextjsS3(this, "NextjsS3");

    const imageOptimizationLambda = new ImageOptimizationLambda(
      this,
      "ImageOptimizationLambda",
      {
        bucket: bucket.bucket,
      }
    );

    const cloudfrontDistribution = new NextjsDistribution(
      this,
      "NextjsCloudfrontDistribution",
      {
        api: lambda.apiGateway,
        bucket: bucket.bucket,
        imageOptFunction: imageOptimizationLambda,
        fqdn,
        certificateArn,
      }
    );

    new NextjsAssetDeployments(this, "NextjsAssetDeployments", {
      staticDir,
      publicStaticDir,
      bucket: bucket.bucket,
      cloudfrontDistribution: cloudfrontDistribution.cloudfrontDistribution,
    });
  }
}
