// Vanamo – eigener Thread für den Intro-Schwarm (siehe intro-flock.mjs). Die Zeichenfläche gehört diesem Worker
// (OffscreenCanvas): Was die Seite im Hauptthread gerade rechnet, bremst den Schwarm nicht.
import {createFlock} from './intro-flock.mjs?v=1';
const flock=createFlock(msg=>postMessage(msg));
onmessage=e=>flock.handle(e.data);
// Nur melden, wenn hier wirklich gezeichnet werden kann – sonst nimmt die Seite das Werk im Hauptthread.
let ok=false;try{ok=!!new OffscreenCanvas(1,1).getContext('2d');}catch{}
postMessage({t:ok?'loaded':'unsupported'});
