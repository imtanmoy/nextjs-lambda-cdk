import { Construct } from "constructs";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { Duration } from "aws-cdk-lib";

interface NextjsAssetDeploymentsProps {
  staticDir: string;
  publicStaticDir: string;
  bucket: s3.Bucket;
  cloudfrontDistribution: cloudfront.Distribution;
}

export class NextjsAssetDeployments extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: NextjsAssetDeploymentsProps
  ) {
    super(scope, id);

    const { staticDir, publicStaticDir, bucket, cloudfrontDistribution } =
      props;

    const maxAge = Duration.days(30).toSeconds();
    const staleWhileRevalidate = Duration.days(1).toSeconds();

    const cacheControl = s3deploy.CacheControl.fromString(
      `public,max-age=${maxAge},stale-while-revalidate=${staleWhileRevalidate},immutable`
    );

    new s3deploy.BucketDeployment(this, "deploy-next-static-bucket", {
      sources: [s3deploy.Source.asset(staticDir)],
      destinationBucket: bucket,
      destinationKeyPrefix: "_next/static",
      distribution: cloudfrontDistribution,
      distributionPaths: ["/_next/static/*"],
      prune: true,
      cacheControl: [cacheControl],
    });

    new s3deploy.BucketDeployment(this, "deploy-next-public-bucket", {
      sources: [s3deploy.Source.asset(publicStaticDir)],
      destinationBucket: bucket,
      destinationKeyPrefix: "static",
      distribution: cloudfrontDistribution,
      distributionPaths: ["/static/*"],
      prune: true,
      cacheControl: [cacheControl],
    });
  }
}
