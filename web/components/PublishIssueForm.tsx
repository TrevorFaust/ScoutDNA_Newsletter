type Props = {
  issueId: string;
  slug: string;
  label?: string;
};

export function PublishIssueForm({
  issueId,
  slug,
  label = "Publish",
}: Props) {
  return (
    <form action="/api/publish" method="post">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="slug" value={slug} />
      <button type="submit" className="btn btn-primary">
        {label}
      </button>
    </form>
  );
}
