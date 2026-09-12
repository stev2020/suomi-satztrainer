// Match the actual explanation titles, never isolated sentence endings.
export const GRAMMAR_TOPICS = [
  {id:'negation',label:'Verneinung',hint:'Übe, wie man Aussagen und Aufforderungen verneint.',match:/vernein/i},
  {id:'questions',label:'Fragen',hint:'Übe Fragewörter und Ja/Nein-Fragen.',match:/frage|erfragen|was oder wer|wo, wohin oder woher/i},
  {id:'possession',label:'Besitz',hint:'Übe, wie man Besitz und Zugehörigkeit ausdrückt.',match:/besitz|haben und befinden|genitiv|name mit -n/i},
  {id:'location',label:'Ortsfälle & Richtung',hint:'Übe Ortsfälle, Ortsangaben und Richtungen. Ortsfälle können auch Empfänger oder andere Beziehungen ausdrücken.',match:/inessiv|elativ|illativ|adessiv|ablativ|allativ|\bort\b|ortsadverb|richtung|ausgangspunkt|zuhause|personenform mit -lla/i},
  {id:'partitive',label:'Partitiv',hint:'Übe den Partitiv bei Mengen, Objekten und anderen Ausdrücken.',match:/partitiv/i},
  {id:'present',label:'Verben im Präsens',hint:'Übe grundlegende Verbformen und Personalendungen.',match:/präsens|^verbform:|^formen von olla$|^sein \(olla\)$/i},
  {id:'past',label:'Vergangenheit',hint:'Übe Formen der Vergangenheit, des Perfekts und des Plusquamperfekts.',match:/vergangenheit|imperfekti|perfekt/i},
  {id:'conditional',label:'Konditional',hint:'Übe Wünsche, Möglichkeiten und höfliche Bitten mit dem Konditional.',match:/konditional/i},
  {id:'imperative',label:'Aufforderungen',hint:'Übe Aufforderungen und Verbote.',match:/aufforderung|imperativ/i},
  {id:'spoken',label:'Umgangssprache',hint:'Übe gesprochene Formen und ihre standardsprachlichen Entsprechungen.',match:/gesproch|umgangssprach/i},
];
export function topicNotes(sentence, grammar, topicId) {
  const entry=grammar[String(sentence.id)],topic=GRAMMAR_TOPICS.find(t=>t.id===topicId);
  if(!topic||entry?.sentence!==sentence.text||!Array.isArray(entry.notes))return [];
  return entry.notes.filter(note=>topic.match.test(note.title));
}
