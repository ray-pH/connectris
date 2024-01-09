import * as PIXI from 'pixi.js'

const app = new PIXI.Application({
    width: 400,
    height: 600,
    backgroundColor: 0x111111,
    view: document.getElementById('game-canvas') as HTMLCanvasElement,
});
const gridsize = 40;
const nx = Math.floor(app.screen.width / gridsize);
const ny = Math.floor(app.screen.height / gridsize);

const tetromino_data = {
    'T' : [[-1,0],[0,0],[1,0],[0,1]],
    'L' : [[-1,0],[0,0],[1,0],[1,1]],
    'J' : [[-1,0],[0,0],[1,0],[-1,1]],
    'O' : [[0,0],[1,0],[0,1],[1,1]],
    'S' : [[-1,0],[0,0],[0,1],[1,1]],
    'Z' : [[-1,1],[0,1],[0,0],[1,0]],
    'I' : [[-2,0],[-1,0],[0,0],[1,0]],
}
const colors = [
    // 0x00ffff, // "#00FFFF"
    0x0000ff, // "#0000FF"
    // 0xffaa00, // "#FFAA00"
    0xffff00, // "#FFFF00"
    0x00ff00, // "#00FF00"
    0x9900ff, // "#9900FF"
    0xff0000, // "#FF0000"
]
const tetromino_data_rotation : (typeof tetromino_data)[] = []
tetromino_data_rotation[0] = tetromino_data;
for (let i = 1; i < 4; i++){
    let t_data : any = {};
    for (let type in tetromino_data_rotation[i-1]){
        let cells = tetromino_data_rotation[i-1][type as keyof typeof tetromino_data];
        let new_cells = [];
        for (let cell of cells){
            // rotate 90 degrees
            new_cells.push([cell[1], -cell[0]]);
        }
        t_data[type as keyof typeof tetromino_data] = new_cells;
    }
    tetromino_data_rotation[i] = t_data;
}


const tetromino_types = Object.keys(tetromino_data);
let current_piece : {
    type: keyof typeof tetromino_data,
    rotation : 0 | 1 | 2 | 3,
    color : number,
    xf: number,
    yf: number,
    x : number,
    y : number,
    fallspeed : number,
}
type pos = [number, number];
let targets : ([number, pos, pos])[] = [];
let field : number[][] = [[]]
let target_connections : ([number, boolean, pos[], pos[]])[] = [];
let done = false;

const graphics = new PIXI.Graphics();
const placedmino = new PIXI.Graphics();
const gridlines = new PIXI.Graphics();
const targetgraphics = new PIXI.Graphics();
const targethighlight = new PIXI.Graphics();
app.stage.addChild(graphics);
app.stage.addChild(placedmino);
app.stage.addChild(gridlines);
app.stage.addChild(targethighlight);
app.stage.addChild(targetgraphics);

function draw_cell(x : number, y : number, color : number, g : PIXI.Graphics = graphics) {
    g.beginFill(color);
    g.drawRect(x * gridsize, y * gridsize, gridsize, gridsize);
    g.endFill();
}
function draw_tetromino(piece : typeof current_piece) {
    let cells = tetromino_data_rotation[piece.rotation][piece.type];
    for (let cell of cells) {
        draw_cell(piece.x + cell[0], piece.y + cell[1], piece.color);
    }
}
function draw_placedmino(field : number[][]){
    placedmino.clear();
    for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
            if (field[y][x] != 0){
                draw_cell(x, y, field[y][x], placedmino);
            }
        }
    }
}
function draw_target_cell(x : number, y : number, color : number){
    targetgraphics.beginFill(0xffffff);
    targetgraphics.drawCircle(x * gridsize + gridsize/2, y * gridsize + gridsize/2, gridsize/2 - 8);
    targetgraphics.endFill();
    targetgraphics.beginFill(color);
    targetgraphics.drawCircle(x * gridsize + gridsize/2, y * gridsize + gridsize/2, gridsize/2 - 10);
    targetgraphics.endFill();
}
function draw_targets(){
    targetgraphics.clear();
    for (let target of targets){
        let color = target[0];
        let pos0 = target[1];
        let pos1 = target[2];
        draw_target_cell(pos0[0], pos0[1], color);
        draw_target_cell(pos1[0], pos1[1], color);
    }
}
function draw_target_highlight(){
    targethighlight.clear();
    const pad = 10;
    for (let target of target_connections){
        let color = target[0];
        for (let pos of target[2]){
            targethighlight.beginFill(0xffffff);
            targethighlight.drawRect(pos[0] * gridsize + pad, pos[1] * gridsize + pad, gridsize - 2*pad, gridsize - 2*pad)
            targethighlight.endFill();
        }
        if (target[1]) continue;
        for (let pos of target[3]){
            targethighlight.beginFill(0xffffff);
            targethighlight.drawRect(pos[0] * gridsize + pad, pos[1] * gridsize + pad, gridsize - 2*pad, gridsize - 2*pad)
            targethighlight.endFill();
        }
    }
}
function draw_grid() {
    gridlines.clear();
    gridlines.lineStyle(1, 0xaaaaaa, 1);
    for (let x = 0; x < nx; x++) {
        gridlines.moveTo(x * gridsize, 0);
        gridlines.lineTo(x * gridsize, app.screen.height);
        gridlines.endFill();
    }
    for (let y = 0; y < ny; y++) {
        gridlines.moveTo(0, y * gridsize);
        gridlines.lineTo(app.screen.width, y * gridsize);
        gridlines.endFill();
    }
}

