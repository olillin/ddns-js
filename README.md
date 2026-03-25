# ddns-js

Automatically set CloudFlare [DNS records](https://www.cloudflare.com/en-gb/learning/dns/dns-records/dns-a-record/) (only works with `A` records) to own public ip.

## Environment variables

### API_TOKEN

> Required: yes

The [Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) used for authorization.

Example: `API_TOKEN=sWh9FHA5ow28zgdwTm8s4J0kUo8Td0imxhsNo9xJ`

### REPEAT_MILLISECONDS

> Required: no

The delay in milliseconds (integer) to wait before repeating the check of all records. If omitted the program will process the records once and exit.
