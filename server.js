
var net = require('net')
, http = require('http')
, EventEmitter = require('events').EventEmitter
, fs = require('fs')
, path = require('path')
, crypto = require('crypto')
, zlib = require('zlib')
, rotator = require('rotator')
;


module.exports = function(options){
  options = options||{};
  // log rotator
  var rotateConfig = {gzip:typeof options.rotateGzip == 'undefined'?true:options.rotateGzip};

  if(options.rotateInterval) rotateConfig.interval = options.rotateInterval;
  if(options.rotateSize) rotateConfig.size = options.rotateSize;

  if(options.rotatePollInterval) rotateConfig.pollInterval = options.rotatePollInterval;
  else rotateConfig.pollInterval = options.rotateInterval/10;
  rotateConfig.pollInterval = Math.abs(rotateConfig.pollInterval);
  if(rotateConfig.pollInterval < 1) rotateConfig.pollInterval = 1;

  if(options.rotateStatInterval) rotateConfig.statInterval = options.rotateStatInterval;

  var tot = rotator(rotateConfig);

  //port
  var tcp;
  if(options.port === 0 || options.tcp === 0){
    tcp = 0;//any port
  } else {
    tcp = options.port || options.tcp || 5140
  }

  var server
  , dir = options.dir || process.cwd()+'/logs/'
  , lineEmitter = new EventEmitter()
  , files = {}
  , rotateBuffer = {}
  ;
  
  server = net.createServer(function(con){
    // right now any client can keep sending data to lbuf
    // with no newline and use up all the memory.
    //
    var z = this;
    //keep a handle to active connections so it can be destroyed.
    this._sockets.push(con);
    
    if(this.paused) {
      con.pause();
    }

    var lbuf = '';
    con.on('data',function(buf){
      
      s = buf.toString('utf8');

      var lines = s.trim().split("\n");

      if(s.lastIndexOf("\n") == s.length-1) {
        //got the whole line!
        lbuf = ''
      } else {
        lbuf = lines.pop();
      }

      lineEmitter.emit('lines',lines,con.remoteAddress,con.remotePort);

    });

    con.on('end',function(){
      if(lbuf.length){
        lineEmitter.emit('lines',[lbuf],con.remoteAddress,con.remotePort);
      }
      delete lbuf;
      z._sockets.splice(z._sockets.indexOf(con),1);
    });
  });

  server._sockets = [];

  var addingToRotator = {};
  lineEmitter.on('lines',function(inlines,ip,port){

    var lines = jsonParse('['+inlines.join(',')+']')
    ,l;

    if(!lines) {
      return;
    }

    var newFiles = [];
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

      if(files[l.file] === undefined) {
        newFiles.push(l.file);
        files[l.file] = false;
      } else if(files[l.file] && !files[l.file].added) {
        var lname = files[l.file].lname;
        if(!addingToRotator[lname]) {
          addingToRotator[lname] = 1;

          tot.addFile(lname,function(err,data){

            if(err) { 
              console.error('error adding ',lname,'to rotator',err);
            } else {
              files[l.file].added = 1;
            }

            delete addingToRotator[lname];
          });
        }
      }

    }

    if(!lines.length) {
      return;
    }

    server._writeLines(lines,files,dir);


    // tack on to side effect of writing lines
    if(newFiles.length) {
      newFiles.forEach(function(log){
          server.emit('log',files[log].lname);
      });
    }   
  });


  tot.on('rotate',function(rs,file,data){
    var fileKey = server._findFileFromLname(file,files);
    var o = files[fileKey];
    if(!o) {
      return;
    }
    // set rotate line buffer so we dont miss any events.
    // if it takes a long time to get a close event we will
    if(!rotateBuffer[file]) rotateBuffer[file] = [];
    // have rotator wait for active stream to close
    tot.rotateAfterClose(file,o.ws);
    // end stream. i have to do this because rotator wont know how to do it for me.
    server.pause();

    if(!server.activeLogs[fileKey]){
      o.ws.end();
      o.ws = fs.createWriteStream(o.lname,{flags:"a+"});
    } else {
      server.once('drain',function(){
        o.ws.end();
        o.ws = fs.createWriteStream(o.lname,{flags:"a+"});
      });
    }
  });

  var afterRotate =  function(file,rotateName,data){

    server.resume(); 
    if(rotateName) server.emit('rotated',file,rotateName);
    var lines = rotateBuffer[file];
    delete rotateBuffer[file];
    
    while(lines && lines.length) writeLine(lines.shift(),files,dir);
  };

  tot.on('rotated',afterRotate);
  tot.on('rotate-error',function(err,file,data){
    // keep it going.
    afterRotate(file,null,data);
  });

  server.listen(tcp,function(){
    console.log('server listening for \\n delimited JSON over tcp on '+server.address().port);
  });

  var closed = false;
  var destroyed = false;
  server.on('close',function(){
    closed = true;
    server.destroy();
  });

  server.destroy = function(cb){

    if(destroyed) return;
    destroyed = true;

    var z = this;
    //destroy all of the connections!
    this._sockets.forEach(function(con){
      con.end();
    });

    var c = 1;
    tot.stop(function(){
      c--;
      if(!c) cb();
    });

    if(!closed){
      c++;
      // 0.6 close doesnt call a callback.
      server.once('close',function(){
        c--;
        if(!c) cb();   
      })
      server.close();
    }

    if(Object.keys(z.activeLogs).length){
      c++;
      server.once('drain',function(){
        c--;
        if(!c) cb();
      });
    }
  }

  server.pause = function(){
    this.paused = true;
    this._sockets.forEach(function(con){
        con.pause();
    });
  }

  server.resume = function(){
    this.paused = false;
    this._sockets.forEach(function(con){
      con.resume();  
    })
  }

  //make the log file directory
  _exists(dir,function(exists){
    if(exists) return;
    fs.mkdir(dir,function(err,data){
      if(err) process.exit('could not make log dir! ',dir,' ',err);
    });
  });
  

  server._findFileFromLname = function(lname,files){
    var ret;
    Object.keys(files).forEach(function(file){
      var o = files[file];
      if(o && o.lname == lname){
        ret = file;
        return false;
      }
    });
    return ret;
  };

  server._getFileObject = function(file,openStreams,dir) {
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
  };

  server.activeLogs = {};
  server._writeLines = function(lines,openStreams,dir){
    var z = this
    ,files = {}
    ;


    lines.forEach(function(l){
        if(!files[l.file]) files[l.file] = "";
        files[l.file] += JSON.stringify(l)+"\n"
    });

    var fileKeys = Object.keys(files);
    cnt = fileKeys.length;
    fileKeys.forEach(function(file){  
      var o = z._getFileObject(file,openStreams,dir);
      cnt++;
      if(!z.activeLogs[file]) z.activeLogs[file] = 0;

      z.activeLogs[file]++;
      o.ws.write(files[file],function(err,bytes){
        z.activeLogs[file]--;
        if(!z.activeLogs[file]) {
          delete z.activeLogs[file];
          z.emit('drain',file);
        }
      });
    });
  }

  return server;
}


function jsonParse(json){
  if(!json || !json.length || !(json+'').trim().length) return undefined;
  try{
    return JSON.parse(json);
  } catch (e) {
    console.log('json parse error =( ',json);
  }

  return undefined;
}




function _exists(p,cb){
  if(fs.exists) fs.exists(p,cb);
  else require('path').exists(p,cb);
}
