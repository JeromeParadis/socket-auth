
exports = module.exports = Manager;

function Manager(io, plugin, options, callback) {
	var SocketAuth = require('./plugins/' + plugin);

	return SocketAuth(io, options, callback);
}