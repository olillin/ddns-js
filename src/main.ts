import fs from 'fs'
import { Validator } from 'jsonschema'
import { Cloudflare } from './cloudflare.js'
import path from 'path'

// Load environment variables
const API_TOKEN =
    process.env.API_TOKEN ??
    (process.env.API_TOKEN_FILE
        ? fs.readFileSync(process.env.API_TOKEN_FILE, 'utf-8')
        : undefined)

const REPEAT_MILLISECONDS =
    process.env.REPEAT_MILLISECONDS ??
    (process.env.REPEAT_MILLISECONDS_FILE
        ? fs.readFileSync(process.env.REPEAT_MILLISECONDS_FILE, 'utf-8')
        : undefined)

if (!API_TOKEN) {
    console.error('Missing required env variable API_TOKEN')
    process.exit()
}

const schemaPath = path.join(process.cwd(), 'resources/config.schema.json')

// Initialize Cloudflare API
const cloudflare = new Cloudflare(API_TOKEN)

interface Configuration {
    records: (RecordDefinition | string)[]
}

interface RecordDefinition {
    zone_id: string
    record_id: string
}

async function main() {
    // Verify Cloudflare API token
    await cloudflare.verifyToken().catch(() => {
        console.error('Invalid API token')
        process.exit()
    })

    // Read records from config.json
    let records: RecordDefinition[] = []

    let schema: object | null = null
    try {
        schema = JSON.parse(fs.readFileSync(schemaPath).toString()) as object
    } catch {
        console.warn('Failed to read schema, config validation skipped')
    }
    try {
        const fileContent = fs.readFileSync('config.json')
        const json = JSON.parse(fileContent.toString()) as Configuration
        if (schema) {
            const validator = new Validator()
            const result = validator.validate(json, schema)
            if (!result.valid) {
                console.error(
                    'config.json is invalid, please make sure the file has the correct format as specified by the schema\nErrors:\n' +
                        result.errors.join('\n')
                )
                process.exit()
            }
        }
        records = await resolveRecords(json.records)
    } catch (e: unknown) {
        console.error('Failed to read records from config.json\nError:', e)
        process.exit()
    }

    if (REPEAT_MILLISECONDS) {
        const repeatMilliseconds = parseInt(REPEAT_MILLISECONDS)
        async function checkRecordsContinuous() {
            await checkRecords(Array.from(records))
            setTimeout(() => {
                checkRecordsContinuous().catch((reason: Error) => {
                    console.error('Failed to repeat record check:', reason)
                })
            }, repeatMilliseconds)
        }
        await checkRecordsContinuous()
    } else {
        await checkRecords(Array.from(records))
    }
}

main().catch(reason => {
    console.error('Fatal error in main:', reason)
})

async function resolveRecords(
    records: (RecordDefinition | string)[]
): Promise<RecordDefinition[]> {
    const result: RecordDefinition[] = []
    await Promise.all(
        records.map(async record => {
            if (typeof record === 'string') {
                const resolved = await resolveName(record)
                if (!resolved) {
                    console.error(`Unable to find record ${record}`)
                    process.exit()
                }
                console.log(
                    `Resolved name ${record} to ${JSON.stringify(resolved)}`
                )
                result.push(resolved)
            } else if (typeof record === 'object') {
                result.push(record)
            } else {
                throw new Error(`Illegal record type ${typeof record}`)
            }
        })
    )
    return result
}

/**
 * Resolve a domain name to its zone and record IDs.
 * Returns undefined if no record with the domain name could be found.
 *
 * @param name The domain name of the record
 * @returns The resolved record.
 */
async function resolveName(name: string): Promise<RecordDefinition | null> {
    const zones = await cloudflare.getZones()
    const segments = name.split('.')
    for (let i = -1; i >= -segments.length; i--) {
        // Find domain
        const domain = segments.slice(i).join('.')
        const zone = zones.find(zone => zone.name === domain)?.id
        if (!zone) {
            continue
        }
        // Find subdomain
        const zoneRecords = await cloudflare.getRecords(zone)
        const zoneRecord = zoneRecords.find(
            zoneRecord => zoneRecord.name === name
        )?.id
        if (!zoneRecord) {
            continue
        }

        return {
            zone_id: zone,
            record_id: zoneRecord,
        }
    }

    return null
}

/**
 * Get the public IP address of this server.
 */
async function getPublicIp(): Promise<string> {
    const response = await fetch('https://api.ipify.org')
    return await response.text()
}

/**
 * Check if a record's content matches an IP address and update if it does not.
 *
 * @param zoneId The id of the zone that the record belongs to
 * @param recordId
 * @param ip
 */
async function checkRecord(
    zoneId: string,
    recordId: string,
    ip: string
): Promise<void> {
    console.log(`\nChecking DNS record ${zoneId}/${recordId}`)

    const record = await cloudflare
        .getRecord(zoneId, recordId)
        .catch((reason: Error) => {
            console.warn(`Failed to get DNS record:\n${reason}`)
            throw reason
        })
    if (record.type !== 'A') {
        console.error(
            `Record has unsupported type, expected A but got ${record.type}`
        )
        throw new Error(
            `Record has unsupported type, expected A but got ${record.type}`
        )
    }

    // Compare IP addresses
    console.log(`DNS record IP: ${record.content}\nPublic IP:     ${ip}`)
    if (record.content !== ip) {
        console.log('IP does not match, updating DNS record...')
        record.content = ip
        const response = await cloudflare
            .updateRecord(zoneId, recordId, record)
            .catch((reason: Error) => {
                console.warn(`Failed to update DNS record:\n${reason}`)
                throw reason
            })
        console.log(`DNS record has been updated, new IP: ${response.content}`)
    } else {
        console.log('IP matches, no action has been taken')
        return
    }
}

async function safeCheckRecord(
    record: RecordDefinition,
    ip: string
): Promise<void> {
    const zoneId = record.zone_id
    const recordId = record.record_id
    if (!zoneId?.match(/^[a-z0-9]{32}$/)) {
        const reason = `Invalid zone id: ${zoneId}`
        console.error(reason)
        throw new Error(reason)
    }
    if (!recordId?.match(/^[a-z0-9]{32}$/)) {
        const reason = `Invalid record id: ${recordId}`
        console.error(reason)
        throw new Error(reason)
    }
    await checkRecord(zoneId, recordId, ip)
}

async function checkRecords(records: RecordDefinition[]): Promise<void> {
    console.log('\nChecking records...')
    const ip = await getPublicIp()
    if (!ip) {
        console.error('Failed to get public IP')
        throw new Error('Failed to get public IP')
    }

    records.reverse()
    while (records.length > 0) {
        const record = records.pop()!
        await safeCheckRecord(record, ip)
    }
}
