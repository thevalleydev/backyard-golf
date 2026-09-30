# Room server protocol

The server listens on `PORT` (default `3000`) for `GET /healthz` and WebSocket
upgrades at `/`. Set `CLIENT_ORIGIN` to the exact browser origin permitted in
production (for example `https://golf.example`); HTTP(S) localhost, 127.0.0.1,
and `[::1]` origins are also permitted for local development. Without
`CLIENT_ORIGIN`, only local browser origins are accepted. Non-browser clients
without an `Origin` header are allowed only when `CLIENT_ORIGIN` is unset.
There is no persistence: rooms expire after two hours without activity, and
all rooms disappear when the process exits.

`room-server.ts` exports `createServer(options?)` for integration tests and
embedding; it starts listening and resolves to `{server, port, close}`. The
separate `index.ts` is the CLI entry point. Importing either module does not
start a listener. Relative TypeScript imports use the `.js` runtime extension
required by NodeNext, including `index.ts` importing `./room-server.js`.

All messages are UTF-8 JSON text. Clients send:

| Command | Fields | Effect |
| --- | --- | --- |
| `create` | `name: string`, `config: {holes: number}` | Create a lobby; holes must be an integer from 1 to 18. |
| `join` | `code: string`, `name: string`, optional `token: string` | Join a lobby, or reconnect with the original name and token at any room status. Codes are case-sensitive, six uppercase characters. Maximum four players. |
| `start` | `token: string` | Host starts the lobby, selecting the first connected player. |
| `next` | `token: string` | Host advances to the next connected, unfinished player while playing. When **all** players report done, instead advances the hole or marks the room finished. This is manual turn control, not a physics verdict. |
| `leave` | `token: string` | Optional explicit departure; removes the player and closes the socket. If the host leaves, the first remaining player becomes host. |
| `call` | `token: string`, `target: Target` | Current player calls a target before shooting. |
| `shot` | `token: string`, `shot: Shot` | Current player relays a shot after calling a target. |
| `result` | `token: string`, `result: Result` | Current player reports a result after a shot; the next eligible player's turn begins. |

`Target` is `{id: string, sub: number|null, rule: number,
modifier: string|null, lead: {id: string, sub: number|null}|null}`. `Shot` is
`{power: number, dir: number, curve: number, loft: number}`, all finite.
`Result` is `{ball: [number, number, number], strokes: number, won: boolean,
done: boolean}`; ball coordinates are finite, `strokes` is a nonnegative,
nondecreasing **current-hole total**, and `won` implies `done`. The server
records reported results but **does not simulate, validate, or adjudicate
physics**, targets, or scoring claims. The client must not present these data
as server-authoritative.

On creation, joining/reconnecting, disconnection, departure, calls, shots,
results, `start`, and `next`, each remaining connected player receives:

```json
{
  "type": "room",
  "room": {
    "code": "ABC234",
    "status": "lobby",
    "hostId": "player-id",
    "players": [
      {
        "id": "player-id",
        "name": "Player",
        "connected": true,
        "strokes": 0,
        "done": false,
        "won": false
      }
    ],
    "currentPlayerId": null,
    "callerId": null,
    "hole": 1,
    "holes": 9,
    "target": null
  },
  "you": {"id": "player-id", "token": "private-reconnect-token"}
}
```

`room.players[].strokes` accumulates reported strokes **across holes**.
`room.players[].ball` appears after a reported result and resets on a new hole.
`done` and `won` reset on a new hole. `currentPlayerId` is null before start,
after finish, or when no connected unfinished player remains. `callerId`
and `target` remain set from `call` until the result, manual turn advance, or
current-player disconnection. Each recipient's `you.token` is private to their
own room update. Send it with every subsequent command; reconnect with
`join` after a lost connection.

The server also broadcasts `{type:"shot",playerId,shot}` and
`{type:"result",playerId,result}` to all connected players, including the
sender. Each relay broadcast precedes its updated room snapshot. Invalid
commands yield `{type:"error",message:string}` only to their sender. Messages
are limited to 4096 bytes; oversized frames may close the connection.

This first milestone supports a synchronized lobby and manual turn control.
`call`/`shot`/`result` are a validated **peer-reporting relay**, not a
multiplayer physics engine. Clients that have no coordinated shot simulation
should use only `create`/`join`/`start`/`next`/`leave`.
