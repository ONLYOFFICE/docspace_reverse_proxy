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

console.log("DynamoDB client region set to: %s", ddbClientRegion);

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

async function getTenantRegion(ddbRegion, tenantDomain) {
  console.log("Fetching tenant region for domain: %s from DynamoDB region: %s", tenantDomain, ddbRegion);
  const ddbClient = new DynamoDBClient({ region: ddbRegion });
  const getItemParams = {
    Key: { 'tenant_domain': { S: tenantDomain } },
    ProjectionExpression: "tenant_region",
    TableName: dynamodbTableName
  };

  try {
    const response = await ddbClient.send(new GetItemCommand(getItemParams));
    if (response.Item) {
      const tenantRegion = regionsMap[response.Item["tenant_region"]["S"]];
      console.log("Tenant region fetched: %s", tenantRegion);
      return tenantRegion;
    } else {
      console.warn("No data found for domain: %s", tenantDomain);
      return null;
    }
  } catch (err) {
    console.error("Error fetching from DynamoDB: %s", err);
    return null;
  }
}

export async function handler(event) {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  const fullDomain = headers.host[0].value.toLowerCase();
  const domainParts = fullDomain.split('.');

  if (domainParts.length === 4 && domainParts[1] === 'devops' && domainParts[2] === 'onlyoffice' && domainParts[3] === 'io') {
    const tenantDomain = fullDomain;

    // Check the cache first
    if (cachedItem[tenantDomain] && cachedItem[tenantDomain].expiresOn > Date.now()) {
      request.origin.custom.domainName = cachedItem[tenantDomain].value;
      console.log("Origin fetched from cache for domain: %s", tenantDomain);
    } else {
      // Fetch the region from DynamoDB and update the origin
      const tenantRegion = await getTenantRegion(ddbClientRegion, tenantDomain);
      if (tenantRegion) {
        request.origin.custom.domainName = tenantRegion;
        cachedItem[tenantDomain] = {
          value: tenantRegion,
          expiresOn: Date.now() + 15 * 60 * 1000 // Cache for 15 minutes
        };
        console.log("Origin updated to %s for domain: %s", tenantRegion, tenantDomain);
      } else {
        request.origin.custom.domainName = regionsMap["default"];
        console.log("Default origin (%s) used for domain: %s", regionsMap["default"], tenantDomain);
      }
    }
  }

  return request;
}
