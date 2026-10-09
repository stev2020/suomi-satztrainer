// Vanamo – Vogel-Avatare.
//
// Sechzehn flächig gezeichnete Vögel, die man als Profilbild wählen kann. Die Zeichnungen stehen als SVG direkt
// hier (keine Bilddateien); bewegt (Blinzeln, Kopf drehen, Schwanz zucken) wird ein Avatar nur, wenn das
// umgebende Element die Klasse „is-live“ trägt oder man darüberfährt – die Regeln stehen in style.css.
// Gespeichert wird nur die Kennung (z. B. „sinitiainen“) im Konto; alles andere kommt aus dieser Datei.
// Die Kennungen stehen auch in der Datenbank (classroom_private.avatar) – neue Vögel dort mit eintragen.

const eye=(x,y,r=2.2,fill='#0B0B0B',d='')=>`<g class="av-eye${d}"><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/><circle cx="${x+.8}" cy="${y-.8}" r="${(r*.32).toFixed(1)}" fill="#FFFFFF"/></g>`;
const branch='<line x1="-38" y1="37" x2="38" y2="37" stroke="#7A5533" stroke-width="4" stroke-linecap="round"/>';
const legs=(color,width=2,y=27)=>`<line x1="-3" y1="${y}" x2="-3" y2="35" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/><line x1="6" y1="${y}" x2="6" y2="35" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;

export const AVATARS=[
 {id:'raystaspaasky',fi:'Räystäspääsky',de:'Mehlschwalbe',bg:'#DCE9F5',art:
  `<line x1="-44" y1="31" x2="44" y2="31" stroke="#2B3A4D" stroke-width="1.5" stroke-linecap="round"/>
<g class="av-tail"><path d="M-14 18 L-27 31 L-22 32 L-11 24 Z" fill="#161C2A"/><path d="M-11 21 L-19 35 L-14 35 L-7 25 Z" fill="#161C2A"/></g>
<ellipse cx="1" cy="8" rx="16" ry="20" fill="#FBFAF5"/>
<g transform="rotate(30 -6 8)"><ellipse cx="-6" cy="8" rx="9.5" ry="21" fill="#161C2A"/><line x1="-6" y1="-2" x2="-6" y2="22" stroke="#27324A" stroke-width="2" stroke-linecap="round"/></g>
<g class="av-head"><path d="M20 -18 L26 -15.5 L20 -13 Z" fill="#0E121B"/><circle cx="9" cy="-15" r="12" fill="#FBFAF5"/><path d="M-3 -15 A12 12 0 0 1 21 -15 Q9 -9 -3 -15 Z" fill="#161C2A"/>${eye(13,-17.5,2.2,'#05070B')}</g>`},
 {id:'punatulkku',fi:'Punatulkku',de:'Gimpel',bg:'#F6E3DD',art:
  `${branch}<g class="av-tail av-d1"><path d="M-20 18 L-38 31 L-33 35 L-15 26 Z" fill="#23221F"/></g>${legs('#6B4A2B',2,28)}
<ellipse cx="-2" cy="8" rx="24" ry="22" fill="#E0584A"/>
<g transform="rotate(28 -10 8)"><ellipse cx="-10" cy="8" rx="12" ry="18" fill="#6E7F8D"/><line x1="-19" y1="13" x2="-2" y2="13" stroke="#F4EEDF" stroke-width="2.5" stroke-linecap="round"/></g>
<g class="av-head av-d1"><path d="M22 -15 L31 -11 L22 -7 Z" fill="#23221F"/><circle cx="10" cy="-14" r="14" fill="#E0584A"/><path d="M-4 -14 A14 14 0 0 1 24 -14 Q10 -9 -4 -14 Z" fill="#23221F"/>${eye(15,-15,2.2,'#0B0B0B',' av-d1')}</g>`},
 {id:'sinitiainen',fi:'Sinitiainen',de:'Blaumeise',bg:'#E4F0DA',art:
  `${branch}<g class="av-tail av-d2"><path d="M-18 18 L-36 32 L-31 35 L-13 26 Z" fill="#2F66A3"/></g>${legs('#4A5560')}
