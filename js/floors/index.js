// Floor registry, top to bottom (the elevator panel and the title picker use this order).
// Each module default-exports a floor spec — contract in ./README.md.
import roof from './roof.js';
import exec from './exec.js';
import office from './office.js';
import hall from './hall.js';
import lobby from './lobby.js';
import pub from './pub.js';
import parking from './parking.js';
import street from './street.js';

// street (회사 앞 거리) is not an elevator stop (spec.outside): you reach it through the lobby's revolving door
export const FLOORS = [roof, exec, office, hall, lobby, pub, parking, street];
export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f]));
