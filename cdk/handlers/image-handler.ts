// Taken from: https://github.com/sladg/nextjs-lambda/blob/master/lib/standalone/image-handler.ts
// There are other open source MIT libraries we can pick, but this seems the most straightforward

process.env.NODE_ENV = "production";
process.env.NEXT_SHARP_PATH = require.resolve("sharp");

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  defaultConfig,
  NextConfigComplete,
} from "next/dist/server/config-shared";
import { ImageConfigComplete } from "next/dist/shared/lib/image-config";
import {
  imageOptimizer,
  ImageOptimizerCache,
} from "next/dist/server/image-optimizer";
import { IncomingMessage, ServerResponse } from "node:http";
import { NextUrlWithParsedQuery } from "next/dist/server/request-meta";

const sourceBucket = process.env.S3_SOURCE_BUCKET ?? undefined;

const nextConfig: NextConfigComplete = {
  ...(defaultConfig as NextConfigComplete),
  images: {
    ...(defaultConfig.images as ImageConfigComplete),
  },
};

// Make header keys lowercase to ensure integrity.
const normalizeHeaders = (headers: Record<string, any>) =>
  Object.entries(headers).reduce(
    (acc, [key, value]) => ({ ...acc, [key.toLowerCase()]: value }),
    {} as Record<string, string>
  );

const requestHandler = async (
  req: IncomingMessage,
  res: ServerResponse,
  url?: NextUrlWithParsedQuery
) => {
  if (!url) {
    throw new Error("URL is missing from request.");
  }

  if (!sourceBucket) {
    throw new Error("S3_SOURCE_BUCKET is missing from environment.");
  }

  if (url?.href.toLowerCase().startsWith("http")) {
    const response = await fetch(url.href);
    if (!response.ok) {
      throw new Error(`Could not fetch image from ${origin}.`);
    }
    res.statusCode = response.status;
    const upstreamType = response.headers.get("Content-Type");
    const originCacheControl = response.headers.get("Cache-Control");

    if (upstreamType) {
      res.setHeader("Content-Type", upstreamType);
    }

    if (originCacheControl) {
      res.setHeader("Cache-Control", originCacheControl);
    }

    const upstreamBuffer = Buffer.from(await response.arrayBuffer());
    res.write(upstreamBuffer);
    res.end();
  } else {
    const trimmedKey = url.href.startsWith("/")
      ? url.href.substring(1)
      : url.href;

    const client = new S3Client({});
    const response = await client.send(
      new GetObjectCommand({ Bucket: sourceBucket, Key: trimmedKey })
    );
    if (!response.Body) {
      throw new Error(`Could not fetch image ${trimmedKey} from bucket.`);
    }

    res.statusCode = 200;

    if (response.ContentType) {
      res.setHeader("Content-Type", response.ContentType);
    }

    if (response.CacheControl) {
      res.setHeader("Cache-Control", response.CacheControl);
    }
    const upstreamBuffer = Buffer.from(
      await response.Body.transformToByteArray()
    );
    res.write(upstreamBuffer);
    res.end();
  }
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!sourceBucket) {
      throw new Error("Bucket name must be defined!");
    }

    const url = event.queryStringParameters?.url || "";

    // This will reject if the image url is not in the acceptable domains
    // specified in the user's next.config.js config: `domains` and/or `remotePatterns`
    const imageParams = ImageOptimizerCache.validateParams(
      { headers: event.headers } as any,
      event.queryStringParameters!,
      nextConfig,
      false
    );

    if ("errorMessage" in imageParams) {
      throw new Error(imageParams.errorMessage);
    }

    const optimizedResult = await imageOptimizer(
      { headers: normalizeHeaders(event.headers) } as any,
      {} as any, // res object is not necessary as it's not actually used.
      imageParams,
      nextConfig,
      false, // not in dev mode
      requestHandler
    );

    return {
      statusCode: 200,
      body: optimizedResult.buffer.toString("base64"),
      isBase64Encoded: true,
      headers: {
        Vary: "Accept",
        "Cache-Control": `public,max-age=${optimizedResult.maxAge},immutable`,
        "Content-Type": optimizedResult.contentType,
      },
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500,
      headers: {
        Vary: "Accept",
        // For failed images, allow client to retry after 1 hour.
        "Cache-Control": `public,max-age=3600,immutable`,
        "Content-Type": "application/json",
      },
      body: error?.message || error?.toString() || error,
    };
  }
};
