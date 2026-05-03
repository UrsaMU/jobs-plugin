+JOB/EXAMPLES

See also: +help job (overview)

EXAMPLES
  +jobs                           List all open jobs.
  +job 5                          View job #5.
  +job/bucket SPHERE              List jobs in the SPHERE bucket.
  +job/comment 5=On it.           Add a comment to job #5.
  +job/assign 5=Alice             Assign job #5 to Alice.
  +job/close 5=All done.          Close job #5 with a final note.
  +job/close 5                    Close job #5 with no comment.
  +job/addplayer Alice to 5       Add Alice as a viewer on #5.
  +job/addaccess SPHERE=Bob       Grant Bob access to SPHERE. (su)
  +job/removeaccess SPHERE=Bob    Revoke Bob's SPHERE access. (su)
  +job/listaccess                 Show all bucket permissions. (su)
  +job/renumber                   Re-sequence all job IDs. (su)
  +job/claim 5                    Claim job #5 for yourself.
  +job/resolve 5=Issue fixed.     Resolve and archive job #5.
  +job/priority 5=high            Set job #5 to high priority.
  +job/staffnote 5=Has history.   Add a staff-only note to #5.
SEE ALSO: +help job, +help job/syntax, +help job/admin
