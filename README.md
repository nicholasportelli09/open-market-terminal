<img src="assets/icon.svg" width="64" height="64" alt="">

# Open Market Terminal

An open-source, AI-powered market terminal in the spirit of a Bloomberg terminal: live markets, charts, research,
valuation, macro and your own portfolio in one fast web app. Free to run yourself, MIT licensed.

**Live demo:** https://market-terminal-eta-nine.vercel.app

## What it does

- **Markets**: indices, rates, FX, commodities and crypto, movers and news, updating live. US, European and Asian
  exchanges (Tokyo, Hong Kong, Shanghai, Shenzhen, Taiwan, Korea).
- **Quotes and charts**: line and candlestick charts, performance from 1 week to 5 years, company fundamentals from
  SEC filings.
- **Scanner**: ranks a stock universe on value, quality, growth, catalysts and risk (your weights), then writes an AI
  thesis with bear, base and bull cases valued by the app's own DCF.
- **Research analyst**: ask about tickers (analyze, explain a move, compare, challenge a thesis). Answers are short,
  cite their sources and label every line as a fact, an estimate or a view.
- **Valuation lab**: DCF, reverse DCF and multiples.
- **Macro**: policy rates, the yield curve, inflation, credit and risk appetite (FRED data).
- **Portfolio**: holdings, cash, income and returns valued live in your base currency. **Connect Interactive
  Brokers** in about two minutes (read-only Flex report: every account, holdings and cash, synced automatically),
  or enter transactions by hand.
- **Sync**: optional email sign-in keeps the portfolio and saved work in step across devices.

## Privacy and AI keys

- Your portfolio lives in your browser. When you sign in, it is copied to your own row in the database. Row-level
  security stops other users from reading it; whoever runs a deployment (on the live demo, the maintainer) can.
- **AI runs on your own key.** Add a free [Gemini key](https://aistudio.google.com/apikey) or an
  [Anthropic key](https://platform.claude.com/settings/keys) under the person icon (top right). The key stays in
  your browser and is sent only with your AI requests; the server uses it for that request and never stores or
  logs it. The server's own AI keys answer only the accounts listed in `AI_ALLOWED_USER_IDS`.
- The IBKR Flex token is saved only in your browser and sent to the server just for each sync; the server never
  stores or logs it. It can read reports, not trade or move money.

## Run it yourself

Needs Node.js 20 or newer.

```bash
git clone https://github.com/nicholasportelli09/open-market-terminal.git
cd open-market-terminal
npm install
cp .env.example .env.local   # every value is optional; fill in what you want
npm run dev                  # http://localhost:3000
```

With no keys at all you get live markets, charts, the scanner screen, macro and the portfolio. AI features ask
each visitor for their own key.

### Environment variables (all optional)

| Variable | What it does |
|---|---|
| `GEMINI_API_KEY` | Server AI key (Google Gemini, free tier). Used only for allowed accounts. |
| `ANTHROPIC_API_KEY` | Server AI key (Anthropic), the fallback after Gemini. |
| `AI_PROVIDER` | `auto` (default: Gemini, then Anthropic), `gemini` or `anthropic`. |
| `ANTHROPIC_MODEL`, `GEMINI_MODEL` | Override the default (cheapest) models. |
| `AI_ALLOWED_USER_IDS` | Comma-separated Supabase user ids that may use the server's AI keys. |
| `AI_OPEN_TO_SIGNED_IN` | Set to `1` to let every signed-in account use the server's keys (not recommended for a public site). |
| `AI_OPEN_WITHOUT_AUTH` | Set to `1` to open the server's keys without sign-in on a production build (private deployments only). |
| `AI_WEEKLY_BUDGET_USD` | Estimated spend cap for the server's Anthropic key per rolling week, per server instance (default 1). |
| `AI_DAILY_LIMIT` | Server AI calls per day, per server instance (default 25). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Turn on sign-in and sync. |
| `FMP_API_KEY`, `FINNHUB_API_KEY` | Analyst ratings and price targets (licensed APIs). |
| `FMP_DAILY_LIMIT` | FMP calls per rolling 24 hours, per server instance (default 200, at most 250). |
| `SEC_USER_AGENT` | `App name contact@email` for SEC EDGAR requests. |

The in-memory caps reset on every new server instance, so also set a monthly spend limit in your Anthropic Console;
that is the hard limit.

Without Supabase settings, the server's AI keys answer anyone only in development (`npm run dev`) or when
`AI_OPEN_WITHOUT_AUTH=1` is set; a production deployment otherwise keeps them locked and visitors use their own keys.

### Sign-in and sync (optional)

1. Create a free project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/20261123151545_user_data_sync.sql` in its SQL editor.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings, API).
4. Under Authentication, URL Configuration, set the Site URL to your deployment's address and add
   `https://<your-domain>/**` to the Redirect URLs, so emailed sign-in links come back to your site.
5. Sign in once, find your user id under Authentication, Users, and put it in `AI_ALLOWED_USER_IDS`.

### Deploy

Works on Vercel as is: import the repo, add the environment variables you want, deploy.

## Tests

```bash
npm run test:unit   # pure logic: portfolio engine, IBKR import, AI guards, valuation
npm run build && npx playwright test   # smoke test of the core flow (needs Google Chrome)
```

## Data sources

Quotes come from public feeds (CNBC, Naver Finance) and calendars and statements from Nasdaq.com, all without an API
agreement; fundamentals from SEC EDGAR, macro data from FRED, headlines from Google News. Prices can be delayed. Check each source's terms before using it
commercially. Nothing here is investment advice.

Not affiliated with, endorsed by or connected to Bloomberg L.P. "Bloomberg" is used only to describe the style of
the app.

## License

[MIT](LICENSE)
