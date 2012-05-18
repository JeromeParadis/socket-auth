/**
 * Export the wrapper.
 */

var connect = require('connect')
   ,parseCookie = require('connect').utils.parseCookie;
   //,redis = require('redis');

exports = module.exports = SocketAuthentication;

function SocketAuthentication(io, options, onSessionLoadedCB) {
  
  var redis = options.rc ? options.rc : redis.createClient();
  //var redis_namespace = (options && options.redis_namespace) ? options.redis_namespace : "sauth.";
  var session_timeout = (options && options.session_timeout) ? options.session_timeout * 60 : 20 * 60;
  var self = this;
  //~ var socket = null;
  
  
  /**
   * 
   */
  var _init = function() {
    if (io) {
        io.set('authorization', onAuthorization);
        io.sockets.on('connection', onConnect);

        //~ io.set('message', function() {
            //~ console.log('*** HEARTBEAT ***', arguments);
        //~ });
        //~ io.sockets.on('connection', function(socket) {
            //~ socket.on('heartbeat', function() {
                //~ console.log('*** HEARTBEAT ***', arguments);
            //~ });
        //~ });
    }
  }
  
  /**
   * This receives the handshake function built into socket-io. This is
   * largely modeled on http://www.danielbaulig.de/socket-ioexpress/.
   * 
   * It extracts the sessionid from the headers, loads the session
   * data from redis, and stores it in the handshake object.
   */
  var onAuthorization = function(handshake, accept) {
    console.log('*** AUTHORIZATION() ***', handshake);
    
    // Parse the cookie if it's present.
    if (handshake.headers.cookie) {
        handshake.cookie = parseCookie(handshake.headers.cookie);
        // Django stores its session ID as 'sessionid'.
        var sessionID = handshake.cookie['sessionid'];
        handshake.sessionID = sessionID;
        loadSession(sessionID, function(err, session) {
            handshake.session = session;
            // Reset the expire on the session key for good sessions.
            if (session) redis.expire(self.getSessionKey(sessionID), session_timeout);
            if (onSessionLoadedCB) onSessionLoadedCB(err, session);

        });
        //~ this.authorize
        
    }
    else {
       // No cookie? No connection!
       return accept('No cookie transmitted.', false);
    }
    // Accept the incoming connection.
    accept(null, true);
  }
  
    /**
     * Adds more handlers and stores the session->socket link for valid
     * connections.
     */
    var onConnect = function(socket) {
        // bail on session-less connections.
        if (!socket.handshake.sessionID) return;
        // else...
        linkSocketToSession(socket);
        socket.on('disconnect', function() {
            unlinkSocketFromSession(socket);
        });
    }
        
  //~ var onConnect = function (sck) {
    //~ socket = sck;
    //~ 
    //~ socket.emit('authorize');
    //~ console.log('socket.id', socket.id)
    //~ 
    //~ // Ping event to refresh session of openned browser window
    //~ // --------------------------------------------
    //~ // socket.on('auth_ping', onAuthPing);
    //~ 
    //~ socket.on('auth', onAuth);
    //~ 
  //~ }
  
  
  /**
   * Ping event to refresh session of opened browser window.
   */
  //~ var onAuthPing = function (data) {
    //~ console.log("ping sessionid:", data.sessionid);
    //~ self.ping(data.sessionid, function(err, session) {
      //~ console.log("Pinged: ", session, data.sessionid)
    //~ });
  //~ }
  
  /**
   * 
   * The functions below serve more-or-less as a session model and might
   * go better in a model but they're fine here for now.
   * 
   */
   
  /**
   * 
   */
  this.get_user_sessions = function(user_id, callback) {
    var key = this.getUsersSessionsKey(user_id);
    var ids = [];
    redis.smembers(key, function(err, members) {
      if (members) {
        redis.mget(members, function(err, items) {
          if (items) {
            for (var i = 0; i < items.length; i++) {
              var item = items[i];
              if (item)
                ids.push(item);
              else
                redis.srem(key,members[i]); // Cleanup expired key
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
  
  /**
   * 
   */
  this.get_user_session_keys = function(user_id, callback) {
    
    redis.smembers(this.getUsersSessionsKey(user_id), callback)
    
    //~ var key = this.getUsersSessionsKey(user_id);
    //~ var ids = [];
    //~ redis.smembers(key,function(err,members) {
      //~ if (members) {
        //~ redis.mget(members,function(err,items) {
          //~ if (items) {
            //~ for (var i = 0; i < items.length; i++) {
              //~ var item = items[i];
              //~ if (item)
                //~ ids.push(members[i]);
              //~ else
                //~ redis.srem(key,members[i]); // Cleanup expired key
            //~ }
            //~ callback && callback(false,ids);
          //~ }
          //~ else
            //~ callback && callback(true,null);
        //~ });        
      //~ }
      //~ else
        //~ callback && callback(true,null);
    //~ });
  };
  
  
  /**
   * 
   */
  this.getSessionKey = function(sessionid) {
    return 'sessions:' + sessionid;
  };
  
  
  /**
   * 
   */
  this.getSessionSocketKey = function(sessionid) {
    return 'sockets:' + sessionid;
  };
  
  
  /**
   * 
   */
  this.getUsersSessionsKey = function(userid) {
    return 'sessions.users:' + userid;
  };
  
  
  /**
   * 
   */
  this.getSocketKeyFromSessionKey = function(sessionKey) {
      return sessionKey.replace('sessions:', 'sockets:');
  };
  
  
  /**
   * 
   */
  this.getSessionSockets = function(sessionkey,callback) {
    var new_key = this.getSocketKeyFromSessionKey(sessionkey);
    console.log("getSessionSockets()", new_key);
    redis.smembers(new_key, callback);
    //~ redis.smembers(new_key, function(err,members) {
      //~ if (callback) {
        //~ if (!err) callback(err, members);
        //~ else callback(err, false);
      //~ }
    //~ });
  };
  
  
  /**
   * Returns the active socketids for a user in a callback.
   *  @param user_id:Int
   *  @param callback:Function(err, socketids)
   */
  this.userSockets = function(user_id, callback) {
      if (!callback) return;
      this.get_user_session_keys(user_id, function(err, sessionKeys) {
          if (err) {
              callback(err);
          }
          else {
              var cmds = [], i = sessionKeys.length;
              while (i--) {
                  console.log('fetching sockets for key:', sessionKeys[i]);
                  cmds.push(['smembers', self.getSocketKeyFromSessionKey(sessionKeys[i])]);
              }
              sockets = [];
              console.log('cmds:', cmds);
              redis.multi(cmds).exec(function(err, results) {
                  console.log('found sockets:', err, results);
                  var i = results.length;
                  while (i--) sockets = sockets.concat(results[i]);
                  callback(err, sockets);
              });
          }
      });
  };
  
  
  /**
   * 
   */
  var linkSocketToSession = function(socket, callback) {
    var socketKey = self.getSessionSocketKey(socket.handshake.sessionID);
    redis.multi()
        .sadd(socketKey, socket.id)
        .expire(socketKey, session_timeout)
        //.scard(socketKey)
        .exec(function(err,replies) {
          console.log("User connected with session", socket.handshake.sessionID);
          //console.log("DEBUG: number of sockets for session:", replies[2])
          callback && callback(null, replies);
        });
    callback && callback("Not a valid session.", null);
  };
  
  
  /**
   * 
   */
  var unlinkSocketFromSession = function(socket) {
    redis.srem(self.getSessionSocketKey(socket.handshake.sessionID), socket.id);
  };
  
  
  /**
   * 
   */
  this.ping = function(sessionid, callback) {
    console.log("pinging session ", sessionid)
    self.authorize(sessionid, callback);
  };
  
  
  /**
   * 
   */
  this.addSession = function(userid, sessionid, session) {
    var sessionKey = this.getSessionKey(sessionid);
    redis.multi([
        ['setex', sessionKey, session_timeout, JSON.stringify(session)],
        //~ ['sadd', this.getUsersSessionsKey(userid), redis.addPrefix(sessionKey));
        ['sadd', this.getUsersSessionsKey(userid), sessionKey],
        ['expire', this.getUsersSessionsKey(userid), session_timeout]
    ]).exec(function(err, result) {
        console.log('SocketAuthentication.addSession()', err, result);
    });
  };
  
  
  /**
   * Returns the session as the second argument in the callback.  The
   * first argument is the error, as per the nodejs-redis model.
   */
  this.loadSession = function(sessionid, callback) {
      redis.get(this.getSessionKey(sessionid), function(err, result) {
          callback && callback(err, result ? JSON.parse(result) : false);
      });
  };
  
  _init();
  
  return this;
}
