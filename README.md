# github_copilot_demo

# ♟ 3D Chess

A fully-featured **3D chess game** built in JavaScript using Three.js.

## Features

- **3D Rendered Board** – Beautifully rendered 3D chessboard with distinct piece models (Pawn, Rook, Knight, Bishop, Queen, King), shadows and lighting effects
- **Complete Chess Rules** – Full move validation including castling, en passant, pawn promotion, check, checkmate, and stalemate detection
- **Local Multiplayer** – Two players take turns on the same device
- **Online Multiplayer** – Peer-to-peer online play via WebRTC (PeerJS); one player creates a room and shares the code, the other player joins
- **Customisable Piece Colours** – Choose from preset colours or use the colour picker for any colour you want for both players' pieces
- **3D Camera Controls** – Orbit, zoom and pan around the board freely
- **Board Flip** – Flip the board to view from either side
- **Move History** – Full algebraic notation move log

## How to Play

1. Open `index.html` in a browser (or serve with any HTTP server)
2. Choose **Local Multiplayer** or **Online** mode
3. Pick piece colours for each player
4. Click **Start Game**

### Online Multiplayer

- **Create Game**: Player 1 clicks "Online – Create", then "Start Game". A room code appears — share it with your opponent.
- **Join Game**: Player 2 clicks "Online – Join", enters the room code, then "Start Game". The game starts automatically when both players connect.

## Tech Stack

| Library | Purpose |
|---------|---------|
| [Three.js r128](https://threejs.org/) | 3D rendering |
| [OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls) | Camera interaction |
| [PeerJS 1.3.2](https://peerjs.com/) | WebRTC peer-to-peer online multiplayer |

## Project Structure

```
index.html           – Main HTML page (setup + game screens)
css/style.css        – Dark-themed responsive UI styles
js/chess-engine.js   – Chess rules engine (moves, check, castling, en passant, promotion)
js/renderer3d.js     – Three.js 3D scene, board, and piece rendering
js/multiplayer.js    – Local & online (PeerJS WebRTC) multiplayer manager
js/app.js            – Main application controller
```
