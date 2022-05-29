const fs = require('fs');

const LOG_FILE = '/var/log/ddns-js.log'
const log = (content) => {
    fs.writeFile(LOG_FILE, `${new Date().toLocaleString()}\n${content}\n`, () => {})
}

try {
    const axios = require('axios').default;

    const API_TOKEN = 'Ls2WZsuBmW6ea_rUHNZjh51xQBr1wckNxU57OTuG';
    const ZONE_ID = 'a52fe7bbf543e784d74dd3a534fdfc11';
    const RECORD_ID = '0b7badecf19bb0f66c88c1e05fa6dc07';

    const sendGetRequest = async (url, config) => {
        return await axios.get(url, config)
            .then(response => {
                return response;
            })
            .catch(reason => console.error(reason));
    }

    const sendPutRequest = async (url, data, config) => {
        return await axios.put(url, data, config)
            .then(response => {
                return response;
            })
            .catch(reason => console.error(reason));
    }

    const getDnsRecord = async (zone_id, dns_record_id) => {
        return await sendGetRequest(
            `https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${dns_record_id}`,
            {
                'headers': {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    }

    const updateDnsRecord = async (zone_id, dns_record_id, data) => {
        return await sendPutRequest(
            `https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${dns_record_id}`,
            data,
            {
                'headers': {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    }

    const getPublicIp = async () => {
        return await sendGetRequest('http://icanhazip.com').then(response => {
            return response.data.replace('\n', '');
        });
    }

    const getRegisteredIp = async () => {
        return await getDnsRecord(ZONE_ID, RECORD_ID).then(response => {
            return response.data.result.content;
        });
    }

    getRegisteredIp().then(registered_ip => {
        getPublicIp().then(current_ip => {

            var output = `Current IP:\t${current_ip}\nRegistered IP:\t${registered_ip}\n\n`

            if (current_ip != registered_ip) {
                output += 'IP does not match, updating CloudFlare...'

                updateDnsRecord(ZONE_ID, RECORD_ID, {
                    'name': '@',
                    'type': 'A',
                    'content': current_ip,
                    'ttl': 1,
                    'proxied': true
                });

            } else {
                output += 'IP matches, doing nothing.'
            }
            log(output)
        })
    })

} catch (e) {
    log(e)
}
