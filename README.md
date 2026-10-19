# Cooking Papas 🦐

The daily [krillion.io](https://krillion.io) scoreboard for Jefferson, Davide and Jack.

Pick your name, enter your score, and the calendar crowns whoever ate the most krill that day.
If two or three papas tie for the top score, they share the chef's hat. Saving again for the same
day replaces your earlier score.

It's a plain static site (`index.html`, `style.css`, `app.js`) with scores stored in a free
[Supabase](https://supabase.com) Postgres database. No build step.

## Try it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

If `config.js` is empty, the site runs in **demo mode** and scores are saved in that browser only.

## One-time setup (about 10 minutes)

### 1. Create the database

1. Sign up at [supabase.com](https://supabase.com) (free tier is plenty) and create a new project.
   Any name and region works, and you can save the database password somewhere and forget about it.
2. In the project, open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Project Settings → API** (or **Connect**) and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **publishable** key (`sb_publishable_…`) or, on older projects, the **anon public** key
4. Paste both into `config.js`:

   ```js
   export const SUPABASE_URL = "https://xxxx.supabase.co";
   export const SUPABASE_KEY = "sb_publishable_...";
   ```

These two values are meant to be public. Don't paste the **secret** / `service_role` key anywhere in this repo.

### 2. Put it online

Either option is free. Each one gives you a link to pin in the group chat.

**GitHub Pages:** push this folder to a GitHub repo, then go to **Settings → Pages → Deploy from a branch**,
pick `main` and `/ (root)`. The site appears at `https://<you>.github.io/<repo>/`.

**Vercel or Netlify:** import the repo with the framework preset set to "Other" and no build command.

Tip: on a phone, open the link and use **Add to Home Screen** so it works like an app.

## Things to know

- **Anyone with the link can add or change scores.** There are no logins, which keeps things quick
  for three friends. The database rules allow reading, adding and overwriting scores, but never
  deleting them. If trolling ever becomes a problem, add Supabase Auth and tighten the policies in
  `schema.sql`.
- **Free Supabase projects pause after about a week with no activity.** Daily play keeps it awake.
  If it does pause, click **Restore** in the Supabase dashboard; no data is lost.
- **Days follow each person's local time zone.** The form defaults to today's date, and you can
  pick an earlier day to backfill a score you forgot to enter.
- **Fixing a bad entry:** submit again for that day, or edit the row in Supabase's **Table Editor**.
- **Adding a papa:** add them to `PLAYERS` in `app.js`, give them a `--p-<id>` color in `style.css`,
  and add their id to the `check (player in (...))` list in the database
  (`alter table scores drop constraint scores_player_check;` then re-add it with the new list).
