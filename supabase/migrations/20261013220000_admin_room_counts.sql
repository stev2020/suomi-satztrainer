-- Verwaltung: Mitgliederzahlen der Klassenräume zählen jetzt die Person mit, die den Raum erstellt hat
-- (sie steht nicht in der Mitgliederliste). Löschvorgänge der Moderation liegen in eigenen kleinen Funktionen.

create function admin_private.room_people(rid uuid)
returns integer language sql stable security definer set search_path='' as $$
  select 1+(select count(*) from classroom_private.members m where m.room_id=rid and not m.blocked)::integer
$$;
create function admin_private.room_teachers(rid uuid)
returns integer language sql stable security definer set search_path='' as $$
  select 1+(select count(*) from classroom_private.members m where m.room_id=rid and not m.blocked and m.role='teacher')::integer
$$;
revoke all on function admin_private.room_people(uuid),admin_private.room_teachers(uuid) from public,anon,authenticated;

create function admin_private.drop_post_files(pid uuid)
returns void language sql security definer set search_path='' as $$
  delete from classroom_private.stream_files where post_id=pid;
$$;
create function admin_private.drop_room(rid uuid)
returns void language sql security definer set search_path='' as $$
  delete from classroom_private.rooms where id=rid;
$$;
revoke all on function admin_private.drop_post_files(uuid),admin_private.drop_room(uuid) from public,anon,authenticated;

create or replace function admin_private.overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  min_group constant integer:=5;
  today date:=(now() at time zone 'Europe/Berlin')::date;
  week0 date:=date_trunc('week',now() at time zone 'Europe/Berlin')::date;
  result jsonb; act jsonb; weekly jsonb; money jsonb; streaks record;
begin
  -- Aktivität je Lernendem nur als Zwischenergebnis; heraus gehen nur Summen.
  with days as (
    select l.user_id,admin_private.day(e.k) as d,admin_private.amount(e.v) as n
    from public.learning_state l,
      jsonb_each_text(case when jsonb_typeof(l.state->'daily')='object' then l.state->'daily' else '{}'::jsonb end) e(k,v)
  ), agg as (
    select user_id,
      sum(n) filter (where d=today) as n_today,
      sum(n) filter (where d between today-6 and today) as n_7,
      sum(n) filter (where d between today-13 and today-7) as n_prev7,
      max(d) filter (where n>0) as last_day
    from days where d is not null group by user_id
  ), per as (
    select coalesce(a.n_today,0) as n_today,coalesce(a.n_7,0) as n_7,coalesce(a.n_prev7,0) as n_prev7,a.last_day,
      admin_private.streak(l.state->'daily',today) as streak,
      (select count(*) from jsonb_object_keys(case when jsonb_typeof(l.state->'reviews')='object' then l.state->'reviews' else '{}'::jsonb end)) as cards
    from public.learning_state l left join agg a on a.user_id=l.user_id
  )
  select jsonb_build_object(
    'today',count(*) filter (where n_today>0),
    'd7',count(*) filter (where last_day>=today-6),
    'd30',count(*) filter (where last_day>=today-29),
    'practiced_today',case when count(*) filter (where n_today>0)>=min_group then sum(n_today) end,
    'practiced_7',case when count(*) filter (where n_7>0)>=min_group then sum(n_7) end,
    'practiced_prev7',case when count(*) filter (where n_prev7>0)>=min_group then sum(n_prev7) end,
    'streak_avg',case when count(*) filter (where streak>0)>=min_group then round(avg(streak) filter (where streak>0),1) end,
    'streak_users',count(*) filter (where streak>0),
    'cards_total',case when count(*) filter (where cards>0)>=min_group then sum(cards) end
  ) into act from per;

  select coalesce(jsonb_agg(jsonb_build_object('week',w,'n',coalesce(c.n,0)) order by w),'[]'::jsonb) into weekly
  from (select week0-7*i as w from generate_series(0,11) i) ws
  left join (select date_trunc('week',u.created_at at time zone 'Europe/Berlin')::date wk,count(*) n from auth.users u group by 1) c on c.wk=w;

  select jsonb_build_object(
    'months',coalesce((select jsonb_agg(jsonb_build_object('month',to_char(m.month,'YYYY-MM'),'gross',m.gross,'fees',m.fees,'payments',m.payments,'recurring',m.recurring) order by m.month)
      from admin_private.money_months m where m.month>(date_trunc('month',today)-interval '6 months')::date),'[]'::jsonb),
    'last_payment_at',(select max(last_payment_at) from admin_private.money_months),
    'last_ok',(select last_ok from admin_private.money_sync where id=1),
    'last_error',(select last_error from admin_private.money_sync where id=1),
    'goal',(select month_goal from admin_private.settings where id=1)
  ) into money;

  return jsonb_build_object(
    'min_group',min_group,
    'accounts',jsonb_build_object(
      'total',(select count(*) from auth.users),
      'new7',(select count(*) from auth.users where created_at>=now()-interval '7 days'),
      'with_email',(select count(*) from public.account_emails where verified_at is not null),
      'weekly',weekly),
    'activity',act,
    'classrooms',jsonb_build_object(
      'rooms',(select count(*) from classroom_private.rooms where not archived),
      'members',(select coalesce(sum(admin_private.room_people(r.id)),0) from classroom_private.rooms r where not r.archived)),
    'swarm',jsonb_build_object(
      'names',(select count(*) from support_private.names where active_from is not null and not contributor and (visible_until is null or visible_until>now())),
      'contributors',(select count(*) from support_private.names where contributor and active_from is not null)),
    'money',money,
    'todo',jsonb_build_object(
      'reports',(select count(*) from quality_private.reports where status='open'),
      'errors',(select count(*) from admin_private.client_errors where status='new'),
      'feedback',(select count(*) from admin_private.feedback where status='open'))
  );
