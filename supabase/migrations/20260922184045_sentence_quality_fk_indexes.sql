-- Cover the referencing side of quality-system foreign keys so review and
-- user-deletion joins do not degrade into sequential scans as the queue grows.
create index sentence_states_reviewed_by_idx
 on quality_private.sentence_states(reviewed_by);
create index translation_states_reviewed_by_idx
 on quality_private.translation_states(reviewed_by);
create index classroom_exclusions_hidden_by_idx
 on quality_private.classroom_exclusions(hidden_by);
