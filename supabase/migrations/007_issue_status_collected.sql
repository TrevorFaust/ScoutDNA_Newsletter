-- Allow "collected" status after run_collect (before compose)
alter table newsletter_issues drop constraint if exists newsletter_issues_status_check;
alter table newsletter_issues add constraint newsletter_issues_status_check
  check (status in ('collecting', 'collected', 'draft', 'in_review', 'approved', 'published'));