<ellipse cx="-2" cy="8" rx="22" ry="21" fill="#F2C83A"/>
<g transform="rotate(28 -9 8)"><ellipse cx="-9" cy="8" rx="11" ry="17" fill="#3F7FC1"/><line x1="-17" y1="12" x2="-1" y2="12" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/></g>
<g class="av-head av-d2"><path d="M22 -15 L29 -12 L22 -9 Z" fill="#1F2A3A"/><circle cx="10" cy="-14" r="14" fill="#FFFFFF"/><path d="M-2 -20 A14 14 0 0 1 22 -20 Q10 -25 -2 -20 Z" fill="#3F7FC1"/><path d="M-3 -13 L23 -13" stroke="#1F3F6B" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M3 -2 Q10 2 17 -2 Q10 -5 3 -2 Z" fill="#1F3F6B"/>${eye(15,-13,2.2,'#0B1626',' av-d2')}</g>`},
 {id:'harmaalokki',fi:'Harmaalokki',de:'Silbermöwe',bg:'#C4DDEC',art:
  `<line x1="-36" y1="38" x2="36" y2="38" stroke="#8A8F96" stroke-width="5" stroke-linecap="round"/>
<g class="av-tail"><path d="M-22 13 L-41 23 L-36 28 L-17 21 Z" fill="#15171C"/><circle cx="-36" cy="24.5" r="1.4" fill="#FFFFFF"/></g>${legs('#E8A9A0',2.5,26)}
<ellipse cx="-2" cy="8" rx="23" ry="19" fill="#FFFFFF"/>
<ellipse cx="-9" cy="7" rx="10" ry="18" fill="#A9B4BE" transform="rotate(50 -9 7)"/>
<g class="av-head"><path d="M20 -17.5 L33 -14.5 Q36 -12 32 -9.5 L20 -10 Z" fill="#F2C83A"/><circle cx="29.5" cy="-11.3" r="1.6" fill="#D8372B"/><circle cx="10" cy="-14" r="12.5" fill="#FFFFFF"/><g class="av-eye"><circle cx="14.5" cy="-16" r="2.3" fill="#F2DC7A"/><circle cx="14.5" cy="-16" r="1.2" fill="#0B0B0B"/></g></g>`},
 {id:'tunturipollo',fi:'Tunturipöllö',de:'Schnee-Eule',bg:'#C5D0E2',art:
  `<line x1="-38" y1="39" x2="38" y2="39" stroke="#7A5533" stroke-width="4" stroke-linecap="round"/><line x1="-30" y1="36" x2="30" y2="36" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="0" cy="12" rx="24" ry="25" fill="#FBFAF5"/>
<path d="M-12 10 L-7 10 M5 9 L10 9 M-4 16 L1 16 M-14 20 L-9 20 M8 19 L13 19 M-6 25 L-1 25 M3 28 L8 28 M-13 29 L-8 29" stroke="#55534E" stroke-width="2" stroke-linecap="round" fill="none"/>
<g class="av-head av-d1"><circle cx="0" cy="-13" r="19" fill="#FBFAF5"/><path d="M-8 -28 L-4 -28 M3 -29 L7 -29 M-13 -23 L-10 -23 M10 -24 L13 -24" stroke="#55534E" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M-12 -18 Q-7 -21 -2 -17 M2 -17 Q7 -21 12 -18" stroke="#B9B7B0" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M-2.5 -10 L2.5 -10 L0 -4 Z" fill="#1A1C20"/><g class="av-eye av-d1"><circle cx="-7" cy="-13.5" r="3.4" fill="#F2C83A"/><circle cx="-7" cy="-13.5" r="1.7" fill="#0B0B0B"/><circle cx="7" cy="-13.5" r="3.4" fill="#F2C83A"/><circle cx="7" cy="-13.5" r="1.7" fill="#0B0B0B"/></g></g>`},
 {id:'kapytikka',fi:'Käpytikka',de:'Buntspecht',bg:'#E8EEDD',art:
  `${branch}<g class="av-tail av-d3"><path d="M-20 18 L-34 34 L-28 36 L-14 26 Z" fill="#15171C"/></g>${legs('#4A5560')}
<ellipse cx="-2" cy="8" rx="21" ry="21" fill="#F4EEDF"/><ellipse cx="-3" cy="24" rx="9" ry="5" fill="#D8372B"/>
<g transform="rotate(28 -9 7)"><ellipse cx="-9" cy="7" rx="11" ry="18" fill="#15171C"/><ellipse cx="-5" cy="0" rx="3.5" ry="8" fill="#FFFFFF"/><path d="M-16 13 L-7 13 M-15 18 L-7 18" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none"/></g>
<g class="av-head av-d3"><path d="M21 -17.5 L36 -13 L21 -10 Z" fill="#4A5560"/><circle cx="10" cy="-14" r="13" fill="#FFFFFF"/><path d="M-3 -16 A13 13 0 0 1 23 -16 Q10 -22 -3 -16 Z" fill="#15171C"/><ellipse cx="-1.5" cy="-13" rx="3.2" ry="5" fill="#D8372B"/><path d="M20 -9 Q10 -5 2 -3" stroke="#15171C" stroke-width="2.5" stroke-linecap="round" fill="none"/>${eye(15,-14,2,'#0B0B0B',' av-d3')}</g>`},
 {id:'harakka',fi:'Harakka',de:'Elster',bg:'#E9E7F2',art:
  `${branch}<g class="av-tail"><path d="M-18 14 L-43 21 L-42 27 L-14 24 Z" fill="#1E4A4A"/></g>${legs('#15171C')}
<ellipse cx="-2" cy="10" rx="21" ry="19" fill="#FFFFFF"/><ellipse cx="6" cy="-2" rx="14" ry="12" fill="#15171C"/>
<g transform="rotate(38 -9 8)"><ellipse cx="-9" cy="8" rx="10.5" ry="17" fill="#15171C"/><ellipse cx="-7" cy="0" rx="6.5" ry="4.5" fill="#FFFFFF"/><line x1="-12" y1="8" x2="-12" y2="20" stroke="#1F5E86" stroke-width="3" stroke-linecap="round"/></g>
<g class="av-head"><path d="M21 -18 L33 -13.5 L21 -10 Z" fill="#15171C"/><circle cx="10" cy="-14" r="13" fill="#15171C"/><g class="av-eye"><circle cx="15" cy="-15" r="2.6" fill="#454B57"/><circle cx="15" cy="-15" r="1.7" fill="#05070B"/><circle cx="15.7" cy="-15.7" r="0.6" fill="#FFFFFF"/></g></g>`},
 {id:'tilhi',fi:'Tilhi',de:'Seidenschwanz',bg:'#F6E8DC',art:
  `${branch}<g class="av-tail av-d1"><path d="M-18 18 L-35 31 L-30 35 L-13 26 Z" fill="#6F6A6A"/><path d="M-32 28.7 L-35 31 L-30 35 L-27 33.3 Z" fill="#F2C83A"/></g>${legs('#3A3532')}
<ellipse cx="-2" cy="8" rx="22" ry="21" fill="#C79A7E"/>
<g transform="rotate(28 -9 8)"><ellipse cx="-9" cy="8" rx="10.5" ry="17" fill="#7A6E69"/><line x1="-16" y1="11" x2="-9" y2="11" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/><line x1="-14" y1="15" x2="-14" y2="21" stroke="#F2C83A" stroke-width="2.5" stroke-linecap="round"/><circle cx="-8" cy="16" r="2" fill="#D8372B"/></g>
<g class="av-head av-d1"><path d="M0 -22 L-13 -37 L12 -26 Z" fill="#CFA184"/><path d="M22 -16 L30 -13 L22 -10 Z" fill="#1A1C20"/><circle cx="10" cy="-14" r="13" fill="#CFA184"/><path d="M23 -15 Q12 -19 1 -20" stroke="#15171C" stroke-width="3.2" stroke-linecap="round" fill="none"/><ellipse cx="17" cy="-6" rx="4.5" ry="3.2" fill="#15171C"/>${eye(14,-17,1.6,'#05070B',' av-d1')}</g>`},
 {id:'viherpeippo',fi:'Viherpeippo',de:'Grünfink',bg:'#EEF3DC',art:
  `${branch}<g class="av-tail av-d2"><path d="M-18 18 L-35 31 L-30 35 L-13 26 Z" fill="#3E4A2A"/><path d="M-18 18 L-33 29.5 L-31 31 L-16 21 Z" fill="#F2D13A"/></g>${legs('#B88A78')}
<ellipse cx="-2" cy="8" rx="23" ry="21" fill="#8DA63A"/>
<g transform="rotate(28 -9 8)"><ellipse cx="-9" cy="8" rx="11" ry="17" fill="#5E7A2A"/><line x1="-16" y1="3" x2="-16" y2="17" stroke="#F2D13A" stroke-width="3" stroke-linecap="round"/></g>
<g class="av-head av-d2"><path d="M20 -20 L32 -13 L20 -7 Z" fill="#E8C9B0"/><circle cx="10" cy="-14" r="13.5" fill="#8DA63A"/>${eye(15,-15,2,'#0B0B0B',' av-d2')}</g>`},
 {id:'punarinta',fi:'Punarinta',de:'Rotkehlchen',bg:'#E7EEDD',art:
  `${branch}<g class="av-tail av-d2"><path d="M-18 18 L-35 31 L-30 35 L-13 26 Z" fill="#7A5C3E"/></g>${legs('#5A4634',1.8)}
<ellipse cx="-2" cy="8" rx="22" ry="21" fill="#EDE8DC"/><ellipse cx="6" cy="0" rx="15" ry="13" fill="#E2703A"/>
<ellipse cx="-10" cy="8" rx="11.5" ry="17" fill="#8A6B4A" transform="rotate(28 -10 8)"/>
<g class="av-head av-d2"><path d="M22 -15.5 L30 -13 L22 -11 Z" fill="#2C2C2A"/><circle cx="10" cy="-14" r="13" fill="#E2703A"/><path d="M-3 -13 A13 13 0 0 1 22 -19 Q10 -18 3 -3 A13 13 0 0 1 -3 -13 Z" fill="#8A6B4A"/>${eye(15,-14.5,2.3,'#0B0B0B',' av-d2')}</g>`},
 {id:'kurki',fi:'Kurki',de:'Kranich',bg:'#D6E8F2',art:
  `<line x1="-30" y1="42" x2="30" y2="42" stroke="#8FA88F" stroke-width="3" stroke-linecap="round"/>
<path d="M-7 12 L-5 27 L-8 41 M-1 12 L3 27 L2 41" stroke="#2A2D33" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M9 4 C16 -8 6 -18 9 -30" stroke="#2A2D33" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M7 -1 C13 -10 4 -19 7 -29" stroke="#F4F2EC" stroke-width="2.2" stroke-linecap="round" fill="none"/>
<g class="av-tail av-d3"><path d="M-19 1 Q-35 1 -35 17 Q-27 10 -17 11 Z" fill="#5F666E"/></g>
<ellipse cx="-5" cy="6" rx="18" ry="10.5" fill="#9AA3AB" transform="rotate(-8 -5 6)"/><path d="M-18 5 Q-6 -1 6 6" stroke="#B4BCC3" stroke-width="2" stroke-linecap="round" fill="none"/>
<g class="av-head av-d3"><path d="M16 -33.5 L31 -30 L16 -28.5 Z" fill="#C9B88A"/><ellipse cx="11" cy="-31" rx="6" ry="4.8" fill="#2A2D33"/><path d="M11.5 -32 Q5.5 -30 6.5 -25" stroke="#F4F2EC" stroke-width="2.2" stroke-linecap="round" fill="none"/><ellipse cx="10" cy="-35.4" rx="3.6" ry="1.6" fill="#C8372D"/><g class="av-eye av-d3"><circle cx="13.6" cy="-32" r="1.3" fill="#D8572B"/></g></g>`},
 {id:'kuukkeli',fi:'Kuukkeli',de:'Unglückshäher',bg:'#E3E8DF',art:
  `<line x1="-38" y1="37" x2="38" y2="37" stroke="#5E6B4A" stroke-width="4" stroke-linecap="round"/><path d="M-30 37 L-26 31 M-18 37 L-14 32 M22 37 L26 31 M30 37 L33 32" stroke="#5E6B4A" stroke-width="2" stroke-linecap="round"/>
<g class="av-tail av-d1"><path d="M-18 16 L-37 30 L-31 35 L-13 25 Z" fill="#C9652E"/><path d="M-17 18 L-32 30 L-29 32 L-14 23 Z" fill="#7A6F66"/></g>${legs('#2E2A27')}
<ellipse cx="-2" cy="8" rx="23" ry="21" fill="#A49A8F"/><path d="M-20 18 Q-2 34 18 18 Q10 29 -2 29 Q-14 29 -20 18 Z" fill="#D9843F"/>
<g transform="rotate(28 -9 8)"><ellipse cx="-9" cy="8" rx="11" ry="17" fill="#6F665E"/><path d="M-15 2 Q-9 6 -3 2" stroke="#D9843F" stroke-width="3" stroke-linecap="round" fill="none"/></g>
<g class="av-head av-d1"><path d="M22 -15 L29 -12.5 L22 -10 Z" fill="#1E1C1A"/><circle cx="10" cy="-14" r="13.5" fill="#B8AFA4"/><path d="M-3.5 -15 A13.5 13.5 0 0 1 23.5 -15 Q12 -21 -3.5 -15 Z" fill="#4A433D"/>${eye(15,-14.5,2.1,'#05070B',' av-d1')}</g>`},
 {id:'kuningaskalastaja',fi:'Kuningaskalastaja',de:'Eisvogel',bg:'#D7EDE9',art:
  `${branch}<g class="av-tail av-d2"><path d="M-16 16 L-30 28 L-25 31 L-12 23 Z" fill="#1C5F8F"/></g>${legs('#D8452B',2.4,27)}
<ellipse cx="-2" cy="9" rx="21" ry="19" fill="#E48434"/>
<g transform="rotate(28 -9 7)"><ellipse cx="-9" cy="7" rx="11" ry="17" fill="#1F86B8"/><circle cx="-12" cy="0" r="1.4" fill="#7FD6E0"/><circle cx="-7" cy="3" r="1.4" fill="#7FD6E0"/><circle cx="-11" cy="7" r="1.4" fill="#7FD6E0"/><circle cx="-6" cy="10" r="1.4" fill="#7FD6E0"/></g>
<g class="av-head av-d2"><path d="M20 -17 L41 -12.5 L20 -9 Z" fill="#1A1A1D"/><circle cx="9" cy="-14" r="13" fill="#1F86B8"/><path d="M-1 -11 Q8 -15 22 -12 Q16 -4 6 -5 Q0 -6 -1 -11 Z" fill="#E48434"/><ellipse cx="0" cy="-6" rx="3.6" ry="2.6" fill="#FFFFFF"/><path d="M-1 -21 Q8 -26 18 -22" stroke="#4FB6D6" stroke-width="2" stroke-linecap="round" fill="none"/>${eye(13,-15,2,'#05070B',' av-d2')}</g>`},
 {id:'peippo',fi:'Peippo',de:'Buchfink',bg:'#F2E4DD',art:
  `${branch}<g class="av-tail av-d3"><path d="M-18 18 L-35 31 L-30 35 L-13 26 Z" fill="#3B3A35"/><path d="M-33 29.5 L-35 31 L-30 35 L-28.5 34 Z" fill="#FFFFFF"/></g>${legs('#9C7F72')}
<ellipse cx="-2" cy="8" rx="22" ry="21" fill="#C98C76"/><path d="M-14 22 Q-2 31 12 23 Q4 29 -2 29 Q-9 29 -14 22 Z" fill="#EBD9CF"/>
<g transform="rotate(28 -9 8)"><ellipse cx="-9" cy="8" rx="11" ry="17" fill="#4A4639"/><line x1="-18" y1="1" x2="-1" y2="1" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/><line x1="-17" y1="9" x2="-3" y2="9" stroke="#F2E8C8" stroke-width="2" stroke-linecap="round"/></g>
<g class="av-head av-d3"><path d="M21 -17 L30 -13 L21 -9 Z" fill="#8E9DA8"/><circle cx="10" cy="-14" r="13.5" fill="#C98C76"/><path d="M-3.5 -14 A13.5 13.5 0 0 1 23 -18 Q14 -21 9 -18 Q2 -14 -3.5 -14 Z" fill="#6D8EA9"/>${eye(15,-14,2,'#0B0B0B',' av-d3')}</g>`},
 {id:'merikotka',fi:'Merikotka',de:'Seeadler',bg:'#D9E4EC',art:
  `<path d="M-40 39 Q-30 31 -12 33 Q6 30 22 34 Q34 34 40 39 Z" fill="#8C8F93"/>
<g class="av-tail av-d1"><path d="M-10 18 L-24 37 L-13 38 L-2 24 Z" fill="#F6F3EA"/></g><line x1="-3" y1="26" x2="-3" y2="33" stroke="#E8B63A" stroke-width="3" stroke-linecap="round"/><line x1="6" y1="26" x2="6" y2="33" stroke="#E8B63A" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="-1" cy="6" rx="20" ry="24" fill="#6B4E35"/>
<g transform="rotate(18 -8 6)"><ellipse cx="-8" cy="6" rx="12" ry="22" fill="#4E3826"/><path d="M-14 0 L-6 2 M-15 8 L-6 10 M-14 16 L-6 18" stroke="#7A5C40" stroke-width="2" stroke-linecap="round"/></g>
<g class="av-head av-d1"><path d="M18 -21 Q29 -22 31 -13 Q31 -10 29 -9 Q27 -12 24 -12 L18 -12 Z" fill="#F0BE34"/><circle cx="8" cy="-17" r="13" fill="#D8C7A6"/><path d="M3 -24 Q11 -27 19 -21" stroke="#B7A27C" stroke-width="2" stroke-linecap="round" fill="none"/><g class="av-eye av-d1"><circle cx="13" cy="-18" r="2.4" fill="#F2DC7A"/><circle cx="13.4" cy="-18" r="1.2" fill="#15171C"/></g><path d="M9 -21.5 L18 -20.5" stroke="#5E4A33" stroke-width="2" stroke-linecap="round"/></g>`},
 {id:'tuulihaukka',fi:'Tuulihaukka',de:'Turmfalke',bg:'#F4E6D2',art:
  `${branch}<g class="av-tail av-d2"><path d="M-14 18 L-33 32 L-28 36 L-10 26 Z" fill="#8FA0AE"/><path d="M-29 29 L-33 32 L-28 36 L-25.2 34.4 Z" fill="#1E2228"/></g>${legs('#E8B63A',2.4)}
<ellipse cx="-2" cy="8" rx="21" ry="22" fill="#F0DABA"/><g fill="#6A4630"><circle cx="2" cy="6" r="1.3"/><circle cx="8" cy="12" r="1.3"/><circle cx="0" cy="16" r="1.3"/><circle cx="7" cy="21" r="1.3"/><circle cx="-4" cy="22" r="1.3"/></g>
<g transform="rotate(26 -9 7)"><ellipse cx="-9" cy="7" rx="11" ry="18" fill="#C46A38"/><g fill="#2A1E17"><circle cx="-12" cy="0" r="1.5"/><circle cx="-6" cy="4" r="1.5"/><circle cx="-12" cy="9" r="1.5"/><circle cx="-6" cy="13" r="1.5"/></g><path d="M-14 19 Q-9 26 -4 19" fill="#2A1E17"/></g>
<g class="av-head av-d2"><path d="M20 -17 Q27 -17 28 -12 Q27 -10 26 -9.5 Q25 -12 22 -11 L20 -11 Z" fill="#4A4F57"/><path d="M19.5 -17.5 L22 -17.5 L22 -11 L19.5 -11 Z" fill="#F2C23A"/><circle cx="9" cy="-14" r="13" fill="#8FA0AE"/><path d="M1 -10 Q9 -12 18 -9 Q14 -2 6 -3 Q2 -4 1 -10 Z" fill="#F4E4CC"/><path d="M12 -12 Q12 -6 10 -3" stroke="#3E454E" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="13" cy="-16" r="3.2" fill="#F2C23A"/>${eye(13,-16,2.2,'#0B0B0B',' av-d2')}</g>`}
];
const BY_ID=new Map(AVATARS.map(a=>[a.id,a]));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export const isAvatar=id=>BY_ID.has(id);
export const avatarInfo=id=>BY_ID.get(id)||null;
export const randomAvatar=()=>AVATARS[Math.floor(Math.random()*AVATARS.length)].id;

