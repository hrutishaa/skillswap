create table users (
  id serial primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  bio text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- One wallet per user, one shared escrow account, one mint for credits
-- that enter the system (signup and first-lesson bonuses).
create table accounts (
  id serial primary key,
  kind text not null check (kind in ('user', 'escrow', 'mint')),
  user_id int unique references users(id),
  balance int not null default 0,
  constraint no_negative check (kind = 'mint' or balance >= 0)
);
create unique index accounts_singleton on accounts (kind) where kind <> 'user';

create table skills (
  id serial primary key,
  teacher_id int not null references users(id),
  title text not null,
  description text not null,
  category text not null,
  level text not null,
  credits_per_hour int not null check (credits_per_hour between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index skills_teacher on skills (teacher_id);

create table skill_slots (
  id serial primary key,
  skill_id int not null references skills(id) on delete cascade,
  starts_at timestamptz not null,
  minutes int not null default 60 check (minutes between 15 and 240)
);

create table bookings (
  id serial primary key,
  skill_id int not null references skills(id),
  slot_id int not null references skill_slots(id),
  learner_id int not null references users(id),
  teacher_id int not null references users(id),
  credits int not null check (credits > 0),
  starts_at timestamptz not null,
  minutes int not null,
  status text not null check (status in ('requested','accepted','declined','cancelled','completed','settled','disputed','refunded')),
  note text not null default '',
  refunded int not null default 0,
  dispute_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  settled_at timestamptz,
  check (learner_id <> teacher_id)
);
create unique index one_active_booking_per_slot on bookings (slot_id)
  where status in ('requested','accepted','completed','settled','disputed');
create index bookings_learner on bookings (learner_id);
create index bookings_teacher on bookings (teacher_id);

create table ledger_txns (
  id serial primary key,
  kind text not null,
  booking_id int references bookings(id),
  memo text not null default '',
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id serial primary key,
  txn_id int not null references ledger_txns(id),
  account_id int not null references accounts(id),
  booking_id int references bookings(id),
  amount int not null check (amount <> 0),
  created_at timestamptz not null default now()
);
create index entries_account on ledger_entries (account_id, id);
create index entries_booking on ledger_entries (booking_id);

-- Every transaction must sum to zero. Checked at commit.
create function check_txn_balanced() returns trigger language plpgsql as $$
begin
  if (select coalesce(sum(amount), 0) from ledger_entries where txn_id = new.txn_id) <> 0 then
    raise exception 'ledger transaction % does not balance', new.txn_id;
  end if;
  return null;
end $$;
create constraint trigger txn_balanced after insert on ledger_entries
  deferrable initially deferred for each row execute function check_txn_balanced();

-- Entries are append only.
create function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'ledger is append only'; end $$;
create trigger entries_immutable before update or delete on ledger_entries
  for each row execute function forbid_change();

create table reviews (
  id serial primary key,
  booking_id int not null unique references bookings(id),
  skill_id int not null references skills(id),
  teacher_id int not null references users(id),
  reviewer_id int not null references users(id),
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table messages (
  id serial primary key,
  booking_id int not null references bookings(id),
  sender_id int not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id serial primary key,
  user_id int not null references users(id),
  type text not null,
  body text not null,
  booking_id int,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications (user_id, id desc);
