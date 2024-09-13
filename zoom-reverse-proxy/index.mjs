'use strict';

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const DEBUG_MODE_ON = true;

if (!DEBUG_MODE_ON) {
    console = console || {};
    console.log = function(){};
}

const cachedItem = {};
const regionsMap = {
  regionsMap_placeholder
};

const ddbRegionsMap = {
    ddbRegionsMap_placeholder
};

const dynamodbTableName = "dynamodb_table_name_placeholder";

const execAWSRegion = process.env.AWS_REGION;

var ddbClientRegion = ddbRegionsMap["default"];

if (ddbRegionsMap[execAWSRegion]) {
    ddbClientRegion = ddbRegionsMap[execAWSRegion];
    console.log("change ddbClient region from %s to %s", ddbRegionsMap["default"], ddbClientRegion);
}

var ddbClient = null;
var ddbClientDefault = null;

function getDynamoDBClient(ddbRegion) {
    if (ddbRegion == ddbRegionsMap["default"]) {
        if (ddbClientDefault == null) {
            ddbClientDefault = new DynamoDBClient({ region: ddbRegionsMap["default"] });
        }
        return ddbClientDefault;
    } else {
        if (ddbClient == null) {
            ddbClient = new DynamoDBClient({ region: ddbRegion });
        }
        return ddbClient;
    }
}

async function getTenantRegion(ddbRegion, tenantDomain) {
    console.log("getTenantRegion params ddbRegion: %s, tenantDomain: %s", ddbRegion, tenantDomain);

    const getItemParams = {
        Key: {
            "tenant_domain": { S: tenantDomain }
        },
        ProjectionExpression: "tenant_region",
        TableName: dynamodbTableName
    };

    console.log(`[DynamoDb] before send GetItemCommand ${JSON.stringify(getItemParams)} with tenant domain ${tenantDomain}`);

    const start = Date.now();

    const response = await getDynamoDBClient(ddbRegion).send(new GetItemCommand(getItemParams));

    const end = Date.now();

    console.log(`[DynamoDb] after send GetItemCommand ${JSON.stringify(response)} with tenant domain ${tenantDomain}. Execution time: ${end - start} `);

    if (response && response.Item) {
        const tenantRegion = regionsMap[response.Item["tenant_region"]["S"]];
        console.log("Added item %s to cache with key %s", tenantRegion, tenantDomain);
        return tenantRegion;
    } else {
        console.log("Error receive data from DynamoDB with tenant domain %s in region %s", tenantDomain, ddbRegion);
        return null;
    }
}

// Function to extract the second-level domain (e.g., name2.example.com from name2.name1.example.com)
function extractSecondLevelDomain(tenantDomain) {
    const domainParts = tenantDomain.split('.');
    if (domainParts.length > 3) {
        // Return the first part (subdomain) and the last two parts (main domain and TLD)
        return `${domainParts[0]}.${domainParts.slice(-2).join('.')}`;
    }
    return tenantDomain;
}

export const handler = async (event, context, callback) => {
    console.log(JSON.stringify(event));

    // Extract the request from the CloudFront event that is sent to Lambda@Edge 
    var request = event.Records[0].cf.request;

    const headers = request.headers;
    let tenantDomain = headers.host[0].value;

    console.log("current tenant_domain from host header: %s", tenantDomain);

    // Parse the domain to check if it's name1.example.com or name2.name1.example.com
    let domainParts = tenantDomain.split('.');

    let originDomain;
    let port;

    // If domain is in the format name1.example.com (exactly three parts)
    if (domainParts.length === 3) {
        console.log("Domain has three parts. Using default region and port 8094.");
        originDomain = regionsMap["default"];
        port = 8094;
    } 
    // If domain is in the format name2.name1.example.com (four or more parts)
    else if (domainParts.length > 3) {
        tenantDomain = extractSecondLevelDomain(tenantDomain);
        console.log("Transformed tenant_domain: %s", tenantDomain);

        // Use cached value if available
        if (cachedItem[tenantDomain] && cachedItem[tenantDomain].expiresOn > Date.now()) {
            originDomain = cachedItem[tenantDomain].value;
            console.log("[CACHE] Received item %s from cache with key %s", originDomain, tenantDomain);
        } else {
            originDomain = await getTenantRegion(ddbClientRegion, tenantDomain);

            if (originDomain == null) {
                console.log("originDomain is null. Attempt 2. Trying to get value from default region %s", ddbRegionsMap["default"]);

                if (ddbRegionsMap["default"] != ddbClientRegion) {
                    originDomain = await getTenantRegion(ddbRegionsMap["default"], tenantDomain);
                }

                if (originDomain == null) {
                    console.log("originDomain is null. Using default domain and port 8094");
                    originDomain = regionsMap["default"];
                    port = 8094;
                } else {
                    port = 8093;
                }
            } else {
                port = 8093;
            }

            // Cache the result for 15 minutes
            cachedItem[tenantDomain] = {
                expiresOn: Date.now() + 15 * 60 * 1000,
                value: originDomain
            };
        }
    } else {
        // Fallback case (just in case)
        console.log("Unexpected domain format. Using default settings.");
        originDomain = regionsMap["default"];
        port = 8094;  // Default to port 8094 if domain format is unexpected
    }

    // Set the origin and port for the request
    request.origin.custom["domainName"] = originDomain;
    request.origin.custom["port"] = port;

    console.log("Change request origin to %s with port %d", originDomain, port);

    // Return to CloudFront
    return callback(null, request);
};
