-- =====================================================================
-- Starter content: the four base ideologues and an original sample deck
-- so you can try the app straight away. Safe to re-run.
-- Edit or delete any of this later in the admin area.
-- =====================================================================

insert into ideology_types (name, color, symbol, description, sort) values
  ('The Capitalist',   '#6fae3a', '◈', 'Markets, money and growth.',            1),
  ('The Supremo',      '#e2483a', '▲', 'Order, strength and tradition.',         2),
  ('The Showstopper',  '#2f43b4', '✦', 'Spectacle, media and popularity.',      3),
  ('The Idealist',     '#e9ae22', '❖', 'Rights, equality and the common good.', 4)
on conflict (name) do nothing;

do $$
declare
  v_deck uuid;
  cap uuid := (select id from ideology_types where name = 'The Capitalist');
  sup uuid := (select id from ideology_types where name = 'The Supremo');
  sho uuid := (select id from ideology_types where name = 'The Showstopper');
  ide uuid := (select id from ideology_types where name = 'The Idealist');
begin
  if exists (select 1 from decks where name = 'Sample Campaign: Metropolis') then return; end if;

  insert into decks (name, description, cover_color, status)
  values ('Sample Campaign: Metropolis',
          'A short starter deck of original questions about running a fictional mega-city. Use it to test the app, then build your own decks in the admin area.',
          '#1d3557', 'published')
  returning id into v_deck;

  insert into questions (deck_id, number, text,
    yes_label, yes_ideology_id, yes_card_text, yes_resources,
    no_label,  no_ideology_id,  no_card_text,  no_resources) values
  (v_deck, 1, 'Should the city sell its public bus network to a private operator?',
    'Yes', cap, 'Competition drives efficiency. Let the market run the routes.', '2 Funds',
    'No',  ide, 'Transport is a right, not a product.', '1 Trust, 1 Funds'),
  (v_deck, 2, 'Should a curfew be imposed in districts with rising crime?',
    'Yes', sup, 'Safety first. Order must be restored.', '2 Clout',
    'No',  ide, 'Punishing whole districts punishes the innocent.', '2 Trust'),
  (v_deck, 3, 'Should the mayor host a televised talent show to fund new parks?',
    'Yes', sho, 'Give the people a show and they will give you their votes.', '2 Media',
    'No',  cap, 'Parks should be funded by sound budgets, not stunts.', '1 Funds, 1 Clout'),
  (v_deck, 4, 'Should landlords be allowed to raise rents without limits?',
    'Yes', cap, 'Property owners know the value of what they own.', '3 Funds',
    'No',  ide, 'A roof over every head comes before profit.', '2 Trust, 1 Media'),
  (v_deck, 5, 'Should a giant statue of the city founder be built in the main square?',
    'Yes', sup, 'Remember where we came from. Stand tall.', '1 Clout, 1 Media',
    'No',  sho, 'Build a stadium instead — people remember a good night out.', '2 Media'),
  (v_deck, 6, 'Should all city council meetings be livestreamed?',
    'Yes', sho, 'Every debate is a stage. Let them watch.', '2 Media',
    'No',  sup, 'Governing needs closed doors and firm hands.', '2 Clout'),
  (v_deck, 7, 'Should the city offer tax holidays to attract tech giants?',
    'Yes', cap, 'Jobs follow capital. Roll out the red carpet.', '2 Funds, 1 Media',
    'No',  ide, 'Those who profit from the city should pay into it.', '2 Trust'),
  (v_deck, 8, 'Should protest marches require police permission 30 days in advance?',
    'Yes', sup, 'Freedom without order is chaos.', '3 Clout',
    'No',  ide, 'The street belongs to the people.', '1 Trust, 1 Media'),
  (v_deck, 9, 'Should the city replace its ageing stadium with a luxury shopping district?',
    'Yes', cap, 'Retail is the new public square.', '2 Funds',
    'No',  sho, 'A stadium full of fans is a stadium full of voters.', '1 Media, 1 Clout'),
  (v_deck, 10, 'Should school textbooks be rewritten to celebrate the city''s heroes?',
    'Yes', sup, 'Pride in our past builds the future.', '2 Clout',
    'No',  sho, 'Make history a blockbuster documentary series instead.', '2 Media');
end $$;

-- Add yourself as an administrator (replace with your email):
-- insert into admins (email) values ('you@example.com') on conflict do nothing;
