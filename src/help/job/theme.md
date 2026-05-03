+JOB/THEME

Control the color and border style of all jobs displays.

SYNTAX
  +job/theme
  +job/theme/set <token>=<value>
  +job/theme/reset

TOKENS
  sep      Color wrapping the border fill (default: empty — colors in smaj).
  title    Color for header title text.
  frame    Color for the `< >` brackets around the title.
  section  Color for divider labels (e.g. "Comments").
  hint     Color for hint and dim text.
  smaj     Major border fill pattern — may be multi-char, e.g. `=-`.
  smin     Minor border fill pattern — used for dividers.
  bold     Bold modifier applied to title text.

EXAMPLES
  +job/theme                         Show all current token values.
  +job/theme/set smaj=%cb=%ch%cb-   Alternating dark/bright blue =-
  +job/theme/set frame=%ch%cr       Red < > brackets.
  +job/theme/set smaj=-=            Plain -=  (no color).
  +job/theme/reset                  Restore built-in defaults.

SEE ALSO: +help job
