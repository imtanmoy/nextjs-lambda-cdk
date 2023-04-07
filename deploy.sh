#!/bin/bash

set -ex

if [[ -z $1 ]]; then
    echo "STAGE is unset or set to the empty string"
    exit 1
fi

STAGE=$1
FQDN="$STAGE.example.com"
CERTIFICATE_ARN="arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"

if [[ "$STAGE" == "prod" ]]; then
    FQDN="example.com"
fi

echo "Building and deploying to $1"

# Build the project
npm run build

cat >.next/standalone/run.sh <<EOF
#!/bin/bash

set -ex

export NODE_ENV=production
export PORT=8080

node server.js
EOF

chmod +x .next/standalone/run.sh

# copy the public folder to the build folder without the static folder in it
cp -r public .next/standalone
rm -rf .next/standalone/public/static

cdk deploy \
    --require-approval never \
    --context stage=$STAGE \
    --context fqdn=$FQDN \
    --context certificateArn=$CERTIFICATE_ARN
