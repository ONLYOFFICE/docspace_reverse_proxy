'use strict';

// Redirect from DS to WS if match
const workspaceRegex = /(\/products\/|\/addons\/|.aspx)/i;

if (workspaceRegex.test(request.uri))
{
    const newurl = `https://${tenantDomain.replace('onlyoffice.io', 'teamlab.info')}${request.uri}?${request.querystring}`;
    console.log("redirect to: %s", newurl);
    const response = {
        status: '302',
        statusDescription: 'Found',
        headers: {
            location: [{
                key: 'Location',
                value: newurl,
            }],
        },
    };
    
    return callback(null, response);
    
}