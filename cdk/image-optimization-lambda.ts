import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as path from "path";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";

interface ImageOptimizationLambdaProps {
  bucket: s3.Bucket;
}

export class ImageOptimizationLambda extends NodejsFunction {
  bucket: s3.Bucket;

  constructor(
    scope: Construct,
    id: string,
    props: ImageOptimizationLambdaProps
  ) {
    const { bucket } = props;

    const imageHandlerPath = path.resolve(
      __dirname,
      "./handlers/image-handler.ts"
    );

    const layer = new lambda.LayerVersion(scope, "sharp-layer", {
      code: lambda.Code.fromAsset(
        path.join(__dirname, "./layers/sharp-layer.zip")
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      license: "Apache-2.0",
      description: "Sharp for Lambdas",
    });

    super(scope, id, {
      entry: imageHandlerPath,
      handler: "handler",
      memorySize: 1024,
      timeout: Duration.seconds(10),
      layers: [layer],
      bundling: {
        minify: true,
        target: "node16",
        externalModules: ["sharp"],
      },
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.X86_64,
      environment: {
        S3_SOURCE_BUCKET: bucket.bucketName,
      },
      currentVersionOptions: {
        removalPolicy: RemovalPolicy.DESTROY,
      },
    });

    this.bucket = bucket;
    this.addPolicy();
  }

  /**
   * Adds policy statement to give GetObject permission Image Optimization lambda.
   */
  private addPolicy(): void {
    const policyStatement = new PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [this.bucket.arnForObjects("*")],
    });

    this.role?.attachInlinePolicy(
      new Policy(this, "get-image-policy", {
        statements: [policyStatement],
      })
    );
  }
}
