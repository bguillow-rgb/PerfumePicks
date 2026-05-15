-- Add 'love' to the swipe_feedback action check constraint.
-- The app's Train screen uses three tiers: love (right), like (down),
-- dislike (left). The original constraint only allowed like/dislike/skip.

alter table swipe_feedback drop constraint if exists swipe_feedback_action_check;
alter table swipe_feedback add constraint swipe_feedback_action_check
  check (action in ('love', 'like', 'dislike', 'skip'));
