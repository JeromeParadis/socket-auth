/**
 * Export the wrapper.
 */

var connect = require('connect')
   ,redis = require('redis');

exports = module.exports = SocketAuthentication;

function SocketAuthentication(io, options) {
  this.rc = redis.createClient();
  this.redis_namespace = (options && options.redis_namespace) ? options.redis_namespace : "sauth.";
  this.session_timeout = (options && options.session_timeout) ? options.session_timeout * 60 : 20 * 60;
  var self = this;
  /* DO THIS IF RUNNING ON SAME DOMAIN?
  io.configure(function (){
    io.set('authorization', function (handshakeData, callback) {
      var cookie = handshakeData.headers.cookie;
      console.log("Cookie = ", cookie)
      var sessionid = null;
      if (cookie) {
         var parsed_cookies = connect.utils.parseCookie(cookie);
         sessionid = parsed_cookies['sessionid'] || null;
         console.log('Session = ' + sessionid)
       }
      handshakeData.django_sessionid = sessionid;
      if (sessionid) {
        var key = options.redis_namespace + 'sessions:' + sessionid;
        self.rc.get(key,function(err,obj) {
          console.log(err,obj)
          if (obj) {
            console.log("User connected",obj);
            // rc.expire(key,20*60);  // Reset expiration when user reconnects
            callback(null, true);
          }
          else
            callback("Session is not longer active.", false);
        });
      }
      else if (!sessionid)
        callback("Not a valid session.", false);
    });

    return this;
  });
  */

  io.sockets.on('connection', function (socket) {
    socket.emit('authorize');
    socket.on('auth', function (data) {
      console.log("sessionid:",data.sessionid);
      self.authorize(data.sessionid,function(err,authorized) {
        console.log("Authorized: ",authorized, data.sessionid)
      });
    });

    // Ping event to refresh session of openned browser window
    // --------------------------------------------
    socket.on('auth_ping', function (data) {
      console.log("ping sessionid:",data.sessionid);
      self.ping(data.sessionid,function(err,authorized) {
        console.log("Pinged: ",authorized, data.sessionid)
      });
    });

  });

  this.get_user = function(id,callback) {
    
  };

  this.getSessionKey = function(sessionid) {
    return key = options.redis_namespace + 'sessions:' + sessionid;
  };

  this.authorize = function(sessionid, callback) {    
    if (sessionid) {
      var key = self.getSessionKey(sessionid);
      self.rc.get(key,function(err,obj) {
        console.log(err,obj)
        if (obj) {
          console.log("User connected",obj);
          rc.expire(key,self.session_timeout);  // Reset expiration when user reconnects
          callback && callback(null, true);
        }
        else
          callback && callback("Session is not longer active.", false);
      });
    }
    else if (!sessionid)
      callback && callback("Not a valid session.", false);
  };

  this.ping = function(sessionid, callback) {
    console.log("pinging session ", sessionid)
    self.authorize(sessionid,callback);
  }

  this.get_session = function(sessionid) {
    
  };

}