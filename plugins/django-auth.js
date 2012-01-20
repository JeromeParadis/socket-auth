/**
 * Export the wrapper.
 */

var connect = require('connect')
   ,redis = require('redis');

exports = module.exports = SocketAuthentication;

function SocketAuthentication(io, options, auth_callback) {
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
    console.log("socket.id",socket.id)
    socket.on('auth', function (data) {
      console.log("sessionid:",data.sessionid);
      self.authorize(socket.id,data.sessionid,function(err,session) {
        console.log("Authorized: ",session, data.sessionid);
        auth_callback && auth_callback(socket.id,session);
      });
    });

    // Ping event to refresh session of openned browser window
    // --------------------------------------------
    socket.on('auth_ping', function (data) {
      console.log("ping sessionid:",data.sessionid);
      self.ping(data.sessionid,function(err,session) {
        console.log("Pinged: ",session, data.sessionid)
      });
    });

  });

  this.get_user_sessions = function(user_id,callback) {
    var key = options.redis_namespace + 'sessions.users:' + user_id;
    var ids = [];
    self.rc.smembers(key,function(err,members) {
      if (members) {
        self.rc.mget(members,function(err,items) {
          if (items) {
            for (var i = 0; i < items.length; i++) {
              var item = items[i];
              if (item)
                ids.push(item);
              else
                self.rc.srem(key,members[i]); // Cleanup expired key
            }
            callback && callback(false,ids);
          }
          else
            callback && callback(true,null);
        });        
      }
      else
        callback && callback(true,null);
    });
  };

  this.get_user_session_keys = function(user_id,callback) {
    var key = options.redis_namespace + 'sessions.users:' + user_id;
    var ids = [];
    self.rc.smembers(key,function(err,members) {
      if (members) {
        self.rc.mget(members,function(err,items) {
          if (items) {
            for (var i = 0; i < items.length; i++) {
              var item = items[i];
              if (item)
                ids.push(members[i]);
              else
                self.rc.srem(key,members[i]); // Cleanup expired key
            }
            callback && callback(false,ids);
          }
          else
            callback && callback(true,null);
        });        
      }
      else
        callback && callback(true,null);
    });
  };

  this.getSessionKey = function(sessionid) {
    return options.redis_namespace + 'sessions:' + sessionid;
  };

  this.getSessionSocketKey = function(sessionid) {
    return options.redis_namespace + 'sockets:' + sessionid;
  };

  this.getSessionSocket = function(sessionkey,callback) {
    var new_key = sessionkey.replace(options.redis_namespace + 'sessions:',options.redis_namespace + 'sockets:');
    console.log("getSessionSocket",new_key);
    self.rc.get(new_key,function(err,data) {
      if (data)
        callback && callback(false,data);
      else
        callback && callback(true,null);
    });
  };

  this.authorize = function(socketid,sessionid, callback) {    
    if (sessionid) {
      var key = self.getSessionKey(sessionid);
      self.rc.get(key,function(err,obj) {
        console.log(err,obj,socketid);
        if (obj) {
          console.log("User found",obj);
          self.rc.setex(self.getSessionSocketKey(sessionid), self.session_timeout, socketid, function(err,result) {
            console.log("User connected",obj);
            rc.expire(key,self.session_timeout);  // Reset expiration when user reconnects
            callback && callback(null, JSON.parse(obj));            
          });
        }
        else
          callback && callback("Session is not longer active.", null);
      });
    }
    else if (!sessionid)
      callback && callback("Not a valid session.", null);
  };

  this.ping = function(sessionid, callback) {
    console.log("pinging session ", sessionid)
    self.authorize(sessionid,callback);
  }

  this.get_session = function(sessionid) {
    
  };

  return this;
}