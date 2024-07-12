const fs = require('fs')
const Validator = require('jsonschema').Validator
const { Cloudflare, formatErrors } = require('./cloudflare.js')

// Load environment variables
const { API_TOKEN, REPEAT_MILLISECONDS } = process.env
if (!API_TOKEN) {
    console.error('Missing required env variable API_TOKEN')
    process.exit()
}

// Initialize Cloudflare API
const cloudflare = new Cloudflare(API_TOKEN)

;(async function main() {
    // Verify Cloudflare API token
    await cloudflare.verifyToken().catch(reason => {
        console.error('Invalid API token')
        process.exit()
    })

    // Read records from config.json
    let records = []

    var schema
    try {
        schema = JSON.parse(fs.readFileSync('config.schema.json').toString())
    } catch {
        console.warn('Failed to read schema, config validation skipped')
    }
    try {
        const fileContent = fs.readFileSync('config.json')
        const json = JSON.parse(fileContent.toString())
        if (schema) {
            const validator = new Validator()
            const result = validator.validate(json, schema)
            if (!result.valid) {
                console.error('config.json is invalid, please make sure the file has the correct format as specified by config.schema.json\nErrors:\n' + result.errors.join('\n'))
                process.exit()
            }
        }
        records = await resolveRecords(json.records)
    } catch (e) {
        console.error('Failed to read records from config.json\nError:' + e)
        process.exit()
    }

    if (REPEAT_MILLISECONDS) {
        const repeatMilliseconds = parseInt(REPEAT_MILLISECONDS)
        function checkRecordsContinuous() {
            checkRecords(Array.from(records))
            setTimeout(checkRecordsContinuous, repeatMilliseconds)
        }
        checkRecordsContinuous()
    } else {
        checkRecords(Array.from(records))
    }
})()

/**
 * @param {object[]|string[]} records
 */
async function resolveRecords(records) {
    const result = []
    await Promise.all(
        records.map(async record => {
            if (typeof record === 'string') {
                const resolved = await resolveName(record)
                if (!resolved) {
                    console.error(`Unable to find record ${record}`)
                    process.exit()
                }
                console.log(`Resolved name ${record} to ${JSON.stringify(resolved)}`)
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
 * @param {string} name The domain name of the record
 * @returns Promise<{zone_id: string, record_id: string}>
 */
async function resolveName(name) {
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
        const subdomain = segments.slice(undefined, i).join('.')
        const zoneRecords = await cloudflare.getRecords(zone)
        const zoneRecord = zoneRecords.find(zoneRecord => zoneRecord.name === name)?.id
        if (!zoneRecord) {
            continue
        }

        return {
            zone_id: zone,
            record_id: zoneRecord,
        }
    }
}

/**
 * Get the public IP address of this server.
 *
 * @returns Promise<string>
 */
function getPublicIp() {
    return new Promise(resolve => {
        fetch('https://api.ipify.org')
            .then(response => response.text())
            .then(text => {
                resolve(text)
            })
    })
}

/**
 * Check if a record's content matches an IP address and update if it does not.
 *
 * @param {string} zoneId The id of the zone that the record belongs to
 * @param {string} recordId
 * @param {string} ip
 * @returns Promise<undefined>
 */
function checkRecord(zoneId, recordId, ip) {
    return new Promise((resolve, reject) => {
        console.log(`\nChecking DNS record ${zoneId}/${recordId}`)

        cloudflare.getRecord(zoneId, recordId).then(
            record => {
                if (record.type != 'A') {
                    console.error(`Record has unsupported type, expected A but got ${record.type}`)
                    reject(`Record has unsupported type, expected A but got ${record.type}`)
                    return
                }

                // Compare IP addresses
                console.log(`DNS record IP: ${record.content}\nPublic IP:     ${ip}`)
                if (record.content != ip) {
                    console.log('IP does not match, updating DNS record...')
                    record.content = ip
                    cloudflare.updateRecord(zoneId, recordId, record).then(
                        response => {
                            console.log(`DNS record has been updated, new IP: ${response.content}`)
                            resolve(undefined)
                        },
                        reason => {
                            console.warn(`Failed to update DNS record:\n${reason}`)
                            reject(reason)
                        }
                    )
                } else {
                    console.log('IP matches, no action has been taken')
                    resolve(undefined)
                }
            },
            reason => {
                console.warn(`Failed to get DNS record:\n${reason}`)
                reject(reason)
            }
        )
    })
}

function safeCheckRecord(record, ip) {
    return new Promise((resolve, reject) => {
        const zoneId = record.zone_id
        const recordId = record.record_id
        if (!zoneId?.match(/^[a-z0-9]{32}$/)) {
            console.error(`Invalid zone id: ${zoneId}`)
            reject()
            return
        }
        if (!recordId?.match(/^[a-z0-9]{32}$/)) {
            console.error(`Invalid record id: ${recordId}`)
            reject()
            return
        }
        checkRecord(zoneId, recordId, ip).then(() => resolve(undefined))
    })
}

function checkRecords(records) {
    return new Promise((resolve, reject) => {
        console.log('\nChecking records...')
        getPublicIp().then(ip => {
            if (!ip) {
                console.error('Failed to get public IP')
                reject('Failed to get public IP')
                return
            }
            records.reverse()
            function next() {
                if (records.length == 0) {
                    resolve(undefined)
                    return
                }
                const record = records.pop()
                safeCheckRecord(record, ip).then(next)
            }
            next()
        })
    })
}
