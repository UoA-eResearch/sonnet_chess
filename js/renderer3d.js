'use strict';

// 3D Chess Renderer using Three.js
// Requires THREE and THREE.OrbitControls to be loaded globally

class ChessRenderer3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);

    // Visual color settings (hex numbers)
    this.pieceColors = {
      white: 0xf5f5f5,
      black: 0x2d2d2d
    };
    this.boardColors = {
      light: 0xf0d9b5,
      dark: 0xb58863
    };
    this.highlightColor = {
      selected: 0x4fc3f7,
      move:     0x81c784,
      capture:  0xe57373,
      check:    0xff5252,
      lastMove: 0xffd54f
    };

    this.pieceMeshes = {};  // "r,c" -> THREE.Group
    this.squareMeshes = []; // [r][c] -> THREE.Mesh
    this.highlights = [];
    this.interactables = [];
    this.flipped = false;

    this.onSquareClick = null;

    this._setup();
    this._createBoard();
    this._animate();
  }

  _setup() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f0f1a);
    this.scene.fog = new THREE.Fog(0x0f0f1a, 30, 60);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 11, 13);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Orbit controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minPolarAngle = Math.PI / 8;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 28;
    this.controls.target.set(0, 0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff8e7, 1.0);
    sun.position.set(6, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left   = -12;
    sun.shadow.camera.right  =  12;
    sun.shadow.camera.top    =  12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x4466ff, 0.25);
    fill.position.set(-8, 6, -8);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.15);
    rim.position.set(0, 2, -12);
    this.scene.add(rim);

    // Raycaster for click detection
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    window.addEventListener('resize', () => this._onResize());
    this.container.addEventListener('click', e => this._onClick(e));
  }

  _createBoard() {
    // Thick board base
    const baseGeo = new THREE.BoxGeometry(8.6, 0.35, 8.6);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x5d3a1a, shininess: 30 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.18;
    base.receiveShadow = true;
    this.scene.add(base);

    // Subtle border strip on top
    const borderMat = new THREE.MeshPhongMaterial({ color: 0x7b4f28 });
    [
      [0, 4.35, 8.6, 0.06, 0.25],
      [0, -4.35, 8.6, 0.06, 0.25],
      [4.35, 0, 0.25, 0.06, 8.6],
      [-4.35, 0, 0.25, 0.06, 8.6]
    ].forEach(([x, z, bw, bh, bd]) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      const m = new THREE.Mesh(g, borderMat);
      m.position.set(x, 0.03, z);
      this.scene.add(m);
    });

    // Squares
    this.squareMeshes = [];
    for (let r = 0; r < 8; r++) {
      this.squareMeshes[r] = [];
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const geo = new THREE.BoxGeometry(1, 0.07, 1);
        const mat = new THREE.MeshPhongMaterial({
          color: isLight ? this.boardColors.light : this.boardColors.dark,
          shininess: isLight ? 20 : 10
        });
        const mesh = new THREE.Mesh(geo, mat);
        const pos = this._boardTo3D(r, c);
        mesh.position.set(pos.x, 0.035, pos.z);
        mesh.receiveShadow = true;
        mesh.userData = { boardRow: r, boardCol: c };
        this.scene.add(mesh);
        this.squareMeshes[r][c] = mesh;
        this.interactables.push(mesh);
      }
    }

    // Rank/file coordinate labels
    this._addLabels();
  }

  _addLabels() {
    const files = 'abcdefgh';
    // Row 0 visually = rank 8, row 7 = rank 1; labels descend as row index increases
    const rankLabels = '87654321';

    for (let i = 0; i < 8; i++) {
      // File labels (a–h) along near edge
      const fileCanvas = this._makeTextCanvas(files[i], 48, '#d4b483');
      const fileTex = new THREE.CanvasTexture(fileCanvas);
      const fileGeo = new THREE.PlaneGeometry(0.45, 0.45);
      const fileMesh = new THREE.Mesh(fileGeo,
        new THREE.MeshBasicMaterial({ map: fileTex, transparent: true, depthWrite: false }));
      fileMesh.rotation.x = -Math.PI / 2;
      fileMesh.position.set(i - 3.5, 0.001, 4.6);
      this.scene.add(fileMesh);
      this._labelMeshes = this._labelMeshes || [];
      this._labelMeshes.push({ mesh: fileMesh, index: i, axis: 'file' });

      // Rank labels (1–8) along left edge
      const rankCanvas = this._makeTextCanvas(rankLabels[i], 48, '#d4b483');
      const rankTex = new THREE.CanvasTexture(rankCanvas);
      const rankGeo = new THREE.PlaneGeometry(0.45, 0.45);
      const rankMesh = new THREE.Mesh(rankGeo,
        new THREE.MeshBasicMaterial({ map: rankTex, transparent: true, depthWrite: false }));
      rankMesh.rotation.x = -Math.PI / 2;
      rankMesh.position.set(-4.6, 0.001, i - 3.5);
      this.scene.add(rankMesh);
      this._labelMeshes.push({ mesh: rankMesh, index: i, axis: 'rank' });
    }
  }

  _makeTextCanvas(text, size, color) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.font = `bold ${Math.floor(size * 0.65)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);
    return canvas;
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _onClick(event) {
    // Prevent clicks while animating pieces
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, true);

    if (hits.length > 0) {
      const pos = this._getBoardPos(hits[0].object);
      if (pos && this.onSquareClick) {
        this.onSquareClick(pos.row, pos.col);
      }
    }
  }

  _getBoardPos(obj) {
    let cur = obj;
    while (cur) {
      if (cur.userData && cur.userData.boardRow !== undefined) {
        return { row: cur.userData.boardRow, col: cur.userData.boardCol };
      }
      cur = cur.parent;
    }
    return null;
  }

  // Convert board (row, col) to 3D (x, z)
  _boardTo3D(r, c) {
    if (this.flipped) {
      return { x: 3.5 - c, z: 3.5 - r };
    }
    return { x: c - 3.5, z: r - 3.5 };
  }

  // Place piece on the board
  placePiece(r, c, type, color) {
    const key = `${r},${c}`;
    if (this.pieceMeshes[key]) {
      this.scene.remove(this.pieceMeshes[key]);
      this.interactables = this.interactables.filter(o => o !== this.pieceMeshes[key]);
      // Remove children too
      const old = this.pieceMeshes[key];
      old.traverse(child => {
        this.interactables = this.interactables.filter(o => o !== child);
      });
      delete this.pieceMeshes[key];
    }
    if (!type) return;

    const mesh = this._createPieceMesh(type, color);
    const pos = this._boardTo3D(r, c);
    mesh.position.set(pos.x, 0.07, pos.z);
    this._tagMesh(mesh, r, c);

    this.scene.add(mesh);
    this.pieceMeshes[key] = mesh;
    this.interactables.push(mesh);
    mesh.traverse(child => {
      if (child !== mesh) this.interactables.push(child);
    });
  }

  _tagMesh(mesh, r, c) {
    mesh.userData = { boardRow: r, boardCol: c };
    mesh.traverse(child => {
      child.userData = { boardRow: r, boardCol: c };
    });
  }

  removePiece(r, c) {
    this.placePiece(r, c, null, null);
  }

  movePiece(fr, fc, tr, tc) {
    const key = `${fr},${fc}`;
    const mesh = this.pieceMeshes[key];
    if (!mesh) return;

    this.removePiece(tr, tc);

    const pos = this._boardTo3D(tr, tc);
    mesh.position.set(pos.x, 0.07, pos.z);
    this._tagMesh(mesh, tr, tc);

    delete this.pieceMeshes[key];
    this.pieceMeshes[`${tr},${tc}`] = mesh;
  }

  // Handle castling rook move
  castleRookMove(color, kingSide) {
    const homeRow = color === 'white' ? 7 : 0;
    if (kingSide) {
      this.movePiece(homeRow, 7, homeRow, 5);
    } else {
      this.movePiece(homeRow, 0, homeRow, 3);
    }
  }

  // Handle en passant captured pawn removal
  removeEnPassant(fr, tc) {
    this.removePiece(fr, tc);
  }

  // Show highlights for selected square and valid moves
  highlightSquares(squares) {
    this.clearHighlights();
    for (const sq of squares) {
      const geo = new THREE.CylinderGeometry(0.38, 0.38, 0.02, 20);
      const mat = new THREE.MeshBasicMaterial({
        color: sq.color,
        transparent: true,
        opacity: 0.75,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      const pos = this._boardTo3D(sq.r, sq.c);
      mesh.position.set(pos.x, 0.09, pos.z);
      this.scene.add(mesh);
      this.highlights.push(mesh);
    }
  }

  // Highlight the selected piece square with a ring
  highlightSelected(r, c) {
    const geo = new THREE.RingGeometry(0.35, 0.48, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: this.highlightColor.selected,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    const pos = this._boardTo3D(r, c);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.10, pos.z);
    this.scene.add(mesh);
    this.highlights.push(mesh);
  }

  clearHighlights() {
    for (const h of this.highlights) this.scene.remove(h);
    this.highlights = [];
  }

  // Rebuild all pieces from board state
  initPieces(board) {
    // Remove all piece meshes
    for (const key of Object.keys(this.pieceMeshes)) {
      const mesh = this.pieceMeshes[key];
      this.scene.remove(mesh);
      mesh.traverse(child => {
        this.interactables = this.interactables.filter(o => o !== child);
      });
      this.interactables = this.interactables.filter(o => o !== mesh);
    }
    this.pieceMeshes = {};

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]) {
          this.placePiece(r, c, board[r][c].type, board[r][c].color);
        }
      }
    }
  }

  // Update piece colors and rebuild
  setPieceColors(whiteHex, blackHex) {
    this.pieceColors.white = whiteHex;
    this.pieceColors.black = blackHex;
    // Update materials of existing pieces
    for (const [key, mesh] of Object.entries(this.pieceMeshes)) {
      const [r, c] = key.split(',').map(Number);
      const boardPiece = this._getBoardPieceInfo(r, c);
      if (boardPiece) {
        const newColor = boardPiece.color === 'white' ? whiteHex : blackHex;
        mesh.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.color.setHex(newColor);
          }
        });
      }
    }
  }

  // Store board reference for color updates
  setBoardRef(board) {
    this._boardRef = board;
  }

  _getBoardPieceInfo(r, c) {
    if (this._boardRef) return this._boardRef[r][c];
    return null;
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    // Reposition all squares and pieces
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.squareMeshes[r] && this.squareMeshes[r][c]) {
          const pos = this._boardTo3D(r, c);
          this.squareMeshes[r][c].position.x = pos.x;
          this.squareMeshes[r][c].position.z = pos.z;
        }
      }
    }
    for (const [key, mesh] of Object.entries(this.pieceMeshes)) {
      const [r, c] = key.split(',').map(Number);
      const pos = this._boardTo3D(r, c);
      mesh.position.x = pos.x;
      mesh.position.z = pos.z;
    }
    for (const h of this.highlights) {
      this.scene.remove(h);
    }
    this.highlights = [];
  }

  resetCamera(flipped) {
    if (flipped) {
      this.camera.position.set(0, 11, -13);
    } else {
      this.camera.position.set(0, 11, 13);
    }
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // ─── Piece Construction ───────────────────────────────────────────────────

  _createPieceMesh(type, color) {
    const hexColor = color === 'white' ? this.pieceColors.white : this.pieceColors.black;
    const isWhite = color === 'white';
    const mat = new THREE.MeshPhongMaterial({
      color: hexColor,
      specular: isWhite ? 0xaaaaaa : 0x555555,
      shininess: isWhite ? 90 : 45,
      reflectivity: 0.5
    });

    const g = new THREE.Group();

    switch (type) {
      case 'pawn':   this._buildPawn(g, mat);   break;
      case 'rook':   this._buildRook(g, mat);   break;
      case 'knight': this._buildKnight(g, mat); break;
      case 'bishop': this._buildBishop(g, mat); break;
      case 'queen':  this._buildQueen(g, mat);  break;
      case 'king':   this._buildKing(g, mat);   break;
    }

    g.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return g;
  }

  _cyl(parent, mat, rT, rB, h, yBase) {
    const geo = new THREE.CylinderGeometry(rT, rB, h, 22);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = yBase + h / 2;
    parent.add(mesh);
    return mesh;
  }

  _sph(parent, mat, r, y) {
    const geo = new THREE.SphereGeometry(r, 16, 16);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y + r;
    parent.add(mesh);
    return mesh;
  }

  _tor(parent, mat, r, tube, y) {
    const geo = new THREE.TorusGeometry(r, tube, 8, 24);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    parent.add(mesh);
    return mesh;
  }

  _box(parent, mat, w, h, d, x, y, z, rx, ry, rz) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rx) mesh.rotation.x = rx;
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    parent.add(mesh);
    return mesh;
  }

  _buildPawn(g, mat) {
    this._cyl(g, mat, 0.27, 0.31, 0.07, 0.00); // base disk
    this._cyl(g, mat, 0.12, 0.18, 0.22, 0.07); // stem
    this._tor(g, mat, 0.15, 0.045, 0.31);       // collar
    this._sph(g, mat, 0.175, 0.30);             // head
  }

  _buildRook(g, mat) {
    this._cyl(g, mat, 0.27, 0.31, 0.07, 0.00); // base disk
    this._cyl(g, mat, 0.19, 0.22, 0.52, 0.07); // body
    this._cyl(g, mat, 0.23, 0.20, 0.10, 0.59); // top widening
    // Battlements
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this._box(g, mat, 0.10, 0.16, 0.10,
        Math.cos(angle) * 0.15, 0.77, Math.sin(angle) * 0.15);
    }
  }

  _buildKnight(g, mat) {
    this._cyl(g, mat, 0.27, 0.31, 0.07, 0.00); // base
    this._cyl(g, mat, 0.16, 0.20, 0.28, 0.07); // lower body
    // Body block
    this._box(g, mat, 0.22, 0.32, 0.30, 0, 0.53, 0.03, -0.18);
    // Head
    this._box(g, mat, 0.18, 0.20, 0.24, 0, 0.76, 0.09, 0.25);
    // Snout
    this._box(g, mat, 0.12, 0.11, 0.18, 0, 0.71, 0.20);
    // Ear bumps
    this._sph(g, mat, 0.05, 0.84);
  }

  _buildBishop(g, mat) {
    this._cyl(g, mat, 0.27, 0.31, 0.07, 0.00); // base
    this._cyl(g, mat, 0.14, 0.20, 0.33, 0.07); // lower body
    this._tor(g, mat, 0.145, 0.045, 0.42);      // collar
    this._cyl(g, mat, 0.09, 0.14, 0.28, 0.46); // upper body
    this._sph(g, mat, 0.075, 0.72);             // knob
    this._cyl(g, mat, 0.025, 0.065, 0.14, 0.79); // finial tip
  }

  _buildQueen(g, mat) {
    this._cyl(g, mat, 0.29, 0.33, 0.07, 0.00); // base
    this._cyl(g, mat, 0.16, 0.22, 0.38, 0.07); // lower body
    this._tor(g, mat, 0.18, 0.05, 0.47);        // lower collar
    this._cyl(g, mat, 0.10, 0.16, 0.20, 0.51); // upper body
    this._tor(g, mat, 0.13, 0.05, 0.73);        // crown ring
    // Crown points (5)
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const cg = new THREE.CylinderGeometry(0.025, 0.045, 0.12, 8);
      const cm = new THREE.Mesh(cg, mat);
      cm.position.set(Math.cos(angle) * 0.13, 0.86, Math.sin(angle) * 0.13);
      g.add(cm);
    }
    this._sph(g, mat, 0.085, 0.84); // top orb
  }

  _buildKing(g, mat) {
    this._cyl(g, mat, 0.29, 0.33, 0.07, 0.00); // base
    this._cyl(g, mat, 0.17, 0.23, 0.40, 0.07); // lower body
    this._tor(g, mat, 0.19, 0.05, 0.49);        // lower collar
    this._cyl(g, mat, 0.11, 0.17, 0.20, 0.53); // upper body
    this._cyl(g, mat, 0.09, 0.11, 0.10, 0.75); // cross base
    // Cross
    this._box(g, mat, 0.24, 0.07, 0.07, 0, 0.91, 0);
    this._box(g, mat, 0.07, 0.22, 0.07, 0, 0.96, 0);
  }
}
