var fs = require('fs');
var httpProxy = require('http-proxy');
var deferred = require('deferred');
// var JSON = require('json');
var http = require('http');

function Cache(base_path) {
  this._base_path = base_path;
}

Cache.prototype.getFile = function(fileid) {
  var that = this;
  var open = deferred.promisify(fs.open);

  var filename = that._base_path + '/' + fileid.slice(0, 2) +  '/' + fileid;
  try {
    return {
      mode: 'r',
      path: filename,
      handle: fs.openSync(filename, 'r')
    }
  } catch (err) {
    if (err.code !== 'ENOENT')
      throw err;
  }
  return {
    mode: 'w',
    path: filename,
    handle: fs.openSync(filename, 'w')
  }
}

var cache = new Cache('/tmp/exhentai');

http.createServer(function(request, response) {
  
  var fileid = request.url.split('fileid=')[1].split(';')[0];
  
  console.log("open:  ", fileid);
  deferred(cache.getFile(fileid)).then(function(file_rec) {

    if (file_rec.mode === 'w') {
      var ws = fs.createWriteStream(file_rec.path, {'fd': file_rec.handle});
      console.log("miss:  ", fileid);
      var proxy = http.createClient(23433, '127.0.0.1')
      var proxy_request = proxy.request(request.method, request.url, request.headers);

      proxy_request.addListener('response', function (proxy_response) {
        proxy_response.addListener('data', function(chunk) {
          ws.write(chunk);
          response.write(chunk, 'binary');
        });
        proxy_response.addListener('end', function() {
          ws.end();
          console.log('wrote: ' + fileid);
          response.end();
        });
        proxy_response.on('error', function(e) {
          ws.end();
          fs.unlink(file_rec.path);
          console.log('error: ' + e.message);
        });
        response.writeHead(proxy_response.statusCode, proxy_response.headers);
      });

      request.addListener('data', function(chunk) {
        proxy_request.write(chunk, 'binary');
      });

      request.addListener('end', function() {
        proxy_request.end();
      });
    }
    if (file_rec.mode === 'r') {
      var rs = fs.createReadStream(file_rec.path, {'fd': file_rec.handle});
      console.log("hit:   ", fileid);
      rs.on('data', function(chunk) {
        response.write(chunk, 'binary');
      })
      rs.on('end', function(chunk) {
        response.end();
        console.log('ended');
      })
    }
  }, function(err) {
    console.error(err);
    console.error(err.stack);
    response.end();
  }).end();
}).listen(23434);
