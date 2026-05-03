+JOB/SYNTAX

See also: +help job (overview)

SYNTAX
  +jobs                              List all open jobs.
  +job <#>                           View job <#>.
  +job/bucket <bucket>               Filter list by bucket name.
  +job/comment <#>=<text>            Add a staff comment.
  +job/assign <#>=<staff>            Assign job to a staff member.
  +job/close <#>[=<comment>]         Close and archive job.
  +job/addplayer <player> to <#>     Add a player as a viewer.
  +job/addaccess <bucket>=<staff>    Grant bucket access. (su)
  +job/removeaccess <bucket>=<staff> Revoke bucket access. (su)
  +job/listaccess                    Show all bucket access. (su)
  +job/renumber                      Re-sequence job numbers. (su)

NOTES
  Commands marked **(su)** require the **superuser** flag.
  Non-superusers only see buckets they have been granted access to.

SEE ALSO: +help job, +help job/examples, +help job/admin
