
exports = module.exports = Manager;

function Manager(io, plugin, options) {
	var SocketAuth = require('./plugins/' + plugin);

	SocketAuth(io, options);

}