export interface CloudflareRecord {
    id: string
    type: string
    name: string
    content: string
    zone_id: string
    record_id: string
}

export interface CloudflareZone {
    id: string
    name: string
}

export interface CloudflareResponse<T> {
    success: boolean
    result: T
    errors: ResponseError[]
}

export interface ResponseError {
    code: number
    message: string
}

export class Cloudflare {
    private apiToken: string

    /**
     * @param apiToken Your Cloudflare API token.
     */
    constructor(apiToken: string) {
        this.apiToken = apiToken
    }

    async request<T>(
        url: string,
        method: string = 'GET',
        body?: BodyInit,
        headers: HeadersInit = {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
        }
    ): Promise<T> {
        const response = await fetch(url, {
            method: method,
            body: body,
            headers: headers,
        })
        const json = (await response.json()) as CloudflareResponse<T>
        if (!json.success) {
            throw new Error(
                `Encountered error during request (${method}) to ${url}:\n${formatErrors(json.errors)}`
            )
        }
        return json.result
    }

    async verifyToken() {
        return this.request(
            'https://api.cloudflare.com/client/v4/user/tokens/verify'
        )
    }

    async updateRecord(
        zoneId: string,
        recordId: string,
        data: object
    ): Promise<CloudflareRecord> {
        const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`
        return await this.request(url, 'PUT', JSON.stringify(data))
    }

    async getZones(): Promise<CloudflareZone[]> {
        return await this.request('https://api.cloudflare.com/client/v4/zones')
    }

    async getRecords(zoneId: string): Promise<CloudflareRecord[]> {
        return await this.request(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`
        )
    }

    async getRecord(
        zoneId: string,
        recordId: string
    ): Promise<CloudflareRecord> {
        return await this.request(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`
        )
    }
}

export function formatErrors(errors: ResponseError[]) {
    return errors.map(e => `  Code ${e.code}: ${e.message}`).join('\n')
}
