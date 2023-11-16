'use strict';

const cachedItem = {};
const regionsMap = {
  "default": "default_region_elb_placeholder",
  "eu-central-1": "eu_central_1_region_elb_placeholder",
  "us-east-2": "us_east_2_region_elb_placeholder"
};
const ddbRegionsMap = {
  "default": "us-east-1",
  "us-east-1": "us-east-1",
  "eu-central-1": "eu-central-1",
  "eu-west-1": "eu-central-1",
  "us-east-2": "us-east-2"
};

const dynamodbTableName = "dynamodb_table_name_placeholder";

const execRegionCode = process.env.AWS_REGION;

var ddbClientRegion = ddbRegionsMap["default"];

if (ddbRegionsMap[execRegionCode]) {
  ddbClientRegion = ddbRegionsMap[execRegionCode];

  console.log("change ddbClient region from %s to %s", ddbRegionsMap["default"], ddbClientRegion);
}

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const ddbClient = new DynamoDBClient({ region: ddbClientRegion });

export const handler = async (event, context, callback) => {
  console.log(JSON.stringify(event));

  // Extract the request from the CloudFront event that is sent to Lambda@Edge 
  var request = event.Records[0].cf.request;

  const headers = request.headers;
  let tenantDomain = headers.host[0].value;

  console.log("current tenant_domain from host header: %s", tenantDomain);

  let originDomain;

  if (request.uri == "/apisystem/portal/register" && request.method == "POST") {
    console.log("this is body %s", request.body);

    let body = JSON.parse(Buffer.from(request.body.data, 'base64').toString('utf8'));
    let regionFromRequest = body["awsRegion"];
    let portalName = body["portalName"];

    originDomain = regionsMap[regionFromRequest];

    console.log("Register portal request: Origin Domain is %s, awsRegion is %s", originDomain, regionFromRequest);

    if (regionFromRequest == null) {
      console.log("Register portal request: awsRegion param is null. Trying set to default");

      body["awsRegion"] = "eu-central-1";
      request.body.data = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
      request.body.action = "replace";

      console.log(request.body.data);

    }

    if (originDomain == null) {
      originDomain = regionsMap["default"];
    }

    console.log("Register portal request: portalName: %s, regionFromRequest: %s, originDomain: %s", portalName, regionFromRequest, originDomain);

    if (originDomain != regionsMap["default"]) {
      request.origin.custom["domainName"] = originDomain;
      console.log("Register portal request: Change request origin to %s", originDomain);
    }


    console.log("request after changed %s", JSON.stringify(request));

    // Return to CloudFront
    return callback(null, request);
  }


  if (cachedItem[tenantDomain] && cachedItem[tenantDomain].expiresOn > Date.now()) {
    originDomain = cachedItem[tenantDomain].value;

    console.log("[CACHE] Recieved item %s from cache with key %s", originDomain, tenantDomain);

  }
  else {

    const getItemParams = {
      Key: {
        'tenant_domain': { S: tenantDomain }
      },
      ProjectionExpression: "tenant_region",
      TableName: dynamodbTableName
    };

    console.log("[DynamoDb] before send command get item %s with tenant domain %s", getItemParams, tenantDomain);

    const responce = await ddbClient.send(new GetItemCommand(getItemParams));

    console.log("[DynamoDb] responce send command get item %s with tenant domain %s", responce, tenantDomain);

    if (responce && responce.Item) {

      originDomain = regionsMap[responce.Item["tenant_region"]["S"]];

      console.log("Added item %s to cache with key %s", originDomain, tenantDomain);


    } else {

      originDomain = regionsMap["default"];

      console.log("Error recieve data from DynamoDB with tenant domain %s", tenantDomain);

    }
  }

  cachedItem[tenantDomain] = {
    expiresOn: Date.now() + 24 * 3600 * 1000, // Set expiry time of 24H
    value: originDomain
  };

  if (originDomain != regionsMap["default"]) {
    request.origin.custom["domainName"] = originDomain;

    console.log("Change request origin to %s", originDomain);
  }

  // Return to CloudFront
  return callback(null, request);
};