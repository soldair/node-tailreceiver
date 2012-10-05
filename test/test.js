var test = require('tap').test
, net = require('net')
, path = require('path')
, fs  = require('fs')
, server = require(path.join(__dirname,'..','server.js')) 
, zlib = require('zlib')
;

test("does rotate tail",function(t){
  var interval
  ,now = Date.now()
  ,written = []
  ,lines = []
  ,targetLogs = []
  ,logs = []
  ;

  var tr = server({port:0,rotateInterval:10});

  var line = 0;
  tr.on('line',function(obj){
    line++;
    if(line == 1) {
      t.ok(obj.ip,'lines should have ip');
      t.ok(obj.file,'lines should have log it came from');
    }
    lines.push(obj);
  });

  tr.on('log',function(log){
    targetLogs.push(log);
  })

  var done = function(){
    // i have written all of the data.
    // get all of the data from all of the files.
    // compare to data written

    tr.destroy(function(){

      var expectedData = '';
      lines.forEach(function(v,k){
        expectedData += JSON.stringify(v)+"\n";    
      });   

      logs.push(targetLogs[0]);

      var logstr = logs.join("\n");

      t.equals(targetLogs.length,1,'should have only found one target log file for incoming data');
      var writtenData = '' 
      ,readLog = function fn(){
        
        if(logs.length) {
          
          var toRead = logs.shift();
          var rs; 
          if(toRead.indexOf('.gz') == -1) {
            rs = fs.createReadStream(toRead);
          } else {
            rs = zlib.createGunzip();

            fs.createReadStream(toRead).pipe(rs);
          }
          rs.on('data',function(buf){
              writtenData += buf.toString();
          });

          rs.on('end',function(){
              fn();
              fs.unlink(toRead);
          });

          rs.on('error',function(){
            fn();    
          })

        } else {
          doneReading();
        }

      }, doneReading = function(){
        t.equals(writtenData,expectedData,'data written accross all rotated and current logs should match exactly');
        t.end();
      };

      readLog();
    });
  };

  // write data to the server.
  tr.on('listening',function(){
    var con = net.createConnection(tr.address().port);
    con.on('connect',function(){
      var i = 0
      ,line = {time:1348232408912,line:"",file:now+'.log'}
      ;
      
      interval = setInterval(function(){
        line.line = "line "+i;
        var w = JSON.stringify(line)+"\n";
        con.write(w,function(){
          written.push(w);
        });
        i++;

        if(i == 100) {
          clearInterval(interval);
          process.nextTick(function(){
            done();
          });
        }
      },1);
    });

    con.on('end',function(){
      // closed.
    });
  });

  tr.on('rotated',function(log,rotateName){
    logs.push(rotateName); 
  });
});
