

## tailreceiver

recieves data as newline delimited json {file:,line:,time} over tcp
to send data to this server feel free to use the npm package forwardho ( https://github.com/soldair/node-forwardho )


# example 

installed globally you get the tailreceiver if you put options are take from options or the most local tailreceiver.json
 
```sh
$> tailreceiver 
```
or as a library

```js
var tailr = require('tailreceiver');
var server = tailr({dir:'./logs',port:5140});
```

# config

```js
{
  "dir":"./logs",
  "port":5140
}
```

# description

- listens on port 5140 for data.

- creates a logs directory "./logs" in the current working directory 

- writes all the data from each distinct log name to distinct files