// Spitzname: höchstens 30 Zeichen, ohne Steuerzeichen und ohne Leerraum am Rand.
export const NICKNAME_MAX=30;
export const cleanNickname=value=>Array.from(String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,NICKNAME_MAX).join('');

// Vogel und Spitzname aus den Kontodaten – beides stammt vom Nutzer und wird deshalb hier geprüft.
export function accountProfile(user){
 const meta=user?.user_metadata||{},username=String(meta.username||'').trim();
 return {username,nickname:cleanNickname(meta.nickname)||username,avatar:isAvatar(meta.avatar)?meta.avatar:''};
}

// Nur die Zeichnung (für Stellen, die den Rahmen selbst liefern, z. B. den Knopf im Kopf).
export function avatarSVG(id){
 const a=BY_ID.get(id);if(!a)return '';
 return `<svg class="avatar-art" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false"><circle r="50" fill="${a.bg}"/>${a.art}</svg>`;
}

// Runder Avatar. Ohne gültigen Vogel erscheint der Anfangsbuchstabe von „name“ (über CSS, damit er nicht als Text mitgelesen wird).
export function avatarMarkup(id,{name='',live=false,size=''}={}){
 const cls=`avatar${size?` avatar-${size}`:''}${live?' is-live':''}`;
 if(BY_ID.has(id))return `<span class="${cls}" data-avatar="${id}" aria-hidden="true">${avatarSVG(id)}</span>`;
 const initial=(Array.from(String(name||'').trim())[0]||'').toUpperCase();
 return `<span class="${cls} avatar-initial" data-initial="${esc(initial)}" aria-hidden="true"></span>`;
}

