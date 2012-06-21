/**
 * Export the wrapper.
 */

var connect = require('connect')
   ,parseCookie = require('connect').utils.parseCookie
   ,redis = require('redis');

exports = module.exports = SocketAuthentication;


function SocketAuthentication(socket, options, onSessionLoadedCB) {
    
    var redis = options.rc ? options.rc : redis.createClient();
    var session_timeout = (options && options.session_timeout) ? options.session_timeout * 60 : 20 * 60;
    this.debug_mode = options && options.debug || false;
    var self = this;
    
    
    /**
     * Convienience function.  Allows me to put the initialisations at 
     * the top of the file before all the functions are defined.  This
     * is called at the bottom of this class.
     */
    var _init = function() {
        // We assume we're passed a connected socket.  There's probably
        // a way to detect this...
        //if (socket) socket.on('connection', onConnect);
        if (socket) onConnect();
    };
    
    
    /**
     * This receives the handshake function built into socket-io. This is
     * largely modeled on http://www.danielbaulig.de/socket-ioexpress/.
     * 
     * It extracts the sessionid from the headers, loads the session
     * data from redis, and stores it in the handshake object so it's
     * accessible from the socket object.
     * 
     *  @param handshake:io.handshake
     *  @param accept:Function(err:String, acceptConnection:Boolean)
     */
    this.onAuthorization = function(handshake, accept) {
        //~ console.log('*** AUTHORIZATION() ***', handshake);
        // Parse the cookie if it's present.
        if (handshake.headers.cookie) {
            handshake.cookie = parseCookie(handshake.headers.cookie);
            // Django stores its session ID as 'sessionid'.
            var sessionID = handshake.cookie['sessionid'];
            handshake.sessionID = sessionID;
            loadSession(sessionID, function(err, session) {
                if (!err) {
                    handshake.session = session;
                    onSessionLoaded(err, session);
                }
            });
            // Accept the incoming connection whether or not the session
            // loads successfully.
            //~ accept(null, true);
        //~ }
        //~ else {
            //~ // No cookie? Still connect.
            //~ accept('No cookie transmitted.', true);
        }
        // Accept the incoming connection whether or not the session
        // loads successfully.
        accept(null, true);
    }
    
    
    /**
     * Adds more handlers and stores the session->socket link for valid
     * connections.
     *  @param socket:io.Socket
     */
    var onConnect = function() {
        // Ask for the session on session-less connections.
        if (!socket.handshake.sessionID) {
            socket.emit('request_session_id');
            socket.on('session', onSessionIdReceived);
        }
        else {
            linkSocketToSession();
        }
        
        socket.on('disconnect', function() {
            unlinkSocketFromSession();
        });
    }
    
    
    /**
     * 
     */
    var onSessionLoaded = function(err, session) {
        // Reset the expire on the session key for good sessions.
        if (session) redis.expire(buildSessionKey(session.id), session_timeout);
        if (session) {
            socket.emit('session_auth');
        }
        if (onSessionLoadedCB) onSessionLoadedCB(err, session)
    }
    
    
    /**
     * Handler for accepting a session id.
     */
    var onSessionIdReceived = function(data) {
        if (self.debug_mode)
            console.log('*** onSessionIdReceived ***', 'sessionid:', data.sessionid);
        loadSession(data.sessionid, onSessionLoaded);
    }
    
    
    //~ var onConnect = function (sck) {
        //~ socket = sck;
        //~ 
        //~ socket.emit('authorize');
        //~ console.log('socket.id', socket.id)
        //~ 
        //~ // Ping event to refresh session of opened browser window
        //~ // --------------------------------------------
        //~ // socket.on('auth_ping', onAuthPing);
        //~ 
        //~ socket.on('auth', onAuth);
        //~ 
    //~ }
    //~ 
    //~ 
    //~ /**
     //~ * Ping event to refresh session of opened browser window.
     //~ */
    //~ var onAuthPing = function (data) {
        //~ console.log("ping sessionid:", data.sessionid);
        //~ self.ping(data.sessionid, function(err, session) {
            //~ console.log("Pinged: ", session, data.sessionid)
        //~ });
    //~ }
    //~ 
    //~ 
    //~ this.ping = function(sessionid, callback) {
        //~ console.log("pinging session ", sessionid)
        //~ self.authorize(sessionid, callback);
    //~ };
    
    
    /**
     * 
     * The functions below serve more-or-less as a session model and 
     * might go better in an explicit model class but they're fine here 
     * for now.
     * 
     * Only the currently externally accessed functions are exposed.
     * Private functions can be made public as needed.
     * 
     */
     
     
    /**
     * Gets all the sessions associated with a user.
     *  @param userid:Int
     *  @param callback:Function(err:String, sessions:Array)
     */
    var userSessions = function(userid, callback) {
        userSessionKeys(userid, function(err, sessionids) {
            loadSessions(sessionids, callback);
        });
    };
    
    
    /**
     * Gets all the session keys associated with a user.
     *  @param userid:Int
     *  @param callback:Function(err:String, sessionKeys:Array)
     */
    var userSessionKeys = function(userid, callback) {
        redis.smembers(buildUsersSessionsKey(userid), callback)
    };
    
    
    /**
     * Centralises session key creation.
     *  @param sessionid:String
     */
    var buildSessionKey = function(sessionid) {
        return 'session:' + sessionid;
    };
    
    
    /**
     * Centralises the socket.session list key creation.
     *  @param sessionid:String
     */
    var buildSessionSocketKey = function() {
        return 'socket.session:' + socket.sessionID;
    };
    
    
    /**
     * Centralises the session.user list key creation.
     *  @param userid:Int
     */
    var buildUsersSessionsKey = function(userid) {
        return 'session.user:' + userid;
    };
    
    
    /**
     * This is an optimisation to avoid having to retrieve a session id
     * in self.userSockets().
     *  @param sessionKey:String
     */
     var buildSocketKeyFromSessionKey = function(sessionKey) {
        return sessionKey.replace('session:', 'socket.session:');
    };
    
    
    /**
     * Returns the active socketids for a user in a callback.
     *  @param user_id:Int
     *  @param callback:Function(err, socketids)
     */
    this.userSockets = function(user_id, callback) {
        if (!callback) return;
        userSessionKeys(user_id, function(err, sessionKeys) {
            if (err) {
                callback(err);
            }
            else {
                var sockets = [], cmds = sessionKeys.map(function(key) {
                    //console.log('fetching sockets for key:', key);
                    return ['smembers', buildSocketKeyFromSessionKey(key)];
                });
                //console.log('cmds:', cmds);
                redis.multi(cmds).exec(function(err, results) {
                    if (self.debug_mode)
                        console.log('found sockets:', err, results);
                    results.forEach(function(r) {
                        sockets = sockets.concat(r);
                    });
                    callback(err, sockets);
                });
            }
        });
    };
    
    
    /**
     * Associates the passed socket with the session so we can 
     * broadcast events out to all sockets associated with a given 
     * session.  The result array passed to the callback is not 
     * terribly helpful.  It will generally be [0,1] or [1,1] to show
     * that the addition was or wasn't new and that the expire was
     * successful, respectfully.
     *  @param socket:io.Socket
     *  @param callback:Function(err:String, result:Array)
     */
    var linkSocketToSession = function(sessionid,callback) {
        socket.sessionID = sessionid;
        var socketKey = buildSessionSocketKey(sessionid);
        if (self.debug_mode)
            console.log('*********** link to *************',socketKey)
        redis.multi()
          .sadd(socketKey, socket.id)
          .expire(socketKey, session_timeout)
          .exec(function(err, result) {
            if (self.debug_mode)
                console.log("User connected with sessionID:", socket.handshake.sessionID);
            callback && callback(err, result);
        });
        callback && callback("Not a valid session.", null);
    };
    
    
    /**
     * Disassociates the passed socket from its session.
     *  @param socket:io.Socket
     */
    var unlinkSocketFromSession = function() {
        redis.srem(buildSessionSocketKey(), socket.id);
    };
    
    
    /**
     * Stores a session object in a Redis hash.  We could get the 
     * sessionid from the session object...
     *  @param userid:Int
     *  @param sessionid:String
     *  @param session:Object
     */
    this.addSession = function(userid, sessionid, session) {
        var sessionKey = buildSessionKey(sessionid);
        redis.multi([
            ['hmset', sessionKey, session],
            ['expire', sessionKey, session_timeout],
            ['sadd', buildUsersSessionsKey(userid), sessionKey],
            ['expire', buildUsersSessionsKey(userid), session_timeout]
        ]).exec(function(err, result) {
            if (self.debug_mode)
                console.log('SocketAuthentication.addSession()', err, result);
        });
    };
    
    
    /**
     * Returns the session as the second argument in the callback. 
     *  @param sessionid:String
     *  @param callback:Function(err:String, session:Object)
     */
    var loadSession = function(sessionid, callback) {
        redis.hgetall(buildSessionKey(sessionid), function(err, session) {
            linkSocketToSession(sessionid);
            callback && callback(err, session);
        });
    };
    
    
    /**
     * Basically mget for session hashes.
     *  @param sessionids:Array
     *  @param callback:Function(err:String, sessions:Array)
     */
    var loadSessions = function(sessionids, callback) {
        var cmds = sessionids.map(function(id) {
            return ['hgetall', buildSessionKey(id)];
        });
        redis.multi(cmds).exec(callback);
    };
    
    
    _init();
    
    return this;
}
