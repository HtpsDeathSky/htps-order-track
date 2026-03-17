# HTPS Order Track

A Telegram-inspired order tracker built with `Next.js`, `Supabase Auth`, and `Supabase Postgres`.

## Features

- Email/password login with Supabase
- Create, edit, delete, and browse orders
- Sort by warranty expiry date
- Highlight expired and expiring orders
- Responsive dashboard for desktop and mobile

## Local Setup

1. Create `D:\project\htps-order-track\.env.local` from `D:\project\htps-order-track\.env.example`
2. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Run the app:

```bash
pnpm dev
```

## Supabase Notes

- Use the SQL script you already executed to create `profiles` and `orders`
- Frontend only uses the `anon` key
- Access control depends on Supabase RLS

## Deploy

Deploy to Vercel with the same two environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
