const fs = require('fs')
const Validator = require('jsonschema').Validator
require('dotenv/config')

// Load environment variables
const {API_TOKEN, REPEAT_MILLISECONDS} = process.env
if (!API_TOKEN) {
    console.error('Missing required env variable API_TOKEN')
    process.exit()
}

// Read records from config.json
let records = []

var schema
try {
    schema = JSON.parse(fs.readFileSync('config.schema.json').toString())
} catch {
    console.warn('Failed to read schema, JSON validation skipped')
}
try {
    const fileContent = fs.readFileSync('config.json')
    const json = JSON.parse(fileContent.toString())
    if (schema) {
        const validator = new Validator()
        const result = validator.validate(json, schema)
        if (!result.valid) {
            console.error("config.json is invalid, please make sure the file has the correct format as specified by config.schema.json\nErrors:\n" + result.errors.join('\n'))
            process.exit()
        }
    }
    if (Array.isArray(json.records)) {
        records = json.records
    } else {
        records.push(json.records)
    }
} catch (e) {
    console.error('Failed to read records from config.json\nError:' + e)
    process.exit()
}

function formatErrors(errors) {
    return errors.map(e => `  Code ${e.code}: ${e.message}`).join('\n')
}

function getDnsRecord(zone_id, dns_record_id) {
    return new Promise(resolve => {
        const url = `https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${dns_record_id}`
        fetch(url, {
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(json => {
            if (!json.success) {
                console.error(`Error occured while getting DNS record content:\n${formatErrors(json.errors)}\n`)
                resolve(undefined)
                return
            }
            resolve(json.result)
        })
    })
}

function updateDnsRecord(zone_id, dns_record_id, data) {
    const url = `https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${dns_record_id}`
    return fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
}

function getPublicIp() {
    return new Promise(resolve => {
        fetch('https://api.ipify.org')
        .then(response => response.text())
        .then(text => {
            resolve(text)
        })
    })
}

function checkDnsRecord(zone_id, dns_record_id, public_ip=null) {
    return new Promise(resolve => {
        console.log(`\nChecking DNS record ${zone_id}/${dns_record_id}`)
    
        const promises = [getDnsRecord(zone_id, dns_record_id)]
        // Get public ip if none provided
        if (public_ip) {
            promises.push(public_ip)
        } else {
            promises.push(getPublicIp())
        }
    
        Promise.all(promises)
        .then(values => {
            const [record, public_ip] = values
    
            if (!public_ip) {
                console.error('Failed to get public IP')
                resolve(undefined)
                return
            }
            // Validate DNS record
            if (!record) {
                console.error('Failed to get DNS record')
                resolve(undefined)
                return
            }
            const record_type = record.type
            if (record_type != 'A') {
                console.error(`Record has unsupported type, expected A but got ${record_type}`)
                resolve(undefined)
                return
            }
            const record_ip = record.content
        
            // Compare IP addresses
            console.log(`DNS record IP: ${record_ip}\nPublic IP:     ${public_ip}`)
            if (record_ip != public_ip) {
                console.log('IP does not match, updating DNS record...')
                updateDnsRecord(zone_id, dns_record_id, {
                    content: public_ip,
                    name: record.name,
                    proxied: record.proxied,
                    type: record.type,
                    comment: record.comment,
                    tags: record.tags,
                    ttl: record.ttl,
                })
                .then(response => response.json())
                .then(json => {
                    if (!json.success) {
                        console.log(`Failed to update DNS record:\n${formatErrors(json.errors)}`)
                        resolve(undefined)
                        return
                    }
                    console.log(`DNS record has been updated, new IP: ${json.result.content}`)
                    resolve(undefined)
                })
            } else {
                console.log('IP matches, no action has been taken')
                resolve(undefined)
            }
        })
    })
}

function checkRecord(record, public_ip=null) {
    return new Promise(resolve => {
        const {zone_id, record_id} = record
        if (!zone_id?.match(/^[a-z0-9]{32}$/)) {
            console.error(`Invalid zone id: ${zone_id}`)
            resolve(undefined)
            return
        }
        if (!record_id?.match(/^[a-z0-9]{32}$/)) {
            console.error(`Invalid record id: ${record_id}`)
            resolve(undefined)
            return
        }
        checkDnsRecord(zone_id, record_id, public_ip)
        .then(() => resolve(undefined))
    })
}

function checkRecords(records) {
    return new Promise(resolve => {
        console.log('\nChecking records...')
        getPublicIp().then(public_ip => {
            if (!public_ip) {
                console.error('Failed to get public IP')
                return
            }
            records.reverse()
            function next() {
                if (records.length == 0) {
                    resolve(undefined)
                    return
                }
                const record = records.pop()
                checkRecord(record, public_ip)
                .then(next)
            }
            next()
        })
    })
}

if (REPEAT_MILLISECONDS) {
    const repeat_milliseconds = parseInt(REPEAT_MILLISECONDS)
    function checkRecordsContinuous() {
        checkRecords(Array.from(records))
        setTimeout(checkRecordsContinuous, repeat_milliseconds)
    }
    checkRecordsContinuous()
} else {
    checkRecords(Array.from(records))
}
