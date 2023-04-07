import { Construct } from "constructs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { CfnOutput, Duration, Fn } from "aws-cdk-lib";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apiGateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import { getDomain, getDomains, isValidDomain, isSubdomain } from "./utils";

interface NextjsDistributionProps {
  api: apiGateway.RestApi;
  bucket: s3.Bucket;
  imageOptFunction: lambda.IFunction;
  fqdn: string;
  certificateArn: string;
}

export class NextjsDistribution extends Construct {
  cloudfrontDistribution: cloudfront.Distribution;

  public static imageOptimizationOriginRequestPolicyProps: cloudfront.OriginRequestPolicyProps =
    {
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      headerBehavior:
        cloudfront.OriginRequestHeaderBehavior.allowList("accept"),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
      comment: "Nextjs Image Optimization Origin Request Policy",
    };

  public static imageCachePolicyProps: cloudfront.CachePolicyProps = {
    queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
    headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Accept"),
    cookieBehavior: cloudfront.CacheCookieBehavior.none(),
    defaultTtl: Duration.days(1),
    maxTtl: Duration.days(365),
    minTtl: Duration.days(0),
    enableAcceptEncodingBrotli: true,
    enableAcceptEncodingGzip: true,
    comment: "Nextjs Image Default Cache Policy",
  };

  constructor(scope: Construct, id: string, props: NextjsDistributionProps) {
    super(scope, id);

    const { api, bucket, imageOptFunction, fqdn, certificateArn } = props;

    if (!isValidDomain(fqdn)) {
      throw new Error("Invalid domain name");
    }

    const imageOptFunctionOrigin =
      this.getImageOptimizationFunctionOrigin(imageOptFunction);

    const certificate = this.getAcmCertificate(certificateArn);

    this.cloudfrontDistribution = this.createCloudFrontDistribution(
      imageOptFunctionOrigin,
      api,
      bucket,
      certificate,
      fqdn
    );

    this.createRoute53Records(fqdn, this.cloudfrontDistribution);

    new CfnOutput(this, "CloudFront URL", {
      value: `https://${this.cloudfrontDistribution.distributionDomainName}`,
    });

    new CfnOutput(this, "DistributionID", {
      value: this.cloudfrontDistribution.distributionId,
    });
  }

  private createCloudFrontImageCachePolicy(): cloudfront.CachePolicy {
    return new cloudfront.CachePolicy(
      this,
      "ImageCachePolicy",
      NextjsDistribution.imageCachePolicyProps
    );
  }

  private createImageOptimizationOriginRequestPolicy(): cloudfront.OriginRequestPolicy {
    return new cloudfront.OriginRequestPolicy(
      this,
      "ImageOptimizationOriginRequestPolicy",
      NextjsDistribution.imageOptimizationOriginRequestPolicyProps
    );
  }

  private createCloudFrontDistribution(
    imageOptFunctionOrigin: origins.HttpOrigin,
    api: apiGateway.RestApi,
    bucket: s3.Bucket,
    certificate: acm.ICertificate,
    fqdn: string
  ): cloudfront.Distribution {
    const imageCachePolicy = this.createCloudFrontImageCachePolicy();
    const imageOptORP = this.createImageOptimizationOriginRequestPolicy();

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      "OAI",
      {
        comment: "Nextjs Static Assets Origin Access Identity",
      }
    );

    return new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.RestApiOrigin(api),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        compress: true,
      },
      additionalBehaviors: {
        "_next/image*": {
          origin: imageOptFunctionOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: imageCachePolicy,
          originRequestPolicy: imageOptORP,
          compress: true,
        },
        "_next/static/*": {
          origin: new origins.S3Origin(bucket, {
            originAccessIdentity: originAccessIdentity,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          compress: true,
        },
        "static/*": {
          origin: new origins.S3Origin(bucket, {
            originAccessIdentity: originAccessIdentity,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          compress: true,
        },
      },
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2018,
      certificate,
      domainNames: getDomains(fqdn),
    });
  }

  private getImageOptimizationFunctionOrigin(
    imageOptFunction: lambda.IFunction
  ): origins.HttpOrigin {
    const imageOptFnUrl = imageOptFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    return new origins.HttpOrigin(Fn.parseDomainName(imageOptFnUrl.url));
  }

  private getAcmCertificate(certificateArn: string): acm.ICertificate {
    return acm.Certificate.fromCertificateArn(
      this,
      "Certificate",
      certificateArn
    );
  }

  private createRoute53Records(
    fqdn: string,
    cloudFrontDistribution: cloudfront.Distribution
  ): void {
    const domainName = getDomain(fqdn);

    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName,
    });

    // if fqdn does not have a subdomain, then create a A record for the root domain with alias to the www else create a CNAME record for the subdomain
    if (!isSubdomain(fqdn)) {
      new route53.ARecord(this, "Route53RecordSet", {
        zone: zone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(cloudFrontDistribution)
        ),
      });

      // create a alias record for the www subdomain
      new route53.CnameRecord(this, `Route53CnameRecordSet`, {
        zone: zone,
        recordName: `www.${domainName}`,
        domainName: cloudFrontDistribution.distributionDomainName,
      });
    } else {
      new route53.CnameRecord(this, `Route53CnameRecordSet`, {
        zone: zone,
        recordName: fqdn,
        domainName: cloudFrontDistribution.distributionDomainName,
      });
    }

    new CfnOutput(this, "FQDN", {
      value: fqdn,
    });
  }
}
