# Family Service Hours Tracker

A complete browser-based Supabase system for tracking the required 36 service hours per family.

## Main Features

- Email/password login
- Separate `admin` and `user` roles
- Family records with:
  - School
  - Family ID
  - Student name
  - Grade
  - Required hours
- Users submit service hours
- Entries start as `pending`
- Administrators approve or reject entries
- Only approved hours reduce the 36-hour requirement
- Dashboard shows approved, pending, and hours left
- Admin family management
- CSV exports for service entries and family progress
- Supabase Row Level Security

## Installation

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run the entire `supabase-schema.sql` file.
4. In Supabase Authentication, create the admin and user accounts.
5. Open `app.js`.
6. Replace:

```javascript
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

with the values from:

**Supabase → Project Settings → API**

7. Upload `index.html`, `styles.css`, and `app.js` to GitHub Pages or another web host.

## Admin Account

The SQL automatically assigns this email as admin:

`pkaraffa@bridgeportedu.net`

To make another account an admin:

```sql
update public.profiles
set role = 'admin'
where lower(email) = lower('person@bridgeportedu.net');
```

## User Account

All new authenticated accounts are automatically added to `profiles` with:

```text
role = user
```

To explicitly make an account a user:

```sql
update public.profiles
set role = 'user'
where lower(email) = lower('person@bridgeportedu.net');
```

## Important Calculation

Only approved entries count toward the requirement:

```text
Hours Left = MAX(36 - Approved Hours, 0)
```

Pending hours appear separately until an administrator authorizes them.
