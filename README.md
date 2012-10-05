# tailreceiver

Get log data as json over tcp from forwardho servers. commit the data to log files unique to name and host. rotate and gzip files based on configured interval. Watch line events to publish data to stats or an event bus.

## example
this server prefers global. it is configured with substacks confuse and prefers the most local tailreceiver.json file to your current working directory

```sh
$>npm install -g tailreceiver
$>tailreceiver
server listening for \n delimited JSON over tcp on 5140

```


```js
var tailreceiver = require('tailreceiver');

var server = tailreceiver(config);

server.on('line',function(){
  console.log('')
});

```

## api

tailreceiver(config)
  - returns tail receiver server
  - config
    - rotateInterval 
      - miliseconds how often files should be rotated. files are prefixed with YYYMMDD(-NUM) num is optional which is the number rotation that day
    - rotateSize
      - size in bytes that files will be to trigger rotation.
    - port
      - the port to listen for log connections on
    - dir
      - the directory to write log files too

tailserver.on
  - line
    - an event with a json object that came from a remote server.

lineObject
  client provided fields
  - line
    - the line of data. provided by the client defaults to undefined
  - file
    - the name of the file provided by the remote server. defaults to /unknown.log
  - time
    - the time the line fo data was created on the remote server. if not populated set to Date.now()

  server set fields
  - ip
    - the remote ip that gave us the data
  - port
    - the report port
  - now
    - when we got it
  - lname
    - the name of the log file that it was added to

  the client can add more fields the default behavior is to add server side fields to the object provided by the client.

## woo hooo

let me know if you find any issues or this package is useful

