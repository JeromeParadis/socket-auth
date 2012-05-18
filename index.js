
exports = module.exports = Manager;

function Manager(io, options, callback) {
	
	var SocketAuth = require('./plugins/' + options.plugin);

	return SocketAuth(io, options, callback);
}
