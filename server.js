
var net = require('net')
 , http = require('http')
 , EventEmitter = require('events').EventEmitter
 , fs = require('fs')
 , path = require('path')
 , crypto = require('crypto')
 ;


module.exports = function(options){
  options = options||{};

  //port
  var tcp = options.tcp || 5140
   , dir = options.dir || process.cwd()+'/logs/'
   ;
  

  var lineEmitter = new EventEmitter();
  var files = {};

  lineEmitter.on('line',function(line,ip,port){
      var l = jsonParse(line);
      if(!l) return;

      if(!l.file) l.file = '/unknown.log';
      if(!l.time) l.time = Date.now();
      l.now = Date.now();
      l.ip = ip;
      l.port = port;

      writeLine(l,files,dir);
  });

  var server = net.createServer(function(con){
      // right now any client can keep sending data to lbuf
      // with no newline and use up all the memory.

      var lbuf;
      con.on('data',function(buf){
        var s = buf.toString('utf8');

        if(lbuf && lbuf.length) {
          s = lbuf.toString('utf8')+s;
        }

        //console.log('data! ',s);

        var lines = s.split("\n");
        if(s.indexOf("\n") == s.length-1) {
          //got the whole line!
          lbuf = ''
        } else {
          lbuf = lines.pop();
        }

        lines.forEach(function(line){
          //console.log('line!: ',line);
          lineEmitter.emit('line',line,con.remoteAddress,con.remotePort);
        });
      });


      con.on('end',function(){
        delete lbuf;
      });
  });


  server.listen(tcp,function(){
    console.log('server listeneing for \n delimited JSON over tcp on '+tcp);
  });

  //make the log file directory
  fs.exists(dir,function(exists){
    if(exists) return;
    fs.mkdir(dir,function(err,data){
      if(err) process.exit('could not make log dir! ',dir,' ',err);
    });
  });

  return server;
}

function jsonParse(json){
  if(!json || !json.length || !json.trim().length) return undefined;
  try{
    return JSON.parse(json);
  } catch (e) {
    console.log('json parse error =( ',json);
  }

  return undefined;
}

function writeLine(l,openStreams,dir){
  //console.log('writeLine')
  var o = openStreams[l.file];
  if(!openStreams[l.file]) {
    o = openStreams[l.file] = {};
    var hash = crypto.createHash('sha1');
    hash.update(l.file);
    var sha = hash.digest('hex');
    o.lname = dir+(sha+'_'+path.basename(l.file).replace(/[^.a-z0-9_-]+/gi,'_'));
    o.ws = fs.createWriteStream(o.lname,{ flags: 'a+'});
    o.started = Date.now();
  }

  o.updated = Date.now();
  o.ws.write(JSON.stringify(l)+"\n");
}

