
var net = require('net')
, http = require('http')
, EventEmitter = require('events').EventEmitter
, fs = require('fs')
, path = require('path')
, crypto = require('crypto')
, zlib = require('zlib')
, rotator = require('rotator')
//, bench = require('yunofast')();
;


module.exports = function(options){
  options = options||{};
  // log rotator
  var rotateConfig = {gzip:typeof options.rotateGzip == 'undefined'?true:options.rotateGzip};

  if(options.rotateInterval) rotateConfig.interval = options.rotateInterval;
  var tot = rotator(rotateConfig);

  //port
  var tcp = options.port || options.tcp || 5140
  , server
  , dir = options.dir || process.cwd()+'/logs/'
  , lineEmitter = new EventEmitter()
  , files = {}
  , rotateBuffer = {}
  ;
  
  server = net.createServer(function(con){
    // right now any client can keep sending data to lbuf
    // with no newline and use up all the memory.

    var lbuf;
    con.on('data',function(buf){

      //bench.start('on data buf');

      var s = buf.toString('utf8');

      if(lbuf && lbuf.length) {
        s = lbuf.toString('utf8')+s;
      }

      //bench.stop('on data buf');

      //bench.start('on data split');

      var lines = s.trim().split("\n");
      if(s.lastIndexOf("\n") == s.length-1) {
        //got the whole line!
        lbuf = ''
      } else {
        lbuf = lines.pop();
      }

      //bench.stop('on data split');

      //bench.start('on data emit');

      lineEmitter.emit('lines',lines,con.remoteAddress,con.remotePort);

      //bench.stop('on data emit');
    });

    con.on('end',function(){
      delete lbuf;
    });
  });

  lineEmitter.on('lines',function(lines,ip,port){

    //bench.start('whole line');

    var lines = jsonParse('['+lines.join(',')+']')
    ,l;

    if(!lines) {
      //bench.stop('whole line');
      return;
    }

    for(i=0;i<lines.length;++i){
      l = lines[i];
      if(!l.file) l.file = '/unknown.log';
      if(!l.time) l.time = Date.now();
      l.now = Date.now();
      l.ip = ip;
      l.port = port;

      if(l.lname && rotateBuffer[l.lname]) {
        rotateBuffer[l.lname].push(l);
        lines.splice(i,1);
      }

      server.emit('line',l);

      if(l.lname && !tot.logs[l.lname]) {
        tot.addFile(l.lname,function(err,data){
          if(err) {
            console.log('error adding ',l.lname,'to rotator',err);
          } else {
            console.log('added file ',l.lname,' to rotator');
          }
        });
      }
    }

    if(!lines.length) {
      //bench.stop('whole line');
      return;
    }

    writeLines(lines,files,dir);

    //bench.stop('whole line');
    
  });

  tot.on('rotate',function(rs,file,data){
    var o = files[file];
    if(!o) return;
    // set rotate line buffer so we dont miss any events.
    // if it takes a long time to get a close event we will
    if(!rotateBuffer[file]) rotateBuffer[file] = [];
    // have rotator wait for active stream to close
    tot.rotateAfterClose(file,o.ws);
    // end stream. i have to do this because rotator wont know how to do it for me.
    o.ws.end();
  });

  var afterRotate =  function(file){ 
    var lines = rotateBuffer[file];
    delete rotateBuffer[file];
    delete files[file];
    
    while(lines && lines.length) writeLine(lines.shift(),files,dir);
  };

  tot.on('rotated',afterRotate);
  tot.on('rotate-error',function(err,file){
    console.log('error rotating file! ',err,file);
    // keep it going.
    afterRotate(file);
  });

  server.listen(tcp,function(){
    console.log('server listening for \\n delimited JSON over tcp on '+tcp);
  });

  server.on('close',function(){
    tot.stop();   
  });

  //make the log file directory
  _exists(dir,function(exists){
    if(exists) return;
    fs.mkdir(dir,function(err,data){
      if(err) process.exit('could not make log dir! ',dir,' ',err);
    });
  });

  return server;
}

//setInterval(function(){
//    console.log(bench.report());
//},10000);

function jsonParse(json){
  if(!json || !json.length || !(json+'').trim().length) return undefined;
  try{
    return JSON.parse(json);
  } catch (e) {
    console.log('json parse error =( ',json);
  }

  return undefined;
}


function getFileObject(file,openStreams,dir) {
  //console.log('writeLine')
  var o = openStreams[file];
  if(!openStreams[file]) {
    o = openStreams[file] = {};
    var hash = crypto.createHash('sha1');
    hash.update(file);
    var sha = hash.digest('hex');
    o.lname = dir+(path.basename(file).replace(/[^.a-z0-9_-]+/gi,'_')+'.'+sha);
    o.ws = fs.createWriteStream(o.lname,{ flags: 'a+'});
    o.started = Date.now();
  }

  o.updated = Date.now();
  return o;
}

function writeLines(lines,openStreams,dir){
  //bench.start('write lines');

  var files = {};
  lines.forEach(function(l){
      if(!files[l.file]) files[l.file] = "";
      files[l.file] += JSON.stringify(l)+"\n"
  });

  Object.keys(files).forEach(function(file){  
    var o = getFileObject(file,openStreams,dir);
    o.ws.write(files[file]);
  });
  //bench.stop('write lines');
}

function _exists(p,cb){
  if(fs.exists) fs.exists(p,cb);
  else require('path').exists(p,cb);
}
