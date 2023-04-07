import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";

export class NextjsS3 extends Construct {
  bucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "next-bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      accessControl: s3.BucketAccessControl.PRIVATE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, "Next bucket", { value: this.bucket.bucketName });
  }
}
