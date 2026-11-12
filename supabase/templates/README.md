# Supabase Auth email templates

Supabase sends its own emails for sign-up confirmation, password reset, etc. They are edited in the
dashboard (Authentication → Emails → Templates), not deployed from this repo. The files here are the
exact text pasted into the dashboard, kept so changes are reviewed and can be restored.

| Dashboard template | Subject                         | Body                 |
|--------------------|---------------------------------|----------------------|
| Confirm sign up    | `confirm-signup.subject.txt`    | `confirm-signup.html`|

## Languages

One template serves every language. The website saves the visitor's language in the account at
sign-up (`user_metadata.ui_locale`, only on non-English pages), and the template picks the version:

    {{ if eq (printf "%v" .Data.ui_locale) "ar" }} …Arabic… {{ else }} …English, unchanged… {{ end }}

`printf "%v"` keeps this safe when an account has no language saved (it renders English).
The English branch is the template that was live before Arabic was added, with only the footer year
updated from © 2025 to © 2026.
