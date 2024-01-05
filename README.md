# ddns-js

Automatically set CloudFlare [DNS records](https://www.cloudflare.com/en-gb/learning/dns/dns-records/dns-a-record/) (only works with `A` records) to own public ip.

## Environment variables

### API_TOKEN

> Required: yes

The [Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) used for authorization.

Example: `API_TOKEN=sWh9FHA5ow28zgdwTm8s4J0kUo8Td0imxhsNo9xJ`

### RECORDS

> Required: yes

The [zone id](https://developers.cloudflare.com/api/operations/zones-get) and [record id](https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-list-dns-records) of one or several DNS records. Zone id and record id are separated by `/` and multiple records are separated by `,`. Records are processed from left to right, waiting for the previous record to finish processing before continuing.

#### Format

`zone_id/record_id`  
**OR**  
`zone_id1/record_id1,zone_id2/record_id2,zone_id3/record_id3,...`

#### Examples

`RECORDS=cy94bddzspk61hg6foug0ne5149xx6ow/l9pjomh92a9bu0ek6v4579bu0h1cc6rx`  
`RECORDS=cy94bddzspk61hg6foug0ne5149xx6ow/l9pjomh92a9bu0ek6v4579bu0h1cc6rx,cy94bddzspk61hg6foug0ne5149xx6ow/wl76os6x901dbg3533zwpqyaf31i56ay`  
`RECORDS=cy94bddzspk61hg6foug0ne5149xx6ow/l9pjomh92a9bu0ek6v4579bu0h1cc6rx,fn2l48m2oj5t8u4vr1wznnrmu9ugc4eo/2va22fkitg20flj42ncl1txu43m1pc2l`  

### REPEAT_MILLISECONDS

> Required: no

The delay in milliseconds (integer) to wait before repeating the check of all records. If omitted the program will process the records once and exit.
