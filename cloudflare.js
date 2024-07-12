class Cloudflare {
    /** @param {string} apiToken Your Cloudflare API token */
    constructor(apiToken) {
        this.apiToken = apiToken
    }

    request(
        url,
        method = 'GET',
        body,
        headers = {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
        }
    ) {
        return new Promise((resolve, reject) => {
            fetch(url, {
                method: method,
                body: body,
                headers: headers,
            })
                .then(response => {
                    return response.json()
                })
                .then(json => {
                    if (!json.success) {
                        reject(`Encountered error during request (${method}) to ${url}:\n${formatErrors(json.errors)}`)
                    } else {
                        resolve(json.result)
                    }
                })
        })
    }

    verifyToken() {
        return this.request('https://api.cloudflare.com/client/v4/user/tokens/verify')
    }

    updateRecord(zoneId, recordId, data) {
        const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`
        return this.request(url, 'PUT', JSON.stringify(data))
    }

    getZones() {
        return this.request('https://api.cloudflare.com/client/v4/zones')
    }

    getRecords(zoneId) {
        return this.request(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`)
    }

    getRecord(zoneId, recordId) {
        return this.request(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`)
    }
}

function formatErrors(errors) {
    return errors.map(e => `  Code ${e.code}: ${e.message}`).join('\n')
}

module.exports = { Cloudflare, formatErrors }
