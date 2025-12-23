# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- **Development Server**: `npm run dev`
- **Build**: `npm run build`
- **Start Production**: `npm run start`
- **Lint**: `npm run lint`

## High-Level Architecture

This is a Next.js 16 project using React 19, built with TypeScript. The application follows the App Router pattern (directory-based routing).

### Key Dependencies
- **Auth**: Supabase (`@supabase/supabase-js`)
- **State Management**: Zustand (`zustand`)
- **Validation**: Zod (`zod`)
- **Video Streaming**: Cloudflare Stream (`@cloudflare/stream-react`)
- **Styling**: Tailwind CSS v4

### Directory Structure
```
├── app/          # Next.js App Router pages/routes
├── lib/          # Shared libraries and utilities
│   ├── auth.ts   # Authentication utilities
│   ├── cloudflare/ # Cloudflare Stream integration
│   ├── store/    # Zustand state stores
│   ├── supabase/ # Supabase client setup
│   ├── utils/    # General utilities
│   └── validations/ # Zod schemas
├── public/       # Static assets
├── supabase/     # Supabase configuration and migrations
└── scripts/      # Custom scripts
```

### Important Files
- `app/layout.tsx`: Main application layout
- `app/middleware.ts`: Next.js middleware (likely for authentication)
- `lib/supabase/`: Supabase client setup
- `lib/auth.ts`: Authentication utilities and helpers

The application appears to have authentication features (login/register pages), admin functionality, and video streaming capabilities (watch page).
