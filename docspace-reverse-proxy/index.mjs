'use strict';

const cachedItem = {};
const regionsMap = {
regionsMap_placeholder
};

const ddbRegionsMap = {
ddbRegionsMap_placeholder
};

const dynamodbTableName = "dynamodb_table_name_placeholder";

const execRegionCode = process.env.AWS_REGION;

var ddbClientRegion = ddbRegionsMap["default"];

if (ddbRegionsMap[execRegionCode]) {
  ddbClientRegion = ddbRegionsMap[execRegionCode];

  console.log("change ddbClient region from %s to %s", ddbRegionsMap["default"], ddbClientRegion);
}

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

async function getTenantRegion(ddbRegion, tenantDomain) {

  console.log("getTenantRegion params ddbRegion: %s, tenantDomain: %s", ddbRegion, tenantDomain);

  const ddbClient = new DynamoDBClient({ region: ddbRegion });

  const getItemParams = {
    Key: {
      'tenant_domain': { S: tenantDomain }
    },
    ProjectionExpression: "tenant_region",
    TableName: dynamodbTableName
  };

  console.log("[DynamoDb] before send command get item %s with tenant domain %s", JSON.stringify(getItemParams), tenantDomain);

  const response = await ddbClient.send(new GetItemCommand(getItemParams));

  console.log("[DynamoDb] responce send command get item %s with tenant domain %s", JSON.stringify(response), tenantDomain);

  if (response && response.Item) {

    const tenantRegion = regionsMap[response.Item["tenant_region"]["S"]];

    console.log("Added item %s to cache with key %s", tenantRegion, tenantDomain);

    return tenantRegion;

  } else {

    console.log("Error recieve data from DynamoDB with tenant domain %s in region %s", tenantDomain, ddbRegion);

    return null;
  }
}

export const handler = async (event, context, callback) => {
  console.log(JSON.stringify(event));

  // Extract the request from the CloudFront event that is sent to Lambda@Edge 
  var request = event.Records[0].cf.request;

  const headers = request.headers;
  let tenantDomain = headers.host[0].value;

  console.log("current tenant_domain from host header: %s", tenantDomain);

  let originDomain;

  if (request.uri.toLowerCase() == "/apisystem/portal/register" && request.method == "POST") {
    console.log("START: Register portal request");

    console.log("Register portal request body %s", request.body);

    let body = JSON.parse(Buffer.from(request.body.data, 'base64').toString('utf8'));
    let regionFromRequest = body["awsRegion"];
    let portalName = body["portalName"];

    if(regionFromRequest !== null && regionFromRequest !== ''  && regionFromRequest!==undefined) {
      regionFromRequest = regionFromRequest.toLowerCase();
    }

    originDomain = regionsMap[regionFromRequest];

    console.log("Register portal request: Origin Domain is %s, awsRegion is %s", originDomain, regionFromRequest);

    if (regionFromRequest == null) {
      console.log("Register portal request: awsRegion param is null. Trying set to default");

      originDomain = regionsMap["default"];
      body["awsRegion"] = ddbRegionsMap["default"];
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

    console.log("END: Register portal request");

    // Return to CloudFront
    return callback(null, request);
  }


  if (cachedItem[tenantDomain] && cachedItem[tenantDomain].expiresOn > Date.now()) {
    originDomain = cachedItem[tenantDomain].value;

    console.log("[CACHE] Recieved item %s from cache with key %s", originDomain, tenantDomain);

  }
  else {
    originDomain = await getTenantRegion(ddbClientRegion, tenantDomain);

    if (originDomain == null) {

      console.log("originDomain is null. Attempt 2. Trying get value from default region %s", ddbRegionsMap["default"]);

      if (ddbRegionsMap["default"] != ddbClientRegion) {
        originDomain = await getTenantRegion(ddbRegionsMap["default"], tenantDomain);
      }

      if (originDomain == null) {
        console.log("originDomain is null. Using default");

        originDomain = regionsMap["default"];
      }
    }
  }

  cachedItem[tenantDomain] = {
    expiresOn: Date.now() + 15 * 60 * 1000, // Set expiry time of 15 minutes
    value: originDomain
  };

  if (originDomain != regionsMap["default"]) {
    request.origin.custom["domainName"] = originDomain;

    console.log("Change request origin to %s", originDomain);
  }

  // Return to CloudFront
  return callback(null, request);
};
