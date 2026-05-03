+JOB/ADMIN

See also: +help job/syntax (general switches)

SYNTAX
  +job/claim <#>                     Claim a job for yourself.
  +job/unclaim <#>                   Release a claimed job.
  +job/resolve <#>[=<comment>]       Mark resolved and archive.
  +job/reopen <#>                    Reopen an archived job.
  +job/delete <#>                    Permanently delete. (su)
  +job/priority <#>=<low|normal|     Set job priority level.
                    high|critical>
  +job/staffnote <#>=<text>          Staff-only note (hidden).

NOTES
  Commands marked **(su)** require the **superuser** flag.
  Staff notes are never visible to the submitting player.
  Use /resolve instead of /close to archive with audit trail.

SEE ALSO: +help job, +help job/syntax, +help job/examples