// Auswahl: alle Vögel als Knöpfe, darunter der Name des gewählten Vogels (finnisch und in der Oberflächensprache).
export function avatarPickerMarkup(idPrefix){
 return `<div class="avatar-picker" data-avatar-picker><div class="avatar-picker-grid" role="group" aria-label="Vogel wählen">${AVATARS.map(a=>`<button type="button" class="avatar-choice" data-avatar-choice="${a.id}" aria-pressed="false" aria-label="${esc(a.de)}"><span class="avatar" aria-hidden="true">${avatarSVG(a.id)}</span></button>`).join('')}</div><p class="avatar-picker-name" id="${idPrefix}-avatar-name" aria-live="polite"><strong lang="fi" data-no-i18n></strong><span></span></p></div>`;
}
export function bindAvatarPicker(root,initial){
 const picker=root?.matches?.('[data-avatar-picker]')?root:root?.querySelector?.('[data-avatar-picker]');if(!picker)return {get:()=>'',set(){}};
 let current='';
 const set=id=>{
  current=isAvatar(id)?id:'';
  picker.querySelectorAll('[data-avatar-choice]').forEach(button=>{const on=button.dataset.avatarChoice===current;button.setAttribute('aria-pressed',String(on));button.classList.toggle('selected',on);button.querySelector('.avatar')?.classList.toggle('is-live',on);});
  const info=BY_ID.get(current),name=picker.querySelector('.avatar-picker-name');
  if(name){name.querySelector('strong').textContent=info?.fi||'';name.querySelector('span').textContent=info?.de||'';}
 };
 picker.addEventListener('click',e=>{const button=e.target.closest?.('[data-avatar-choice]');if(button&&picker.contains(button))set(button.dataset.avatarChoice);});
 set(initial);
 return {get:()=>current,set};
}