function initialize_field(){
    for (let y = 0; y < ny; y++) {
        field[y] = [];
        for (let x = 0; x < nx; x++) {
            field[y][x] = 0;
        }
    }
    // Add floor
    field[ny] = [];
    for (let x = 0; x < nx; x++) {
        field[ny][x] = 1;
    }
}

function generate_target() : [number, pos, pos] {
    loop1: while (true){
        let x0 = Math.floor(Math.random() * nx);
        let y0 = Math.floor(ny - Math.random() * ny/2);
        let x1 = Math.floor(Math.random() * nx);
        let y1 = Math.floor(ny - Math.random() * ny/2);
        let color = colors[Math.floor(Math.random() * colors.length)];
        // keep generating until we get a valid target
        if (x0 == x1 && y0 == y1) continue;
        for (let target of targets){
            if (target[0] == color) continue loop1;
            if (target[1][0] == x0 && target[1][1] == y0) continue loop1;
            if (target[2][0] == x0 && target[2][1] == y0) continue loop1;
            if (target[1][0] == x1 && target[1][1] == y1) continue loop1;
            if (target[2][0] == x1 && target[2][1] == y1) continue loop1;
        }
        return [color, [x0, y0], [x1, y1]];
    }
}
function regenerate_targets(n : number) {
    targets = [];
    for (let i = 0; i < n; i++) targets.push(generate_target());
}

function generate_piece() {
    let type = tetromino_types[Math.floor(Math.random() * tetromino_types.length)] as keyof typeof tetromino_data;
    let x = Math.floor(nx/2);
    let color = colors[Math.floor(Math.random() * colors.length)];
    current_piece = {
        type: type,
        rotation : 0,
        color: color,
        xf: x,
        yf: 0.0,
        x : x,
        y : 0,
        fallspeed : 0.04,
    }
}

/** return true if there is a collision */
function check_collision(piece : typeof current_piece, field : number[][]) : boolean {
    let cells = tetromino_data_rotation[piece.rotation][piece.type]
    for (let cell of cells){
        let cellx = current_piece.x + cell[0];
        let celly = current_piece.y + cell[1];
        if (field[celly][cellx] != 0) return true
    }
    return false
}

function store_piece(piece : typeof current_piece, field : number[][]) {
    // store piece in field after collision (offset upwards by 1)
    let cells = tetromino_data_rotation[piece.rotation][piece.type]
    for (let cell of cells){
        let cellx = piece.x + cell[0];
        let celly = piece.y + cell[1] - 1;
        field[celly][cellx] = piece.color;
    }
}

function get_neighbors(pos : pos, color : number) : pos[] {
    let neigh = [
        [pos[0] - 1, pos[1]] as pos,
        [pos[0] + 1, pos[1]] as pos,
        [pos[0], pos[1] - 1] as pos,
        [pos[0], pos[1] + 1] as pos
    ].filter((p) =>  
        p[1] >= 0 && p[1] < ny && p[0] >= 0 && p[0] < nx &&
        field[p[1]][p[0]] == color );
    return neigh;
}
function get_connected_colors(start : pos, color : number) : pos[] {
    if (field[start[1]][start[0]] != color) return [];
    let group : pos[] = [];
    let heads : pos[] = [start];
    while (heads.length > 0){
        let head = heads.pop() as pos;
        group.push(head);
        for (let neigh of get_neighbors(head, color)){
            if (!poslist_contain(group, neigh) && !poslist_contain(heads, neigh)) heads.push(neigh);
        }
    }
    return group;
}
function poslist_contain(poslist : pos[], pos : pos) : boolean {
    for (let p of poslist) if (p[0] == pos[0] && p[1] == pos[1]) return true;
    return false;
}


