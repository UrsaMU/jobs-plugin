+REQUEST/SYNTAX

See also: +help request (overview)

SYNTAX
  +request                          List your open requests.
  +request <#>                      View request <#>.
  +request <title>=<text>           Submit to the default bucket.
  +request/create <bucket>/<title>=<text>
                                    Submit to a specific bucket.
  +request/comment <#>=<text>       Add a comment to request <#>.
  +request/cancel <#>               Cancel your own request.
  +request/addplayer <#>=<player>   Add <player> as a viewer.

NOTES
  **+requests** and **+myjobs** are aliases that list your open
  requests. Superusers using `+myjobs` see all jobs system-wide.
  Only the original submitter may cancel or add players; viewers
  may comment.

SEE ALSO: +help request, +help request/examples
