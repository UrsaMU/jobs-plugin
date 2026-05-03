+JOB

Staff job management (admin/wizard/superuser only).

SYNTAX
  +job[/<switch>] [<args>]

SWITCHES
  /bucket       Filter the job list by bucket name.
  /comment      Add a staff comment to a job.
  /assign       Assign a job to a staff member.
  /close        Close and archive a job.
  /addplayer    Add a player as a viewer on a job.
  /addaccess    Grant bucket access to a staff member. (su)
  /removeaccess Revoke bucket access. (su)
  /listaccess   Show all bucket access settings. (su)
  /renumber     Re-sequence all job numbers. (su)

EXAMPLES
  +jobs         List all open jobs.
  +job 5        View job #5.
SEE ALSO: +help job/syntax, +help job/examples, +help jobs, +help archive