function calc_target() {
    target_connections = [];
    for (let target of targets){
        let color = target[0];
        let pos0 = target[1];
        let pos1 = target[2];
        let conn0 = get_connected_colors(pos0, color);
        let conn1 = get_connected_colors(pos1, color);
        let connected = poslist_contain(conn1, pos0);
        target_connections.push([color, connected, conn0, conn1] as [number, boolean, pos[], pos[]]);
    }
}

function handleKeyDown(event: KeyboardEvent) {
    let cells = tetromino_data_rotation[current_piece.rotation][current_piece.type];
    switch (event.key) {
        case 'ArrowLeft':
            // move left if possible
            for (let cell of cells){
                let x = current_piece.x + cell[0];
                if (x == 0) return;
                if (field[current_piece.y + cell[1]][x - 1] != 0) return;
            }
            current_piece.x  -= 1;
            current_piece.xf -= 1;
            break;
        case 'ArrowRight':
            // move right if possible
            for (let cell of cells){
                let x = current_piece.x + cell[0];
                if (x == nx - 1) return;
                if (field[current_piece.y + cell[1]][x + 1] != 0) return;
            }
            current_piece.x  += 1;
            current_piece.xf += 1;
            break;
        case 'ArrowUp':
            // rotate if possible
            let new_rotation = (current_piece.rotation + 1) % 4;
            let new_cells = tetromino_data_rotation[new_rotation][current_piece.type];
            for (let cell of new_cells){
                let x = current_piece.x + cell[0];
                let y = current_piece.y + cell[1];
                if (x < 0 || x >= nx || y < 0 || y >= ny) return;
                if (field[y][x] != 0) return;
            }
            current_piece.rotation = new_rotation as 0 | 1 | 2 | 3;
            break;
        case 'ArrowDown':
            // move down if possible
            for (let cell of cells){
                let y = current_piece.y + cell[1];
                if (y == ny - 1) return;
                if (field[y + 1][current_piece.x + cell[0]] != 0) return;
            }
            current_piece.yf  += 1;
            current_piece.y   += 1;
            break;
        case 'r':
            reset();
            break;
    }
}

function is_row_completed(y : number) : boolean {
    for (let x = 0; x < nx; x++) if (field[y][x] == 0) return false;
    return true;
}
function remove_completed_row() {
    let destroyed_rows : number[] = [];
    for (let y = 0; y < ny; y++) {
        if (is_row_completed(y)) destroyed_rows.push(y);
    }
    if (destroyed_rows.length == 0) return;

    // remove the destroyed rows
    for (let y of destroyed_rows){
        for (let x = 0; x < nx; x++) field[y][x] = 0;
    }
    // push down the rows above by number of destroyed rows below
    for (let y = ny-1; y >= 0; y--){
        if (destroyed_rows.includes(y)) continue;
        let destroyed_rows_below = destroyed_rows.filter((row) => row > y);
        let count = destroyed_rows_below.length;
        if (count == 0) continue;
        // move row y to row y+count
        for (let x = 0; x < nx; x++) {
            field[y+count][x] = field[y][x];
            field[y][x] = 0;
        }
    }
}
function remove_completed_target() {
    // console.log(target_connections);
    for (let i = 0; i < target_connections.length; i++){
        let completed = target_connections[i][1];
        if (completed){
            for (let pos of target_connections[i][2]){
                field[pos[1]][pos[0]] = 0;
            }
            // remove target_connections[i] and targets[i]
            target_connections.splice(i, 1);
            targets.splice(i, 1);
        }
    }
}

function update(delta : number) {
    if (done) return;

    graphics.clear();
    current_piece.yf += current_piece.fallspeed * delta;
    current_piece.y = Math.floor(current_piece.yf);

    // check if piece has landed
    if (check_collision(current_piece, field)){
        store_piece(current_piece, field);
        remove_completed_row();
        calc_target();
        remove_completed_target();
        draw_placedmino(field);
        draw_targets();
        draw_target_highlight();
        generate_piece();
        if (check_collision(current_piece, field)){
            done = true;
            alert("You lose!");
        }
        if (targets.length == 0){
            done = true;
            alert("You win!");
        }
    } else{
        draw_tetromino(current_piece);
    }
}

function reset(){
    done = false;
    initialize_field();
    regenerate_targets(2);
    generate_piece();
    draw_grid();
    draw_placedmino(field);
    draw_targets();
    draw_target_highlight();
}
function main(){
    reset();
    app.ticker.add(update);
    window.addEventListener('keydown', handleKeyDown);
}

main();
