// Floor registry, top to bottom (the elevator panel and the title picker use this order).
// Each module default-exports a floor spec — contract in ./README.md.
import roof from './roof.js';
import exec from './exec.js';
import office from './office.js';
import hall from './hall.js';
import lobby from './lobby.js';
import pub from './pub.js';
import parking from './parking.js';

export const FLOORS = [roof, exec, office, hall, lobby, pub, parking];
export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f]));
