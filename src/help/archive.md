+ARCHIVE

View and manage closed jobs in the archive (staff only). Plain
`+archive` lists all archived jobs; `+archive <#>` reads one.

SYNTAX
  +archive[/<switch>] [<args>]

SWITCHES
  /purge <#>          Permanently delete one archived job. (su)
  /purgeall CONFIRM   Delete all archived jobs. (su)

EXAMPLES
  +archive                     List all archived jobs.
  +archive 5                   View archived job #5.
  +archive/purge 5             Permanently delete archived #5.
  +archive/purgeall CONFIRM    Wipe the entire archive.

NOTES
  **/purge** and **/purgeall** require **superuser**; deletion is permanent.

SEE ALSO: +help job, +help request
