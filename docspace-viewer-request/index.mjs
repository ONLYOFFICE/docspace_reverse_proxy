'use strict';

export const handler = async (event, context, callback) => {
    console.log(JSON.stringify(event));
  
    // Extract the request from the CloudFront event that is sent to Lambda@Edge 
    var request = event.Records[0].cf.request;
  
    const headers = request.headers;
    let tenantDomain = headers.host[0].value;

    console.log("Tenant domain: %s", tenantDomain);

    const editorPageRegex = /\/Products\/Files\/DocEditor\.aspx/i;

    if (editorPageRegex.test(request.uri))
    {
        const newurl = `https://${tenantDomain.replace(domain_name_replace_placeholder)}${request.uri}?${request.querystring}`;
        console.log("redirect to: %s", newurl);

        const response = {
            status: '302',
            statusDescription: 'Found',
            headers: {
                location: [{
                    key: 'Location',
                    value: newurl,
                }],
                'cache-control': [{ // Add cache-control header
                    key: 'Cache-Control',
                    value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
                }],
            },
        };
        
        return callback(null, response);   
    }

    return callback(null, request);
}