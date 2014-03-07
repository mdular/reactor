var http = require('http'),
	io = require('socket.io'),
	fs = require('fs'),
	actions = {},
	commands = {},
	games = {},
	players = {},
	entities = [],
	gameStarted = false;

var server = http.createServer(function (request, response) {
	fs.readFile(__dirname + '/index.html', function (err, data) {
		if (err) {
			response.writeHead(500);
			return response.end('Error loading index.html');
		}

		response.writeHead('200', {
			'Content-Type' : 'text/html'
		});
		response.write(data);
		response.end();
	});
});

var createGame = function () {
	// create new game
	var gamesCount = Object.keys(games).length,
		waitTime = 1000,
		id = gamesCount,
		date = new Date(),
		startTime = date.getTime() + waitTime,
		game = {
			name 	: 'game ' + id,
			players : [],
			startTime : 1000
		};
	
	for (var key in players) {
		game.players.push(key);
	}

	games[id] = game;
};

var startGame = function (gameId) {
//console.log('startGame', games[gameId].players);
	gameStarted = true;
	var game = games[gameId];	

	// send start command to players
	for (var key in game.players) {
		//console.log('send start command to player', players[game.players[key]]);
		commands.start(players[game.players[key]], game);
	};

	// TODO: use ticks from webdungeons to queue game start with a small delay

	if (gameStarted) {
		commands.spawn(gameId, game.startTime);
	}

	// TODO: remove players from queue.. MAKE QUEUE
};

var addPlayer = function (gameId, playerId) {
console.log('adding player', playerId);
	games[gameId].players.push(playerId);
};

var removePlayer = function (gameId, playerId) {
//console.log('removePlayer', playerId);
//console.log('before remove:', games[gameId].players);
//console.log('player indexOf:', games[gameId].players.indexOf(playerId));
	games[gameId].players.splice(games[gameId].players.indexOf(playerId), 1);
//console.log('after remove:', games[gameId].players);
//console.log('players left:', games[gameId].players.length);
	// stop game if only 1 player left
	if (games[gameId].players.length < 2) {
		stopGame(gameId);
	}
};

var stopGame = function (gameId) {
	gameStarted = false;
	commands.stop(games[gameId], 'game stopped. not enough players.');
	delete games[gameId];
};

// actions received from client
actions = {
	join 	: function (socket, data) {
		//console.log('join', data);

		var playerCount = Object.keys(players).length,
			id = Math.round(Math.random() * 100000),
			player = {
				name 	: 'player ' + id, // player name
				socket 	: socket,
				score	: 0
			};

		// TODO: proper player manager
		players[id] = player;
		playerCount++;

		// TODO: confirm join

		// TODO: game manager

		// ghetto queue
		// TODO: proper queue!
		if (playerCount > 1 && !gameStarted) {
			createGame();
			// start game
			startGame(0);
		} else if (gameStarted) {
			addPlayer(0, id);
		}
	},
	leave	: function (socket, data) {
		// TODO: remove form queue
		console.log('leave');
	},
	getStats	: function (socket, data) {
		commands.updateStats(socket);
	},
	click 	: function (socket, data) {
console.log('click', data);

		// TODO: loose validation.. check if click happened somewhere near relative coordinates, 
		// this will make simple trigger('click')-cheating inefficient.

		var hit = false;

		for (var key in entities) {
			var entity = entities[key];

			// let's keep this simple!
			// this will easily become more precise by factor based object size
			if (
				data.x > entity.x // click is within left boundary
				&& data.x - 20 < entity.x // click is tolerably within right boundary (20% screen width)
				&& data.y > entity.y // click is within upper boundary
				&& data.y - 20 < entity.y // click is tolerably within lower boundary (20% screen height)
				) {
				hit = true;
				break;
			}
		}

		if (hit) {
console.log('click is a hit');

			var game = games[0];
			var winner;

			for (var key in game.players) {
				var pl = players[game.players[key]];
				if (pl.socket === socket) {
					pl.score++;
					commands.destroy(game, game.players[key]);
					commands.spawn(0);
					break;
				}
			}
		} else {
console.log('not a hit..');
		}
	}
}

// commands sent to client
commands = {
	updateStats	: function (socket) {
		var playerId;
		for (var key in players) {
			if (players[key].socket === socket) {
				playerId = key;
				break;
			}
		}

		socket.emit('react', {
			action 	: 'updateStats',
			data	: {
				players	: Object.keys(players).length,
				games	: Object.keys(games).length,
				score	: players[playerId].score
			}
		});
	},
	start		: function (player, game) {
//console.log('send start command', player);

		// TODO: update opponents.. maybe on updateStats?
		/*
		var opponents = [];
		for (var key in game.players) {
			opponents[game.players[key]] = players[game.players[key]].name;
		}*/

		player.socket.emit('react', {
			action 	: 'start',
			data	: {
				game 	  : game.name,
				//opponents : opponents,
				startTime : game.startTime
			}
		})
	},
	spawn 		: function (gameId, delay) {
		//console.log('spawn', gameId);

		var game = games[gameId],
			scale = Math.round((.5 + (Math.random() * .5)) * 100) / 100,
			x = Math.round(Math.random() * 100),
			y = Math.round(Math.random() * 100),
			entity = {
				scale	: scale,
				x		: x,
				y 		: y
			};

		entities.push(entity);

		for (var key in game.players) {
			players[game.players[key]].socket.emit('react', {
				action 	: 'spawn',
				data	: entity
			});
		};
	},
	destroy		: function (game, winnerId) {
		//var game = games[gameId];

		for ( var key in game.players ) {
			var pl = players[game.players[key]],
				data = {};

			if (pl === players[winnerId]) {
				data.success = true;
				data.message = 'you won this round!';
			} else {
				data.success = false;
				data.message = 'you were too slow - try harder!';
			}

			pl.socket.emit('react', {
				action 	: 'destroy',
				data	: data
			});
		}
	},
	stop		: function (game, message) {
console.log('sending stop command to', game.players);
		for (var key in game.players) {
			players[game.players[key]].socket.emit('react', {
				action 	: 'stop',
				data	: {
					message	: message
				}
			});
		}
	}
};

server.listen(1337);
io = io.listen(server);

io.sockets.on('connection', function (socket) {

	// route 'react' actions
	socket.on('react', function (data) {
		if (typeof actions[data.action] === 'function') {
			actions[data.action].apply(actions[data.action], [socket, data.data]);
		}
	});

	// handle connection drop
	socket.on('disconnect', function (data) {

		var player, playerId;

		// dirty find & remove player
		// TODO: user manager
		for (var key in players) {
			var pl = players[key];
			//console.log(pl.socket.id);
			//console.log(socket.id);
			if (pl.socket === socket) {
				player = players[key],
				playerId = key;
				break;
			}
		}

//console.log('player', playerId, 'disconnected.');
//console.log('typeOf playerId', typeof playerId);
		if (typeof games[0] !== 'undefined') {
			removePlayer(0, playerId);
		}
		//console.log('removed player. game: ', games[0].players);

		delete players[key];
		//console.log('deleted player. players: ', players);
	});
});