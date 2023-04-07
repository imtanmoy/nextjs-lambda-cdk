import { Construct } from "constructs";
import { Function } from "aws-cdk-lib/aws-lambda";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as apiGateway from "aws-cdk-lib/aws-apigateway";

interface NextJsLambdaProps {
  region: string;
  codeDir: string;
}

export class NextJsLambda extends Construct {
  lambdaFunction: Function;
  apiGateway: apiGateway.RestApi;

  constructor(scope: Construct, id: string, props: NextJsLambdaProps) {
    super(scope, id);

    const lambdaAdapterLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "LambdaAdapterLayerX86",
      `arn:aws:lambda:${props.region}:753240598075:layer:LambdaAdapterLayerX86:15`
    );

    this.lambdaFunction = new lambda.Function(this, "NextCdkFunction", {
      memorySize: 1024,
      timeout: Duration.seconds(10),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "run.sh",
      code: lambda.Code.fromAsset(props.codeDir),
      architecture: lambda.Architecture.X86_64,
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        RUST_LOG: "info",
        PORT: "8080",
      },
      layers: [lambdaAdapterLayer],
      currentVersionOptions: {
        removalPolicy: RemovalPolicy.DESTROY,
      },
    });

    this.apiGateway = new apiGateway.RestApi(this, "api", {
      defaultCorsPreflightOptions: {
        allowOrigins: apiGateway.Cors.ALL_ORIGINS,
        allowMethods: apiGateway.Cors.ALL_METHODS,
      },
    });

    const nextCdkFunctionIntegration = new apiGateway.LambdaIntegration(
      this.lambdaFunction,
      {
        allowTestInvoke: false,
      }
    );
    this.apiGateway.root.addMethod("ANY", nextCdkFunctionIntegration);

    this.apiGateway.root.addProxy({
      defaultIntegration: new apiGateway.LambdaIntegration(
        this.lambdaFunction,
        {
          allowTestInvoke: false,
        }
      ),
      anyMethod: true,
    });
  }
}
