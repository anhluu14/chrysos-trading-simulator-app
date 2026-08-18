# Chrysos

**Chrysos** is a mobile-first cryptocurrency trading simulator built with Expo and React Native. It provides a risk-free space to explore market data, practise trades with virtual USDT, track a portfolio, and learn the fundamentals of crypto trading.

> **Educational use only.** Chrysos does not execute real trades, hold funds, or provide financial advice. All balances and trades are simulated.

## Features

- Virtual trading with a starting USDT balance
- Live cryptocurrency market data, charts, token search, and watchlists
- Portfolio valuation, holdings, P&L, and transaction history
- Buy and sell order flows with configurable order types
- Leaderboards, achievements, and collection-based social learning
- Learning modules and crypto news
- Light and dark themes, plus English and Vietnamese localization
- Offline-first local persistence with optional Supabase synchronization
- QR-based collection invites and mobile camera support

## Tech Stack

- [Expo](https://expo.dev/) and React Native
- Expo Router for file-based navigation
- TypeScript
- Redux Toolkit and Redux Persist
- Supabase for optional cloud data synchronization
- AsyncStorage and Expo SecureStore for local persistence
- Sentry for optional production error tracking

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm or Yarn 1.22+
- Expo Go or an Android/iOS simulator for mobile development

### Installation

```bash
git clone https://github.com/<your-username>/chrysos.git
cd chrysos
yarn install
```

### Environment configuration

Copy the following into a local `.env` file if you want to enable cloud synchronization and news. Never commit this file or production credentials.

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_NEWS_API_KEY=your-news-api-key
EXPO_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

The app remains usable without Supabase credentials: it uses local storage and gracefully skips cloud operations. For production, keep privileged API keys on a server rather than in a client app.

### Run the app

```bash
# Start Expo and choose a device from the terminal
yarn start

# Run the web version
yarn web

# Run a native development build
yarn android
yarn ios
```

## Quality Checks

```bash
# Type-check the project
npx tsc --noEmit

# Run tests once
yarn test:ci

# Produce a static web build
npx expo export --platform web
```

## Project Structure

```text
app/            Expo Router screens and navigation layouts
components/     Reusable UI and feature components
context/        Theme, language, and user providers
features/       Redux slices and async actions
services/       Market data, storage, sync, and application services
database/       Supabase schema and migration scripts
hooks/          Reusable data and UI hooks
utils/          Formatting, configuration, and platform utilities
assets/         Images, icons, and fonts
```

## Data and Privacy

Chrysos stores simulated account and portfolio data locally. If Supabase is configured, selected application data can be synchronized to the configured project. Do not use real credentials, seed phrases, private keys, or financial account data in the app.

## Contributing

Contributions are welcome. Please create a branch, make focused changes, run the quality checks above, and open a pull request describing the change.

## License

License details will be added before release.