end $$;

create or replace function admin_private.moderation(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; kind text; tid uuid; rid uuid; verdict text; r classroom_private.rooms%rowtype;
begin
  if uid is null or not exists(select 1 from admin_private.admins a where a.user_id=uid) then
    raise exception 'Keine Berechtigung.' using errcode='42501';
  end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>3000 then raise exception 'Ungültige Anfrage.'; end if;

  if action='class_reports' then
    with g as (
      select x.target_kind,x.target_id,x.room_id,count(*) as n,min(x.created_at) as first_at,max(x.created_at) as last_at,
        jsonb_object_agg(x.reason,x.cnt) as reasons
      from (select target_kind,target_id,room_id,reason,count(*) as cnt,min(created_at) as created_at
            from classroom_private.reports where status='open' group by 1,2,3,4) x
      group by 1,2,3
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'target_kind',g.target_kind,'target_id',g.target_id,'room_id',g.room_id,'count',g.n,'reasons',g.reasons,
      'first_at',g.first_at,'last_at',g.last_at,
      'notes',(select coalesce(jsonb_agg(z.note),'[]'::jsonb) from (select note from classroom_private.reports
                where status='open' and target_kind=g.target_kind and target_id=g.target_id and note<>'' order by created_at desc limit 5) z),
      'room',(select jsonb_build_object('name',ro.name,'archived',ro.archived,
                'members',admin_private.room_people(ro.id))
              from classroom_private.rooms ro where ro.id=g.room_id),
      'content',case g.target_kind
        when 'post' then (select jsonb_build_object('body',p.body,'kind',p.kind,'deleted',p.deleted,'created_at',p.created_at,
            'role',admin_private.room_role(p.room_id,p.user_id),
            'parent',(select q.body from classroom_private.stream_posts q where q.id=p.parent_id),
            'files',(select coalesce(jsonb_agg(jsonb_build_object('name',f.name,'mime',f.mime,'size',f.size)),'[]'::jsonb)
                     from classroom_private.stream_files f where f.post_id=p.id))
          from classroom_private.stream_posts p where p.id=g.target_id)
        when 'message' then (select jsonb_build_object('body',m.body,'deleted',m.deleted,'created_at',m.created_at,
            'role',admin_private.room_role(a.room_id,m.user_id),'assignment',a.title)
          from classroom_private.messages m join classroom_private.assignments a on a.id=m.assignment_id where m.id=g.target_id)
        else null end
    ) order by g.last_at desc),'[]'::jsonb) into result from g;
    return result;
  end if;

  if action='class_resolve' then
    kind:=payload->>'target_kind'; verdict:=payload->>'decision';
    if kind is null or kind not in ('post','message','room') or coalesce(payload->>'target_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültige Meldung.'; end if;
    if verdict is null or verdict not in ('keep','remove','archive') or (verdict='remove' and kind='room') then raise exception 'Ungültige Entscheidung.'; end if;
    tid:=(payload->>'target_id')::uuid;
    select room_id into rid from classroom_private.reports where target_kind=kind and target_id=tid and status='open' limit 1;
    if rid is null then raise exception 'Diese Meldung ist schon erledigt.'; end if;
    if verdict='remove' and kind='post' then
      update classroom_private.stream_posts set body='[Vom Betreiber entfernt]',deleted=true,pinned=false where id=tid;
      -- Dateien des Beitrags: Eintrag weg; die Datei selbst entfernt danach storage-sweep (Storage-API).
      perform admin_private.drop_post_files(tid);
    elsif verdict='remove' and kind='message' then
      update classroom_private.messages set body='[Vom Betreiber entfernt]',deleted=true where id=tid;
    elsif verdict='archive' then
      update classroom_private.rooms set archived=true where id=rid;
    end if;
    update classroom_private.reports set status='resolved',decision=verdict,resolved_at=now(),reporter_id=null,note=''
      where target_kind=kind and target_id=tid and status='open';
    return jsonb_build_object('ok',true,'files_removed',verdict='remove' and kind='post');
  end if;

  if action='class_rooms' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.open_reports desc,x.last_activity desc nulls last),'[]'::jsonb) into result from (
      select ro.id,ro.name,ro.archived,to_char(ro.created_at at time zone 'Europe/Berlin','YYYY-MM') as created,
        admin_private.room_people(ro.id) as members,
        admin_private.room_teachers(ro.id) as teachers,
        (select count(*) from classroom_private.stream_posts p where p.room_id=ro.id and not p.deleted and p.created_at>now()-interval '30 days') as posts_30d,
        (select count(*) from classroom_private.messages me join classroom_private.assignments a on a.id=me.assignment_id
          where a.room_id=ro.id and not me.deleted and me.created_at>now()-interval '30 days') as messages_30d,
        (select count(*) from classroom_private.assignments a where a.room_id=ro.id) as assignments,
        (select count(*) from classroom_private.stream_files f where f.room_id=ro.id and f.post_id is not null) as files,
        (select coalesce(sum(f.size),0) from classroom_private.stream_files f where f.room_id=ro.id and f.post_id is not null) as file_bytes,
        greatest((select max(p.created_at) from classroom_private.stream_posts p where p.room_id=ro.id),
          (select max(me.created_at) from classroom_private.messages me join classroom_private.assignments a on a.id=me.assignment_id where a.room_id=ro.id),
          (select max(s.created_at) from classroom_private.submissions s join classroom_private.assignments a on a.id=s.assignment_id where a.room_id=ro.id)) as last_activity,
        (select count(*) from classroom_private.reports rp where rp.room_id=ro.id and rp.status='open') as open_reports
      from classroom_private.rooms ro order by ro.created_at desc limit 300) x;
    return result;
  end if;

  if action='class_room_archive' then
    if coalesce(payload->>'room_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültiger Raum.'; end if;
    update classroom_private.rooms set archived=true where id=(payload->>'room_id')::uuid;
    update classroom_private.reports set status='resolved',decision='archive',resolved_at=now(),reporter_id=null,note=''
      where room_id=(payload->>'room_id')::uuid and target_kind='room' and status='open';
    return jsonb_build_object('ok',found);
  end if;

  if action='class_room_delete' then
    if coalesce(payload->>'room_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültiger Raum.'; end if;
    select * into r from classroom_private.rooms where id=(payload->>'room_id')::uuid for update;
    if r.id is null then raise exception 'Diesen Raum gibt es nicht mehr.'; end if;
    if (payload->>'confirm_name') is distinct from r.name then raise exception 'Bitte den Raumnamen genau eingeben.'; end if;
    perform admin_private.drop_room(r.id);
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unbekannte Aktion.';
end $$;

revoke all on function admin_private.overview() from public,anon,authenticated;
revoke all on function admin_private.moderation(text,jsonb) from public,anon,authenticated;
