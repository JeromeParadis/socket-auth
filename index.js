
exports = module.exports = Manager;

function Manager(io, plugin, options) {
	var SocketAuth = require('./plugins/' + plugin);

	return SocketAuth(io, options);
}